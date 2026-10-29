'use strict';
const { parentPort, workerData } = require('worker_threads');
(async () => {
  try {
    const { processOffice } = require('./office-lite-engine');
    if (workerData.buffer) workerData.buffer = Buffer.from(workerData.buffer);
    parentPort.postMessage({ ok: true, result: await processOffice(workerData) });
  } catch (error) {
    const code = /^A9_OFFICE_[A-Z_]+$/.test(String(error.code || '')) ? error.code : 'A9_OFFICE_INVALID_DOCUMENT';
    parentPort.postMessage({ ok: false, error: { code, message: code } });
  } finally { parentPort.close(); }
})();
