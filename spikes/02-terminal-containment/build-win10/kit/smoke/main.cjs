'use strict';

const path = require('path');
const { app } = require('electron');

const outputRoot = process.env.WIN10_BUILD_OUTPUT;
if (!outputRoot) {
  process.stderr.write('WIN10_BUILD_OUTPUT is missing\n');
  process.exit(2);
}

app.whenReady().then(() => {
  const pty = require(path.join(outputRoot, 'node-pty'));
  let output = '';
  let finished = false;
  const timer = setTimeout(() => finish(3, 'timeout'), 15000);
  const terminal = pty.spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'echo WIN10_NATIVE_SMOKE'], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: process.env,
    useConpty: false
  });

  terminal.onData(data => { output += data; });
  terminal.onExit(event => {
    const ok = output.indexOf('WIN10_NATIVE_SMOKE') !== -1 && event.exitCode === 0;
    finish(ok ? 0 : 4, ok ? 'PASS' : 'marker-or-exit-failed', event);
  });

  function finish(code, status, event) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    process.stdout.write(JSON.stringify({
      status,
      marker: 'WIN10_NATIVE_SMOKE',
      output,
      exit: event || null,
      versions: process.versions,
      forced_backend: 'winpty'
    }) + '\n');
    app.exit(code);
  }
}).catch(error => {
  process.stderr.write(String(error && error.stack || error) + '\n');
  app.exit(5);
});
