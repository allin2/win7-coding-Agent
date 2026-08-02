'use strict';

const payload = {
  type: 'ready',
  pid: process.pid,
  memory: process.memoryUsage(),
  stdin: {
    readable: !!(process.stdin && process.stdin.readable),
    destroyed: !!(process.stdin && process.stdin.destroyed),
    isTTY: !!(process.stdin && process.stdin.isTTY),
  },
};

if (process.parentPort) {
  process.parentPort.postMessage(payload);
  process.parentPort.once('message', function () { process.exit(0); });
} else if (process.send) {
  process.send(payload);
  process.on('message', function () { process.exit(0); });
} else {
  process.stdout.write(JSON.stringify(payload) + '\n');
  process.exit(0);
}
