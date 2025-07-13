//import { BLEMaster } from "@silver-zepp/easy-ble";

import { BLEMaster } from "@silver-zepp/easy-ble";
import { BLEService } from "./ble-service";

// create an instances
const ble = new BLEMaster();
const bleService = new BLEService("vesc_ble_service");

App({
  globalData: {
    ble,
    bleService,

    scannedDevices: [],

    connectedDeviceName: "",
    connectedDeviceAddress: "",

    vesc_temp: 0,
    motor_temp: 0,
    duty_cycle: 0,
    rpm: 0,
    speed: 0,
    input_voltage: 0,
    battery_level: 0
  },

  onCreate(options) {    
    this.globalData.bleService.init(this.globalData);    
  },

  onDestroy(options) {        
    this.globalData.bleService.stop(this.globalData);
  },
});
