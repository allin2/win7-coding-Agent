'use strict';

// Manifest-bound, network-free RC-05 probe. The finite modes emit raw CP936
// bytes for 中文 so the packaged Runner exercises its real decoding path.
const mode = process.argv[2];
const chineseWord = Buffer.from([0xd6, 0xd0, 0xce, 0xc4]);

if (mode === 'positive') {
  process.stdout.write(Buffer.concat([chineseWord, Buffer.from('\r\n', 'ascii')]), () => process.exit(0));
} else if (mode === 'bounded') {
  process.stdout.write(Buffer.concat(Array.from({ length: 100 }, () => chineseWord)), () => process.exit(0));
} else if (mode === 'wait-for-cancel') {
  setInterval(() => {}, 1000);
} else {
  process.stderr.write('RC0506_LOCAL_PROBE_MODE_INVALID\r\n');
  process.exit(64);
}
