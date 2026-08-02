'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// 仅暴露最小上报通道给渲染进程（验证 contextBridge / 沙箱隔离）
contextBridge.exposeInMainWorld('acceptance', {
  report: (data) => ipcRenderer.send('acc-report', data),
});
