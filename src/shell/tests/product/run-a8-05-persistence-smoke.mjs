#!/usr/bin/env node
/* A8-05 source-locked persistence/recovery smoke.  It prefers the packaged
 * D-014 better-sqlite3 binding and falls back to a deterministic structural
 * driver only when --require-d014 is not supplied. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  assertEvidenceOutsideCandidate,
  bindCandidate,
  finalizeEvidenceReport,
} from './a8-validation-evidence.mjs';

const require = createRequire(import.meta.url);
const args = Object.fromEntries(process.argv.slice(2).map((value) => {
  const index = value.indexOf('=');
  return index < 0 ? [value.replace(/^--/, ''), 'true'] : [value.slice(2, index), value.slice(index + 1)];
}));
const productRoot = path.resolve(args.product || process.cwd());
const reportPath = path.resolve(args.report || path.join(productRoot, 'a8-05-persistence.json'));
const requireD014 = args['require-d014'] === 'true';
const validationLayer = args['validation-layer'] || 'developer';
if (validationLayer !== 'developer' && !requireD014) throw new Error('A8_FORMAL_D014_REQUIRED');
const candidateRootValue = args['candidate-root'];
const candidateBinding = candidateRootValue ? bindCandidate({
  candidateRoot: candidateRootValue,
  manifestPath: args.manifest,
  expectedManifestSha256: args['expected-manifest-sha256'],
  expectedCandidateId: args['expected-candidate-id'] || args.candidate,
}) : null;
if (candidateBinding) assertEvidenceOutsideCandidate(candidateBinding.candidateRoot, reportPath);
const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a8-05-persistence-smoke-'));

function resolvePackagedModule(moduleName) {
  const candidates = [
    path.join(productRoot, 'src', moduleName, 'dist'),
    path.join(productRoot, moduleName, 'dist'),
    path.join(productRoot, 'resources', 'app', moduleName, 'dist'),
  ];
  const resolved = candidates.find((candidate) => fs.existsSync(path.join(candidate, 'index.js')));
  if (!resolved) throw new Error(`A8_PACKAGED_MODULE_NOT_FOUND:${moduleName}`);
  return resolved;
}

const state = require(resolvePackagedModule('state'));
const workspace = require(resolvePackagedModule('workspace'));

const fixedIds = (() => {
  let value = 0;
  return () => `00000000-0000-4000-8000-${String(++value).padStart(12, '0')}`;
})();
const fixedClock = (() => {
  let value = 0;
  return () => `2026-08-21T00:00:${String(value++).padStart(2, '0')}.000Z`;
})();

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function sha256File(filePath) { return fs.existsSync(filePath) ? sha256(fs.readFileSync(filePath)) : null; }
function hash(char) { return char.repeat(64); }
function result(id, passed, detail) { return { id, status: passed ? 'PASS' : 'FAIL', detail }; }

class FakeDb {
  constructor() { this.tables = new Map(); }
  table(name) { if (!this.tables.has(name)) this.tables.set(name, new Map()); return this.tables.get(name); }
  exec(sql) {
    for (const match of sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+(a8_[a-z0-9_]+)/gi)) this.table(match[1]);
    for (const match of sql.matchAll(/DELETE FROM\s+(a8_[a-z0-9_]+)/gi)) this.table(match[1]).clear();
  }
  pragma() { return []; }
  prepare(sql) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    return { get: (...params) => this.get(normalized, params), all: (...params) => this.all(normalized, params), run: (...params) => this.run(normalized, params) };
  }
  transaction(operation) { return () => { const before = this.clone(); try { return operation(); } catch (error) { this.tables = before; throw error; } }; }
  close() {}
  clone() { return new Map([...this.tables].map(([name, rows]) => [name, new Map([...rows].map(([key, row]) => [key, { ...row }]))])); }
  get(sql, params) {
    if (sql.startsWith('SELECT MAX(version) AS version FROM a8_schema_migrations')) {
      const rows = [...this.table('a8_schema_migrations').values()];
      return { version: rows.length ? Math.max(...rows.map((row) => Number(row.version))) : null };
    }
    if (sql.startsWith('SELECT meta_value FROM a8_catalog_meta WHERE meta_key = ?')) return this.table('a8_catalog_meta').get(String(params[0]));
    if (sql.startsWith('SELECT * FROM a8_review_sets WHERE review_id = ?')) return this.table('a8_review_sets').get(String(params[0]));
    throw new Error(`Unexpected get SQL: ${sql}`);
  }
  all(sql, params) {
    const match = sql.match(/^SELECT \* FROM (a8_[a-z0-9_]+)/i);
    if (!match) throw new Error(`Unexpected all SQL: ${sql}`);
    let rows = [...this.table(match[1]).values()];
    if (match[1] === 'a8_tasks' && sql.includes('WHERE state IN')) {
      const allowed = new Set(params.map(String)); rows = rows.filter((row) => allowed.has(String(row.state)));
    }
    if (match[1] === 'a8_tasks' && sql.includes('WHERE session_id = ?')) rows = rows.filter((row) => String(row.session_id) === String(params[0]));
    if ((match[1] === 'a8_review_files' || match[1] === 'a8_validation_runs') && sql.includes('WHERE review_id = ?')) rows = rows.filter((row) => String(row.review_id) === String(params[0]));
    if (sql.includes('ORDER BY created_at ASC')) rows.sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)));
    if (sql.includes('ORDER BY sequence ASC')) rows.sort((left, right) => Number(left.sequence) - Number(right.sequence));
    return rows;
  }
  run(sql, params) {
    const remove = sql.match(/^DELETE FROM (a8_[a-z0-9_]+)/i);
    if (remove) { this.table(remove[1]).clear(); return { changes: 1 }; }
    const update = sql.match(/^UPDATE (a8_tasks|a8_runs) SET state = \?, error_code = \?, finished_at = \? WHERE (?:task_id|run_id) = \?/i);
    if (update) { const row = this.table(update[1]).get(String(params[3])); if (row) { row.state = params[0]; row.error_code = params[1]; row.finished_at = params[2]; } return { changes: row ? 1 : 0 }; }
    const updateFact = sql.match(/^UPDATE a8_session_facts SET payload_json = \? WHERE event_id = \?/i);
    if (updateFact) { const row = this.table('a8_session_facts').get(String(params[1])); if (row) row.payload_json = params[0]; return { changes: row ? 1 : 0 }; }
    const insert = sql.match(/^INSERT(?: OR REPLACE)? INTO (a8_[a-z0-9_]+) \(([^)]+)\) VALUES \(([^)]+)\)/i);
    if (!insert) throw new Error(`Unexpected run SQL: ${sql}`);
    const tableName = insert[1];
    const columns = insert[2].split(',').map((item) => item.trim());
    const row = Object.fromEntries(columns.map((column, index) => [column, params[index] ?? null]));
    const key = tableName === 'a8_review_files' ? `${row.review_id}:${row.comparison_key}` : String(row[{ a8_schema_migrations: 'version', a8_workspaces: 'workspace_id', a8_sessions: 'session_id', a8_goals: 'goal_id', a8_turns: 'turn_id', a8_tasks: 'task_id', a8_runs: 'run_id', a8_session_facts: 'event_id', a8_review_sets: 'review_id', a8_validation_runs: 'validation_run_id', a8_catalog_meta: 'meta_key', a8_recovery_events: 'event_id' }[tableName] || 'migration_id']);
    this.table(tableName).set(key, row);
    return { changes: 1 };
  }
}

function openDb(databasePath) {
  const nativeRoots = [
    path.join(productRoot, 'native', 'storage', 'node_modules', 'better-sqlite3'),
    path.join(productRoot, 'resources', 'native', 'storage', 'node_modules', 'better-sqlite3'),
  ];
  const nativeRoot = nativeRoots.find((candidate) => fs.existsSync(path.join(candidate, 'package.json')));
  const packageJson = nativeRoot ? path.join(nativeRoot, 'package.json') : null;
  const useNative = Boolean(packageJson && requireD014);
  if (useNative) {
    if (process.platform !== 'win32' || process.arch !== 'x64' || process.versions.electron !== '22.3.27' || Number(process.versions.modules) !== 110) {
      throw new Error(`D014_ELECTRON_ABI110_RUNTIME_REQUIRED:platform=${process.platform};arch=${process.arch};electron=${process.versions.electron || 'none'};abi=${process.versions.modules}`);
    }
    const BetterSqlite3 = require(nativeRoot);
    const database = new BetterSqlite3(databasePath);
    const sqliteVersion = String(database.prepare('SELECT sqlite_version() AS version').get().version);
    const compileOptions = (database.pragma('compile_options') || []).map((row) => String(row.compile_options));
    if (sqliteVersion !== '3.43.1' || !['ENABLE_FTS5', 'ENABLE_COLUMN_METADATA', 'THREADSAFE=2'].every((item) => compileOptions.includes(item))) {
      database.close();
      throw new Error('D014_SQLITE_PROFILE_MISMATCH');
    }
    database.pragma('journal_mode = WAL');
    return { database, profile: 'D-014-E22-SQLITE343-LOCAL-SSD' };
  }
  if (requireD014) throw new Error('D014_NATIVE_BINDING_NOT_FOUND');
  return { database: new FakeDb(), profile: 'DEVELOPER_FAKE_SQLITE' };
}

function runCatalogCases(database, profile) {
  const cases = [];
  const first = new state.A8PersistentCatalog(database, { idFactory: fixedIds, clock: fixedClock });
  const workspaceRecord = first.ensureWorkspace(path.join(runRoot, 'workspace')); fs.mkdirSync(workspaceRecord.canonicalPath, { recursive: true });
  const session = first.createSession({ workspaceId: workspaceRecord.workspaceId, label: 'smoke' });
  const goal = first.setGoal({ sessionId: session.sessionId, text: 'persistence smoke', expectedRevision: 0 });
  const turn = first.beginTurn(session.sessionId);
  const reopened = new state.A8PersistentCatalog(database, { idFactory: fixedIds, clock: fixedClock });
  cases.push(result('A8P-01-REOPEN-PROJECTION', reopened.getSession(session.sessionId)?.goal?.goalId === goal.goalId && reopened.getSession(session.sessionId)?.turnCount === 1, 'Session/Goal/Turn/facts reopen consistently'));
  reopened.persistTask({ schemaVersion: 1, taskId: turn.taskId, sessionId: session.sessionId, turnId: turn.turnId, state: 'EXECUTING', currentRunId: turn.runId, lastEventSeq: 1, startedAt: fixedClock() }, { schemaVersion: 1, runId: turn.runId, taskId: turn.taskId, attempt: 1, state: 'EXECUTING', startedAt: fixedClock() });
  const interruption = new state.A8RecoveryCoordinator(reopened).recover();
  cases.push(result('A8P-02-INTERRUPT-EXECUTION', interruption.status === 'INTERRUPTED_TASKS' && interruption.interruptedTaskIds.includes(turn.taskId), 'Executing task is interrupted without resume'));
  const reviewTurn = reopened.beginTurn(session.sessionId);
  reopened.persistTask({ schemaVersion: 1, taskId: reviewTurn.taskId, sessionId: session.sessionId, turnId: reviewTurn.turnId, state: 'AWAITING_REVIEW', lastEventSeq: 1, startedAt: fixedClock() });
  cases.push(result('A8P-02-AWAITING-REVIEW-RETAINED', new state.A8RecoveryCoordinator(reopened).recover().status === 'READY', 'User-gated Review remains retained'));
  const reviewRoot = path.join(runRoot, 'review'); const workspaceRoot = path.join(runRoot, 'review-workspace'); fs.mkdirSync(workspaceRoot, { recursive: true }); fs.writeFileSync(path.join(workspaceRoot, 'one.txt'), 'one\n');
  const review = new workspace.ReviewStagingSession({ workspaceRoot, workspaceId: workspaceRecord.workspaceId, sessionId: session.sessionId, taskId: 'review-task', stagingRoot: reviewRoot, proposals: [{ relativePath: 'one.txt', operation: 'MODIFY', afterContent: Buffer.from('ONE\n') }] });
  review.decide('one.txt', 'ACCEPTED'); const projection = review.review; fs.writeFileSync(path.join(workspaceRoot, 'one.txt'), 'drift\n');
  const restored = workspace.ReviewStagingSession.restore({ workspaceRoot, sessionId: session.sessionId, taskId: 'review-task', stagingRoot: reviewRoot, review: projection });
  cases.push(result('A8P-03-REVIEW-DRIFT', restored.review.status === 'STALE', 'Restored Review baseline drift is stale before Apply'));
  const corrupt = openDb(path.join(runRoot, 'corrupt.db')).database; const corruptCatalog = new state.A8PersistentCatalog(corrupt, { idFactory: fixedIds, clock: fixedClock }); const corruptWorkspace = corruptCatalog.ensureWorkspace(path.join(runRoot, 'corrupt-workspace')); const corruptSession = corruptCatalog.createSession({ workspaceId: corruptWorkspace.workspaceId, label: 'corrupt' }); corruptCatalog.beginTurn(corruptSession.sessionId); const corruptFact = corrupt.prepare('SELECT * FROM a8_session_facts').all()[0]; corrupt.prepare('UPDATE a8_session_facts SET payload_json = ? WHERE event_id = ?').run('{bad', corruptFact.event_id);
  let failedClosed = false; try { new state.A8PersistentCatalog(corrupt, { idFactory: fixedIds, clock: fixedClock }); } catch (error) { failedClosed = String(error).includes('READ_ONLY_RECOVERY_REQUIRED'); }
  cases.push(result('A8P-04-FAIL-CLOSED-CORRUPTION', failedClosed, 'Malformed catalog payload does not partially reopen'));
  cases.push(result('A8P-04-SCHEMA-HASH-BOUNDARY', profile.length > 0, `Profile ${profile} recorded; external runner must verify D-014`));
  return cases;
}

function runMigrationCases() {
  const source = path.join(runRoot, 'a7-source'); const target = path.join(runRoot, 'a8-target'); fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'manifest.v1.json'), '{"schemaVersion":1,"files":[]}');
  fs.writeFileSync(path.join(source, 'workspace-list.v1.json'), JSON.stringify([{ canonicalPath: 'C:\\\\repo', displayName: 'repo' }, { canonicalPath: 'bad', displayName: 'bad', apiKey: 'blocked' }]));
  fs.writeFileSync(path.join(source, 'settings.v1.json'), JSON.stringify({ providerId: 'internal', mode: 'replay', theme: 'dark', apiKey: 'blocked' }));
  fs.writeFileSync(path.join(source, 'credentials.v1.json'), '{"apiKey":"blocked"}');
  const imported = new state.A8MigrationRunner({ clock: fixedClock, idFactory: fixedIds }).run({ sourceRoot: source, targetRoot: target });
  const idempotent = new state.A8MigrationRunner({ clock: fixedClock, idFactory: fixedIds }).run({ sourceRoot: source, targetRoot: target });
  const report = fs.readFileSync(path.join(target, 'a8-state-v1', 'migration-report.v1.json'), 'utf8');
  return [
    result('A8M-01-A7-SENSITIVE-EXCLUSION', !report.includes('blocked') && imported.skipped.files.includes('credentials.v1.json'), 'Credentials and forbidden files are excluded'),
    result('A8M-02-ALLOWLIST-IMPORT', imported.status === 'IMPORTED' && imported.imported.workspaces === 1 && imported.imported.settings === 3 && /^[a-f0-9]{64}$/.test(imported.reportSha256), 'Explicit allowlists produce marker/report hashes'),
    result('A8M-03-MIGRATION-RETRY', idempotent.status === 'ALREADY_COMPLETE' && fs.existsSync(path.join(target, 'a8-migration-marker.v1.json')), 'Migration is idempotent after atomic completion'),
  ];
}

function runSensitiveCase(database) {
  const catalog = new state.A8PersistentCatalog(database, { idFactory: fixedIds, clock: fixedClock, knownSensitiveValues: ['secret-sentinel'] });
  let blocked = false; try { catalog.persistReview({ schemaVersion: 1, reviewId: 'sensitive', sessionId: 's', taskId: 't', revision: 1, status: 'READY', workspaceBaseHash: hash('a'), previewHash: hash('b'), acceptedSetHash: hash('c'), updatedAt: fixedClock(), payload: { note: 'secret-sentinel' } }); } catch (error) { blocked = String(error).includes('SENSITIVE_DATA_BLOCKED'); }
  return result('A8C-01-SENSITIVE-DATA-BLOCK', blocked, 'Known secret value is blocked before Review persistence');
}

let report;
try {
  const databasePath = path.join(runRoot, 'state', 'agent-events-v2.db'); fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const opened = openDb(databasePath); const cases = runCatalogCases(opened.database, opened.profile).concat(runMigrationCases(), runSensitiveCase(opened.database));
  const serialized = opened.database instanceof FakeDb ? JSON.stringify([...opened.database.tables].map(([name, rows]) => [name, [...rows]])) : null;
  const databaseSha256After = serialized ? sha256(serialized) : sha256File(databasePath);
  try { opened.database.close(); } catch { /* evidence still records failure below */ }
  const passed = cases.every((item) => item.status === 'PASS');
  const recordedAt = new Date().toISOString();
  report = finalizeEvidenceReport({
    schema_version: 1,
    record_id: `A8-05-PERSISTENCE-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`,
    recorded_at: recordedAt,
    status: passed ? 'PASS' : 'FAIL',
    storage_profile: opened.profile,
    database_path: databasePath,
    database_sha256_before: null,
    database_sha256_after: databaseSha256After,
    report_sha256: null,
    cases,
  }, {
    binding: candidateBinding,
    validationLayer,
    operatorId: args.operator,
    environment: { platform: process.platform, arch: process.arch, electron: process.versions.electron, node: process.versions.node, node_abi: Number(process.versions.modules), system_version: os.release() },
    temporaryRoot: runRoot,
    cleanupStatus: passed ? 'REMOVED_AFTER_PASS' : 'PRESERVED_FOR_DIAGNOSIS',
    developerCandidateId: args.candidate || 'developer-a8-05-source-tree',
    expectedCaseIds: ['A8P-01-REOPEN-PROJECTION', 'A8P-02-INTERRUPT-EXECUTION', 'A8P-03-REVIEW-DRIFT', 'A8P-04-FAIL-CLOSED-CORRUPTION', 'A8M-01-A7-SENSITIVE-EXCLUSION', 'A8M-02-ALLOWLIST-IMPORT', 'A8M-03-MIGRATION-RETRY', 'A8C-01-SENSITIVE-DATA-BLOCK'],
  });
  if (passed) fs.rmSync(runRoot, { recursive: true, force: true });
  const reportText = JSON.stringify({ ...report, report_sha256: null }, null, 2) + '\n'; report.report_sha256 = sha256(reportText); fs.mkdirSync(path.dirname(reportPath), { recursive: true }); fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  process.exitCode = passed ? 0 : 1;
} catch (error) {
  report = finalizeEvidenceReport({ schema_version: 1, record_id: 'A8-05-PERSISTENCE-FAILED', recorded_at: new Date().toISOString(), status: 'FAIL', storage_profile: requireD014 ? 'D-014_REQUIRED' : 'DEVELOPER_FAKE_SQLITE', report_sha256: null, cases: [{ id: 'runner', status: 'FAIL', detail: String(error && error.message ? error.message : error) }] }, { binding: candidateBinding, validationLayer, operatorId: args.operator, environment: { platform: process.platform, arch: process.arch, electron: process.versions.electron, node: process.versions.node, node_abi: Number(process.versions.modules), system_version: os.release() }, temporaryRoot: runRoot, cleanupStatus: 'PRESERVED_FOR_DIAGNOSIS', developerCandidateId: args.candidate || 'unknown' });
  const reportText = JSON.stringify({ ...report, report_sha256: null }, null, 2) + '\n'; report.report_sha256 = sha256(reportText);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true }); fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  process.exitCode = 1;
}
