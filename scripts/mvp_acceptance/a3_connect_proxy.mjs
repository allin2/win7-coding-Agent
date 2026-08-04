#!/usr/bin/env node

/** Ephemeral HTTP CONNECT proxy for A3 success/407 classification tests. */
import http from 'http';
import net from 'net';

const bind = argument('--bind=') || '127.0.0.1';
const port = Number(argument('--port=') || 0);
const mode = argument('--mode=') || 'success';
const proxy = http.createServer((_req, res) => {
  res.writeHead(405);
  res.end();
});
proxy.on('connect', (request, clientSocket, head) => {
  process.stderr.write(`A3_PROXY_CONNECT ${String(request.url || '').replace(/[^0-9a-zA-Z.:-]/g, '_')}\n`);
  if (mode === '407') {
    clientSocket.write('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="A3"\r\n\r\n');
    clientSocket.destroy();
    return;
  }
  const [host, rawPort] = String(request.url || '').split(':');
  const target = net.connect({ host, port: Number(rawPort) });
  target.once('connect', () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head && head.length > 0) target.write(head);
    target.pipe(clientSocket);
    clientSocket.pipe(target);
  });
  target.on('error', (error) => {
    process.stderr.write(`A3_PROXY_TARGET_ERROR ${String(error && error.code || 'UNKNOWN')}\n`);
    clientSocket.destroy();
  });
  clientSocket.on('error', (error) => {
    process.stderr.write(`A3_PROXY_CLIENT_ERROR ${String(error && error.code || 'UNKNOWN')}\n`);
    target.destroy();
  });
});
proxy.listen(port, bind, () => {
  const address = proxy.address();
  const actualPort = address && typeof address !== 'string' ? address.port : port;
  process.stdout.write(`A3_PROXY_READY ${JSON.stringify({ bind, port: actualPort, mode })}\n`);
});
process.on('SIGTERM', () => proxy.close(() => process.exit(0)));
process.on('SIGINT', () => proxy.close(() => process.exit(0)));

function argument(prefix) {
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : undefined;
}
