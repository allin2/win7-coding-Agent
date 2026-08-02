'use strict';

// utilityProcess 子进程：向父进程回报运行时信息，验证 Core 边界可行性。
process.parentPort.on('message', (msg) => {
  if (msg && msg.type === 'exit') {
    process.exit(0);
  }
});

process.parentPort.postMessage({
  type: 'ready',
  node: process.versions.node,
  pid: process.pid,
  electron: process.versions.electron,
});
