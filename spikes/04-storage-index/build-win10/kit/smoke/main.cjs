'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const outputRoot = process.env.WIN10_BUILD_OUTPUT;
const schemaPath = process.env.WIN10_A6_SCHEMA;
if (!outputRoot || !schemaPath) {
  process.stderr.write('WIN10_BUILD_OUTPUT or WIN10_A6_SCHEMA is missing\n');
  process.exit(2);
}

app.whenReady().then(() => {
  const moduleRoot = path.join(outputRoot, 'runtime', 'node_modules', 'better-sqlite3');
  const nativeBinding = path.join(moduleRoot, 'build', 'Release', 'better_sqlite3.node');
  const Database = require(moduleRoot);
  const workDir = path.join(app.getPath('temp'), 'Win7 A6 SQLite 中文 空格 smoke');
  fs.mkdirSync(workDir, { recursive: true });
  const dbPath = path.join(workDir, '状态 索引.db');
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + suffix); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }

  const db = new Database(dbPath, { nativeBinding });
  try {
    db.pragma('trusted_schema = ON');
    const journalMode = db.pragma('journal_mode = WAL', { simple: true });
    const sqliteVersion = db.prepare('select sqlite_version() as version').get().version;
    const compileOptions = db.pragma('compile_options').map(row => row.compile_options).sort();
    const requiredOptions = ['ENABLE_FTS5', 'ENABLE_COLUMN_METADATA', 'THREADSAFE=2'];
    const missingOptions = requiredOptions.filter(option => !compileOptions.includes(option));
    if (sqliteVersion !== '3.43.1') throw new Error(`Unexpected SQLite version: ${sqliteVersion}`);
    if (missingOptions.length) throw new Error(`Missing SQLite compile options: ${missingOptions.join(',')}`);
    if (String(journalMode).toLowerCase() !== 'wal') throw new Error(`WAL not enabled: ${journalMode}`);

    db.exec(fs.readFileSync(schemaPath, 'utf8'));
    db.prepare(`insert into events
      (event_type, file_path, file_hash, file_size, mtime, ctime, timestamp, metadata)
      values (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('create', 'C:\\工作区\\中文 空格\\a6.ts', 'abc123', 42, 1, 1, Date.now(), 'A6_FTS5_MARKER 中文索引');
    const ftsRow = db.prepare("select event_id, file_path from events_fts where events_fts match 'A6_FTS5_MARKER'").get();
    if (!ftsRow || ftsRow.file_path.indexOf('中文 空格') === -1) throw new Error('FTS5 marker query failed');
    db.pragma('wal_checkpoint(TRUNCATE)');

    process.stdout.write(JSON.stringify({
      marker: 'WIN10_A6_SQLITE_SMOKE',
      status: 'PASS',
      versions: process.versions,
      better_sqlite3: require(path.join(moduleRoot, 'package.json')).version,
      sqlite: sqliteVersion,
      journal_mode: journalMode,
      trusted_schema: db.pragma('trusted_schema', { simple: true }),
      compile_options: compileOptions,
      required_compile_options: requiredOptions,
      missing_compile_options: missingOptions,
      fts5_query: 'PASS',
      unicode_space_path: 'PASS',
      schema: 'PASS'
    }) + '\n');
  } finally {
    db.close();
  }
  app.exit(0);
}).catch(error => {
  process.stderr.write(String(error && error.stack || error) + '\n');
  app.exit(5);
});
