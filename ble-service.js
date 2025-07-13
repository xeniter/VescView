
// maximal logging
//BLEMaster.SetDebugLevel(3);

// UUIDs for the VESC UART service
const VESC_UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const VESC_UART_RX_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // Watch writes to this
const VESC_UART_TX_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // Watch reads from this

const services = {
  [VESC_UART_SERVICE_UUID]: {
    [VESC_UART_RX_UUID]: [],              // Write: no descriptor needed
    [VESC_UART_TX_UUID]: ["2902"],        // Notify: needs CCC descriptor (0x2902)
  }
};


function crc16xmodem(data) {

  let crc = 0x0000;
  const polynomial = 0x1021;

  for (let i = 0; i < data.length; i++) {
    let b = data[i];
    crc ^= (b << 8);
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ polynomial) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }

  return crc;
}

function buildPacket(cmdId) {

  const payload = [cmdId];
  const len = payload.length;

  // Convert payload to a Uint8Array (Buffer is fine too)
  const payloadBuffer = Buffer.from(payload);

  // Compute CRC using crc16-xmodem
  const crc = crc16xmodem(payloadBuffer);

  // Construct the full packet
  const packet = [
    0x02,              // start byte
    len,               // length of payload
    ...payload,        // payload itself
    (crc >> 8) & 0xff, // CRC high byte
    crc & 0xff,        // CRC low byte
    0x03               // end byte
  ];

  return packet;
}

let receiveBuffer = [];

function isValidVescPacket(packet) {   

  if (packet.length < 6) {
    console.log(`packet length is ${packet.length} < 6!`);  
    return -1;
  }
  
  if (packet[0] !== 0x02) {
    console.log(`packet[0] is ${packet[0]} != 0x02!`);
    return 0;
  }  

  // VESC_FRAME = 0x02 PAYLOAD_LEN_BYTE PAYLOAD CRC_HIGH_BYTE CRC_LOW_BYTE 0x03
  const payload_len = packet[1];
  const vesc_frame_len = payload_len+5;
  
  if (packet.length < vesc_frame_len) {
    //console.log(`len is ${packet.length} but should be at least ${vesc_frame_len}!`);
    return -1;
  }

  if(packet[vesc_frame_len - 1] !== 0x03) {
    console.log(`packet[${vesc_frame_len - 1}] is ${packet[vesc_frame_len - 1]} != 0x03!`);
    return 0;
  }

  const payload = packet.slice(2, 2 + len);
  const crcFromPacket = (packet[2 + len] << 8) | packet[2 + len + 1];
  const crcComputed = crc16xmodem(Buffer.from(payload));

  if (crcFromPacket !== crcComputed) {
    console.log(`crc is ${crcFromPacket} but should ${crcComputed}!`);
    return 0;
  }  

  return vesc_frame_len;
}

function safeSlice(buffer, start, end) {
  if (buffer instanceof Uint8Array) {
    return buffer.slice(start, end);
  } else if (Array.isArray(buffer)) {
    return Uint8Array.from(buffer.slice(start, end));
  } else {
    throw new TypeError("Expected Uint8Array or Array");
  }
}

function buffer_get_uint16(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return view.getUint16(0, false); // Big-endian
}

function buffer_get_int16(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return view.getInt16(0, false);
}

function buffer_get_float16(buffer, scale) {
  const intVal = buffer_get_int16(buffer);
  return intVal / scale;
}

function buffer_get_float32(buffer, scale) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const floatVal = view.getFloat32(0, false); // Big-endian
  return floatVal / scale;
}

export class BLEService {
  constructor(name) {
    this.name = name;
    this.updateCallback = null;  // Hier speichern wir die Callback-Funktion
    this.ReceiveBLEdata = this.ReceiveBLEdata.bind(this);
  }

  // Methode zum Setzen der Callback-Funktion
  setUpdateCallback(callback) {
    if (typeof callback === "function") {
      this.updateCallback = callback;
    } else {
      console.warn("BLEService: updateCallback must be a function");
    }
  }

  init(globalData) {
    console.log("ble service init")
    this.globalData = globalData;
    console.log("ble service init done")
  }

  start_scan() {    

    this.globalData.ble.startScan((device) => {

        console.log(`${device.dev_name} - ${device.dev_addr} (RSSI: ${device.rssi})`);
  
        const existing = this.globalData.scannedDevices.find(d => d.dev_addr === device.dev_addr);
        if (!existing) {
          console.log("new device:", device);
          this.globalData.scannedDevices.push(device);        
        } else {
          console.log("update device:", device);
          existing.rssi = device.rssi; // update RSSI        
        }

        // update list in UI via callback
        if (this.updateCallback) {
          this.updateCallback();
        } else {
          console.log("BLEService: no updateCallback set");
        }
             
      });      
  }

  stop_scan() {
    this.globalData.ble.stopScan();
  }

  connect(device) {    
  
    return new Promise((resolve, reject) => {      
  
      this.globalData.ble.connect(device.dev_addr, (result) => {        
  
        if (result.connected) {
          console.log(`Connected to device ${device.dev_name}`);
          console.log("Calling ConnectToBleService()");
  
          this.ConnectToBleService()
            .then(() => {
              console.log(`device.dev_addr ${device.dev_addr}`);
  
              this.connected_dev_addr = device.dev_addr;
              this.globalData.connectedDeviceName = device.dev_name;
              this.globalData.connectedDeviceAddress = device.dev_addr;
  
              console.log("BLE setup complete");
              resolve(result);
            })
            .catch((err) => {
              console.error("BLE setup failed:", err);
              reject(err);
            });
  
        } else {
          console.log(`Failed to connect. Status: ${result.status}`);
          reject(new Error(`Failed to connect: ${result.status}`));
        }
     
      });
        
    });
  }


  ReceiveBLEdata(data, length) {

    // Convert the data to a Uint8Array if it's not already
    const byteArray = new Uint8Array(data.buffer || data);

    // Ensure only the received length is processed
    const trimmed = byteArray.slice(0, length);

    // Append new data to buffer
    receiveBuffer = receiveBuffer.concat(Array.from(trimmed));

    /*
    // Format to hex string for logging
    //-------------------------------------
    hexString = receiveBuffer.map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log("Data (hex):", hexString);

    console.log(`ReceiveBLEdata new:${length} all:${receiveBuffer.length}`);

    */

    // Try to extract valid packets
    while (true) {

        const startIndex = receiveBuffer.indexOf(0x02);
        // could be a possible end index
        const endIndex = receiveBuffer.indexOf(0x03);

        // Not enough data yet
        if (startIndex === -1 || endIndex === -1) {
          //console.log("not enough data yet...");
          break;
        }

        //console.log(`startIndex is ${startIndex}, endIndex is ${endIndex}`);

        const possiblePacket = receiveBuffer.slice(startIndex);            
        //console.log(`try to parse data with length of ${possiblePacket.length}`);
        //console.log([...possiblePacket].map(b => b.toString(16).padStart(2, '0')).join(' '));

        valid_vesc_packet_length = isValidVescPacket(possiblePacket);
        //console.log(`valid_vesc_packet_length is ${valid_vesc_packet_length}`);

        if (valid_vesc_packet_length == 0) {
          console.log("❌ Invalid VESC frame");
          // Drop the first byte to try resynchronizing
          receiveBuffer = receiveBuffer.slice(startIndex + 1);
        }

        if (valid_vesc_packet_length == -1) {
          //console.log("not enought data for parsing frame yet...");
          break;
        }

        if (valid_vesc_packet_length > 0) {
            //console.log("✅ Valid VESC frame:");
            //console.log([...possiblePacket].map(b => b.toString(16).padStart(2, '0')).join(' '));

            // Process packet (e.g., decode payload here)
            
            const payloadLength = possiblePacket[1];
            const commandType = possiblePacket[2];

            /*console.log(
              `✅ Valid VESC frame received - type: ${commandType} (0x${commandType.toString(16).padStart(2, '0')}), ` +
              `length: ${payloadLength} (0x${payloadLength.toString(16).padStart(2, '0')})`
            );*/

            // check for COMM_GET_VALUES_SETUP(47 = 0x2f)
            if (commandType == 0x2f) {
              //console.log("received COMM_GET_VALUES_SETUP");

              try {
                const vesc_temp        = buffer_get_float16(safeSlice(possiblePacket,  3,  5), 10.0);
                //console.log(`vesc_temp is ${vesc_temp}`);
                this.globalData.vesc_temp = vesc_temp;

                const motor_temp       = buffer_get_float16(safeSlice(possiblePacket,  5,  7), 10.0);
                //console.log(`motor_temp is ${motor_temp}`);
                this.globalData.motor_temp = motor_temp;

                const duty_cycle      = buffer_get_float16(safeSlice(possiblePacket, 15, 17), 1.0);
                //console.log(`duty_cycle is ${duty_cycle}`);
                this.globalData.duty_cycle = duty_cycle;

                const rpm             = buffer_get_float32(safeSlice(possiblePacket, 17, 21), 1.0);
                //console.log(`rpm is ${rpm}`);
                this.globalData.rpm = rpm;

                const speed           = buffer_get_float32(safeSlice(possiblePacket, 21, 25), 1000.0);
                //console.log(`speed is ${speed}`);
                this.globalData.speed = speed;

                const input_voltage   = buffer_get_float16(safeSlice(possiblePacket, 25, 27), 10.0);
                //console.log(`input_voltage is ${input_voltage}`);
                this.globalData.input_voltage = input_voltage;

                const battery_level   = buffer_get_float16(safeSlice(possiblePacket, 27, 29), 1000.0);
                //console.log(`battery_level is ${battery_level}`);
                this.globalData.battery_level = battery_level;

              } catch (e) {
                console.error("❌ Error parsing", e);
              }

              if (typeof this.updateCallback === "function") {
                try {
                  this.updateCallback();
                } catch (e) {
                  console.error("Error calling updateCallback:", e);
                }
              } else {
                console.warn("updateCallback is not a function!");
              }
            }

            // Remove processed frame from buffer
            receiveBuffer = receiveBuffer.slice(valid_vesc_packet_length + 1);
        }
    }    

  }

  ConnectToBleService() {    
  
    return new Promise((resolve, reject) => {      
      
      const profile = this.globalData.ble.generateProfileObject(services);
      console.log('generating profile done');
  
      console.log('Start listener...');
  
      this.globalData.ble.startListener(profile, (response) => {
        if (!response.success) {
          console.log('Failed to start listener for profile');
          return reject(new Error('Failed to start listener'));
        }
  
        console.log('Listener started successfully');
  
        this.globalData.ble.on.charaNotification((uuid, data, length) => {
          //console.log(`Notification received ${length} bytes from ${uuid}`);
          this.ReceiveBLEdata(data, length);
        });
  
        this.globalData.ble.write.enableCharaNotifications(VESC_UART_TX_UUID, true);
  
        this.globalData.ble.on.descWriteComplete((chara, desc, status) => {
          console.log(`Descriptor write complete for Characteristic UUID: ${chara}, Descriptor UUID: ${desc}, Status: ${status}`);
        });
  
        // Flag to track if resolved
        let resolved = false;
  
        this._intervalId = setInterval(() => {
          const packet = buildPacket(47);
          this.globalData.ble.write.characteristic(VESC_UART_RX_UUID, new Uint8Array(packet), true);
  
          if (!resolved) {
            resolved = true;
            console.log('Resolve after first write cycle');
            resolve();
            // Optionally clear interval here if you want
            // clearInterval(this._intervalId);
          }
        }, 1000);
  
        // No resolve here, wait for first write
      });
        
    });
     
  }

  stop() {    
    this.globalData.ble.disconnect(this.connected_dev_addr);
    this.globalData.ble.quit();    
  }
}
