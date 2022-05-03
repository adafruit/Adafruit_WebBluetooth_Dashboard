// let the editor know that `Chart` is defined by some code
// included in another file (in this case, `index.html`)
// Note: the code will still work without this line, but without it you
// will see an error in the editor
/* global Chart */
/* global Graph */
/* global numeral */
/* global colorjoe */

'use strict';

import * as THREE from 'three';
import {GLTFLoader} from 'gltfloader';

let device;

const bufferSize = 64;
const colors = ['#00a7e9', '#f89521', '#be1e2d'];
const measurementPeriodId = '0001';

const maxLogLength = 500;
const log = document.getElementById('log');
const butConnect = document.getElementById('butConnect');
const butClear = document.getElementById('butClear');
const autoscroll = document.getElementById('autoscroll');
const showTimestamp = document.getElementById('showTimestamp');
const lightSS = document.getElementById('light');
const darkSS = document.getElementById('dark');
const darkMode = document.getElementById('darkmode');
const dashboard = document.getElementById('dashboard');
const fpsCounter = document.getElementById("fpsCounter");
const knownOnly = document.getElementById("knownonly");

let colorIndex = 0;
let activePanels = [];
let bytesReceived = 0;
let currentBoard;
let buttonState = 0;

document.addEventListener('DOMContentLoaded', async () => {
  butConnect.addEventListener('click', clickConnect);
  butClear.addEventListener('click', clickClear);
  autoscroll.addEventListener('click', clickAutoscroll);
  showTimestamp.addEventListener('click', clickTimestamp);
  darkMode.addEventListener('click', clickDarkMode);
  knownOnly.addEventListener('click', clickKnownOnly);

  if ('bluetooth' in navigator) {
    const notSupported = document.getElementById('notSupported');
    notSupported.classList.add('hidden');
  }

  loadAllSettings();
  updateTheme();
  await updateAllPanels();
  //createMockPanels();
});

const boards = {
  CLUE: {
    colorOrder: 'GRB',
    neopixels: 1,
    hasSwitch: false,
    buttons: 2,
  },
  CPlay: {
    colorOrder: 'GRB',
    neopixels: 10,
    hasSwitch: true,
    buttons: 2,
  },
  Sense: {
    colorOrder: 'GRB',
    neopixels: 1,
    hasSwitch: false,
    buttons: 1,
  },
  unknown: {
    colorOrder: 'GRB',
    neopixels: 1,
    hasSwitch: false,
    buttons: 1,
  }
}

let panels = {
  battery: {
    title: 'Battery Level',
    serviceId: 'battery_service',
    characteristicId: 'battery_level',
    panelType: "custom",
    structure: ['Uint8'],
    data: {battery:[]},
    properties: ['notify'],
    textFormat: function(value) {
      return numeral(value).format('0.0') + '%';
    },
    create: function(panelId) {
      let panelTemplate = loadPanelTemplate(panelId, 'battery-level');
      this.update(panelId);
    },
    update: function(panelId) {
      let panelElement = document.querySelector("#dashboard > #" + panelId);
      let value = null;
      if (panels[panelId].data.battery.length > 0) {
        value = panels[panelId].data.battery.pop();
        panels[panelId].data.battery = [];
      }

      if (value != null && value <= 25) { // Show Red
        panelElement.querySelector(".content .battery").classList.remove("battery-middle");
        panelElement.querySelector(".content .battery").classList.add("battery-alert");
      } else if (value == null || value <= 50) { // Show Yellow
        panelElement.querySelector(".content .battery").classList.remove("battery-alert");
        panelElement.querySelector(".content .battery").classList.add("battery-middle");
      } else { // Show Green
        panelElement.querySelector(".content .battery").classList.remove("battery-middle");
        panelElement.querySelector(".content .battery").classList.remove("battery-alert");
      }

      if (value == null) {
        panelElement.querySelector(".content .percentage").innerHTML = '?';
        panelElement.querySelector(".content .battery .level").style.width = '100%';
        panelElement.querySelector(".content .battery").title = 'Battery Level: ?';
      } else {
        panelElement.querySelector(".content .battery .level").style.width = value + '%';
        value = panels[panelId].textFormat(value);
        panelElement.querySelector(".content .percentage").innerHTML = value;
        panelElement.querySelector(".content .battery").title = 'Battery Level: ' + value;
      }
    },
  },
  temperature: {
    serviceId: '0100',
    characteristicId: '0101',
    panelType: "graph",
    structure: ['Float32'],
    data: {temperature:[]},
    properties: ['notify'],
    textFormat: function(value) {
      return numeral((9 / 5 * value) + 32).format('0.00') + '&deg; F';
    },
  },
  light: {
    serviceId: '0300',
    characteristicId: '0301',
    panelType: "graph",
    structure: ['Float32'],
    data: {light:[]},
    properties: ['notify'],
  },
  accelerometer: {
    serviceId: '0200',
    characteristicId: '0201',
    panelType: "graph",
    structure: ['Float32', 'Float32', 'Float32'],
    data: {x:[], y:[], z:[]},
    properties: ['notify'],
    textFormat: function(value) {
      return numeral(value).format('0.00');
    },
    measurementPeriod: 500,
  },
  gyroscope: {
    serviceId: '0400',
    characteristicId: '0401',
    panelType: "graph",
    structure: ['Float32', 'Float32', 'Float32'],
    data: {x:[], y:[], z:[]},
    properties: ['notify'],
    textFormat: function(value) {
      return numeral(value).format('0.00');
    },
    measurementPeriod: 500,
  },
  magnetometer: {
    serviceId: '0500',
    characteristicId: '0501',
    panelType: "graph",
    structure: ['Float32', 'Float32', 'Float32'],
    data: {x:[], y:[], z:[]},
    properties: ['notify'],
    textFormat: function(value) {
      return numeral(value).format('0.00') + ' &micro;T';
    },
    measurementPeriod: 500,
  },
  buttons: {
    serviceId: '0600',
    characteristicId: '0601',
    panelType: "custom",
    structure: ['Uint32'],
    data: {buttonState:[]},
    properties: ['notify'],
    create: function(panelId) {
      let panelTemplate = loadPanelTemplate(panelId, 'onboard-buttons');
      for (let i = 0; i < currentBoard.buttons; i++) {
        let buttonTemplate = document.querySelector("#templates > .roundbutton").cloneNode(true);
        buttonTemplate.id = "button_" + (i + 1);
        buttonTemplate.querySelector(".text").innerHTML = String.fromCharCode(65 + i);
        panelTemplate.querySelector(".content").appendChild(buttonTemplate);
      }
    },
    update: function(panelId) {
      let panelElement = document.querySelector("#dashboard > #" + panelId);
      buttonState = panels[panelId].data.buttonState.pop();
      if (panels.switch.condition()) {
        panels.switch.update('switch'); // Update the switch because we aren't doing 2 notifys
      }
      // Match the buttons to the values
      for (let i = 1; i <= currentBoard.buttons; i++) {
        if (buttonState & (1 << i)) {
          panelElement.querySelector("#button_" + i + " .roundbtn").classList.add("pressed");
        } else {
          panelElement.querySelector("#button_" + i + " .roundbtn").classList.remove("pressed");
        }
      }
    },
  },
  switch: {
    serviceId: '0600',
    characteristicId: '0601',
    panelType: "custom",
    structure: ['Uint32'],
    data: {buttonState:[]},
    properties: [],
    condition: function() {
      return currentBoard.hasSwitch;
    },
    create: function(panelId) {
      let panelTemplate = loadPanelTemplate(panelId, 'onboard-switch');
      this.update(panelId);
    },
    update: function(panelId) {
      // UI Only Update
      let panelElement = document.querySelector("#dashboard > #" + panelId);
      panelElement.querySelector(".content #onboardSwitch").checked = buttonState & 1;
    },
  },
  humidity: {
    serviceId: '0700',
    characteristicId: '0701',
    panelType: "graph",
    structure: ['Float32'],
    data: {humidity:[]},
    properties: ['notify'],
    textFormat: function(value) {
      return numeral(value).format('0.0') + '%';
    },
  },
  barometric_pressure: {
    serviceId: '0800',
    characteristicId: '0801',
    panelType: "graph",
    structure: ['Float32'],
    data: {barometric:[]},
    properties: ['notify'],
    textFormat: function(value) {
      return numeral(value).format('0.00') + ' hPA';
    },
  },
  tone: {
    serviceId: '0c00',
    characteristicId: '0c01',
    panelType: "custom",
    create: function(panelId) {
      let panelTemplate = loadPanelTemplate(panelId, 'play-button');
      panelTemplate.querySelector(".content .button").onclick = function() {
        let button = this;
        button.disabled = true;
        playSound(440, 1000, function() {button.disabled = false;})
      }
      this.packetSequence = this.structure;
    },
    structure: ['Uint16', 'Uint32'],
    properties: ['write'],
  },
  neopixel: {
    serviceId: '0900',
    characteristicId: '0903',
    panelType: "color",
    structure: ['Uint16', 'Uint8', 'Uint8[]'],
    data: {R:[],G:[],B:[]},
    properties: ['write'],
  },
  'model3d': {
    title: '3D Model',
    serviceId: '0d00',
    characteristicId: '0d01',
    panelType: "model3d",
    structure: ['Float32', 'Float32', 'Float32', 'Float32'],
    data: {w:[],x:[], y:[], z:[]},
    style: "font-size: 16px;",
    properties: ['notify'],
    textFormat: function(value) {
      return numeral(value).format('0.00') + ' rad';
    },
    measurementPeriod: 200,
  },
};

function playSound(frequency, duration, callback) {
  if (callback === undefined) {
    callback = function() {};
  }

  let value = encodePacket('tone', [frequency, duration]);
  panels.tone.characteristic.writeValue(value)
    .catch(error => {console.log(error);})
    .then(callback);
}

function encodePacket(panelId, values) {
  const typeMap = {
    "Uint8":    {fn: DataView.prototype.setUint8,    bytes: 1},
    "Uint16":   {fn: DataView.prototype.setUint16,   bytes: 2},
    "Uint32":   {fn: DataView.prototype.setUint32,   bytes: 4},
    "Int32":    {fn: DataView.prototype.setInt32,    bytes: 4},
    "Float32":  {fn: DataView.prototype.setFloat32,  bytes: 4},
  };

  if (values.length != panels[panelId].packetSequence.length) {
    logMsg("Error in encodePacket(): Number of arguments must match structure");
    return false;
  }

  let bufferSize = 0, packetPointer = 0;
  panels[panelId].packetSequence.forEach(function(dataType) {
    bufferSize += typeMap[dataType].bytes;
  });

  let view = new DataView(new ArrayBuffer(bufferSize));

  for (var i = 0; i < values.length; i++) {
    let dataType = panels[panelId].packetSequence[i];
    let dataViewFn = typeMap[dataType].fn.bind(view);
    dataViewFn(packetPointer, values[i], true);
    packetPointer += typeMap[dataType].bytes;
  }

  return view.buffer;
}

/**
 * @name connect
 * Opens a Web Serial connection to a micro:bit and sets up the input and
 * output stream.
 */
async function connect() {
  // - Request a port and open a connection.
  if (!device) {
    logMsg('Connecting to device ...');
    let services = [];
    for (let panelId of Object.keys(panels)) {
      services.push(getFullId(panels[panelId].serviceId));
    }
    if (knownOnly.checked) {
      let knownBoards = Object.keys(boards);
      knownBoards.pop();
      let filters = [];
      for(let board of knownBoards) {
        filters.push({name: board});
      }
      device = await navigator.bluetooth.requestDevice({
        filters: filters,
        optionalServices: services,
      });
    } else {
      device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: services,
      });
    }
  }
  if (device) {
    logMsg("Connected to device " + device.name);
    if (boards.hasOwnProperty(device.name)) {
      currentBoard = boards[device.name];
    } else {
      currentBoard = boards.unknown;
    }
    device.addEventListener('gattserverdisconnected', onDisconnected);
    let server = await device.gatt.connect();
    const availableServices = await server.getPrimaryServices();

    // Create the panels only if service available
    for (let panelId of Object.keys(panels)) {
      if (panels[panelId].condition == undefined || panels[panelId].condition()) {
        if (getFullId(panels[panelId].serviceId).substr(0, 4) == "adaf") {
          for (const service of availableServices) {
            if (getFullId(panels[panelId].serviceId) == service.uuid) {
              createPanel(panelId);
            }
          }
        } else {
          // Non-custom ones such as battery are always active
          createPanel(panelId);
        }
      }
    }

    reset();

    for (let panelId of activePanels) {
      let service = await server.getPrimaryService(getFullId(panels[panelId].serviceId)).catch(error => {console.log(error);});
      if (service) {
        panels[panelId].characteristic = await service.getCharacteristic(getFullId(panels[panelId].characteristicId)).catch(error => {console.log(error);});
        logMsg('');
        logMsg('Characteristic Information');
        logMsg('---------------------------');
        logMsg('> Sensor:               ' + ucWords(panelId));
        logMsg('> Characteristic UUID:  ' + panels[panelId].characteristic.uuid);
        logMsg('> Broadcast:            ' + panels[panelId].characteristic.properties.broadcast);
        logMsg('> Read:                 ' + panels[panelId].characteristic.properties.read);
        logMsg('> Write w/o response:   ' + panels[panelId].characteristic.properties.writeWithoutResponse);
        logMsg('> Write:                ' + panels[panelId].characteristic.properties.write);
        logMsg('> Notify:               ' + panels[panelId].characteristic.properties.notify);
        logMsg('> Indicate:             ' + panels[panelId].characteristic.properties.indicate);
        logMsg('> Signed Write:         ' + panels[panelId].characteristic.properties.authenticatedSignedWrites);
        logMsg('> Queued Write:         ' + panels[panelId].characteristic.properties.reliableWrite);
        logMsg('> Writable Auxiliaries: ' + panels[panelId].characteristic.properties.writableAuxiliaries);

        if (panels[panelId].properties.includes("notify")) {
          if (panels[panelId].measurementPeriod !== undefined) {
            let mpChar = await service.getCharacteristic(getFullId(measurementPeriodId)).catch(error => {console.log(error);});
            let view = new DataView(new ArrayBuffer(4));
            view.setInt32(0, panels[panelId].measurementPeriod, true);
            mpChar.writeValue(view.buffer)
              .catch(error => {console.log(error);})
              .then(_ => {
              logMsg("Changed measurement period for " + ucWords(panelId) + " to " + panels[panelId].measurementPeriod + "ms");
            });
          }
          logMsg('Starting notifications for ' + ucWords(panelId));
          await panels[panelId].characteristic.startNotifications();
          panels[panelId].characteristic.addEventListener('characteristicvaluechanged', function(event){handleIncoming(panelId, event.target.value);});
        }
        if (panels[panelId].properties.includes("read")) {
          let intervalPeriod = 1000;
          if (panels[panelId].measurementPeriod !== undefined) {
            intervalPeriod = panels[panelId].measurementPeriod;
          }
          panels[panelId].polling = setInterval(function() {
            if (!panels[panelId].readInProgress) {
              panels[panelId].readInProgress = true;
            panels[panelId].characteristic.readValue()
              .then(function(data) {
                handleIncoming(panelId, data);
               }).catch(error => {});
              panels[panelId].readInProgress = false;
            }
          }, intervalPeriod);
        }
      }
    }
    readActiveSensors();
  }
}

async function readActiveSensors() {
  for (let panelId of activePanels) {
    let panel = panels[panelId];
    if (panels[panelId].properties.includes("read") || panels[panelId].properties.includes("notify")) {
      await panels[panelId].characteristic.readValue().then(function(data){handleIncoming(panelId, data);});
    }
  }
}

function handleIncoming(panelId, value) {
  const columns = Object.keys(panels[panelId].data);
  const typeMap = {
    "Uint8":    {fn: DataView.prototype.getUint8,    bytes: 1},
    "Uint16":   {fn: DataView.prototype.getUint16,   bytes: 2},
    "Uint32":   {fn: DataView.prototype.getUint32,   bytes: 4},
    "Float32":  {fn: DataView.prototype.getFloat32,  bytes: 4}
  };

  let packetPointer = 0, i = 0;
  panels[panelId].structure.forEach(function(dataType) {
    let dataViewFn = typeMap[dataType].fn.bind(value);
    let unpackedValue = dataViewFn(packetPointer, true);
    panels[panelId].data[columns[i]].push(unpackedValue);
    if (panels[panelId].data[columns[i]].length > bufferSize) {
      panels[panelId].data[columns[i]].shift();
    }
    packetPointer += typeMap[dataType].bytes;
    bytesReceived += typeMap[dataType].bytes;
    i++;
  });

  panels[panelId].rendered = false;
}

/**
 * @name disconnect
 * Closes the Web Bluetooth connection.
 */
async function disconnect() {
  if (device && device.gatt.connected) {
    device.gatt.disconnect();
  }
}

function getFullId(shortId) {
  if (shortId.length == 4) {
    return 'adaf' + shortId + '-c332-42a8-93bd-25e905756cb8';
  }
  return shortId;
}

function logMsg(text) {
  // Update the Log
  if (showTimestamp.checked) {
    let d = new Date();
    let timestamp = d.getHours() + ":" + `${d.getMinutes()}`.padStart(2, 0) + ":" +
        `${d.getSeconds()}`.padStart(2, 0) + "." + `${d.getMilliseconds()}`.padStart(3, 0);
    log.innerHTML += '<span class="timestamp">' + timestamp + ' -> </span>';
    d = null;
  }
  log.innerHTML += text+ "<br>";

  // Remove old log content
  if (log.textContent.split("\n").length > maxLogLength + 1) {
    let logLines = log.innerHTML.replace(/(\n)/gm, "").split("<br>");
    log.innerHTML = logLines.splice(-maxLogLength).join("<br>\n");
  }

  if (autoscroll.checked) {
    log.scrollTop = log.scrollHeight
  }
}

/**
 * @name updateTheme
 * Sets the theme to  Adafruit (dark) mode. Can be refactored later for more themes
 */
function updateTheme() {
  // Disable all themes
  document
    .querySelectorAll('link[rel=stylesheet].alternate')
    .forEach((styleSheet) => {
      enableStyleSheet(styleSheet, false);
    });

  if (darkMode.checked) {
    enableStyleSheet(darkSS, true);
  } else {
    enableStyleSheet(lightSS, true);
  }
}

function enableStyleSheet(node, enabled) {
  node.disabled = !enabled;
}

/**
 * @name reset
 * Reset the Panels, Log, and associated data
 */
async function reset() {
  // Clear the data
  clearGraphData();

  // Clear all Panel Data
  for (let panelId of activePanels) {
    let panel = panels[panelId];
    if (panels[panelId].data !== undefined) {
      Object.entries(panels[panelId].data).forEach(([field, item], index) => {
        panels[panelId].data[field] = [];
      });
    }
    panels[panelId].rendered = false;
  }

  bytesReceived = 0;
  colorIndex = 0;

  // Clear the log
  log.innerHTML = "";
}

/**
 * @name clickConnect
 * Click handler for the connect/disconnect button.
 */
async function clickConnect() {
  if (device && device.gatt.connected) {
    await disconnect();
    return;
  }

  await connect().then(_ => {toggleUIConnected(true);}).catch(() => {});
}

async function onDisconnected(event) {
  let disconnectedDevice = event.target;

  for (let panelId of activePanels) {
    if (typeof panels[panelId].polling !== 'undefined') {
      clearInterval(panels[panelId].polling);
    }
  }

  // Loop through activePanels and remove them
  destroyPanels();

  toggleUIConnected(false);
  logMsg('Device ' + disconnectedDevice.name + ' is disconnected.');

  device = undefined;
  currentBoard = undefined;
}

/**
 * @name clickAutoscroll
 * Change handler for the Autoscroll checkbox.
 */
async function clickAutoscroll() {
  saveSetting('autoscroll', autoscroll.checked);
}

/**
 * @name clickTimestamp
 * Change handler for the Show Timestamp checkbox.
 */
async function clickTimestamp() {
  saveSetting('timestamp', showTimestamp.checked);
}

/**
 * @name clickDarkMode
 * Change handler for the Dark Mode checkbox.
 */
async function clickDarkMode() {
  updateTheme();
  saveSetting('darkmode', darkMode.checked);
}



/**
 * @name clickKnownOnly
 * Change handler for the Show Only Known Devices checkbox.
 */
async function clickKnownOnly() {
  saveSetting('knownonly', knownOnly.checked);
}

/**
 * @name clickClear
 * Click handler for the clear button.
 */
async function clickClear() {
  reset();
}

function convertJSON(chunk) {
  try {
    let jsonObj = JSON.parse(chunk);
    return jsonObj;
  } catch (e) {
    return chunk;
  }
}

function toggleUIConnected(connected) {
  let lbl = 'Connect';
  if (connected) {
    lbl = 'Disconnect';
  }
  butConnect.textContent = lbl;
}

function loadAllSettings() {
  // Load all saved settings or defaults
  autoscroll.checked = loadSetting('autoscroll', true);
  showTimestamp.checked = loadSetting('timestamp', false);
  darkMode.checked = loadSetting('darkmode', false);
  knownOnly.checked = loadSetting('knownonly', true);
}

function loadSetting(setting, defaultValue) {
  let value = JSON.parse(window.localStorage.getItem(setting));
  if (value == null) {
    return defaultValue;
  }

  return value;
}

function saveSetting(setting, value) {
  window.localStorage.setItem(setting, JSON.stringify(value));
}

async function finishDrawing() {
  return new Promise(requestAnimationFrame);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function updateAllPanels() {
  for (let panelId of activePanels) {
    updatePanel(panelId);
  }

  // wait for frame to finish and request another frame
  await finishDrawing();
  await updateAllPanels();
}

function updatePanel(panelId) {
  if (!panels[panelId].rendered) {
    if (panels[panelId].panelType == "text") {
      updateTextPanel(panelId);
    } else if (panels[panelId].panelType == "graph") {
      updateGraphPanel(panelId);
    } else if (panels[panelId].panelType == "model3d") {
      update3dPanel(panelId);
    } else if (panels[panelId].panelType == "custom") {
      updateCustomPanel(panelId);
    }
    panels[panelId].rendered = true;
  }
}

function createPanel(panelId) {
  if (panels.hasOwnProperty(panelId)) {
    if (panels[panelId].panelType == "text") {
      createTextPanel(panelId);
    } else if (panels[panelId].panelType == "graph") {
      createGraphPanel(panelId);
    } else if (panels[panelId].panelType == "color") {
      createColorPanel(panelId);
    } else if (panels[panelId].panelType == "model3d") {
      create3dPanel(panelId);
    } else if (panels[panelId].panelType == "custom") {
      createCustomPanel(panelId);
    }
    panels[panelId].rendered = true;
    activePanels.push(panelId);
  }
}

function destroyPanels() {
  let activePanelCount = activePanels.length;
  for (let i = 0; i < activePanelCount; i++) {
    let itemToRemove = activePanels.pop();
    document.querySelector("#dashboard > #" + itemToRemove).remove();
  }
}

function clearGraphData() {
  for (let panelId of activePanels) {
    let panel = panels[panelId];
    if (panel.panelType == "graph") {
      panel.graph.clear();
    }
  }
}

function ucWords(text) {
  return text.replace('_', ' ').toLowerCase().replace(/(?<= )[^\s]|^./g, a=>a.toUpperCase())
}

function loadPanelTemplate(panelId, templateId) {
  if (templateId == undefined) {
    templateId = panels[panelId].panelType;
  }
    // Create Panel from Template
  let panelTemplate = document.querySelector("#templates > ." + templateId).cloneNode(true);
  panelTemplate.id = panelId;
  if (panels[panelId].title !== undefined) {
    panelTemplate.querySelector(".title").innerHTML = panels[panelId].title;
  } else {
    panelTemplate.querySelector(".title").innerHTML = ucWords(panelId);
  }

  dashboard.appendChild(panelTemplate)

  return panelTemplate;
}

/* Text Panel */
function createTextPanel(panelId) {
  // Create Panel from Template
  let panelTemplate = loadPanelTemplate(panelId);
  panelTemplate.querySelector(".content p").innerHTML = "-";
  if (panels[panelId].style !== undefined) {
    panelTemplate.querySelector(".content").style = panels[panelId].style;
  }
}

function updateTextPanel(panelId) {
  let panelElement = document.querySelector("#dashboard > #" + panelId);
  let panelContent = [];
  Object.entries(panels[panelId].data).forEach(([field, item], index) => {
    let value = "";
    if (panels[panelId].data[field].length > 0) {
      value = panels[panelId].data[field].pop(); // Show only the last piece of data
      panels[panelId].data[field] = [];
      if (panels[panelId].textFormat !== undefined) {
        value = panels[panelId].textFormat(value);
      }
    }
    if (value !== "") {
      panelContent.push(value);
    }
  });
  if (panelContent.length == 0) {
    panelContent = "-";
  } else {
    panelContent = panelContent.join("<br>");
  }
  panelElement.querySelector(".content p").innerHTML = panelContent;
}

/* Graph Panel */
function createGraphPanel(panelId) {
  // Create Panel from Template
  let panelTemplate = loadPanelTemplate(panelId);
  let canvas = panelTemplate.querySelector(".content canvas");

  // Create a canvas
  panels[panelId].graph = new Graph(canvas);
  panels[panelId].graph.create(false);

  // Setup graph
  Object.entries(panels[panelId].data).forEach(([field, item], index) => {
    panels[panelId].graph.addDataSet(field, colors[(colorIndex + index) % colors.length]);
    // Create text spans for each dataset and set the color here
    let textField = document.createElement('div');
    textField.style.color = colors[(colorIndex + index) % colors.length];
    textField.id = field;
    panelTemplate.querySelector(".content .text p").appendChild(textField);
  });
  colorIndex += Object.entries(panels[panelId].data).length;

  panels[panelId].graph.update();
}

function updateGraphPanel(panelId) {
  let panelElement = document.querySelector("#dashboard > #" + panelId);
  let panelContent = [];
  let multipleEntries = Object.entries(panels[panelId].data).length > 1;

  // Set Graph Data to match
  Object.entries(panels[panelId].data).forEach(([field, item], index) => {
    if (panels[panelId].data[field].length > 0) {
      let value = null;
      while(panels[panelId].data[field].length > 0) {
        value = panels[panelId].data[field].shift();
        panels[panelId].graph.addValue(index, value, false);
      }
      if (panels[panelId].textFormat !== undefined) {
        value = panels[panelId].textFormat(value);
      }
      if (value !== null) {
        if (multipleEntries) {
          value = ucWords(field) + ": " + value;
        }
        panelElement.querySelector(".content .text p #" + field).innerHTML = value;
      }
    } else {
      panels[panelId].graph.clearValues(index);
      if (multipleEntries) {
        panelElement.querySelector(".content .text p #" + field).innerHTML = ucWords(field) + ': -';
      } else {
        panelElement.querySelector(".content .text p #" + field).innerHTML = '-';
      }
    }

  });

  panels[panelId].graph.flushBuffer();
}

/* Color Panel */
function createColorPanel(panelId) {
  // Create Panel from Template
  let panelTemplate = loadPanelTemplate(panelId);

  let container = panelTemplate.querySelector('.content div');
  panels[panelId].colorPicker = colorjoe.rgb(container, 'red');

  // Update the panel packet sequence to match the number of LEDs on board
  panels[panelId].packetSequence = panels[panelId].structure.slice(0, 2);
  let dataType = panels[panelId].structure[2].replace(/\[\]/, '');
  for (let i = 0; i < currentBoard.neopixels * 3; i++) {
    panels[panelId].packetSequence.push(dataType);
  }

  // RGB Color Picker
  function updateModelLed(color) {
    logMsg("Changing neopixel to " + color.hex());
    let orderedColors = adjustColorOrder(Math.round(color.r() * 255),
                                         Math.round(color.g() * 255),
                                         Math.round(color.b() * 255));
    let values = [0, 1].concat(new Array(currentBoard.neopixels).fill(orderedColors).flat());
    let packet = encodePacket(panelId, values);
    panels[panelId].characteristic.writeValue(packet)
    .catch(error => {console.log(error);})
    .then(_ => {});
  }

  function adjustColorOrder(red, green, blue) {
    // Add more as needed
    switch(currentBoard.colorOrder) {
      case 'GRB':
        return [green, red, blue];
      default:
        return [red, green, blue];
    }
  }

  panels[panelId].colorPicker.on('done', updateModelLed);
}

/* 3D Panel */
function create3dPanel(panelId) {
  let panelTemplate = loadPanelTemplate(panelId);
  let canvas = panelTemplate.querySelector(".content canvas");

  // Make it visually fill the positioned parent
  canvas.style.width ='100%';
  canvas.style.height='100%';
  // ...then set the internal size to match
  canvas.width  = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;

  // Create a 3D renderer and camera
  panels[panelId].renderer = new THREE.WebGLRenderer({canvas});

  panels[panelId].camera = new THREE.PerspectiveCamera(45, canvas.width/canvas.height, 0.1, 100);
  panels[panelId].camera.position.set(0, -5, 30);

  // Set up the Scene
  panels[panelId].scene = new THREE.Scene();
  panels[panelId].scene.background = new THREE.Color('black');
  {
    const skyColor = 0xB1E1FF;  // light blue
    const groundColor = 0x999999;  // gray
    const intensity = 1;
    const light = new THREE.HemisphereLight(skyColor, groundColor, intensity);
    panels[panelId].scene.add(light);
  }

  {
    const color = 0xFFFFFF;
    const intensity = 3;
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(0, 10, 0);
    light.target.position.set(-5, 0, 0);
    panels[panelId].scene.add(light);
    panels[panelId].scene.add(light.target);
  }

  {
    const color = 0xFFFFFF;
    const intensity = 1;
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(0, -10, 0);
    light.target.position.set(5, 0, 0);
    panels[panelId].scene.add(light);
    panels[panelId].scene.add(light.target);
  }

  function frameArea(sizeToFitOnScreen, boxSize, boxCenter, camera) {
    const halfSizeToFitOnScreen = sizeToFitOnScreen * 0.5;
    const halfFovY = THREE.MathUtils.degToRad(camera.fov * 0.5);
    const distance = halfSizeToFitOnScreen / Math.tan(halfFovY);
    // compute a unit vector that points in the direction the camera is now
    // in the xz plane from the center of the box
    const direction = (new THREE.Vector3())
        .subVectors(camera.position, boxCenter)
        .multiply(new THREE.Vector3(1, 0, 1))
        .normalize();

    // move the camera to a position distance units way from the center
    // in whatever direction the camera was from the center already
    camera.position.copy(direction.multiplyScalar(distance).add(boxCenter));

    // pick some near and far values for the frustum that
    // will contain the box.
    camera.near = boxSize / 100;
    camera.far = boxSize * 100;

    camera.updateProjectionMatrix();

    // point the camera to look at the center of the box
    camera.lookAt(boxCenter.x, boxCenter.y, boxCenter.z);
  }

  {
    const gltfLoader = new GLTFLoader();
    gltfLoader.load('https://cdn.glitch.com/eeed3166-9759-4ba5-ba6b-aed272d6db80%2Fbunny.glb', (gltf) => {
      const root = gltf.scene;
      panels[panelId].model = root;
      panels[panelId].scene.add(root);

      const box = new THREE.Box3().setFromObject(root);

      const boxSize = box.getSize(new THREE.Vector3()).length();
      const boxCenter = box.getCenter(new THREE.Vector3());

      frameArea(boxSize * 1.25, boxSize, boxCenter, panels[panelId].camera);
    });
  }
}

function update3dPanel(panelId) {
  let panelElement = document.querySelector("#dashboard > #" + panelId);

  function resizeRendererToDisplaySize(renderer) {
    const canvas = renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const needResize = canvas.width !== width || canvas.height !== height;
    if (needResize) {
      renderer.setSize(width, height, false);
    }
    return needResize;
  }
  // Set Graph Data to match
  if (resizeRendererToDisplaySize(panels[panelId].renderer)) {
    const canvas = panels[panelId].renderer.domElement;
    panels[panelId].camera.aspect = canvas.clientWidth / canvas.clientHeight;
    panels[panelId].camera.updateProjectionMatrix();
  }

  let quaternion = {w: 1, x: 0, y: 0, z:0};
  Object.entries(panels[panelId].data).forEach(([field, item], index) => {
    if (panels[panelId].data[field].length > 0) {
      let value = panels[panelId].data[field].pop(); // Show only the last piece of data
      quaternion[field] = value;
      panels[panelId].data[field] = [];
    }
  });

  if (panels[panelId].model != undefined) {
    let rotObjectMatrix = new THREE.Matrix4();
    let rotationQuaternion = new THREE.Quaternion(quaternion.y, quaternion.z, quaternion.x, quaternion.w);
    rotObjectMatrix.makeRotationFromQuaternion(rotationQuaternion);
    panels[panelId].model.quaternion.setFromRotationMatrix(rotObjectMatrix);
  }

  panels[panelId].renderer.render(panels[panelId].scene, panels[panelId].camera);
}

function createCustomPanel(panelId) {
  if (panels[panelId].condition === undefined || panels[panelId].condition()) {
    if (panels[panelId].create != undefined) {
      panels[panelId].create(panelId);
    }
  }
}

function updateCustomPanel(panelId) {
  if (panels[panelId].condition === undefined || panels[panelId].condition()) {
    if (panels[panelId].update != undefined) {
      panels[panelId].update(panelId);
    }
  }
}

function createMockPanels() {
  currentBoard = boards.CLUE;
  for (let panelId of Object.keys(panels)) {
    if (panels[panelId].condition == undefined || panels[panelId].condition()) {
      // Non-custom ones such as battery are always active
      createPanel(panelId);
    }
  }
}
