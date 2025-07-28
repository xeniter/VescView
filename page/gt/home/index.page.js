//import { ui, createWidget, widget, prop } from "@zos/ui";
import ui from "@zos/ui";
import { getDeviceInfo } from '@zos/device'
import { setPageBrightTime } from '@zos/display'
import { setWakeUpRelaunch } from '@zos/display'
import { onGesture, GESTURE_LEFT, GESTURE_RIGHT, GESTURE_TAP } from "@zos/interaction";
import { localStorage } from '@zos/storage'

const { width } = getDeviceInfo()

// Visual Logger
// install -> npm i @silver-zepp/vis-log
import VisLog from "@silver-zepp/vis-log";
const vis = new VisLog("index.js");


const StateEnum = {
  SCANNING: 0,
  CONNECTING: 1,
  DASHBOARD: 2,
  TEMPERATURE: 3,
  BATTERY: 4,
  SPEED: 5,
  DEVICE: 6,
  count: 6
};

const StateEnumName = Object.entries(StateEnum)
  .filter(([k, v]) => typeof v === "number" && k !== "count")
  .reduce((acc, [k, v]) => {
    acc[v] = k;
    return acc;
  }, {});

let currentWidgetList = []


// DASHBOARD
//######################

const MAX_X = 454;
const MAX_Y = 454;

// Simulated slot layout, replace with your actual values
const WIDGETS = {
  0: { x: 0, y: 72, w: 288, h: 288, label: "ESC", unit:"°C", invertcolor: true  },
  1: { x: 96, y: 216, w: 288, h: 288, label: "BAT", unit:"%", invertcolor: false },
  2: { x: 96*2, y: 72, w: 288, h: 288, label: "MOT", unit:"°C", invertcolor: true },
}

// Props (you can customize colors, width, etc.)
const WIDGET_BACKGROUND_ARC_PROPS = {
  color: 0x333333,
  line_width: 12
}

const WIDGET_DUTY_BACKGROUND_ARC_PROPS = {
  color: 0x333333,
  line_width: 24
}

const WIDGET_ACTIVE_ARC_PROPS = {
  color: 0xff0000,
  line_width: 12
}

const WIDGET_DUTY_ACTIVE_ARC_PROPS = {
  color: 0xff0000,
  line_width: 24
}

function getGradientColor(percent, invert = false) {
  // Clamp between 0–100
  percent = Math.max(0, Math.min(100, percent))

  // If inverted, flip the percentage
  if (invert) {
    percent = 100 - percent
  }

  let r, g, b = 0

  if (percent < 50) {
    // Red to yellow
    r = 255
    g = Math.round((percent / 50) * 255)
  } else {
    // Yellow to green
    r = Math.round(255 - ((percent - 50) / 50) * 255)
    g = 255
  }

  return (r << 16) + (g << 8) + b // Convert RGB to 0xRRGGBB
}

// other widgets
//-----------------
const screenWidth = 480;
const screenHeight = 320;

const widgetWidth = 360;
const widgetHeight = 50;

const widgetCenterX = (screenWidth - widgetWidth) / 2;
const widgetCenterY = (screenHeight - widgetHeight) / 2;

Page({

  onInit() {

    this.switchState(StateEnum.SCANNING);
        
    vis.info("Start scanning...");
    const bleService = getApp()._options.globalData.bleService; 
    bleService.setUpdateCallback(this.updateDisplay.bind(this));
    bleService.start_scan();

    const result = setPageBrightTime({
      brightTime: 60000,
    })

    // don't close program
    setWakeUpRelaunch({
      relaunch: true,
    })

  },

  connect(device, message) {

    const bleService = getApp()._options.globalData.bleService; 
    
    this.switchState(StateEnum.CONNECTING);         
    bleService.stop_scan();
  
    vis.info(`${message} to ${device.dev_name}`);
    console.log(`${message} to ${device.dev_name}`);
  
    bleService.connect(device)
      .then(() => {
        vis.info("Connected");        
        this.switchState(StateEnum.DASHBOARD);
        console.log(`Connected to ${device.dev_name}`);
      })
      .catch((error) => {
        vis.error("Connecting failed");
        console.log(`bleService.connect failed: ${error}`);
        bleService.start_scan();
        this.switchState(StateEnum.SCANNING);
      });
  },

  updateScanDeviceList() {

    if (this.currentState !== StateEnum.SCANNING) {
      return;
    }
    
    const scannedDevices = getApp()._options.globalData.scannedDevices;        

    const sorted = scannedDevices
    .filter(d => d.rssi !== undefined)
    .sort((a, b) => b.rssi - a.rssi);

    // auto connect in case its saved
    //----------------------------------
    // Get saved devices or start fresh
    let savedDevicesRaw = localStorage.getItem("saved_devices");                
    let savedDevices = savedDevicesRaw ? JSON.parse(savedDevicesRaw) : [];
    
    // Look in list if device is saved and connect to it
    for (const device of sorted) {
      // Check if already exists
      let exists = savedDevices.some(d => d.mac === device.dev_addr);

      if (exists) {
        this.connect(device, "AutoConnect");
        return;
      }
    }
        
    // Display top 5
    sorted.slice(0, 5).forEach((device, index) => {

      console.log(`${index} ${device.dev_name}`);      

      const buttonHeight = 60;
      const spacing = 20;
      const startY = 60;

      new_button = ui.createWidget(ui.widget.BUTTON, {
        x: 30,
        y: startY + index * (buttonHeight + spacing),
        w: width - 60,
        h: buttonHeight,
        radius: 12,
        text_size: 32,
        text: device.dev_name,
        color: COLOR_WHITE,
        border_color: COLOR_BLUE, // Border color
        border_width: 2, // Border width
        border_radius: 10, // Rounded corners
        click_func: () => {

          console.log(`Button clicked: ${device.dev_name}`);
          this.connect(device, "Connect");
          return;
        }

      });

      currentWidgetList.push(new_button);
    });
  },


  build_gauge(slot, value) {

    // ESC
    const { x, y, w, h, label, unit, invertcolor} = WIDGETS[slot]
    const centerX = x + w / 2
    const centerY = y + h / 2

    // Background arc
    currentWidgetList.push(ui.createWidget(ui.widget.ARC_PROGRESS, {
      ...WIDGET_BACKGROUND_ARC_PROPS,
      center_x: centerX,
      center_y: centerY,
      radius: 50,
      start_angle: -160,
      end_angle: 160,
      level: 100  // full arc
    }));

    // Active arc – let's say the value is 40 out of 80    
    const minValue = 0
    const maxValue = 100
    const level = (value - minValue) / (maxValue - minValue) * 100

    currentWidgetList.push(ui.createWidget(ui.widget.TEXT, {
      x: centerX - 50,     // Centered horizontally
      y: centerY - 100,    // Adjust this to move label up
      w: 100,
      h: 40,
      text_size: 24,
      color: 0x1B75BC,  // VESC blue
      align_h: ui.align.CENTER_H,
      align_v: ui.align.CENTER_V,
      text: label
    }));

    const arcColor = getGradientColor(level, invertcolor);

    currentWidgetList.push(ui.createWidget(ui.widget.ARC_PROGRESS, {
      ...WIDGET_ACTIVE_ARC_PROPS,
      center_x: centerX,
      center_y: centerY,
      radius: 50,
      start_angle: -160,
      end_angle: 160,
      level: level, // percentage
      color: arcColor,
    }));

    // Show numeric text
    currentWidgetList.push(ui.createWidget(ui.widget.TEXT, {
      x: centerX - 50,      // Centered horizontally
      y: centerY - 25,      // Centered vertically
      w: 100,
      h: 50,
      color: 0xffffff,
      text_size: 23,
      align_h: ui.align.CENTER_H,
      align_v: ui.align.CENTER_V,
      text: `${value}${unit}`
    }));

  },

  displayDashboard() {

    const battery_level = Math.round(getApp()._options.globalData.battery_level*100);
    const vesc_temp = Math.round(getApp()._options.globalData.vesc_temp);
    const motor_temp = Math.round(getApp()._options.globalData.motor_temp);
    const duty_cycle = Math.abs(Math.round(getApp()._options.globalData.duty_cycle/10));

    this.build_gauge(0, vesc_temp);
    this.build_gauge(1, battery_level);
    this.build_gauge(2, motor_temp);

    // arc for duty cycle
    //----------------------

     // Background arc
     currentWidgetList.push(ui.createWidget(ui.widget.ARC_PROGRESS, {
      ...WIDGET_DUTY_BACKGROUND_ARC_PROPS,
      center_x: MAX_X/2+6,
      center_y: MAX_Y/2+6,
      radius: (MAX_X/2)-12,
      start_angle: -160,
      end_angle: 160,
      level: 100  // full arc
    }));
    
    const arcColor = getGradientColor(duty_cycle, true);

    currentWidgetList.push(ui.createWidget(ui.widget.ARC_PROGRESS, {
      ...WIDGET_DUTY_ACTIVE_ARC_PROPS,
      center_x: MAX_X/2+6,
      center_y: MAX_Y/2+6,
      radius: (MAX_X/2)-12,
      start_angle: -160,
      end_angle: 160,
      level: duty_cycle, // percentage
      color: arcColor,
    }));

    const now = new Date()

    const pad = n => n.toString().padStart(2, '0')
    const timeString = `${pad(now.getHours())}:${pad(now.getMinutes())}`

    currentWidgetList.push(ui.createWidget(ui.widget.TEXT, {
      x: 144,
      y: 50,
      w: 200,
      h: 50,
      text_size: 48,
      color: 0x1B75BC,  // VESC blue
      align_h: ui.align.CENTER_H,
      align_v: ui.align.CENTER_V,
      text: timeString
    }));
  
  },


  displayBatteryStatus() {
    
    const battery_level = getApp()._options.globalData.battery_level;
    const input_voltage = getApp()._options.globalData.input_voltage;

    currentWidgetList.push(ui.createWidget(ui.widget.TEXT, {
      x: widgetCenterX,
      y: 80,
      w: widgetWidth,
      h: widgetHeight,
      text_size: 30,
      align_h: ui.align.CENTER_H,
      align_v: ui.align.CENTER_V,
      text: 'BATTERY LEVEL'
    }));

    currentWidgetList.push(ui.createWidget(ui.widget.TEXT, {
      x: widgetCenterX,
      y: 130,
      w: widgetWidth,
      h: widgetHeight,
      text_size: 60,
      align_h: ui.align.CENTER_H,
      align_v: ui.align.CENTER_V,
      text: battery_level.toString()
    }));

    currentWidgetList.push(ui.createWidget(ui.widget.TEXT, {
      x: widgetCenterX,
      y: 200,
      w: widgetWidth,
      h: widgetHeight,
      text_size: 30,
      align_h: ui.align.CENTER_H,
      align_v: ui.align.CENTER_V,
      text: 'INPUT VOLTAGE'
    }));

    currentWidgetList.push(ui.createWidget(ui.widget.TEXT, {
      x: widgetCenterX,
      y: 250,
      w: widgetWidth,
      h: widgetHeight,
      text_size: 60,
      align_h: ui.align.CENTER_H,
      align_v: ui.align.CENTER_V,
      text: input_voltage.toString()
    }));

  },

  displayTemperatureStatus() {    

    const vesc_temp = getApp()._options.globalData.vesc_temp;
    const motor_temp = getApp()._options.globalData.motor_temp;

    currentWidgetList.push(ui.createWidget(ui.widget.TEXT, {
      x: widgetCenterX,
      y: 80,
      w: widgetWidth,
      h: widgetHeight,
      text_size: 30,
      align_h: ui.align.CENTER_H,
      align_v: ui.align.CENTER_V,
      text: 'VESC TEMPERATURE'
    }));

    currentWidgetList.push(ui.createWidget(ui.widget.TEXT, {
      x: widgetCenterX,
      y: 130,
      w: widgetWidth,
      h: widgetHeight,
      text_size: 60,
      align_h: ui.align.CENTER_H,
      align_v: ui.align.CENTER_V,
      text: vesc_temp.toString()
    }));

    currentWidgetList.push(ui.createWidget(ui.widget.TEXT, {
      x: widgetCenterX,
      y: 200,
      w: widgetWidth,
      h: widgetHeight,
      text_size: 30,
      align_h: ui.align.CENTER_H,
      align_v: ui.align.CENTER_V,
      text: 'MOTOR TEMPERATURE'
    }));

    currentWidgetList.push(ui.createWidget(ui.widget.TEXT, {
      x: widgetCenterX,
      y: 250,
      w: widgetWidth,
      h: widgetHeight,
      text_size: 60,
      align_h: ui.align.CENTER_H,
      align_v: ui.align.CENTER_V,
      text: motor_temp.toString()
    }));

  },

  displaySpeedStatus() {
    
    const duty_cycle = getApp()._options.globalData.duty_cycle;
    const rpm = getApp()._options.globalData.rpm;
    const speed = getApp()._options.globalData.speed;

    currentWidgetList.push(ui.createWidget(ui.widget.TEXT, {
      x: widgetCenterX,
      y: 80,
      w: widgetWidth,
      h: widgetHeight,
      text_size: 30,
      align_h: ui.align.CENTER_H,
      align_v: ui.align.CENTER_V,
      text: 'DUTY CYCLE'
    }));

    currentWidgetList.push(ui.createWidget(ui.widget.TEXT, {
      x: widgetCenterX,
      y: 130,
      w: widgetWidth,
      h: widgetHeight,
      text_size: 60,
      align_h: ui.align.CENTER_H,
      align_v: ui.align.CENTER_V,
      text: duty_cycle.toString()
    }));

    currentWidgetList.push(ui.createWidget(ui.widget.TEXT, {
      x: widgetCenterX,
      y: 200,
      w: widgetWidth,
      h: widgetHeight,
      text_size: 30,
      align_h: ui.align.CENTER_H,
      align_v: ui.align.CENTER_V,
      text: 'RPM'
    }));

    currentWidgetList.push(ui.createWidget(ui.widget.TEXT, {
      x: widgetCenterX,
      y: 250,
      w: widgetWidth,
      h: widgetHeight,
      text_size: 60,
      align_h: ui.align.CENTER_H,
      align_v: ui.align.CENTER_V,
      text: rpm.toString()
    }));

    currentWidgetList.push(ui.createWidget(ui.widget.TEXT, {
      x: widgetCenterX,
      y: 320,
      w: widgetWidth,
      h: widgetHeight,
      text_size: 30,
      align_h: ui.align.CENTER_H,
      align_v: ui.align.CENTER_V,
      text: 'SPEED'
    }));

    currentWidgetList.push(ui.createWidget(ui.widget.TEXT, {
      x: widgetCenterX,
      y: 370,
      w: widgetWidth,
      h: widgetHeight,
      text_size: 60,
      align_h: ui.align.CENTER_H,
      align_v: ui.align.CENTER_V,
      text: speed.toString()
    }));

  },

  displayConnectedDevice() {
    
    const connectedDeviceName = getApp()._options.globalData.connectedDeviceName;
    const connectedDeviceAddress = getApp()._options.globalData.connectedDeviceAddress;    

    currentWidgetList.push(ui.createWidget(ui.widget.TEXT, {
      x: widgetCenterX,
      y: 100,
      w: widgetWidth,
      h: widgetHeight,
      text_size: 35,
      align_h: ui.align.CENTER_H,
      align_v: ui.align.CENTER_V,
      text: 'CONNECTED DEVICE'
    }));

    currentWidgetList.push(ui.createWidget(ui.widget.TEXT, {
      x: widgetCenterX,
      y: 180,
      w: widgetWidth,
      h: widgetHeight,
      text_size: 30,
      align_h: ui.align.CENTER_H,
      align_v: ui.align.CENTER_V,
      text: connectedDeviceName
    }));

    currentWidgetList.push(ui.createWidget(ui.widget.TEXT, {
      x: widgetCenterX,
      y: 230,
      w: widgetWidth,
      h: widgetHeight,
      text_size: 30,
      align_h: ui.align.CENTER_H,
      align_v: ui.align.CENTER_V,
      text: connectedDeviceAddress
    }));

    // Get saved devices or start fresh
    let savedDevicesRaw = localStorage.getItem("saved_devices");                
    let savedDevices = savedDevicesRaw ? JSON.parse(savedDevicesRaw) : [];

    // Check if already exists
    let exists = savedDevices.some(d => d.mac === connectedDeviceAddress);

    currentWidgetList.push(ui.createWidget(ui.widget.BUTTON, {
      x: widgetCenterX,
      y: 310,
      w: widgetWidth,
      h: widgetHeight,
      radius: 12,
      text_size: 32,
      text: "AutoConnect",
      color: COLOR_WHITE,
      border_color: COLOR_BLUE, // Border color
      border_width: 2, // Border width
      border_radius: 10, // Rounded corners
      click_func: () => {

        console.log("auto connect button clicked");

        console.log(`localStorage.getItem is: ${localStorage.getItem}`);

        if (exists) {   
          // remove it from list      
          savedDevices = savedDevices.filter(
            device => device.mac !== connectedDeviceAddress
          )
        } else {
          // add it to list
          savedDevices.push({ name: connectedDeviceName, mac: connectedDeviceAddress });
        }
        
        // store list permanent
        localStorage.setItem("saved_devices", JSON.stringify(savedDevices));

      }
    }));

    if (exists) {   
      currentWidgetList.push(ui.createWidget(ui.widget.TEXT, {
        x: widgetCenterX,
        y: 360,
        w: widgetWidth,
        h: widgetHeight,
        text_size: 30,
        align_h: ui.align.CENTER_H,
        align_v: ui.align.CENTER_V,
        text: "ON",
        color: 0x00FF00 // green in hex RGB
      }));
    } else {
      currentWidgetList.push(ui.createWidget(ui.widget.TEXT, {
        x: widgetCenterX,
        y: 360,
        w: widgetWidth,
        h: widgetHeight,
        text_size: 30,
        align_h: ui.align.CENTER_H,
        align_v: ui.align.CENTER_V,
        text: "OFF",
        color: 0xFF0000 // red in hex RGB
      }));
    }

    

  },

  switchState(newState) {

    this.currentState = newState;
    this.updateDisplay();

  },

  updateDisplay() {

    // remove all old ones
    currentWidgetList.forEach(widget => {
      ui.deleteWidget(widget)
    })
    // Clear the array after deletion
    currentWidgetList = [] 


    const stateName = StateEnumName[this.currentState];
    console.log(`Current state is: ${stateName}`);

    switch (this.currentState) {
       
      case StateEnum.SCANNING:
        this.updateScanDeviceList();
        break;
      case StateEnum.CONNECTING:
        break;
      case StateEnum.DASHBOARD:
        this.displayDashboard();
        break;
      case StateEnum.BATTERY:
        this.displayBatteryStatus();
        break;
      case StateEnum.TEMPERATURE:
        this.displayTemperatureStatus();
        break;
      case StateEnum.SPEED:
        this.displaySpeedStatus();
        break;
      case StateEnum.DEVICE:
        this.displayConnectedDevice();
        break;
    }

  },

  onReady() {

    onGesture({
      callback: (event) => {
        if (event === GESTURE_LEFT) {

          // is swipe right in real
          switch (this.currentState) {
            case StateEnum.SCANNING:
              break;
            case StateEnum.CONNECTING:
              break;
            case StateEnum.DASHBOARD:
              this.switchState(StateEnum.BATTERY);
              break;
            case StateEnum.BATTERY:
              this.switchState(StateEnum.TEMPERATURE);
              break;
            case StateEnum.TEMPERATURE:
              this.switchState(StateEnum.SPEED);
              break;
            case StateEnum.SPEED:
              this.switchState(StateEnum.DEVICE);
              break;
            case StateEnum.DEVICE:
              this.switchState(StateEnum.DASHBOARD);
              break;
          }

        } else if (event === GESTURE_RIGHT) {
          
          switch (this.currentState) {
            case StateEnum.SCANNING:
              break;
            case StateEnum.CONNECTING:
              // Zepp App Store requires to go back:
              // Click on the application interface, and swiping right cannot return to the previous level
              this.switchState(StateEnum.SCANNING);
              break;
            case StateEnum.DASHBOARD:
              this.switchState(StateEnum.SPEED);
              break;
            case StateEnum.BATTERY:
              this.switchState(StateEnum.DASHBOARD);
              break;
            case StateEnum.TEMPERATURE:
              this.switchState(StateEnum.BATTERY);
              break;
            case StateEnum.SPEED:
              this.switchState(StateEnum.TEMPERATURE);
              break;
            case StateEnum.DEVICE:
              this.switchState(StateEnum.SPEED);
              break;
          }

        } else if (event === GESTURE_TAP) {
          console.log("Tapped");
        }
        return true; // Prevents default behavior
      }
    });

  },

  onDestroy() {

    // Unregister the gesture event to prevent memory leaks
    onGesture({ callback: null });

  }

});