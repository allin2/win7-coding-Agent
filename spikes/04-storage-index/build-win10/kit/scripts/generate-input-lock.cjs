'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const definitions = [
  ['inputs/electron-v22.3.27-win32-x64.zip', '22.3.27', 'https://github.com/electron/electron/releases/download/v22.3.27/electron-v22.3.27-win32-x64.zip'],
  ['inputs/node-v22.3.27-headers.tar.gz', '22.3.27', 'https://artifacts.electronjs.org/headers/dist/v22.3.27/node-v22.3.27-headers.tar.gz'],
  ['inputs/electron-v22.3.27-win-x64-node.lib', '22.3.27-x64', 'https://artifacts.electronjs.org/headers/dist/v22.3.27/win-x64/node.lib'],
  ['inputs/node-v16.17.1-win-x64.zip', '16.17.1', 'https://nodejs.org/dist/v16.17.1/node-v16.17.1-win-x64.zip'],
  ['inputs/better-sqlite3-8.7.0.tgz', '8.7.0', 'https://registry.npmjs.org/better-sqlite3/-/better-sqlite3-8.7.0.tgz'],
  ['inputs/better-sqlite3-8.7.0-metadata.json', '8.7.0 registry metadata', 'https://registry.npmjs.org/better-sqlite3/8.7.0'],
  ['project/schema/schema.sql', 'SPIKE_04 source snapshot', 'spikes/04-storage-index/schema/schema.sql'],
  ['project/schema/migrations.ts', 'SPIKE_04 source snapshot', 'spikes/04-storage-index/schema/migrations.ts'],
  ['tooling/package.json', 'a6-build-tooling-1.0.0', 'project build profile'],
  ['tooling/package-lock.json', 'lockfileVersion 2', 'npm official registry lock']
];

function entry([relative, version, source]) {
  const data = fs.readFileSync(path.join(root, relative));
  return {
    path: relative,
    version,
    sha256: crypto.createHash('sha256').update(data).digest('hex'),
    size: data.length,
    source
  };
}

const lock = {
  schema_version: 1,
  profile: 'WIN10-VS2019-V142-SDK19041-ELECTRON22-A6-SQLITE-X64',
  generated_at: '2026-08-07T00:00:00Z',
  inputs: definitions.map(entry)
};
fs.writeFileSync(path.join(root, 'input-lock.json'), JSON.stringify(lock, null, 2) + '\n');
process.stdout.write(JSON.stringify({ inputs: lock.inputs.length }) + '\n');
