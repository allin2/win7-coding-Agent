'use strict';

const observed = {
  readable: !!(process.stdin && process.stdin.readable),
  destroyed: !!(process.stdin && process.stdin.destroyed),
  isTTY: !!(process.stdin && process.stdin.isTTY),
  hasRead: !!(process.stdin && typeof process.stdin.read === 'function'),
  dataSeen: false,
};

if (process.stdin && typeof process.stdin.once === 'function') {
  process.stdin.once('data', function () { observed.dataSeen = true; });
}

setTimeout(function () {
  if (process.parentPort) process.parentPort.postMessage({ type: 'stdio-observed', observed: observed });
}, 250);

if (process.parentPort) process.parentPort.once('message', function () { process.exit(0); });
