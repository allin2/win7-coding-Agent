'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mvpAcceptance', {
  report: function (payload) { return ipcRenderer.invoke('mvp:report', payload); },
  forbiddenInvoke: function () { return ipcRenderer.invoke('mvp:forbidden'); },
});
