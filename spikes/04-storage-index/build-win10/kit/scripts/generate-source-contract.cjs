'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sourceRoot = path.join(root, 'tooling', 'node_modules', 'better-sqlite3');
const files = [
  'package.json',
  'LICENSE',
  'binding.gyp',
  'src/better_sqlite3.cpp',
  'src/better_sqlite3.hpp',
  'deps/common.gypi',
  'deps/defines.gypi',
  'deps/sqlite3.gyp',
  'deps/sqlite3/sqlite3.c',
  'deps/sqlite3/sqlite3.h',
  'deps/sqlite3/sqlite3ext.h'
];

const contractFiles = files.map(relative => {
  const data = fs.readFileSync(path.join(sourceRoot, relative));
  return { path_in_package: relative, size: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex') };
});
const defines = fs.readFileSync(path.join(sourceRoot, 'deps', 'defines.gypi'), 'utf8');
const sqliteHeader = fs.readFileSync(path.join(sourceRoot, 'deps', 'sqlite3', 'sqlite3.h'), 'utf8');
if (!defines.includes('SQLITE_ENABLE_FTS5')) throw new Error('SQLITE_ENABLE_FTS5 is not present');
if (!sqliteHeader.includes('#define SQLITE_VERSION        "3.43.1"')) throw new Error('SQLite version is not 3.43.1');

const contract = {
  schema_version: 1,
  better_sqlite3: '8.7.0',
  sqlite: '3.43.1',
  license: 'MIT',
  sqlite_legal_status: 'public domain',
  required_source_markers: {
    'deps/defines.gypi': ['SQLITE_ENABLE_FTS5', 'SQLITE_ENABLE_COLUMN_METADATA', 'SQLITE_THREADSAFE=2'],
    'deps/sqlite3/sqlite3.h': ['#define SQLITE_VERSION        "3.43.1"']
  },
  files: contractFiles
};
fs.writeFileSync(path.join(root, 'compliance', 'source-contract.json'), JSON.stringify(contract, null, 2) + '\n');
process.stdout.write(JSON.stringify({ files: contractFiles.length }) + '\n');
