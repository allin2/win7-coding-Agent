/**
 * SPIKE 01 - 最小 preload 脚本
 *
 * 通过 contextBridge 仅暴露白名单 API 给渲染进程。
 * 安全约束：nodeIntegration=false, contextIsolation=true, sandbox=true
 *
 * Win7-Validation: NOT_PERFORMED
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// 白名单 API —— 渲染进程只能通过 window.spikeAPI 访问
contextBridge.exposeInMainWorld('spikeAPI', {
  /**
   * 获取版本信息（T01 / T02）
   * @returns {Promise<{electron, chrome, node, v8, os, arch, appVersion}>}
   */
  getVersions: () => ipcRenderer.invoke('get-versions'),

  /**
   * 健康检查 ping
   * @returns {Promise<string>} 'pong'
   */
  ping: () => ipcRenderer.invoke('ping'),

  /**
   * 获取路径兼容性测试结果（T03 / C10）
   * @returns {Promise<{dirname, hasCJK, hasSpace, compatible}>}
   */
  getPathTest: () => ipcRenderer.invoke('get-path-test'),

  /**
   * 获取 utilityProcess 可用性（T08）
   * @returns {Promise<{available, note}>}
   */
  getUtilityProcess: () => ipcRenderer.invoke('get-utility-process'),
});
