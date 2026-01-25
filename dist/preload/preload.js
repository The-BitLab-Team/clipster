"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('clipster', {
    getMode: () => electron_1.ipcRenderer.invoke('clipster:getMode'),
    setMode: (mode) => electron_1.ipcRenderer.invoke('clipster:setMode', mode),
    sendMessage: (message, history) => electron_1.ipcRenderer.invoke('clipster:sendMessage', message, history),
    onModeChanged: (callback) => {
        electron_1.ipcRenderer.on('clipster:modeChanged', (_event, mode) => callback(mode));
    },
});
