/// <reference path="./better-sqlite3.d.ts" />
import * as childProcess from 'child_process';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import * as util from 'util';
import * as vm from 'vm';
import Database from 'better-sqlite3';

// A9-33 batch-2 contract tests. Dev-machine evidence only: nothing here starts Electron, PowerShell, Win10 or Win7.
const releaseDir = path.resolve(__dirname, '../../../../release/win7-product-v3');
const fixtures = require(path.join(releaseDir, 'a9-batch2-fixtures.cjs')) as any;
const requests = require(path.join(releaseDir, 'a9-batch2-desktop-request.cjs')) as any;
const report = require(path.join(releaseDir, 'a9-batch2-report.cjs')) as any;
const smoke = require(path.join(releaseDir, 'a9-batch2-smoke.cjs')) as any;
const driver = require(path.resolve(__dirname, 'a9-batch2-driver-entry.cjs')) as any;
const { createA9AgentRuntime } = require('../../product/a9-agent-runtime') as any;

describe('ADR-0259 driver approval refresh', () => {
  const source = fs.readFileSync(path.resolve(__dirname, 'a9-batch2-driver-entry.cjs'), 'utf8');
  const ts = require('typescript');
  const tree = ts.createSourceFile('driver.cjs', source, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS);
  const sites: { name: string; code: string }[] = [];
  let resultHandler = '';
  const visit = (node: any) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'approvalRefreshResult') resultHandler = `const ${node.getText(tree)};`;
    if (ts.isCallExpression(node) && node.expression.getText(tree) === 'exec'
      && node.arguments[0]?.getText(tree).includes('window.win7Agent.a9.resumeApproval(')) {
      let declaration = node.parent;
      while (declaration && !ts.isVariableDeclaration(declaration)) declaration = declaration.parent;
      if (!declaration) throw new Error('approval exec must have a testable declaration');
      sites.push({ name: declaration.name.getText(tree), code: `const ${declaration.getText(tree)};` });
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  const approval = { approvalId: 'approval-"1', bindingDigest: 'digest-1', conversationId: 'conversation-1', taskId: 'task-1', turnId: 'turn-1' };
  const harness = (site: { name: string; code: string }, resumeApproval: any, refreshSnapshot: any) => {
    const out = jest.fn();
    const exec = jest.fn((code: string) => vm.runInNewContext(code, { window: { win7Agent: { a9: { resumeApproval } }, win7AgentA9Workbench: { refreshSnapshot } } }));
    const box: any = { exec, out };
    vm.runInNewContext(`${resultHandler}\n${site.code}\nthis.reply = ${site.name};`, box);
    const args = site.name === 'oldApprovalResult' ? [{ ...approval, approval }] : [approval, 'denied', { digest: 'override-digest', conversation: 'override-conversation' }];
    const expected = [approval.approvalId, site.name === 'oldApprovalResult' ? 'approved' : 'denied',
      site.name === 'oldApprovalResult' ? approval.bindingDigest : 'override-digest',
      site.name === 'oldApprovalResult' ? approval.conversationId : 'override-conversation', approval.taskId, approval.turnId];
    return { invoke: () => box.reply(...args), exec, out, expected };
  };
  test('every direct resumeApproval call is covered by a renderer execution regression', () => {
    expect(sites.map((site) => site.name).sort()).toEqual(['approvalReply', 'oldApprovalResult']);
    expect(sites).toHaveLength((source.match(/window\.win7Agent\.a9\.resumeApproval\s*\(/g) || []).length);
  });
  describe.each(sites)('$name', (site) => {
    test.each([true, false])('returns the original ok=%s reply only after one refresh in the same execution', async (ok) => {
      const calls: string[] = []; const result = { ok, error: ok ? undefined : { code: 'A9_APPROVAL_STALE' } };
      const resume = jest.fn(async () => { calls.push('resume'); await Promise.resolve(); calls.push('returned'); return result; });
      const refresh = jest.fn(async () => { calls.push('refresh'); await Promise.resolve(); calls.push('refreshed'); return { status: 'ready' }; });
      const run = harness(site, resume, refresh);
      expect(await run.invoke()).toBe(result);
      expect(resume).toHaveBeenCalledTimes(1); expect(resume).toHaveBeenCalledWith(...run.expected);
      expect(refresh).toHaveBeenCalledTimes(1); expect(refresh).toHaveBeenCalledWith();
      expect(calls).toEqual(['resume', 'returned', 'refresh', 'refreshed']); expect(run.exec).toHaveBeenCalledTimes(1); expect(run.out).not.toHaveBeenCalled();
    });
    test.each(['throw', 'null', 'undefined'])('a %s refresh failure preserves the reply in evidence and rejects the driver', async (kind) => {
      const result = { ok: true, result: { outcome: 'blocked', turnId: approval.turnId } };
      const resume = jest.fn(async () => result);
      const refresh = jest.fn(async () => { if (kind === 'throw') throw new Error('snapshot transport failed'); return kind === 'null' ? null : undefined; });
      const run = harness(site, resume, refresh);
      await expect(run.invoke()).rejects.toThrow('A9_BATCH2_DRIVER_APPROVAL_REFRESH_FAILED');
      expect(run.out).toHaveBeenCalledTimes(1);
      expect(run.out).toHaveBeenCalledWith('approval-refresh-error.json', { result, refresh_error: kind === 'throw' ? 'snapshot transport failed' : 'A9_BATCH2_DRIVER_APPROVAL_REFRESH_EMPTY' });
      expect(resume).toHaveBeenCalledTimes(1); expect(refresh).toHaveBeenCalledTimes(1); expect(run.exec).toHaveBeenCalledTimes(1);
    });
    test('a rejected API call propagates without a refresh or replay', async () => {
      const error = new Error('resume transport failed'); const resume = jest.fn(async () => { throw error; }); const refresh = jest.fn();
      const run = harness(site, resume, refresh);
      await expect(run.invoke()).rejects.toBe(error);
      expect(resume).toHaveBeenCalledTimes(1); expect(refresh).not.toHaveBeenCalled(); expect(run.out).not.toHaveBeenCalled();
    });
  });
});

describe('ADR-0260 driver managed-process refresh', () => {
  const source = fs.readFileSync(path.resolve(__dirname, 'a9-batch2-driver-entry.cjs'), 'utf8');
  const ts = require('typescript');
  const tree = ts.createSourceFile('driver.cjs', source, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS);
  const functions: Record<string, string> = {};
  const declarations: string[] = [];
  const visit = (node: any) => {
    if (ts.isFunctionDeclaration(node) && ['waitFor', 'refreshWorkbenchSnapshot', 'newConversation', 'stopAllManaged'].includes(node.name?.text)) {
      functions[node.name.text] = node.getText(tree);
    }
    if (ts.isVariableDeclaration(node) && ['finish', 'workbenchRefreshFailure'].includes(node.name.getText(tree))) declarations.push(`let ${node.getText(tree)};`);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  function harness(statuses: string[] = ['exited'], failure?: string, blocked = false) {
    let now = 0; let snapshotIndex = 0; let activeId = 'before';
    const order: string[] = []; const out = jest.fn();
    const create = { disabled: true, click: jest.fn(() => { order.push('click'); activeId = 'after'; }) };
    const stop = { hidden: false, click: jest.fn() };
    const refreshSnapshot = jest.fn(async () => {
      order.push('refresh'); await Promise.resolve();
      if (failure === 'throw') throw new Error('snapshot transport failed');
      if (failure === 'long') throw new Error('x'.repeat(500));
      if (failure === 'null' || failure === 'undefined') return failure === 'null' ? null : undefined;
      create.disabled = blocked; stop.hidden = true; order.push('refreshed');
      return { conversationControls: { canSwitch: !blocked } };
    });
    const exec = jest.fn(async (code: string) => {
      if (failure === 'exec') throw new Error('renderer execution failed');
      return vm.runInNewContext(code, { window: { win7AgentA9Workbench: { refreshSnapshot } },
        document: { getElementById: (id: string) => id === 'conversation-new' ? create : stop } });
    });
    const writeJson = jest.fn(); const driverProcess = { exitCode: 1 }; const quit = jest.fn();
    const box: any = { exec, out, Date: { now: () => now }, env: {}, MODE: 'TEST_ONLY', ownsExit: false, p2Case: false,
      results: [], evidenceIndex: [], ipcLog: [], dialogLog: [], startedAt: 0, resultFile: 'TEST_ONLY', driverExitCode: 1,
      writeJson, process: driverProcess, app: { quit },
      sleep: jest.fn(async (ms: number) => { now += ms; }), conversationId: async () => activeId,
      snapshot: jest.fn(async () => ({ managedProcesses: [{ lastProbeStatus: statuses[Math.min(snapshotIndex++, statuses.length - 1)] }] })) };
    vm.runInNewContext(`${declarations.join('\n')}\n${Object.values(functions).join('\n')}\nthis.api = { newConversation, stopAllManaged, finish };`, box);
    return { ...box.api, out, refreshSnapshot, create, stop, order, exec, writeJson, driverProcess, quit, snapshot: box.snapshot, sleep: box.sleep, time: () => now };
  }
  test.each([['exited'], ['running', 'starting', 'exited']])('stopAllManaged refreshes once before returning after %j', async (...statuses: string[]) => {
    const run = harness(statuses);
    await run.stopAllManaged(); run.order.push('returned');
    expect(run.refreshSnapshot).toHaveBeenCalledTimes(1); expect(run.refreshSnapshot).toHaveBeenCalledWith();
    expect(run.order).toEqual(['refresh', 'refreshed', 'returned']);
    expect(run.stop.click).toHaveBeenCalledTimes(statuses.length - 1);
    expect(run.time()).toBe(2500 * (statuses.length - 1)); expect(run.out).not.toHaveBeenCalled();
  });
  test('newConversation refreshes once before waiting for the stale button and clicks only once', async () => {
    const run = harness();
    expect(await run.newConversation()).toBe('after');
    expect(run.order).toEqual(['refresh', 'refreshed', 'click']);
    expect(run.refreshSnapshot).toHaveBeenCalledTimes(1); expect(run.refreshSnapshot).toHaveBeenCalledWith();
    expect(run.create.click).toHaveBeenCalledTimes(1); expect(run.out).not.toHaveBeenCalled();
  });
  describe.each(['stopAllManaged', 'newConversation'])('%s', (operation) => {
    test.each(['throw', 'null', 'undefined', 'long', 'exec'])('a %s refresh failure writes bounded evidence and stops the driver', async (failure) => {
      const run = harness(['exited'], failure);
      await expect(run[operation]()).rejects.toThrow('A9_BATCH2_DRIVER_WORKBENCH_REFRESH_FAILED');
      expect(run.out).toHaveBeenCalledTimes(1);
      const error = failure === 'throw' ? 'snapshot transport failed' : failure === 'long' ? 'x'.repeat(240)
        : failure === 'exec' ? 'renderer execution failed' : 'A9_BATCH2_DRIVER_WORKBENCH_REFRESH_EMPTY';
      expect(run.out).toHaveBeenCalledWith('workbench-refresh-error.json', { operation, refresh_error: error });
      expect(run.exec).toHaveBeenCalledTimes(1); expect(run.refreshSnapshot).toHaveBeenCalledTimes(failure === 'exec' ? 0 : 1);
      expect(run.create.click).not.toHaveBeenCalled(); expect(run.stop.click).not.toHaveBeenCalled(); expect(run.sleep).not.toHaveBeenCalled();
    });
    test('a caught refresh failure still finishes ERROR and cannot replay or overwrite the first failure', async () => {
      const run = harness(['exited'], 'null'); let failure: any;
      try { await run[operation](); } catch (error) { failure = error; }
      expect(failure).toBeDefined();
      const next = operation === 'stopAllManaged' ? 'newConversation' : 'stopAllManaged';
      await expect(run[next]()).rejects.toBe(failure);
      await run.finish(null);
      expect(run.writeJson).toHaveBeenCalledWith('TEST_ONLY', expect.objectContaining({ status: 'ERROR', error: expect.stringContaining('A9_BATCH2_DRIVER_WORKBENCH_REFRESH_FAILED') }));
      expect(run.driverProcess.exitCode).toBe(1); expect(run.quit).toHaveBeenCalledTimes(1);
      expect(run.out).toHaveBeenCalledTimes(1); expect(run.out.mock.calls[0][1].operation).toBe(operation); expect(run.refreshSnapshot).toHaveBeenCalledTimes(1);
    });
  });
  test('a refresh does not bypass the real disabled button or change its 20-second deadline', async () => {
    const run = harness(['exited'], undefined, true);
    await expect(run.newConversation()).rejects.toThrow('TIMEOUT:new conversation:');
    expect(run.time()).toBe(20000); expect(run.create.click).not.toHaveBeenCalled(); expect(run.refreshSnapshot).toHaveBeenCalledTimes(1);
  });
  test('an incomplete managed stop still fails after the original six UI attempts', async () => {
    const run = harness(['running']);
    await expect(run.stopAllManaged()).rejects.toThrow('A9_BATCH2_DRIVER_MANAGED_STOP_INCOMPLETE');
    expect(run.stop.click).toHaveBeenCalledTimes(6); expect(run.time()).toBe(15000); expect(run.refreshSnapshot).not.toHaveBeenCalled();
  });
  test('KL-13 discloses stale controls, the correct backend gate and the RC deferral', () => {
    const limits = fixtures.KNOWN_LIMITS.filter((item: string) => item.startsWith('KL-13:'));
    expect(limits).toHaveLength(1);
    expect(limits[0]).toMatch(/natural.*exit/); expect(limits[0]).toContain('Stop'); expect(limits[0]).toContain('New Conversation');
    expect(limits[0]).toContain('submit, stop or switch'); expect(limits[0]).toContain('backend gate remains correct'); expect(limits[0]).toContain('deferred to RC');
  });
});

describe('A9-36 independent supplemental request and inputs', () => {
  const req = require(path.join(releaseDir, 'a9-alpha2-supplement-request.cjs'));
  const supplement = require(path.join(releaseDir, 'a9-alpha2-supplement.cjs'));
  const now = Date.parse('2026-10-15T16:00:00Z');
  const H = (label: string) => crypto.createHash('sha256').update(label).digest('hex');
  const PIN = H('owner-signed authority bytes');
  const RUN = 'C:\\A9-W43\\run\\0daf288c';
  const baseM6 = () => ({ w42_source: req.W42_SOURCE, w42_zip_path: `${RUN}\\inputs\\WIN7-42.zip`, w42_zip_sha256: req.W42_PACKAGE_SHA, w42_manifest_sha256: req.W42_MANIFEST_SHA,
    w42_persistence_sha256: req.W42_PERSISTENCE_SHA, cand_persistence_sha256: H('candidate persistence'), native_sha256: H('native module'),
    w42_root: `${RUN}\\m6\\WIN7-42`, fixtures_root: `${RUN}\\inputs\\m6`, fixture_files: Object.fromEntries(req.M6_FIXTURE_FILES.map((n: string) => [n, H(n)])), now: req.M6_NOW });
  const baseAuthority = () => ({ schema_version: 1, task: 'A9-36', status: 'OWNER_APPROVED', run_id: '0daf288c-7d26-4ebc-b17c-40bc9702ce13',
    candidate: 'WIN7-55', source: crypto.createHash('sha1').update('candidate source').digest('hex'), runtime_sha256: H('runtime'), package_sha256: H('package'), manifest_sha256: H('manifest'),
    candidate_root: 'C:\\A9-W43\\frozen\\WIN7-55', run_root: RUN, zip_path: 'C:\\A9-W43\\frozen\\WIN7-55.zip',
    target: { machine: 'DCCS-CHAIZL-PC', sid: 'S-1-5-21-1708701742-428676696-1831205153-1001', session_id: 5, integrity: 'Medium', elevated: false, in_job: false },
    inputs: Object.fromEntries(req.INPUTS.map((n: string) => [n, H(n)])), phases: ['m4', 'm1', 'm2', 'm3', 'm6', 'm5'], max_requests: 6, max_wall_seconds: 7200,
    expires_at: '2026-10-15T20:00:00Z', provider: { base_url: 'https://api.deepseek.com', model: 'deepseek-v4-flash', max_turns: 3, max_requests: 40, max_response_bytes: 1048576 },
    credential_source: 'C:\\Users\\agent\\AppData\\Local\\Win7CodingAgent\\a9',
    tools: { python: { path: 'C:\\Python38\\python.exe', sha256: H('python') }, git: { path: 'C:\\Git\\cmd\\git.exe', sha256: H('git') } }, m6: baseM6() });
  const root = () => fs.mkdtempSync(path.join(os.tmpdir(), 'a9-36-contract-'));
  const changedAuthority = (key: string, value: any) => {
    const a: any = baseAuthority(); const parts = key.split('.'); let parent = a;
    for (const part of parts.slice(0, -1)) parent = parent[part];
    if (value === undefined) delete parent[parts[parts.length - 1]]; else parent[parts[parts.length - 1]] = value;
    return a;
  };
  test('candidate identities and M6 forward/native hashes are supplied by the owner, with no final-candidate code pins', () => {
    for (const label of ['first signed candidate', 'a later signed candidate']) {
      const a = { ...baseAuthority(), source: crypto.createHash('sha1').update(label).digest('hex'), package_sha256: H(label + ' ZIP'), manifest_sha256: H(label + ' manifest'),
        m6: { ...baseM6(), cand_persistence_sha256: H(label + ' persistence'), native_sha256: H(label + ' native') } };
      expect(req.validateAuthority(a, now)).toBe(a);
    }
    for (const name of ['SOURCE', 'PACKAGE_SHA', 'MANIFEST_SHA']) expect(req).not.toHaveProperty(name);
  });
  test.each([
    ['source', 'ba042757a04f428cb3db3ccd10888a7bebe97d3b'],
    ['package_sha256', 'ae1d4bb109df68c2f23e08cb4b927f2168f7a1f645969643f35101bf8f9da96e'],
    ['manifest_sha256', '520bda7e34cade8c611d8d28120a46b046519b462e3df8978968efc45e07c7df'],
  ])('retired WIN7-45 %s is individually refused even under the WIN7-55 label', (key, value) => {
    expect(() => req.validateAuthority(changedAuthority(key, value), now)).toThrow('A9_36_RETIRED_CANDIDATE');
  });
  test.each(['WIN7-42', 'WIN7-45', 'WIN7-46', 'WIN7-47', 'WIN7-48', 'WIN7-49', 'WIN7-50', 'win7-51', '', null, undefined])('candidate label %s is refused', (value) => {
    expect(() => req.validateAuthority(changedAuthority('candidate', value), now)).toThrow();
  });
  test.each([
    ['source', '0'.repeat(39) + '1'],
    ['package_sha256', '0' + 'ab'.repeat(32).slice(0, 63)],
    ['package_sha256', '1' + 'f'.repeat(63)],
  ])('P2-01: %s refuses prefix-perturbed placeholder %s', (key, value) => {
    expect(() => req.validateAuthority(changedAuthority(key, value), now)).toThrow('A9_36_CANDIDATE_HASH');
  });
  test('P2-01: random candidate hashes with six leading zeroes remain valid', () => {
    const a = { ...baseAuthority(), source: '000000' + crypto.randomBytes(20).toString('hex').slice(6),
      package_sha256: '000000' + crypto.randomBytes(32).toString('hex').slice(6) };
    expect(req.validateAuthority(a, now)).toBe(a);
  });
  test.each(['source', 'package_sha256', 'manifest_sha256', 'runtime_sha256', 'inputs.a9-alpha2-supplement.cjs',
    'tools.python.sha256', 'tools.git.sha256', 'm6.cand_persistence_sha256', 'm6.native_sha256', 'm6.fixture_files.F42.sqlite'])('identity field %s refuses placeholders, wrong lengths and uppercase', (key) => {
    // Dictionary keys containing dots are handled separately from nested authority keys.
    const set = (value: any) => {
      if (key.startsWith('inputs.')) return { ...baseAuthority(), inputs: { ...baseAuthority().inputs, 'a9-alpha2-supplement.cjs': value } };
      if (key.startsWith('m6.fixture_files.')) return { ...baseAuthority(), m6: { ...baseM6(), fixture_files: { ...baseM6().fixture_files, 'F42.sqlite': value } } };
      return changedAuthority(key, value);
    };
    const length = key === 'source' ? 40 : 64; const good = H(key).slice(0, length);
    expect(() => req.validateAuthority(set(good), now)).not.toThrow();
    for (const value of [undefined, null, 123, '', 'TBD', 'PLACEHOLDER', '0'.repeat(length), 'f'.repeat(length), 'ab'.repeat(length / 2),
      'abc'.repeat(Math.ceil(length / 3)).slice(0, length), '0123456789abcdef'.repeat(4).slice(0, length), good.slice(1), good + 'a', good.toUpperCase(), 'g' + good.slice(1), good.slice(1) + '\n', good.slice(1) + '\r']) {
      expect([key, value, (() => { try { req.validateAuthority(set(value), now); return 'accepted'; } catch (_) { return 'refused'; } })()]).toEqual([key, value, 'refused']);
    }
  });
  test.each(['w42_source', 'w42_zip_sha256', 'w42_manifest_sha256', 'w42_persistence_sha256'])('M6 rollback pin %s must equal the full frozen WIN7-42 pin', (key) => {
    for (const value of [undefined, H('different rollback pin').slice(0, key === 'w42_source' ? 40 : 64), 'TBD']) {
      expect(() => req.validateAuthority(changedAuthority('m6.' + key, value), now)).toThrow();
    }
  });
  test('request issuance and consumption bind the exact authority SHA, including prior-phase receipts', () => {
    const a: any = { ...baseAuthority(), run_root: root() }; const ledger = path.join(a.run_root, 'ledger');
    const first = req.createRequest(a, 'm4', PIN, now); const otherPin = H('different authority bytes');
    expect(first.authority_sha256).toBe(PIN);
    expect(() => req.validateRequest(first, a, otherPin, now)).toThrow('A9_36_REQUEST_AUTHORITY');
    const missing = { ...first }; delete missing.authority_sha256;
    expect(() => req.validateRequest(missing, a, PIN, now)).toThrow();
    expect(() => req.consume(first, a, ledger, otherPin, now)).toThrow('A9_36_REQUEST_AUTHORITY');
    expect(fs.existsSync(ledger)).toBe(false);
    expect(() => req.createRequest(a, 'm4', 'a'.repeat(64), now)).toThrow('A9_36_PIN');
    req.consume(first, a, ledger, PIN, now);
    expect(req.readJson(path.join(ledger, '1.json')).authority_sha256).toBe(PIN);
    fs.mkdirSync(path.join(a.run_root, 'evidence', 'm4'), { recursive: true });
    req.complete(first, a, { task: 'A9-36', run_id: a.run_id, phase: 'm4', package_sha256: a.package_sha256, status: 'PASS' });
    expect(() => req.assertNext(req.createRequest(a, 'm1', otherPin, now), a, ledger, otherPin, now)).toThrow('A9_36_PREREQUISITE');
    expect(() => req.assertNext(req.createRequest(a, 'm1', PIN, now), a, ledger, PIN, now)).not.toThrow();
  });
  test('loadBound authenticates the original authority file bytes before issuing a SHA-bound request (Windows path simulation)', () => {
    const dir = root(); const a = baseAuthority();
    for (const name of req.INPUTS) fs.writeFileSync(path.join(dir, name), name, 'utf8');
    const authorityFile = `${RUN}\\inputs\\authority.json`; const diskFile = path.join(dir, 'authority.json');
    fs.writeFileSync(diskFile, JSON.stringify(a), 'utf8');
    // Only path mapping is simulated; hashing and JSON/input reads use the actual temporary files.
    const mapped = (file: any) => path.join(dir, path.win32.basename(String(file)));
    const disk = { ...fs, openSync: (file: any, flags: any) => fs.openSync(mapped(file), flags), lstatSync: (file: any) => fs.lstatSync(mapped(file)), readFileSync: (file: any, encoding: any) => fs.readFileSync(mapped(file), encoding) };
    const exports: any = {}; const context = { module: { exports }, require: (name: string) => name === 'fs' ? disk : name === 'path' ? path.win32 : require(name), Buffer };
    vm.runInNewContext(fs.readFileSync(path.join(releaseDir, 'a9-alpha2-supplement-request.cjs'), 'utf8'), context);
    const boundReq = context.module.exports; const pin = req.fileHash(diskFile);
    const loaded = boundReq.loadBound(authorityFile, pin, a.target, now);
    expect(boundReq.createRequest(loaded, 'm4', pin, now).authority_sha256).toBe(pin);
    fs.appendFileSync(diskFile, '\n');
    expect(() => boundReq.loadBound(authorityFile, pin, a.target, now)).toThrow('A9_36_PIN');
    expect(() => boundReq.loadBound(authorityFile, pin.toUpperCase(), a.target, now)).toThrow('A9_36_PIN');
    expect(boundReq.loadBound(authorityFile, req.fileHash(diskFile), a.target, now).candidate).toBe('WIN7-55');
  });
  test('candidate manifest source and label must equal the authority before loading any candidate code', () => {
    const dir = root(); const zip = path.join(dir, 'candidate.zip'); const manifestFile = path.join(dir, 'release-manifest.json'); fs.writeFileSync(zip, 'candidate ZIP fixture');
    for (const patch of [{ source_commit: req.W42_SOURCE }, { candidate: 'WIN7-42' }]) {
      const a = { ...baseAuthority(), candidate_root: dir, zip_path: zip, package_sha256: req.fileHash(zip) };
      fs.writeFileSync(manifestFile, JSON.stringify({ candidate: a.candidate, source_commit: a.source, ...patch }), 'utf8');
      a.manifest_sha256 = req.fileHash(manifestFile);
      expect(() => supplement.inspectCandidate(a)).toThrow('A9_36_PACKAGE_IDENTITY');
    }
  });
  test('authority binds owner-provided candidate hashes, exact phase closure, the M6 rollback pins and budgets', () => {
    expect(req.validateAuthority(baseAuthority(), now)).toMatchObject({ task: 'A9-36', max_requests: 6, max_wall_seconds: 7200 });
    expect(req.PHASES).toEqual(['m4', 'm1', 'm2', 'm3', 'm6', 'm5']);
    for (const patch of [{ status: 'DRAFT' }, { source: 'f'.repeat(40) }, { package_sha256: 'e'.repeat(64) }, { max_requests: 5 }, { max_requests: 7 }, { max_wall_seconds: 5400 }, { max_wall_seconds: 7201 },
      { phases: ['m4', 'm1', 'm2', 'm3', 'm5'] }, { phases: ['m4', 'm1', 'm2', 'm3', 'm5', 'm6'] }, { expires_at: '2026-10-15T15:59:59Z' }, { expires_at: '2026-10-16T16:00:00Z' }, { unexpected: true }]) {
      expect(() => req.validateAuthority({ ...baseAuthority(), ...patch }, now)).toThrow();
    }
    const withM6 = (patch: any) => ({ ...baseAuthority(), m6: { ...baseM6(), ...patch } });
    for (const patch of [{ w42_source: 'f'.repeat(40) }, { w42_zip_sha256: 'e'.repeat(64) }, { w42_manifest_sha256: 'e'.repeat(64) }, { now: '2026-10-16T12:00:00.001Z' }, { now: new Date(0).toISOString() },
      { w42_root: 'C:\\elsewhere\\WIN7-42' }, { w42_zip_path: 'C:\\elsewhere\\WIN7-42.zip' }, { fixtures_root: `${RUN}\\inputs\\other` }, { fixtures_root: `${RUN}\\m6` }, { w42_root: `${RUN}\\inputs\\m6\\WIN7-42` },
      { w42_root: 'C:\\A9-W43\\frozen\\WIN7-55\\inner' }, { fixture_files: { ...baseM6().fixture_files, 'baseline.json': 'zz' } }, { fixture_files: { 'F42.sqlite': 'e'.repeat(64) } },
      { fixture_files: { ...baseM6().fixture_files, 'extra.sqlite': 'e'.repeat(64) } }, { unexpected: 1 }]) {
      expect(() => req.validateAuthority(withM6(patch), now)).toThrow();
    }
    const missing: any = baseAuthority(); delete missing.m6; expect(() => req.validateAuthority(missing, now)).toThrow();
    expect(req.M6_FIXTURE_FILES).toEqual(['F42.sqlite', 'FCandC.sqlite', 'FCandN.sqlite', 'C42.sqlite', 'CCand.sqlite', 'baseline.json']);
  });
  test('unknown identity, elevated/job/session0 and command-bearing inputs fail closed', () => {
    for (const patch of [{ elevated: true }, { in_job: null }, { in_job: true }, { session_id: 0 }, { integrity: 'High' }, { sid: 'other' }, { machine: 'other' }]) {
      expect(() => req.validateAuthority({ ...baseAuthority(), target: { ...baseAuthority().target, ...patch } }, now)).toThrow();
    }
    for (const run_root of ['C:\\A9-W43\\..\\0daf288c', 'relative', '\\\\host\\share', 'C:\\A9%USER%\\0daf288c']) expect(() => req.validateAuthority({ ...baseAuthority(), run_root }, now)).toThrow();
    const a = baseAuthority(); const request = req.createRequest(a, 'm4', PIN, now);
    for (const index of ['1', true, false, 1.5, null]) expect(() => req.validateRequest({ ...request, index }, a, PIN, now)).toThrow();
    expect(() => req.validateRequest({ ...request, command: 'arbitrary' }, a, PIN, now)).toThrow();
    expect(() => req.validateRequest({ ...request, phase: 'p01-env' }, a, PIN, now)).toThrow();
    expect(() => req.validateRequest({ ...request, run_id: 'old' }, a, PIN, now)).toThrow();
    expect(() => req.validateRequest({ ...request, expires_at: '2026-10-15T15:00:00Z' }, a, PIN, now)).toThrow();
  });
  test('exclusive consumption preserves first request and refuses reuse/concurrent lock', () => {
    const a = baseAuthority(); const request = req.createRequest(a, 'm4', PIN, now); const dir = root();
    req.consume(request, a, dir, PIN, now); const first = fs.readFileSync(path.join(dir, '1.json'));
    expect(() => req.consume(request, a, dir, PIN, now)).toThrow();
    expect(fs.readFileSync(path.join(dir, '1.json'))).toEqual(first);
    const other = root(); fs.mkdirSync(path.join(other, 'dispatch.lock'));
    expect(() => req.consume(request, a, other, PIN, now)).toThrow();
    expect(fs.existsSync(path.join(other, 'dispatch.lock'))).toBe(true);
  });
  test('next group needs hash-bound prior PASS and any failure HALTs the new ledger', () => {
    const a: any = { ...baseAuthority(), run_root: root() }; const ledger = path.join(a.run_root, 'ledger');
    const first = req.createRequest(a, 'm4', PIN, now); const next = req.createRequest(a, 'm1', PIN, now);
    expect(() => req.consume(next, a, ledger, PIN, now)).toThrow();
    fs.mkdirSync(path.join(a.run_root, 'evidence', 'm4'), { recursive: true });
    req.consume(first, a, ledger, PIN, now); req.complete(first, a, { task: 'A9-36', run_id: a.run_id, phase: 'm4', package_sha256: a.package_sha256, status: 'PASS' });
    fs.writeFileSync(path.join(a.run_root, 'evidence', 'm4', 'phase-result.json'), '{"status":"FAIL"}');
    expect(() => req.consume(next, a, ledger, PIN, now)).toThrow('PREREQUISITE_RESULT');
    const b: any = { ...baseAuthority(), run_root: root() }; const bLedger = path.join(b.run_root, 'ledger');
    fs.mkdirSync(path.join(b.run_root, 'evidence', 'm4'), { recursive: true });
    req.consume(first, b, bLedger, PIN, now); req.complete(first, b, { task: 'A9-36', run_id: b.run_id, phase: 'm4', package_sha256: b.package_sha256, status: 'FAIL' });
    expect(fs.existsSync(path.join(bLedger, 'HALTED.json'))).toBe(true);
    expect(() => req.consume(next, b, bLedger, PIN, now)).toThrow();
  });
  test('M6 is the fifth request, needs the M3 PASS, and the paid real-service group needs the M6 PASS', () => {
    const a: any = { ...baseAuthority(), run_root: root() }; const ledger = path.join(a.run_root, 'ledger');
    const passPhase = (phase: string, index: number) => {
      const request = req.createRequest(a, phase, PIN, now); expect(request.index).toBe(index);
      fs.mkdirSync(path.join(a.run_root, 'evidence', phase), { recursive: true });
      req.consume(request, a, ledger, PIN, now);
      req.complete(request, a, { task: 'A9-36', run_id: a.run_id, phase, package_sha256: a.package_sha256, status: 'PASS' });
    };
    expect(() => req.assertNext(req.createRequest(a, 'm6', PIN, now), a, ledger, PIN, now)).toThrow();
    passPhase('m4', 1); passPhase('m1', 2); passPhase('m2', 3);
    expect(() => req.assertNext(req.createRequest(a, 'm6', PIN, now), a, ledger, PIN, now)).toThrow();
    passPhase('m3', 4);
    expect(() => req.assertNext(req.createRequest(a, 'm5', PIN, now), a, ledger, PIN, now)).toThrow();
    expect(() => req.assertNext(req.createRequest(a, 'm6', PIN, now), a, ledger, PIN, now)).not.toThrow();
    passPhase('m6', 5);
    expect(() => req.assertNext(req.createRequest(a, 'm5', PIN, now), a, ledger, PIN, now)).not.toThrow();
    passPhase('m5', 6);
    expect(() => req.createRequest(a, 'm7', PIN, now)).toThrow();
  });
  test('actual original nineteen commands are byte identical, including oversize and positional forms', () => {
    expect(supplement.GIT_FORMS).toHaveLength(19);
    // Repository-portable assertion pins the original command-list digest; no dependency on an external report file at test time.
    const commandHash = crypto.createHash('sha256').update(JSON.stringify(supplement.GIT_FORMS)).digest('hex');
    expect(commandHash).toBe('b00af1e9e71ad8c9d6230ecfff73023bb8fca05b85af0a4fcc26f9a937fe2584');
    expect(supplement.GIT_FORMS[16].length).toBe(270030);
    expect(supplement.toolsFor('a2-git:1', 'cmd')[0].name).toBe('start_process');
    expect(() => supplement.toolsFor('a2-git:19', 'cmd')).toThrow();
    expect(supplement.toolsFor('unapproved external script', 'cmd')).toBeNull();
  });
  const pad = (n: number) => String(n).padStart(2, '0');
  const expectedCounts: Record<string, number> = { m4: 3, m1: 11, m2: 13, m3: 11, m5: 6, m6: 5 };
  test('closed Stage plan: frozen, contiguous assertion ids, unique modes that match the driver mode table', () => {
    expect(Object.keys(supplement.STAGE_PLAN)).toEqual(['m4', 'm1', 'm2', 'm3', 'm5']);
    expect(Object.isFrozen(supplement.STAGE_PLAN)).toBe(true);
    for (const stages of Object.values(supplement.STAGE_PLAN) as any[]) { expect(Object.isFrozen(stages)).toBe(true); for (const stage of stages) { expect(Object.isFrozen(stage)).toBe(true); expect(Object.isFrozen(stage.ids)).toBe(true); } }
    for (const [phase, count] of Object.entries(expectedCounts)) expect(supplement.requiredAssertions(phase)).toHaveLength(count);
    expect(Object.values(expectedCounts).reduce((sum, n) => sum + n, 0)).toBe(49);
    expect(() => supplement.requiredAssertions('p01-env')).toThrow();
    const names = new Set<string>(); const modes: string[] = [];
    for (const [phase, stages] of Object.entries(supplement.STAGE_PLAN) as any[]) {
      const seen: string[] = [];
      for (const stage of stages) {
        expect(names.has(phase + '/' + stage.name)).toBe(false); names.add(phase + '/' + stage.name);
        expect(modes).not.toContain(stage.mode); modes.push(stage.mode);
        expect(supplement.stageOf(phase, stage.name)).toBe(stage);
        expect(stage.ids.length).toBeGreaterThan(0); expect(new Set(stage.ids).size).toBe(stage.ids.length);
        if (stage.reuse) { expect(seen).toContain(stage.reuse); const target = stages.find((s: any) => s.name === stage.reuse); expect(target.reuse).toBeUndefined(); }
        seen.push(stage.name);
      }
      const ids = stages.flatMap((s: any) => s.ids).sort((a: number, b: number) => a - b);
      expect(ids).toEqual(Array.from({ length: ids.length }, (_, n) => n + 1));
      expect(new Set(stages.map((s: any) => s.group)).size).toBe(1);
    }
    expect(() => supplement.stageOf('m2', 'nope')).toThrow();
    expect([...modes].sort()).toEqual([...driver.SUPPLEMENT_MODES].sort());
    expect(driver.SUPPLEMENT_MODES).toContain('supplement_continue_schema');
    expect(supplement.requiredAssertions('m6')).toEqual(Array.from({ length: 5 }, (_, n) => `A2-M6-PERSISTENCE-A${pad(n + 1)}`));
    expect(supplement.M6_ASSERTIONS).toEqual(supplement.requiredAssertions('m6'));
    const m2 = supplement.STAGE_PLAN.m2; expect(m2.map((s: any) => s.name)).toEqual(['main', 'audit_output', 'audit_managed', 'audit_ownership', 'continue', 'budget']);
    expect(m2[5]).toMatchObject({ reuse: 'continue', budgetChars: 16000 });
    expect(supplement.STAGE_PLAN.m5.map((s: any) => [s.name, s.credentials === true])).toEqual([['rehearsal', false], ['main', true]]);
    expect(supplement.STAGE_PLAN.m1[0].git).toBe(true);
  });
  test('the driver mode table is the Stage plan and every planned assertion id is written exactly once in the driver source', () => {
    const source = fs.readFileSync(path.resolve(__dirname, 'a9-batch2-driver-entry.cjs'), 'utf8');
    const table = source.slice(source.indexOf('const SUPPLEMENT_MODE_TABLE = {'), source.indexOf('// Pre-ready seams'));
    const keys = [...table.matchAll(/(supplement_[a-z_]+):/g)].map((m) => m[1]);
    expect(keys).toEqual(driver.SUPPLEMENT_MODES);
    expect(source).toContain("JSON.stringify(Object.keys(SUPPLEMENT_MODE_TABLE)) !== JSON.stringify(SUPPLEMENT_MODES)");
    const written: string[] = [];
    for (const m of source.matchAll(/supplementAssert\('([a-z0-9-]+)', (\d+),/g)) written.push(`A2-${m[1].toUpperCase()}-A${pad(Number(m[2]))}`);
    for (const m of source.matchAll(/auditStage\(\{ id: (\d+),/g)) written.push(`A2-M2-VERIFICATION-A${pad(Number(m[1]))}`);
    for (const m of source.matchAll(/record\('(A2-M4-CONTINUE-SCHEMA)', (\d+),/g)) written.push(`${m[1]}-A${pad(Number(m[2]))}`);
    const planned = ['m4', 'm1', 'm2', 'm3', 'm5'].flatMap((phase) => supplement.requiredAssertions(phase));
    expect([...written].sort()).toEqual([...planned].sort());
    // Each Stage mode function is the one the table names, and the audit helper is the only place that writes a variable id.
    expect([...source.matchAll(/supplementAssert\('[a-z0-9-]+', spec\.id,/g)]).toHaveLength(1);
  });
  test('Stage verdicts accept only the exact DONE, exit-0, own-assertion result; the phase needs every Stage in order', () => {
    const stage = supplement.stageOf('m2', 'continue'); const ids = supplement.stageAssertionIds(stage);
    expect(ids).toEqual(['A2-M2-VERIFICATION-A10', 'A2-M2-VERIFICATION-A11']);
    const rows = ids.map((assertion_id: string) => ({ assertion_id, status: 'PASS' })); const good = { mode: stage.mode, status: 'DONE', assertions: rows };
    expect(supplement.evaluateStageResult(stage, good, { code: 0 })).toBe(true);
    for (const changed of [[], rows.slice(1), rows.concat(rows[0]), rows.map((v: any, n: number) => n ? v : { ...v, status: 'UNKNOWN' }), rows.map((v: any, n: number) => n ? v : { ...v, status: 'FAIL' }),
      rows.map((v: any) => ({ ...v, assertion_id: 'other' })), [rows[0], { assertion_id: 'A2-M2-VERIFICATION-A12', status: 'PASS' }], [rows[0], rows[0]]]) {
      expect(supplement.evaluateStageResult(stage, { ...good, assertions: changed }, { code: 0 })).toBe(false);
    }
    expect(supplement.evaluateStageResult(stage, { ...good, status: 'ERROR' }, { code: 0 })).toBe(false);
    expect(supplement.evaluateStageResult(stage, { ...good, mode: 'supplement_budget' }, { code: 0 })).toBe(false);
    expect(supplement.evaluateStageResult(stage, good, { code: 1 })).toBe(false);
    expect(supplement.evaluateStageResult(stage, good, { code: 0, killed_by: 'timeout' })).toBe(false);
    expect(supplement.evaluateStageResult(stage, good, { code: 0, spawn_error: 'x' })).toBe(false);
    expect(supplement.evaluateStageResult(stage, null, { code: 0 })).toBe(false);
    expect(supplement.evaluateStageResult(stage, good, null)).toBe(false);
    // The single-Stage shortcut still judges the first Stage of a one-Stage phase.
    const m4 = supplement.requiredAssertions('m4').map((assertion_id: string) => ({ assertion_id, status: 'PASS' }));
    expect(supplement.evaluateDriverResult('m4', { mode: 'supplement_continue_schema', status: 'DONE', assertions: m4 }, { code: 0 })).toBe(true);
    expect(supplement.evaluateDriverResult('m4', { mode: 'continue_restart', status: 'DONE', assertions: m4 }, { code: 0 })).toBe(false);
    const plan = supplement.STAGE_PLAN.m2; const pass = plan.map((s: any) => ({ name: s.name, status: 'PASS' }));
    expect(supplement.evaluatePhaseStages('m2', pass)).toBe('PASS');
    expect(supplement.evaluatePhaseStages('m2', pass.slice(0, 5))).toBe('FAIL');
    expect(supplement.evaluatePhaseStages('m2', pass.concat(pass[0]))).toBe('FAIL');
    expect(supplement.evaluatePhaseStages('m2', [pass[1], pass[0], ...pass.slice(2)])).toBe('FAIL');
    expect(supplement.evaluatePhaseStages('m2', pass.map((v: any, n: number) => n === 3 ? { ...v, status: 'FAIL' } : v))).toBe('FAIL');
    expect(supplement.evaluatePhaseStages('m2', pass.map((v: any, n: number) => n === 3 ? { ...v, status: 'UNKNOWN' } : v))).toBe('FAIL');
    expect(supplement.evaluatePhaseStages('m2', null)).toBe('FAIL');
    expect(() => supplement.evaluatePhaseStages('m6', pass)).toThrow();
    expect(supplement.postflightClean({ failed: false, related: [] })).toBe(true);
    for (const value of [null, { failed: true, related: [] }, { failed: false, related: [{ pid: 1 }] }, { failed: false }]) expect(supplement.postflightClean(value)).toBe(false);
  });
  test('Stage layout: a reuse Stage continues on the earlier Stage roots, others get their own isolated profile', () => {
    const phaseRoot = path.join(root(), 'work', 'm2');
    const layouts = Object.fromEntries(supplement.STAGE_PLAN.m2.map((s: any) => [s.name, supplement.stageLayout(phaseRoot, s)]));
    expect(layouts.budget.home).toBe(layouts.continue.home); expect(layouts.budget.data).toBe(layouts.continue.data); expect(layouts.budget.workspace).toBe(layouts.continue.workspace);
    expect(layouts.main.home).not.toBe(layouts.continue.home);
    expect(new Set(['main', 'audit_output', 'audit_managed', 'audit_ownership', 'continue'].map((n) => layouts[n].data)).size).toBe(5);
    for (const layout of Object.values(layouts) as any[]) {
      expect(layout.workspace.endsWith('中文 workspace')).toBe(true);
      for (const key of ['LOCALAPPDATA', 'APPDATA', 'TEMP']) expect(layout.env[key].startsWith(layout.home)).toBe(true);
      expect(layout.env.WIN7AGENT_PORTABLE).toBe('0');
    }
  });
  test('isolated seeds are real Python sources, differ by kind and never overwrite an existing workspace', () => {
    const parent = root(); const workspace = path.join(parent, '中文 workspace');
    supplement.seedWorkspace(workspace, 'journey');
    expect(fs.readFileSync(path.join(workspace, 'calc.py'), 'utf8')).toContain('return a - b');
    expect(() => supplement.seedWorkspace(workspace, 'journey')).toThrow();
    expect(() => supplement.seedWorkspace(path.join(parent, 'other'), 'unknown-kind')).toThrow('A9_36_SEED_KIND');
    const initial = childProcess.spawnSync('python3', ['test_calc.py'], { cwd: workspace, encoding: 'utf8' });
    expect(initial.status).toBe(1); expect(initial.stderr).toContain('AssertionError');
    fs.writeFileSync(path.join(workspace, 'calc.py'), 'def add(a,b):\n    return a+b\n', 'utf8');
    const fixed = childProcess.spawnSync('python3', ['test_calc.py'], { cwd: workspace, encoding: 'utf8' });
    expect(fixed.status).toBe(0); expect(fixed.stderr).toContain('OK');
    const absentFeature = childProcess.spawnSync('python3', ['acceptance_check.py'], { cwd: workspace, encoding: 'utf8' });
    expect(absentFeature.status).not.toBe(0);
    fs.appendFileSync(path.join(workspace, 'calc.py'), '\ndef multiply(a,b):\n    return a*b\n', 'utf8');
    fs.appendFileSync(path.join(workspace, 'display.py'), '\nfrom calc import multiply\ndef format_product(a,b):\n    return str(multiply(a,b))\n', 'utf8');
    fs.writeFileSync(path.join(workspace, 'test_calc.py'), 'import unittest\nfrom calc import add,multiply\nfrom display import format_sum,format_product\nclass Tests(unittest.TestCase):\n def test_add(self): self.assertEqual(add(2,3),5)\n def test_sum(self): self.assertEqual(format_sum(2,3),"5")\n def test_positive(self): self.assertEqual(multiply(2,3),6)\n def test_negative(self): self.assertEqual(format_product(-2,3),"-6")\nif __name__=="__main__": unittest.main()\n', 'utf8');
    const contractCheck = childProcess.spawnSync('python3', ['acceptance_check.py'], { cwd: workspace, encoding: 'utf8' });
    expect(contractCheck.status).toBe(0); expect(contractCheck.stdout).toContain('A2-FUNCTIONAL-CONTRACT-PASS');
    // The fixture workspace carries every file the scripted prompts read, rewrite or run.
    const fixtureWorkspace = path.join(parent, 'fixture'); supplement.seedWorkspace(fixtureWorkspace, 'fixture');
    for (const name of ['AGENTS.md', 'probe.txt', 'check.py', 'a.txt', 'b.txt', ...Object.keys(supplement.SCRIPT_FILES), ...Object.keys(supplement.DATA_FILES)]) expect(fs.existsSync(path.join(fixtureWorkspace, name))).toBe(true);
    expect(fs.readFileSync(path.join(fixtureWorkspace, 'AGENTS.md'), 'utf8')).toContain('A2-RULE-MARKER');
    expect(fs.readFileSync(path.join(fixtureWorkspace, 'AGENTS.md'), 'utf8').length).toBeLessThan(200);
    const check = childProcess.spawnSync('python3', ['check.py'], { cwd: fixtureWorkspace, encoding: 'utf8' });
    expect(check.status).toBe(0); expect(check.stdout).toContain('A2-CHECK');
    const large = childProcess.spawnSync('python3', ['check.py', '--large-fail'], { cwd: fixtureWorkspace, encoding: 'utf8' });
    expect(large.status).toBe(1); expect(large.stdout.length).toBeGreaterThanOrEqual(20000);
    const modify = childProcess.spawnSync('python3', ['ext_modify.py', 'ext_shell.txt', 'shell1'], { cwd: fixtureWorkspace, encoding: 'utf8' });
    expect(modify.status).toBe(0); expect(fs.readFileSync(path.join(fixtureWorkspace, 'ext_shell.txt'), 'utf8')).toBe('shell1\n');
    expect(fs.readFileSync(path.join(fixtureWorkspace, 'late_target.txt'), 'utf8')).toBe('late0\n');
    expect(fs.readFileSync(path.join(fixtureWorkspace, 'cont_target.txt'), 'utf8')).toBe('cont0\n');
  });
  test('credential copying retains ciphertext only, refuses changed endpoint and does not overwrite data', () => {
    const source = root(); const target = root(); const a = baseAuthority();
    fs.writeFileSync(path.join(source, 'a9-provider-config.v1.json'), JSON.stringify({ schemaVersion: 1, baseUrl: a.provider.base_url, model: a.provider.model, keyRemembered: true }));
    const file = path.join(source, 'a9-vault-apikey', 'credentials', 'credentials.v1.json'); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, protection: 'electron-safe-storage-windows-dpapi-current-user', ciphertext: Buffer.from('opaque encrypted bytes').toString('base64') }));
    expect(supplement.copyEncryptedConfig(source, target, a.provider)).toMatchObject({ plaintext_credential_export: false, actual_dpapi_restore: 'NOT_PERFORMED' });
    expect(fs.readFileSync(path.join(target, 'a9-vault-apikey', 'credentials', 'credentials.v1.json'))).toEqual(fs.readFileSync(file));
    expect(() => supplement.copyEncryptedConfig(source, target, a.provider)).toThrow();
    expect(() => supplement.copyEncryptedConfig(source, root(), { ...a.provider, model: 'changed' })).toThrow();
    const rejected = root(); const sentinel = 'PLAINTEXT_SENTINEL_NEVER_EXPORT';
    fs.writeFileSync(path.join(source, 'a9-provider-config.v1.json'), JSON.stringify({ schemaVersion: 1, baseUrl: a.provider.base_url, model: a.provider.model, keyRemembered: true, apiKey: sentinel }));
    expect(() => supplement.copyEncryptedConfig(source, rejected, a.provider)).toThrow('SAVED_CONFIG_FIELDS');
    expect(fs.readdirSync(rejected)).toEqual([]);
    fs.writeFileSync(path.join(source, 'a9-provider-config.v1.json'), JSON.stringify({ schemaVersion: 1, baseUrl: a.provider.base_url, model: a.provider.model, keyRemembered: true, probe: { error: sentinel } }));
    const sanitized = root(); supplement.copyEncryptedConfig(source, sanitized, a.provider);
    expect(fs.readFileSync(path.join(sanitized, 'a9-provider-config.v1.json'), 'utf8')).not.toContain(sentinel);
  });
  test('actual package data-root selector receives isolated LOCALAPPDATA and portable is disabled', () => {
    const { loadA9PackageRuntime } = require('../../product/a9-package-runtime');
    const releaseRoot = root(); const appRoot = path.join(releaseRoot, 'resources', 'app'); const productRoot = path.join(appRoot, 'product');
    const storage = path.join(releaseRoot, 'resources', 'native', 'storage');
    const binding = path.join(storage, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
    const helper = path.join(releaseRoot, 'resources', 'native', 'runner', 'spike02_helper.exe');
    for (const dir of [productRoot, path.dirname(binding), path.dirname(helper)]) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(binding, 'sqlite-fixture'); fs.writeFileSync(helper, 'runner-fixture');
    const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
    fs.writeFileSync(path.join(appRoot, 'a9-runtime.json'), JSON.stringify({ schema_version: 1, release_id: 'A9-TEST', version: '0.3.0-alpha.1', native_layout: 'EXTERNAL_TO_APP_AND_ASAR',
      storage_module_root: '../native/storage', storage_native_binding: '../native/storage/node_modules/better-sqlite3/build/Release/better_sqlite3.node', runner_helper: '../native/runner/spike02_helper.exe',
      runner_helper_profile: 'D-013-v25-a9-trusted-shell-current-user', runner_helper_protocol: 2, data_root: '%LOCALAPPDATA%\\Win7CodingAgent\\a9', portable_flag: '--portable' }));
    fs.writeFileSync(path.join(releaseRoot, 'release-manifest.json'), JSON.stringify({ schema_version: 1, release_id: 'A9-TEST', version: '0.3.0-alpha.1',
      status: 'DEVELOPER_PACKAGE_CANDIDATE_NOT_WIN10_OR_WIN7_PASS', files: [], gates: { win10: 'NOT_PERFORMED', win7: 'NOT_PERFORMED' }, required_native: { runner_helper: digest('runner-fixture'), runner_helper_profile: 'D-013-v25-a9-trusted-shell-current-user', runner_helper_protocol: 2, better_sqlite3_node: digest('sqlite-fixture'), electron_abi: 110 } }));
    const env = supplement.isolatedProfileEnvironment('C:\\A9-new-run\\work\\m5');
    expect(env.WIN7AGENT_PORTABLE).toBe('0'); expect(env.TEMP).toBe(env.TMP); expect(env.NODE_TLS_REJECT_UNAUTHORIZED).toBe('1'); expect(env.NODE_EXTRA_CA_CERTS).toBe('');
    const selected: any[] = []; const ensured: string[] = [];
    const runtime = loadA9PackageRuntime({ productRoot, platform: 'win32', argv: [], env, ensureDirectory: (directory: string) => ensured.push(directory), app: { setPath: (name: string, value: string) => selected.push({ name, value }) } });
    expect(runtime.portable).toBe(false);
    expect(selected).toEqual([{ name: 'userData', value: path.win32.join(env.LOCALAPPDATA, 'Win7CodingAgent') }]);
    expect(ensured).toEqual([path.win32.join(env.LOCALAPPDATA, 'Win7CodingAgent')]);
  });
  test('real-model shell evidence binds start/end, exact command, workspace and structured cleanup facts', () => {
    const workspace = 'C:\\new run\\中文 workspace';
    const build = (command: string, cwd = workspace) => [
      { eventType: 'tool_start', eventId: 1, payload: { data: { toolName: 'shell', callId: 'call', args: { command, cwd } } } },
      { eventType: 'tool_end', eventId: 2, payload: { data: { toolName: 'shell', callId: 'call', shell: { exitCode: 0, stdout: 'Ran 4 tests\nOK\nA2-BUILD-PASS', processTreeReaped: true, timedOut: false, truncated: false } } } },
    ];
    expect(driver.journeyShellChecks(build('python test_calc.py'), workspace, 'python test_calc.py')).toHaveLength(1);
    for (const command of ['python fake.py', 'echo OK', 'python test_calc.py; echo OK', 'python build.py']) expect(driver.journeyShellChecks(build(command), workspace, 'python test_calc.py')).toHaveLength(0);
    expect(driver.journeyShellChecks(build('python test_calc.py', 'C:\\other'), workspace, 'python test_calc.py')).toHaveLength(0);
    const changed = build('python test_calc.py'); changed[1].payload.data.callId = 'unmatched';
    expect(driver.journeyShellChecks(changed, workspace, 'python test_calc.py')).toHaveLength(0);
    const truncated: any = build('python test_calc.py'); truncated[1].payload.data.shell.truncated = true;
    expect(driver.journeyShellChecks(truncated, workspace, 'python test_calc.py')).toHaveLength(0);
  });
  test('J1 accepts actual workspace numbered reads and rejects errors/content/hash/incomplete citations', async () => {
    const workspace = 'C:\\new\\workspace'; const source = 'def add(a,b):\n    return a-b\n';
    const sources = { 'AGENTS.md': '# rules\n', 'README.md': '# project\n', 'calc.py': source };
    const digest = (text: string) => crypto.createHash('sha256').update(text).digest('hex');
    const directory = root();
    const { A9WorkspaceService } = require('../../../workspace/dist/a9-workspace-service');
    const service = new A9WorkspaceService(directory); const reads: any[] = [];
    for (const [name, content] of Object.entries(sources)) {
      fs.writeFileSync(path.join(directory, name), content, 'utf8');
      const result = await service.read(name); const n = reads.length;
      reads.push({ eventType: 'tool_start', eventId: n + 1, payload: { data: { toolName: 'read', callId: name, args: { path: name } } } },
        { eventType: 'tool_end', eventId: n + 2, payload: { data: { toolName: 'read', callId: name, result: JSON.stringify(result) } } });
    }
    expect(JSON.parse(reads[5].payload.data.result).content).toBe('1: def add(a,b):\n2:     return a-b\n3: ');
    const judge = (events: any[], modelText: string) => driver.journeyReadCitations(events, workspace, modelText, source, sources).ok;
    const answer = 'add 应做加法，实际做减法。calc.py:1 `def add(a,b):`，calc.py:2 `return a-b`';
    expect(judge(reads, answer)).toBe(true);
    expect(judge(reads, 'add 应做加法，实际做减法。calc.py:1 `return a-b`，calc.py:2 `def add(a,b):`')).toBe(false);
    expect(judge(reads, answer.replace('，实际', ',实际'))).toBe(false);
    expect(judge(reads, answer.replace('calc.py:1', 'README.md:1'))).toBe(false);
    expect(judge(reads, 'calc.py:1 calc.py:2')).toBe(false);
    expect(judge(reads, 'calc.py:1 def add(a,b): calc.py:2 return a-b')).toBe(false);
    expect(judge(reads, 'add 应做加法，实际做减法。calc.py:1 calc.py:2')).toBe(false);
    expect(judge(reads, 'calc.py:2')).toBe(false);
    expect(judge(reads, 'calc.py:999')).toBe(false);
    for (const replacement of [JSON.stringify({ error: { code: 'ENOENT', message: 'missing' } }), 'unparseable read result',
      JSON.stringify({ path: 'calc.py', isText: true, outsideWorkspace: false, truncated: false, startLine: 1, content: 'fake', contentSha256: digest('fake') })]) {
      const bad = JSON.parse(JSON.stringify(reads)); bad[5].payload.data.result = replacement;
      expect(judge(bad, answer)).toBe(false);
    }
    const raw = JSON.parse(JSON.stringify(reads)); const rawResult = JSON.parse(raw[5].payload.data.result); rawResult.content = source; raw[5].payload.data.result = JSON.stringify(rawResult);
    expect(judge(raw, answer)).toBe(false);
    const wrongPaths = JSON.parse(JSON.stringify(reads)); wrongPaths[0].payload.data.args.path = 'unrelated.txt';
    expect(judge(wrongPaths, answer)).toBe(false);
  });
  test('on-demand issuance is fixed in the hashed CLI/desktop path and later requests need fresh TTL', () => {
    const moduleSource = fs.readFileSync(path.join(releaseDir, 'a9-alpha2-supplement.cjs'), 'utf8');
    const desktopSource = fs.readFileSync(path.join(releaseDir, 'a9-alpha2-supplement-desktop.ps1'), 'utf8');
    expect(moduleSource).toContain("argv[0] === '--issue'");
    expect(desktopSource.indexOf("'--issue'")).toBeLessThan(desktopSource.indexOf("'--run'"));
    // Second Win7 attempt: EPIPE under "&" capture of the GUI-subsystem electron.exe (cause is a hypothesis). The Process-based path is NOT_PERFORMED on Win7.
    expect(desktopSource).not.toMatch(/&\s*\$electron/);
    expect(desktopSource).not.toMatch(/\(\s*&\s*\$/);
    for (const needle of ['New-Object Diagnostics.ProcessStartInfo', '$info.FileName=$electron', '$info.UseShellExecute=$false', '$info.RedirectStandardOutput=$true', '$info.RedirectStandardError=$true', '$info.StandardOutputEncoding=[Text.Encoding]::UTF8', '$info.StandardErrorEncoding=[Text.Encoding]::UTF8', '[Diagnostics.Process]::Start($info)', '[Console]::OpenStandardOutput()', '[Console]::OpenStandardError()', 'New-Object Text.UTF8Encoding($false)', 'ReadToEndAsync()', 'WaitForExit()']) expect(desktopSource).toContain(needle);
    expect(desktopSource.indexOf('WaitForExit()')).toBeLessThan(desktopSource.indexOf('.Result'));
    expect(desktopSource.indexOf('$info.StandardOutputEncoding')).toBeLessThan(desktopSource.indexOf('[Diagnostics.Process]::Start($info)'));
    expect(desktopSource.indexOf('$info.StandardErrorEncoding')).toBeLessThan(desktopSource.indexOf('[Diagnostics.Process]::Start($info)'));
    expect(desktopSource).not.toContain('[Console]::Out.Write'); expect(desktopSource).not.toContain('[Console]::Error.Write');
    expect(desktopSource.match(/Invoke-Electron @\(/g)).toHaveLength(2);
    expect(desktopSource.indexOf('Invoke-Electron @($orchestrator,\'--issue\'')).toBeLessThan(desktopSource.indexOf('Invoke-Electron @($orchestrator,\'--run\''));
    expect(desktopSource).toContain("'A9_36_REQUEST_ISSUE_FAILED'");
    expect(desktopSource).not.toMatch(/Set-ExecutionPolicy/i);
    expect(desktopSource).toContain(`ValidateSet(${req.PHASES.map((p: string) => `'${p}'`).join(',')})`);
    expect(moduleSource).toContain("argv[0] === '--m6-probe'"); expect(moduleSource).toContain("argv[0] === '--m6-fixtures'"); expect(moduleSource).toContain("argv[0] === '--m6-baseline'");
    const a = baseAuthority(); const old = req.createRequest(a, 'm1', PIN, now);
    expect(() => req.validateRequest(old, a, PIN, now + 900001)).toThrow();
    expect(() => req.validateRequest(req.createRequest(a, 'm1', PIN, now + 900001), a, PIN, now + 900001)).not.toThrow();
    expect(() => req.assertNext(req.createRequest(a, 'm1', PIN, now), a, root(), PIN, now)).toThrow();
    const bound = { ...a, run_root: root() }; const ledger = path.join(bound.run_root, 'ledger');
    const firstFile = supplement.issueRequest(bound, 'm4', PIN, now); const first = req.readJson(firstFile);
    expect(first.index).toBe(1); expect(() => supplement.issueRequest(bound, 'm4', PIN, now)).toThrow();
    expect(() => supplement.issueRequest(bound, 'm1', PIN, now)).toThrow();
    req.consume(first, bound, ledger, PIN, now); fs.mkdirSync(path.join(bound.run_root, 'evidence', 'm4'), { recursive: true });
    req.complete(first, bound, { task: 'A9-36', run_id: bound.run_id, phase: 'm4', package_sha256: bound.package_sha256, status: 'PASS' });
    const secondFile = supplement.issueRequest(bound, 'm1', PIN, now + 900001); const second = req.readJson(secondFile);
    expect(second.index).toBe(2); expect(Date.parse(second.expires_at)).toBe(now + 900001 + 900000);
    expect(req.readJson(firstFile)).toEqual(first);
  });
  test('fixture rejects malformed streaming finishes and retries only one actual context error', async () => {
    const fixture = new supplement.SupplementFixture(path.join(root(), 'requests.jsonl')); const port = await fixture.listen();
    const post = (prompt: string, extra: any[] = []) => new Promise<any>((resolve, reject) => {
      const body = JSON.stringify({ messages: [{ role: 'user', content: prompt }, ...extra] });
      const request = http.request({ hostname: '127.0.0.1', port, path: '/v1/chat/completions', method: 'POST' }, (response) => { let raw = ''; response.on('data', (c) => { raw += c; }); response.on('end', () => resolve({ status: response.statusCode, raw })); });
      request.on('error', reject); request.end(body);
    });
    try {
      const first = await post('a2-context-retry'); const second = await post('a2-context-retry');
      expect(first.status).toBe(400); expect(first.raw).toContain('context_length_exceeded');
      expect(second.status).toBe(200); expect(second.raw).toContain('A2 fixture complete');
      const missing = await post('a2-provider:missing'); expect(missing.raw).not.toContain('finish_reason');
      const empty = await post('a2-provider:empty'); expect(empty.raw).toBe('data: [DONE]\n\n');
      const turns = [];
      for (const name of ['write', 'shell', 'start_process']) {
        const prompt = 'a2-readonly:' + name; const id = 'a2-' + req.sha(prompt).slice(0, 8) + '-0';
        await post(prompt);
        await post(prompt, [{ role: 'assistant', tool_calls: [{ id, function: { name } }] },
          { role: 'tool', tool_call_id: id, content: `Error: unknown or unavailable tool '${name}' in read_only mode. Available tools: list, read.` }]);
        turns.push({ events: [] });
      }
      const rows = fs.readFileSync(fixture.logFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
      expect(driver.supplementalReadOnlyFacts(turns, rows, true).ok).toBe(true);
      expect(driver.supplementalReadOnlyFacts(turns, [], true).ok).toBe(false);
      expect(driver.supplementalReadOnlyFacts(turns, rows.filter((row: any) => !row.rejections.length), true).ok).toBe(false);
      expect(driver.supplementalReadOnlyFacts(turns, rows, false).ok).toBe(false);
      expect(driver.supplementalReadOnlyFacts([{ events: [{ eventType: 'tool_start' }] }, ...turns.slice(1)], rows, true).ok).toBe(false);
    } finally { await fixture.close(); }
  });
  test('saved budget is the only config field the Stage setup changes, within the product bounds, and copied configs keep it', () => {
    const dataRoot = root(); const file = path.join(dataRoot, 'a9-provider-config.v1.json');
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, baseUrl: 'http://127.0.0.1:1/v1', model: 'm', customHeaderNames: [] }));
    expect(supplement.setContextBudget(dataRoot, 16000)).toEqual({ file: 'a9-provider-config.v1.json', before: null, after: 16000 });
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ schemaVersion: 1, baseUrl: 'http://127.0.0.1:1/v1', model: 'm', customHeaderNames: [], contextBudgetChars: 16000 });
    expect(supplement.setContextBudget(dataRoot, 20000)).toMatchObject({ before: 16000, after: 20000 });
    for (const bad of [15999, 1000001, 16000.5, '16000', null]) expect(() => supplement.setContextBudget(dataRoot, bad)).toThrow('A9_36_BUDGET_CONFIG');
    expect(() => supplement.setContextBudget(root(), 16000)).toThrow();
    const source = root(); const target = root(); const a = baseAuthority();
    fs.writeFileSync(path.join(source, 'a9-provider-config.v1.json'), JSON.stringify({ schemaVersion: 1, baseUrl: a.provider.base_url, model: a.provider.model, keyRemembered: true, contextBudgetChars: 40000 }));
    const key = path.join(source, 'a9-vault-apikey', 'credentials', 'credentials.v1.json'); fs.mkdirSync(path.dirname(key), { recursive: true });
    fs.writeFileSync(key, JSON.stringify({ schemaVersion: 1, protection: 'electron-safe-storage-windows-dpapi-current-user', ciphertext: Buffer.from('opaque').toString('base64') }));
    supplement.copyEncryptedConfig(source, target, a.provider);
    expect(JSON.parse(fs.readFileSync(path.join(target, 'a9-provider-config.v1.json'), 'utf8')).contextBudgetChars).toBe(40000);
    fs.writeFileSync(path.join(source, 'a9-provider-config.v1.json'), JSON.stringify({ schemaVersion: 1, baseUrl: a.provider.base_url, model: a.provider.model, keyRemembered: true, contextBudgetChars: 10 }));
    expect(() => supplement.copyEncryptedConfig(source, root(), a.provider)).toThrow('SAVED_CONFIG_BUDGET');
  });
  test('fixture follows the original goal of a continuation prompt and logs the facts the judgements need, never the request body', async () => {
    const workspace = root(); fs.writeFileSync(path.join(workspace, 'AGENTS.md'), '# A2-RULE-MARKER-CHANGED\nrules\n');
    const logFile = path.join(root(), 'requests.jsonl'); const fixture = new supplement.SupplementFixture(logFile); const port = await fixture.listen();
    const call = (route: string, body: any, method = 'POST') => new Promise<any>((resolve, reject) => {
      const request = http.request({ hostname: '127.0.0.1', port, path: route, method }, (response) => { let raw = ''; response.on('data', (c) => { raw += c; }); response.on('end', () => resolve({ status: response.statusCode, raw })); });
      request.on('error', reject); request.end(body === undefined ? undefined : JSON.stringify(body));
    });
    const chat = (prompt: string, extra: any[] = [], system = 'SYSTEM BODY A2') => call('/v1/chat/completions', { messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }, ...extra] });
    try {
      expect(supplement.continuationGoal('a2-rules')).toBeNull();
      const wrapper = `用户主动请求继续原任务\n${JSON.stringify({ originalGoal: 'a2-cont-edit:1', other: 1 })}\n不得重放已完成的工具调用`;
      expect(supplement.continuationGoal(wrapper)).toBe('a2-cont-edit:1');
      expect(supplement.continuationGoal('用户主动请求继续原任务\n{bad json')).toBeNull();
      expect((await call('/state', { workspace: workspace })).status).toBe(200);
      for (const bad of [{ unknown: 1 }, { providerFail: 'yes' }, { shellKind: 'bash' }, { workspace: '' }, { contextRetried: 1 }]) expect((await call('/state', bad)).status).toBe(400);
      const first = await chat(wrapper);
      expect(first.raw).toContain('"read"');
      const lines = () => fs.readFileSync(logFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
      const row = lines()[0];
      expect(row).toMatchObject({ request: 1, continuation: true, prompt: 'a2-cont-edit:1', rules: 0, environment: 0, agents_in_request: false, tool_messages: 0 });
      expect(row.rule_markers).toEqual([]); expect(row.system_sha256).toBe(crypto.createHash('sha256').update('SYSTEM BODY A2').digest('hex'));
      expect(row.agents_sha256).toBe(crypto.createHash('sha256').update('# A2-RULE-MARKER-CHANGED\nrules\n').digest('hex'));
      expect(JSON.stringify(row)).not.toContain('SYSTEM BODY A2');
      const withAgents = await chat('a2-rules', [], 'SYS <environment_facts>x</environment_facts>\n# A2-RULE-MARKER-CHANGED\nrules\n');
      expect(withAgents.status).toBe(200);
      expect(lines()[1]).toMatchObject({ request: 2, continuation: false, prompt: 'a2-rules', rules: 1, environment: 1, rule_markers: ['A2-RULE-MARKER-CHANGED'], agents_in_request: true });
      await call('/state', { providerFail: true });
      expect((await chat('a2-rules')).status).toBe(401);
      await call('/state', { providerFail: false });
      expect((await chat('a2-rules')).status).toBe(200);
      const counters = JSON.parse((await call('/counters', undefined, 'GET')).raw); expect(counters.requests).toBe(4); expect(counters.state.providerFail).toBe(false);
      fixture.beginStage(path.join(root(), 'next.jsonl'));
      expect(JSON.parse((await call('/counters', undefined, 'GET')).raw)).toMatchObject({ requests: 0, state: { shellKind: 'cmd' } });
      expect(supplement.finalDelayMs('a2-ext:bg')).toBe(0); expect(supplement.finalDelayMs('a2-audit-managed')).toBe(2500); expect(supplement.finalDelayMs('a2-rules')).toBe(0);
    } finally { await fixture.close(); }
  });
  test('every scripted prompt of the driver resolves to tools, and each Stage prompt keeps its designed tool sequence', () => {
    const source = fs.readFileSync(path.resolve(__dirname, 'a9-batch2-driver-entry.cjs'), 'utf8');
    const prompts = new Set<string>();
    for (const m of source.matchAll(/(?:supplementTurn|submit|submitRaw|runPrompt|localCommitTurn|deniedGit)\(\s*[`'"](a2-[^`'"$]*)/g)) prompts.add(m[1]);
    for (const m of source.matchAll(/submitTurn\("(a2-[^"]*)"\)/g)) prompts.add(m[1]);
    for (const m of source.matchAll(/prompt: '(a2-[^']*)'/g)) prompts.add(m[1]);
    expect(prompts.size).toBeGreaterThan(20);
    const concrete = (prompt: string) => prompt === 'a2-readonly:' ? 'a2-readonly:write' : prompt.endsWith(':') ? prompt + '1' : prompt;
    for (const prompt of prompts) {
      const kind = concrete(prompt);
      expect([kind, supplement.toolsFor(kind, 'cmd', { workspace: 'C:\\w' })]).not.toEqual([kind, null]);
    }
    const names = (prompt: string) => supplement.toolsFor(prompt, 'cmd', {}).map((t: any) => t.name);
    expect(names('a2-audit-output')).toEqual(['shell', 'write']);
    expect(names('a2-audit-managed')).toEqual(['start_process', 'shell']);
    expect(names('a2-audit-ownership')).toEqual(['start_process', 'write']);
    expect(names('a2-git-branch:1')).toEqual(['shell', 'shell', 'shell', 'shell']);
    expect(names('a2-bg-hold')).toEqual(['start_process']);
    expect(names('a2-late:1')).toEqual(['read', 'edit', 'start_process']);
    expect(names('a2-ext:shell')).toEqual(['read', 'edit', 'shell']);
    expect(names('a2-ext:bg')).toEqual(['start_process', 'shell']);
    expect(names('a2-review:3')).toEqual(['shell', 'start_process', 'shell']);
    expect(names('a2-cont-edit:1')).toEqual(['read', 'edit']);
    expect(supplement.toolsFor('a2-long-card:x', 'cmd', { workspace: 'C:\\w' })[0].args).toEqual({ command: supplement.LONG_CARD_COMMAND, cwd: 'C:\\w' });
    expect(supplement.LONG_CARD_COMMAND.length).toBeGreaterThan(400);
    expect(supplement.toolsFor('a2-git-branch:1', 'cmd', {})[1].args.command).toBe('git switch -c a2-topic');
    expect(supplement.toolsFor('a2-git-branch:1', 'cmd', {})[3].args.command).toBe('git -c user.name=A2 -c user.email=a2@example.invalid commit -m A2-topic');
    expect(supplement.toolsFor('a2-cmd-build:x', 'cmd', {})[0].args.command).toBe('python slow_build.py');
    expect(supplement.toolsFor('a2-cmd-test:x', 'cmd', {})[0].args.command).toBe('python check.py');
  });
  test('the local bare origin is real, holds exactly one ref, and the ref check notices any push or deletion', () => {
    const parent = root(); const workspace = path.join(parent, 'ws'); const origin = path.join(parent, 'origin.git'); fs.mkdirSync(workspace);
    fs.writeFileSync(path.join(workspace, 'probe.txt'), 'value 0\n');
    const git = childProcess.spawnSync('git', ['--version'], { encoding: 'utf8' });
    expect(git.status).toBe(0);
    const extra = supplement.setupGitWorkspace('git', workspace, origin);
    expect(extra.A9_ALPHA2_ORIGIN).toBe(origin); expect(extra.A9_ALPHA2_ORIGIN_MAIN).toMatch(/^[0-9a-f]{40}$/);
    const refs = () => childProcess.spawnSync('git', ['--git-dir', origin, 'for-each-ref', '--format=%(refname) %(objectname)'], { encoding: 'utf8' }).stdout.trim();
    expect(driver.evaluateOriginRefs(extra.A9_ALPHA2_ORIGIN_MAIN, refs())).toBe(true);
    expect(childProcess.spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: workspace, encoding: 'utf8' }).stdout.trim()).toBe(origin);
    expect(() => supplement.setupGitWorkspace('git', workspace, origin)).toThrow();
    childProcess.spawnSync('git', ['-c', 'user.name=A', '-c', 'user.email=a@example.invalid', 'commit', '--allow-empty', '-m', 'next'], { cwd: workspace });
    childProcess.spawnSync('git', ['push', 'origin', 'main'], { cwd: workspace });
    expect(driver.evaluateOriginRefs(extra.A9_ALPHA2_ORIGIN_MAIN, refs())).toBe(false);
    childProcess.spawnSync('git', ['push', 'origin', 'main:side'], { cwd: workspace });
    expect(driver.evaluateOriginRefs(extra.A9_ALPHA2_ORIGIN_MAIN, refs())).toBe(false);
    for (const [initial, text] of [['', ''], [null, null], ['a'.repeat(40), ''], ['a'.repeat(40), `refs/heads/main ${'b'.repeat(40)}`], ['a'.repeat(40), `refs/heads/main ${'a'.repeat(40)}\nrefs/heads/x ${'a'.repeat(40)}`], ['short', 'refs/heads/main short']]) {
      expect(driver.evaluateOriginRefs(initial as any, text as any)).toBe(false);
    }
    expect(driver.evaluateOriginRefs('a'.repeat(40), `refs/heads/main ${'a'.repeat(40)}\n`)).toBe(true);
  });
  test('F-01 corpus: the repository Policy engine allows the 17 characterised forms and still asks for the controls', () => {
    const types = require('../../../core/dist/types'); const { PolicyEngine } = require('../../../core/dist/policy');
    const engine = new PolicyEngine();
    const evaluate = (command: string, toolName = 'shell') => engine.evaluate({ id: 'c', toolName, args: { command }, approvalLevel: types.ApprovalLevel.FULL_ACCESS });
    expect(supplement.F01_WRAPPED).toHaveLength(13); expect(supplement.F01_DATA).toHaveLength(4); expect(supplement.F01_CONTROLS).toHaveLength(2);
    expect(new Set([...supplement.F01_WRAPPED, ...supplement.F01_DATA, ...supplement.F01_CONTROLS]).size).toBe(19);
    for (const command of [...supplement.F01_WRAPPED, ...supplement.F01_DATA]) expect([command, evaluate(command).verdict, evaluate(command).ruleId]).toEqual([command, 'allow', 'POLICY_FULL_ACCESS_ALLOWED']);
    for (const command of supplement.F01_CONTROLS) expect([command, evaluate(command).verdict]).toEqual([command, 'ask']);
    const rows = [['wrapped', supplement.F01_WRAPPED], ['data', supplement.F01_DATA], ['control', supplement.F01_CONTROLS]].flatMap(([group, list]: any) => list.map((command: string) => ({ group, command, verdict: evaluate(command).verdict, rule_id: evaluate(command).ruleId })));
    const expected = { wrapped: supplement.F01_WRAPPED, data: supplement.F01_DATA, controls: supplement.F01_CONTROLS, tool_starts_before: 3, tool_starts_after: 3 };
    expect(driver.evaluateF01(rows, expected).ok).toBe(true);
    expect(driver.evaluateF01(rows.map((r: any) => r.command === 'nohup npm publish' ? { ...r, verdict: 'ask' } : r), expected).ok).toBe(false);
    expect(driver.evaluateF01(rows.map((r: any) => r.command === 'npm publish' ? { ...r, verdict: 'allow' } : r), expected).ok).toBe(false);
    expect(driver.evaluateF01(rows.map((r: any) => r.command === 'echo npm publish' ? { ...r, rule_id: 'OTHER' } : r), expected).ok).toBe(false);
    expect(driver.evaluateF01(rows.slice(1), expected).ok).toBe(false);
    expect(driver.evaluateF01(rows, { ...expected, tool_starts_after: 4 }).ok).toBe(false);
    expect(driver.evaluateF01(rows, { ...expected, wrapped: supplement.F01_WRAPPED.slice(1) }).ok).toBe(false);
    expect(driver.evaluateF01([], expected).ok).toBe(false);
    // The scripted Git flows rely on exactly these classifications: only the commit and the long push command wait for an approval.
    for (const command of ['git branch --show-current', 'git switch -c a2-topic', 'git add -- probe.txt', 'git status --porcelain', 'git diff -- probe.txt', 'python check.py', 'python slow_build.py', 'python bg_out.py', 'python bg_hold.py', 'python late_write.py', 'python ext_modify.py ext_bg.txt bg1'])
      expect([command, evaluate(command).verdict]).toEqual([command, 'allow']);
    for (const command of ['git -c user.name=A2 -c user.email=a2@example.invalid commit -m A2-topic', 'git -c user.name=A2 -c user.email=a2@example.invalid commit -m A2-local', supplement.LONG_CARD_COMMAND]) expect([command.slice(0, 40), evaluate(command).verdict]).toEqual([command.slice(0, 40), 'ask']);
    for (const form of supplement.GIT_FORMS) expect(evaluate(form).verdict).not.toBe('allow');
  });
  test('M6 mechanics on the developer machine: fixtures, deterministic baseline, ten probes and the verdict with counterexamples', () => {
    const base = root(); const sqliteDir = path.dirname(require.resolve('better-sqlite3/package.json'));
    const packageRoot = path.join(base, 'pkg'); fs.mkdirSync(path.join(packageRoot, 'resources', 'app'), { recursive: true });
    fs.symlinkSync(path.resolve(__dirname, '../../../state'), path.join(packageRoot, 'resources', 'app', 'state'), 'dir');
    expect(fs.existsSync(path.join(packageRoot, ...supplement.M6_PINS.persistence_path.split('/')))).toBe(true);
    const fixturesDir = path.join(base, 'fixtures');
    const files = supplement.m6Fixtures(fixturesDir, packageRoot, packageRoot, sqliteDir).files;
    expect(Object.keys(files)).toEqual(['F42.sqlite', 'FCandC.sqlite', 'FCandN.sqlite', 'C42.sqlite', 'CCand.sqlite']);
    expect(files['C42.sqlite'].size).toBe(Math.floor(files['F42.sqlite'].size / 2)); expect(files['CCand.sqlite'].size).toBe(Math.floor(files['FCandN.sqlite'].size / 2));
    expect(() => supplement.m6Fixtures(fixturesDir, packageRoot, packageRoot, sqliteDir)).toThrow();
    const pinned = supplement.m6Baseline(fixturesDir, packageRoot, packageRoot, sqliteDir);
    expect(Object.keys(pinned)).toEqual(req.M6_FIXTURE_FILES); expect(() => supplement.m6Baseline(fixturesDir, packageRoot, packageRoot, sqliteDir)).toThrow();
    const baseline = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'baseline.json'), 'utf8'));
    expect(baseline).toMatchObject({ schema_version: 1, now: req.M6_NOW }); expect(Object.keys(baseline.scenarios)).toEqual(supplement.M6_SCENARIOS.map((s: any) => s.name));
    expect(supplement.M6_SCENARIOS.filter((s: any) => s.kind === 'normal')).toHaveLength(6); expect(supplement.M6_SCENARIOS.filter((s: any) => s.kind === 'corrupt')).toHaveLength(4);
    expect(supplement.M6_CALL_LABELS).toHaveLength(13);
    const results: any = {};
    for (const scenario of supplement.M6_SCENARIOS) {
      const work = fs.mkdtempSync(path.join(base, 'probe-')); const copy = path.join(work, 'a9.sqlite'); fs.copyFileSync(path.join(fixturesDir, scenario.fixture + '.sqlite'), copy);
      results[scenario.name] = supplement.m6Probe(scenario.name, packageRoot, sqliteDir, copy);
    }
    for (const name of ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']) { expect(results[name].business.open_status).toBe('ready'); expect(results[name].business.calls).toHaveLength(13); }
    for (const name of ['X1', 'X2', 'X3', 'X4']) expect(results[name].business).toMatchObject({ open_status: 'diagnostics', has_manager: false, main_unchanged: true });
    const env = results.S1.env; const expectedEnv = { node: env.node, electron: env.electron, abi: env.abi, platform: env.platform, arch: env.arch };
    const pins = { fixtures_unchanged: true, packages_verified: true, persistence: true, native: true };
    const verdict = (changed: any, options: any = {}) => supplement.evaluateM6(changed, baseline, { expectedEnv, pins, ...options });
    const clone = () => JSON.parse(JSON.stringify(results));
    const good = verdict(results); expect(good.ok).toBe(true); expect(good.rows.map((r: any) => r.assertion_id)).toEqual(supplement.M6_ASSERTIONS);
    const status = (value: any) => value.rows.map((r: any) => r.status).join(',');
    expect(status(good)).toBe('PASS,PASS,PASS,PASS,PASS');
    let changed = clone(); changed.S3.business.calls[2].value = [{ extra: true }];
    expect(verdict(changed).rows[1].status).toBe('FAIL'); expect(verdict(changed).ok).toBe(false);
    changed = clone(); changed.S2.business.calls[4].ok = false; expect(verdict(changed).rows[0].status).toBe('FAIL');
    changed = clone(); changed.S1.business.calls.reverse(); expect(verdict(changed).rows[0].status).toBe('FAIL');
    changed = clone(); changed.S6.business.open_status = 'diagnostics'; expect(verdict(changed).rows[0].status).toBe('FAIL');
    changed = clone(); changed.X2.business.open_status = 'ready'; changed.X2.business.has_manager = true; expect(verdict(changed).rows[2].status).toBe('FAIL');
    changed = clone(); changed.X4.business.main_sha256_after = 'f'.repeat(64); changed.X4.business.main_unchanged = false; expect(verdict(changed).rows[2].status).toBe('FAIL');
    changed = clone(); delete changed.X1; expect(verdict(changed).rows[2].status).toBe('FAIL');
    changed = clone(); changed.S4.env.node = '99.0.0'; expect(verdict(changed).rows[3].status).toBe('FAIL');
    for (const key of ['fixtures_unchanged', 'packages_verified', 'persistence', 'native']) expect(verdict(results, { pins: { ...pins, [key]: false } }).rows[3].status).toBe('FAIL');
    expect(verdict(results, { pins: {} }).rows[3].status).toBe('FAIL');
    expect(verdict(results, { expectedEnv: { ...expectedEnv, electron: '22.3.27' } }).rows[3].status).toBe('FAIL');
    changed = clone(); const handles = changed.S5.business.calls.find((c: any) => c.label === 'listManagedProcesses').value; handles.find((p: any) => p.handleId === 'h2').cleanupRequired = !handles.find((p: any) => p.handleId === 'h2').cleanupRequired;
    expect(verdict(changed).rows[4].status).toBe('FAIL');
    changed = clone(); changed.S5.business.calls.find((c: any) => c.label === 'listConversationFacts').value.find((f: any) => f.taskId === 'task2').requestPrompt = 'other'; expect(verdict(changed).rows[4].status).toBe('FAIL');
    expect(verdict({}).ok).toBe(false); expect(verdict(null).ok).toBe(false);
    expect(supplement.canon({ b: 1, a: [{ d: 1, c: 2 }] })).toBe(supplement.canon({ a: [{ c: 2, d: 1 }], b: 1 }));
    expect(supplement.m6Observations(results.S5.business)).toEqual({ r1_cleanup_required: expect.any(Boolean), r2_request_prompt: expect.any(String) });
    expect(supplement.m6Observations(null)).toEqual({ r1_cleanup_required: undefined, r2_request_prompt: undefined });
    expect(() => supplement.m6Probe('S9', packageRoot, sqliteDir, path.join(base, 'x'))).toThrow('A9_36_M6_SCENARIO');
    expect(() => supplement.m6Probe('S1', 'relative', sqliteDir, path.join(base, 'x'))).toThrow('A9_36_M6_PATH');
    expect(supplement.M6_PINS).toMatchObject({ w42_persistence_sha256: req.W42_PERSISTENCE_SHA });
    expect(supplement.M6_PINS).not.toHaveProperty('cand_persistence_sha256'); expect(supplement.M6_PINS).not.toHaveProperty('native_sha256');
  }, 180000);
  test('manifest tree check refuses a changed, linked, escaping or duplicated entry', () => {
    const base = root(); fs.mkdirSync(path.join(base, 'sub')); fs.writeFileSync(path.join(base, 'sub', 'a.txt'), 'alpha');
    const sha = crypto.createHash('sha256').update('alpha').digest('hex'); const entry = { path: 'sub/a.txt', sha256: sha, size: 5 };
    expect(supplement.verifyManifestTree(base, { files: [entry] })).toBe(1);
    for (const files of [[{ ...entry, sha256: 'a'.repeat(64) }], [{ ...entry, size: 6 }], [entry, entry], [{ ...entry, path: '../x' }], [{ ...entry, path: 'sub\\a.txt' }], [{ ...entry, path: 'missing.txt' }], []]) {
      expect(() => supplement.verifyManifestTree(base, { files })).toThrow();
    }
    fs.symlinkSync(path.join(base, 'sub', 'a.txt'), path.join(base, 'link.txt'));
    expect(() => supplement.verifyManifestTree(base, { files: [{ ...entry, path: 'link.txt' }] })).toThrow('A9_36_CANDIDATE_LINK');
  });
  test('manifest tree check reads an archive-named file as a plain file (simulation: the Electron fs is modelled; the entry of the first Win7 failure was not recorded, resources/default_app.asar is the inferred cause)', () => {
    const base = root(); fs.mkdirSync(path.join(base, 'resources')); fs.writeFileSync(path.join(base, 'resources', 'default_app.asar'), 'archive-bytes');
    const entry = { path: 'resources/default_app.asar', sha256: crypto.createHash('sha256').update('archive-bytes').digest('hex'), size: 13 };
    const isArchive = (p: any) => /\.asar$/i.test(String(p));
    const electronLike: any = { lstatSync: (p: any) => fs.lstatSync(p), statSync: (p: any) => (isArchive(p) ? { isFile: () => false, isDirectory: () => true, size: 0 } : fs.statSync(p)),
      openSync: (p: any, flags: any) => { if (isArchive(p)) throw new Error('ENOTDIR'); return fs.openSync(p, flags); }, readSync: fs.readSync, closeSync: fs.closeSync };
    expect(() => supplement.verifyManifestTree(base, { files: [entry] }, electronLike)).toThrow('A9_36_CANDIDATE_CHANGED');
    expect(supplement.verifyManifestTree(base, { files: [entry] }, fs)).toBe(1);
    const nodeFs = require('fs');
    expect(supplement.rawFileSystem({}, () => { throw new Error('must not load original-fs outside Electron'); })).toBe(nodeFs);
    expect(supplement.rawFileSystem(undefined as any, () => { throw new Error('must not load'); })).toBe(nodeFs);
    expect(supplement.rawFileSystem({ electron: '22.3.27' }, () => nodeFs)).toBe(nodeFs);
    for (const method of ['lstatSync', 'statSync', 'openSync', 'readSync', 'closeSync']) expect(() => supplement.rawFileSystem({ electron: '22.3.27' }, () => ({ ...fs, [method]: undefined }))).toThrow('A9_36_PHYSICAL_FILESYSTEM_UNAVAILABLE');
    expect(() => supplement.rawFileSystem({ electron: '22.3.27' }, () => null)).toThrow('A9_36_PHYSICAL_FILESYSTEM_UNAVAILABLE');
    expect(() => supplement.rawFileSystem({ electron: '22.3.27' }, () => { throw new Error("Cannot find module 'original-fs'"); })).toThrow('A9_36_PHYSICAL_FILESYSTEM_UNAVAILABLE');
    const source = fs.readFileSync(path.join(releaseDir, 'a9-alpha2-supplement.cjs'), 'utf8');
    expect(source).toContain('function verifyManifestTree(root, manifest, io = rawFileSystem()) {');
    expect(source).toContain("loadOriginalFs = () => require('original-fs')");
    const body = source.slice(source.indexOf('function verifyManifestTree('), source.indexOf('function inspectCandidate('));
    expect(body.length).toBeGreaterThan(200); expect(body).not.toMatch(/\bfs\./); expect(body).not.toContain('contract.fileHash');
  });
  test('executor session id is compared as a whole number: 5 is not 50 or 51 and malformed WMIC output is refused', () => {
    expect(supplement.sessionIdOf('\r\r\nSessionId=5\r\r\n\r\r\n')).toBe(5);
    expect(supplement.sessionIdOf('SessionId=5')).toBe(5);
    expect(supplement.sessionIdOf('SessionId=50\r\n')).toBe(50);
    expect(supplement.sessionIdOf('SessionId=51\r\n')).toBe(51);
    for (const bad of ['', 'SessionId=', 'SessionId=five', 'SessionId=-5', 'SessionId=5.0', 'SessionId=5\r\nSessionId=5\r\n', 'SessionId=5\r\nSessionId=50\r\n', 'XSessionId=5', 'SessionId=5 extra', 'SessionId=1234567890', undefined, null]) {
      expect(supplement.sessionIdOf(bad as any)).toBeNull();
    }
    const source = fs.readFileSync(path.join(releaseDir, 'a9-alpha2-supplement.cjs'), 'utf8');
    const body = source.slice(source.indexOf('function assertActualRuntime('), source.indexOf('// Closed Stage plan.'));
    expect(body).toContain('sessionIdOf(self) !== a.target.session_id'); expect(body).not.toContain("self.includes('SessionId='");
  });
  test.each([
    ['dccs-chaizl-PC', true], ['DCCS-CHAIZL-PC', true], ['OTHER-PC', false],
  ])('executor machine comparison ignores hostname case but refuses another machine: %s', (machine, accepted) => {
    const a = baseAuthority();
    const spawnSync = jest.fn((file: string, args: string[]) => {
      if (file === a.tools.python.path) return { status: 0, stdout: 'Python 3.8.10\r\n' };
      if (file === a.tools.git.path) return { status: 0, stdout: 'git version 2.46.2.windows.1\r\n' };
      if (args[0] === '/user') return { status: 0, stdout: `"agent","${a.target.sid}"\r\n` };
      if (args[0] === '/groups') return { status: 0, stdout: '"Mandatory Label\\Medium Mandatory Level","S-1-16-8192"\r\n' };
      if (args[0] === 'process') return { status: 0, stdout: `\r\nSessionId=${a.target.session_id}\r\n` };
      throw new Error('unexpected identity command');
    });
    const context: any = { module: { exports: {} }, Buffer,
      process: { platform: 'win32', arch: 'x64', pid: 1234, env: { SystemRoot: 'C:\\Windows' },
        versions: { electron: '22.3.27', node: '16.17.1', modules: '110' } },
      require: (name: string) => name === 'os' ? { ...os, release: () => '6.1.7601', hostname: () => machine }
        : name === 'child_process' ? { spawnSync }
        : name === './a9-alpha2-supplement-request.cjs' ? { ...req, fileHash: (file: string) => {
          const tool = Object.values(a.tools).find((value) => value.path === file);
          if (!tool) throw new Error('unexpected tool hash'); return tool.sha256;
        } } : require(name) };
    vm.runInNewContext(fs.readFileSync(path.join(releaseDir, 'a9-alpha2-supplement.cjs'), 'utf8'), context);
    const check = () => context.module.exports.assertActualRuntime(a);
    if (accepted) expect(check()).toEqual({ electron: '22.3.27', node: '16.17.1', abi: '110', python: 'Python 3.8.10', git: 'git version 2.46.2.windows.1' });
    else expect(check).toThrow('A9_36_EXECUTOR_IDENTITY');
    expect(spawnSync).toHaveBeenCalledTimes(accepted ? 5 : 3);
  });
  const postflightFor = (rows: any[], failed = false, target: any = { session_id: 2 }, rootPids = [5644]) => {
    const context: any = { module: { exports: {} }, Buffer, process: { pid: 9000 },
      require: (name: string) => name === './a9-alpha2-supplement-request.cjs' ? req : require(name) };
    vm.runInNewContext(fs.readFileSync(path.join(releaseDir, 'a9-alpha2-supplement.cjs'), 'utf8') + '\nmodule.exports.postflight = postflight;', context);
    const realExec = jest.fn(() => { throw new Error('must not execute processes'); });
    const listProcesses = jest.fn(() => ({ failed, rows }));
    const result = context.module.exports.postflight({ listProcesses, realExec }, { target }, rootPids, ['C:\\A9-DEV\\']);
    expect(listProcesses).toHaveBeenCalledWith(realExec); expect(realExec).not.toHaveBeenCalled();
    return result;
  };
  test.each([
    'C:\\Program Files (x86)\\SogouInput\\SGTool.exe',
    'C:\\Program Files (x86)\\SogouInput\\16.7.0.4673\\SGTool.exe',
    'c:\\pRoGrAm FiLeS (X86)\\sOgOuInPuT\\16.7.0.4673\\sGtOoL.ExE',
  ])('ADR-0258 postflight records an environment process without residue: %s', (image) => {
    const row = { ProcessId: '7080', ParentProcessId: '5644', Name: 'SGTool.exe', SessionId: '2', ImagePath: image, ImageSource: 'executable_path' };
    for (const failed of [false, true]) {
      const result = postflightFor([row], failed);
      expect(result).toEqual({ failed, related: [], environment: [{ pid: 7080, parent: 5644, name: 'SGTool.exe', session: 2, image }] });
      expect(supplement.postflightClean(result)).toBe(!failed);
    }
  });
  test('ADR-0259 postflight keeps a command-line-derived SGTool image related', () => {
    const row = { ProcessId: '7080', ParentProcessId: '5644', Name: 'SGTool.exe', SessionId: '2',
      ImagePath: 'C:\\Program Files (x86)\\SogouInput\\16.7.0.4673\\SGTool.exe', ImageSource: 'command_line' };
    const result = postflightFor([row]);
    expect(result).toEqual({ failed: false, related: [{ pid: 7080, parent: 5644, name: 'SGTool.exe', session: 2 }], environment: [] });
    expect(supplement.postflightClean(result)).toBe(false);
  });
  test.each([
    'C:\\Program Files (x86)\\SogouInputX\\SGTool.exe',
    'C:\\Program Files (x86)\\SogouInput\\Other.exe',
    'C:\\Temp\\SGTool.exe', '', undefined, null,
    'C:\\Program Files (x86)\\SogouInput\\..\\SGTool.exe',
    'C:\\Program Files (x86)\\SogouInput\\.\\SGTool.exe',
    'C:\\Program Files (x86)\\SogouInput\\16.7\\..\\SGTool.exe',
    'C:\\Program Files (x86)\\SogouInput\\SGTool.exe:stream',
    '\\\\?\\C:\\Program Files (x86)\\SogouInput\\SGTool.exe',
    'C:/Program Files (x86)/SogouInput/SGTool.exe',
    'C:\\Program Files (x86)\\SogouInput\\SGTool.exe\n',
  ])('ADR-0258 postflight keeps an unapproved or unknown image related: %s', (image) => {
    const result = postflightFor([{ ProcessId: 7080, ParentProcessId: 5644, Name: 'SGTool.exe', SessionId: 2, ImagePath: image }]);
    expect(result.related).toEqual([{ pid: 7080, parent: 5644, name: 'SGTool.exe', session: 2 }]);
    expect(result.environment || []).toEqual([]); expect(result.failed).toBe(false);
    expect(supplement.postflightClean(result)).toBe(false);
  });
  test('ADR-0258 postflight preserves candidate selection and still tracks children of environment processes', () => {
    const image = 'C:\\Program Files (x86)\\SogouInput\\16.7.0.4673\\SGTool.exe';
    const result = postflightFor([
      { ProcessId: 7081, ParentProcessId: 7080, Name: 'child.exe', SessionId: 2, ImagePath: 'C:\\Temp\\child.exe' },
      { ProcessId: 7080, ParentProcessId: 5644, Name: 'SGTool.exe', SessionId: 2, ImagePath: image },
      { ProcessId: 8000, ParentProcessId: 1, Name: 'product.exe', SessionId: 2, ImagePath: 'C:\\A9-DEV\\product.exe' },
      { ProcessId: 8001, ParentProcessId: 1, Name: 'spike02_helper.exe', SessionId: 2, ImagePath: '' },
      { ProcessId: 8002, ParentProcessId: 1, Name: 'SGTool.exe', SessionId: 2, ImagePath: image },
      { ProcessId: 9000, ParentProcessId: 5644, Name: 'SGTool.exe', SessionId: 2, ImagePath: image },
    ]);
    expect(result.related).toEqual([
      { pid: 7081, parent: 7080, name: 'child.exe', session: 2 },
      { pid: 8000, parent: 1, name: 'product.exe', session: 2 },
      { pid: 8001, parent: 1, name: 'spike02_helper.exe', session: 2 },
    ]);
    expect(result.environment).toEqual([{ pid: 7080, parent: 5644, name: 'SGTool.exe', session: 2, image }]);
    expect(supplement.postflightClean(result)).toBe(false);
  });
  const exactSogouExe = "C:\\Program Files (x86)\\SogouInput\\SogouExe\\SogouExe.exe";
  const directSogouExe = { ProcessId: '7080', ParentProcessId: '5644', Name: 'SogouExe.exe', SessionId: '2',
    ImagePath: exactSogouExe, ExecutablePath: exactSogouExe, ImageSource: 'executable_path', CreationDate: '20261023085002.152400+480' };
  test.each([exactSogouExe, exactSogouExe.toUpperCase()])('ADR-0263 accepts only the exact directly identified SogouExe image: %s', image => {
    const row = { ...directSogouExe, Name: 'SOGOUeXE.EXE', ImagePath: image, ExecutablePath: image };
    for (const failed of [false, true]) {
      const result = postflightFor([row], failed);
      expect(result).toEqual({ failed, related: [], environment: [{ pid: 7080, parent: 5644, name: row.Name, session: 2,
        image, created: row.CreationDate, image_source: 'executable_path' }] });
      expect(supplement.postflightClean(result)).toBe(!failed);
    }
  });
  test.each([
    { ImageSource: 'command_line' }, { ImageSource: 'none' }, { ImageSource: undefined },
    { ExecutablePath: undefined }, { ExecutablePath: '' }, { Name: 'other.exe' }, { Name: 'SogouExe.exe\n' },
    { CreationDate: undefined }, { CreationDate: '' }, { CreationDate: '20261023085002.152400+480\n' },
    { CreationDate: '20260230085002.152400+480' }, { CreationDate: '20261323085002.152400+480' },
    { CreationDate: '20261023245002.152400+480' }, { CreationDate: '16000101000000.000000+000' },
    { ProcessId: undefined }, { ProcessId: '' }, { ProcessId: 0 }, { ProcessId: -1 }, { ProcessId: 7080.5 }, { ProcessId: true }, { ProcessId: '7080\n' },
    { ProcessId: '9007199254740992' }, { ParentProcessId: '' }, { ParentProcessId: 0 }, { ParentProcessId: -1 },
    { SessionId: '' }, { SessionId: undefined }, { SessionId: 0 }, { SessionId: -1 }, { SessionId: 2.5 }, { SessionId: true }, { SessionId: '2\n' }, { SessionId: 3 },
  ])('ADR-0263 keeps missing, false or mismatched identity related: %p', changes => {
    const row = { ...directSogouExe, ...changes };
    // Select the recorded PID directly when testing an invalid parent; invalid PIDs remain selected via their valid parent.
    const result = postflightFor([row], false, { session_id: 2 }, 'ParentProcessId' in changes ? [7080] : [5644]);
    expect(result.related).toHaveLength(1); expect(result.environment).toEqual([]);
    expect(supplement.postflightClean(result)).toBe(false);
  });
  test.each([
    "C:\\Program Files (x86)\\SogouInputX\\SogouExe\\SogouExe.exe",
    "C:\\Program Files (x86)\\SogouInput\\Other\\SogouExe.exe",
    "C:\\Program Files (x86)\\SogouInput\\SogouExe\\..\\SogouExe\\SogouExe.exe",
    "C:\\Program Files (x86)\\SogouInput\\SogouExe\\SogouExe.exe:stream",
    "\\\\?\\C:\\Program Files (x86)\\SogouInput\\SogouExe\\SogouExe.exe",
    "C:/Program Files (x86)/SogouInput/SogouExe/SogouExe.exe", exactSogouExe + '\n', exactSogouExe + ' ',
  ])('ADR-0263 refuses similar paths, aliases and trailing data: %s', image => {
    for (const changes of [{ ImagePath: image }, { ExecutablePath: image }, { ImagePath: image, ExecutablePath: image }]) {
      const result = postflightFor([{ ...directSogouExe, ...changes }]);
      expect(result.related).toHaveLength(1); expect(result.environment).toEqual([]); expect(supplement.postflightClean(result)).toBe(false);
    }
  });
  test.each([undefined, null, {}, { session_id: '' }, { session_id: 0 }, { session_id: -1 }, { session_id: 2.5 }, { session_id: true }, { session_id: 3 }])(
    'ADR-0263 requires a valid matching authority session: %p', target => {
      // Explicit undefined must not activate the helper default.
      const result = postflightFor([directSogouExe], false, target === undefined ? {} : target);
      expect(result.related).toHaveLength(1); expect(result.environment).toEqual([]); expect(supplement.postflightClean(result)).toBe(false);
    });
  test('ADR-0263 retains all descendants and other mandatory residues', () => {
    const result = postflightFor([
      { ProcessId: '7081', ParentProcessId: '7080', Name: 'child.exe', SessionId: '2', ImagePath: "C:\\Temp\\child.exe" }, directSogouExe,
      { ProcessId: '8000', ParentProcessId: '1', Name: 'product.exe', SessionId: '2', ImagePath: "C:\\A9-DEV\\product.exe" },
      { ProcessId: '8001', ParentProcessId: '1', Name: 'spike02_helper.exe', SessionId: '2', ImagePath: '' },
    ]);
    expect(result.environment).toHaveLength(1); expect(result.related.map((r: any) => r.pid)).toEqual([7081, 8000, 8001]);
    expect(supplement.postflightClean(result)).toBe(false);
  });
  test('actual real-model network seam retains TLS verification, enforces limits and keeps only hashes of the system message', () => {
    const source = fs.readFileSync(path.resolve(__dirname, 'a9-batch2-driver-entry.cjs'), 'utf8');
    const start = source.indexOf('  function installRealProviderBudget() {'); const end = source.indexOf('  async function supplementRealModel()', start);
    expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
    const callbacks: Array<(response: any) => void> = [];
    const makeTransport = () => ({ request: (_options: any, callback: any) => {
      callbacks.push(callback); const request: any = new EventEmitter(); request.destroy = jest.fn();
      request.write = jest.fn(() => true); request.end = jest.fn();
      return request;
    } });
    const transport = makeTransport();
    const network: any = { requests: 0, response_bytes: 0, tls: [], limit_rejected: false, bodies: [], body_errors: 0 };
    vm.runInNewContext(source.slice(start, end) + '\ninstallRealProviderBudget();', { env: { A9_ALPHA2_PROVIDER: JSON.stringify(baseAuthority().provider) }, realNetwork: network, require: () => transport, Buffer, JSON, sha256: (value: string) => crypto.createHash('sha256').update(value).digest('hex') });
    const options = { hostname: 'api.deepseek.com', protocol: 'https:', rejectUnauthorized: true };
    for (const changed of [{ ...options, rejectUnauthorized: false }, { ...options, hostname: 'other' }, { ...options, agent: {} }, { ...options, ca: 'custom' }]) expect(() => transport.request(changed, () => {})).toThrow('A9_36_PROVIDER_TLS_OPTIONS');
    expect(network.requests).toBe(0);
    const first = transport.request(options, () => {}); const response = new EventEmitter(); callbacks[0](response);
    response.emit('data', Buffer.alloc(1048577)); expect(first.destroy).toHaveBeenCalled(); expect(network.limit_rejected).toBe(true);
    for (let n = 1; n < 40; n++) transport.request(options, () => {});
    expect(network.requests).toBe(40); expect(() => transport.request(options, () => {})).toThrow('A9_36_PROVIDER_REQUEST_LIMIT');
    // Body capture: two write chunks and an end chunk are joined, only the system message is hashed, and a probe request is marked.
    const fresh: any = { requests: 0, response_bytes: 0, tls: [], limit_rejected: false, bodies: [], body_errors: 0 };
    const bodyTransport = makeTransport();
    vm.runInNewContext(source.slice(start, end) + '\ninstallRealProviderBudget();', { env: { A9_ALPHA2_PROVIDER: JSON.stringify(baseAuthority().provider) }, realNetwork: fresh, require: () => bodyTransport, Buffer, JSON, sha256: (value: string) => crypto.createHash('sha256').update(value).digest('hex') });
    const secretText = 'SYSTEM-PROMPT-SECRET-TEXT'; const body = JSON.stringify({ model: 'deepseek-v4-flash', messages: [{ role: 'system', content: secretText }, { role: 'user', content: 'USER-TEXT' }], tools: [{ function: { name: 'probe_test_echo' } }] });
    const req = bodyTransport.request(options, () => {}); req.write(body.slice(0, 20)); req.write(body.slice(20, 50)); req.end(body.slice(50));
    expect(fresh.bodies).toEqual([{ model: 'deepseek-v4-flash', probe: true, system_sha256: crypto.createHash('sha256').update(secretText).digest('hex'), system_chars: secretText.length, messages: 2 }]);
    expect(JSON.stringify(fresh)).not.toContain(secretText); expect(JSON.stringify(fresh)).not.toContain('USER-TEXT');
    const bad = bodyTransport.request(options, () => {}); bad.end('{not json'); expect(fresh.body_errors).toBe(1); expect(fresh.bodies).toHaveLength(1);
    const noSystem = bodyTransport.request(options, () => {}); noSystem.end(JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'x' }] }));
    expect(fresh.bodies[1]).toMatchObject({ system_sha256: null, system_chars: 0, probe: false });
  });
  test('interrupted-task writer carries the goal and the user-data check refuses a shared or A8-bearing profile', () => {
    const calls: any[] = []; const db = { prepare: (sql: string) => ({ run: (...args: any[]) => calls.push({ sql, args }) }) };
    driver.insertInterruptedTask(db, 'conv', 'task', 'old-turn'); driver.insertInterruptedTask(db, 'conv', 'task', 'old-turn', 'a2-rules');
    expect(calls).toHaveLength(6);
    expect(JSON.parse(calls[2].args[1]).requestPrompt).toBe('b2 guard continue'); expect(JSON.parse(calls[5].args[1])).toEqual({ taskId: 'task', requestPrompt: 'a2-rules' });
    const good = { user_data: 'C:\\run\\0daf288c\\work\\m1\\main\\profile-local\\Win7CodingAgent', run_root: 'C:\\run\\0daf288c\\', expected: 'C:\\run\\0daf288c\\work\\m1\\main\\profile-local\\Win7CodingAgent', a8_database_exists: false,
      real: { run_root: 'C:\\run\\0daf288c\\', user_data: 'C:\\run\\0daf288c\\work\\m1\\main\\profile-local\\Win7CodingAgent', data_root: 'C:\\run\\0daf288c\\work\\m1\\main\\data', workspace: 'C:\\run\\0daf288c\\work\\m1\\main\\中文 workspace' } };
    expect(driver.evaluateUserDataIsolation(good).ok).toBe(true);
    // The resolved (physical) locations must lie in the resolved run root too: a junction that leads out of the run is refused, and a location that could not be resolved is refused.
    for (const patch of [{ user_data: 'C:\\Users\\agent\\AppData\\Local\\Win7CodingAgent' }, { expected: 'C:\\elsewhere\\Win7CodingAgent' }, { a8_database_exists: true }, { a8_database_exists: undefined }, { run_root: undefined },
      { real: { ...good.real, user_data: 'D:\\junction-target\\Win7CodingAgent' } }, { real: { ...good.real, data_root: 'D:\\junction-target\\data' } }, { real: { ...good.real, workspace: 'D:\\junction-target\\ws' } },
      { real: { ...good.real, workspace: undefined } }, { real: { ...good.real, run_root: null } }, { real: undefined }])
      expect(driver.evaluateUserDataIsolation({ ...good, ...patch }).ok).toBe(false);
    expect(driver.evaluateUserDataIsolation(undefined).ok).toBe(false);
    const source = fs.readFileSync(path.resolve(__dirname, 'a9-batch2-driver-entry.cjs'), 'utf8');
    expect(source).toContain("throw new Error('A9_36_USERDATA_NOT_ISOLATED')");
    expect(source).toContain("path.join(app.getPath('userData'), 'state', 'agent-events-v2.db')");
  });
});

// Judgement functions of the supplement Stages. Each takes one good fact set and must fail for every single missing or wrong fact; unobserved facts never pass.
describe('A9-36 supplement judgement functions', () => {
  const H = (n: string) => n.repeat(64).slice(0, 64); const G = 'a'.repeat(40);
  const clone = (value: any) => JSON.parse(JSON.stringify(value));
  const setPath = (value: any, pathText: string, replacement: any) => { const copy = clone(value); const keys = pathText.split('.'); let node = copy; for (const key of keys.slice(0, -1)) node = node[key]; if (replacement === undefined) delete node[keys[keys.length - 1]]; else node[keys[keys.length - 1]] = replacement; return copy; };
  // Every named mutation must turn the verdict off; the unmutated facts must pass.
  const judge = (fn: (facts: any) => any, good: any, mutations: Array<[string, any]>) => {
    expect(fn(good).ok).toBe(true);
    for (const [pathText, replacement] of mutations) expect([pathText, fn(setPath(good, pathText, replacement)).ok]).toEqual([pathText, false]);
    expect(fn(undefined).ok).toBe(false); expect(fn({}).ok).toBe(false);
  };
  test('M1 local branch, test stream, build cancel and long card', () => {
    judge(driver.evaluateLocalBranch, { shell_ends: [{ exit_code: 0, stdout: 'main\n' }, { exit_code: 0, stdout: '' }, { exit_code: 0, stdout: '' }, { exit_code: 0, stdout: '' }], branch_before: 'main', branch_after: 'a2-topic',
      head_subject: 'A2-topic', main_before: G, main_after: G, origin_main: G, origin_refs_after: `refs/heads/main ${G}`, status_before: ' M probe.txt', status_after: '', index_before: '100644 aaa 0\tprobe.txt',
      index_after: '100644 bbb 0\tprobe.txt', head_files: ['probe.txt'], head_blob: G, worktree_blob: G, approval: { accepted: true }, new_processes: [] },
    [['shell_ends.3.exit_code', 1], ['shell_ends.0.stdout', 'other\n'], ['shell_ends', []], ['branch_before', 'other'], ['branch_after', 'main'], ['head_subject', 'A2-local'], ['main_after', 'b'.repeat(40)], ['main_before', 'short'],
      ['origin_refs_after', `refs/heads/main ${G}\nrefs/heads/a2-topic ${G}`], ['status_before', ''], ['status_after', ' M probe.txt'], ['index_after', '100644 aaa 0\tprobe.txt'], ['head_files', []],
      ['worktree_blob', 'b'.repeat(40)], ['head_blob', undefined], ['approval.accepted', false], ['approval', undefined], ['new_processes', [{ pid: 1 }]], ['new_processes', undefined]]);
    judge(driver.evaluateTestStream, { frames: [{ turnId: 'T', text: 'A2-CHECK value 0' }], order: { ok: true }, ends: [{ exit_code: 0, stdout: 'A2-CHECK value 0\n' }], turn_id: 'T', shell_kind: 'cmd', outcome: 'completed' },
      [['order.ok', false], ['order', undefined], ['frames', []], ['frames.0.turnId', 'other'], ['frames.0.text', 'nothing'], ['ends', []], ['ends.0.exit_code', 1], ['ends.0.stdout', 'x'], ['shell_kind', 'powershell'], ['outcome', 'failed']]);
    judge(driver.evaluateBuildCancel, { start_seen: true, ticks_before_cancel: 2, order: { ok: true }, terminal_outcome: 'cancelled', frames_after_settle: 5, frames_after_wait: 5, new_processes: [], process_probe_failures: 0 },
      [['start_seen', false], ['ticks_before_cancel', 1], ['ticks_before_cancel', undefined], ['order.ok', false], ['terminal_outcome', 'completed'], ['frames_after_wait', 6], ['frames_after_settle', undefined],
        ['new_processes', [{ pid: 9 }]], ['process_probe_failures', 1], ['process_probe_failures', undefined]]);
    const command = 'cmd /c "echo ' + 'segment '.repeat(40) + '& git push origin main"'; const rect = { left: 100, top: 100, right: 700, bottom: 400, width: 600, height: 300 }; const button = { left: 120, top: 350, right: 220, bottom: 390, width: 100, height: 40 };
    judge(driver.evaluateLongCard, { command, summary: `shell cwd=C:\\w: ${command}`, dom_summary: `shell cwd=C:\\w: ${command}`, cwd_shown_resolves: true, viewport: { width: 1366, height: 768 }, card_rect: rect,
      buttons: [button, { ...button, left: 240, right: 340 }], clipped: false, font_px: 14, bound: true, denied_ok: true, tool_starts_after: 0 },
    [['command', 'short'], ['summary', 'shell cwd=C:\\w: other'], ['dom_summary', 'other'], ['cwd_shown_resolves', false], ['viewport.width', 1280], ['viewport.height', 700], ['card_rect.right', 1400], ['card_rect.bottom', 800], ['card_rect.left', -1],
      ['buttons', [button]], ['buttons.0.bottom', 800], ['clipped', true], ['clipped', undefined], ['font_px', 9], ['bound', false], ['denied_ok', false], ['tool_starts_after', 1]]);
  });
  test('M2 input binding, audit stages, continuation reload and Provider failure', () => {
    const request = { agents_sha256: H('a'), agents_in_request: true, system_sha256: H('b'), rules: 1, environment: 1 };
    judge(driver.evaluateInputShas, { agents_sha256: H('a'), requests: [request, { ...request }] }, [['requests', [request]], ['requests.1.agents_sha256', H('c')], ['requests.0.agents_in_request', false], ['requests.1.system_sha256', H('d')],
      ['requests.0.system_sha256', 'x'], ['requests.0.rules', 2], ['requests.1.environment', 0], ['agents_sha256', 'x']]);
    const attempt = (revision: string) => ({ ok: false, code: 'A9_AUDIT_PERSISTENCE_FAILED', revision, requests_before: 2, requests_after: 2, continue_events_before: 0, continue_events_after: 0, turns_before: 1, turns_after: 1, tool_starts_before: 1, tool_starts_after: 1 });
    const audit = { trigger_installed: true, failing_event_rows: 0, turn_completed: false, never_exists: false, tool_result_requests: 0, max_tool_result_requests: 0, second_submit_ok: false, second_submit_code: 'A9_AUDIT_PERSISTENCE_FAILED',
      requests: { before: 0, after_turn: 1, after_submit: 1 }, require_continue: true, continue_attempts: [attempt('r1'), attempt('r2')] };
    judge(driver.evaluateAuditStage, audit, [['trigger_installed', false], ['failing_event_rows', 1], ['turn_completed', true], ['never_exists', true], ['tool_result_requests', 1], ['second_submit_ok', true], ['second_submit_code', 'OTHER'],
      ['requests.after_submit', 2], ['requests.after_turn', 0], ['requests.before', undefined], ['continue_attempts', undefined], ['continue_attempts.0.ok', true], ['continue_attempts.1.code', 'OTHER'], ['continue_attempts.0.requests_after', 3],
      ['continue_attempts.1.continue_events_after', 1], ['continue_attempts.0.turns_after', 2], ['continue_attempts.1.tool_starts_after', 2], ['continue_attempts.1.revision', 'r1']]);
    expect(driver.evaluateAuditStage({ ...audit, tool_result_requests: 1, max_tool_result_requests: 1 }).ok).toBe(true);
    expect(driver.evaluateAuditStage({ ...audit, tool_result_requests: 2, max_tool_result_requests: 1 }).ok).toBe(false);
    expect(driver.evaluateAuditStage({ ...audit, require_continue: false, continue_attempts: undefined }).ok).toBe(true);
    const line = { continuation: true, agents_sha256: H('2'), agents_in_request: true, rule_markers: ['A2-RULE-MARKER-CHANGED'], rules: 1, environment: 1, system_sha256: H('5'), prompt: 'a2-rules' };
    judge(driver.evaluateContinueReload, { baseline: { agents_sha256: H('1'), system_sha256: H('5') }, continuation_lines: [line], agents_old_sha256: H('1'), agents_new_sha256: H('2'), new_marker: 'A2-RULE-MARKER-CHANGED', goal: 'a2-rules' },
      [['baseline.agents_sha256', H('9')], ['baseline.system_sha256', undefined], ['continuation_lines', []], ['continuation_lines.0.continuation', false], ['agents_new_sha256', H('1')], ['continuation_lines.0.agents_sha256', H('1')],
        ['continuation_lines.0.agents_in_request', false], ['continuation_lines.0.rule_markers', ['A2-RULE-MARKER', 'A2-RULE-MARKER-CHANGED']], ['continuation_lines.0.rule_markers', ['A2-RULE-MARKER']], ['continuation_lines.0.rules', 2],
        ['continuation_lines.0.environment', 0], ['continuation_lines.0.system_sha256', H('6')], ['continuation_lines.0.prompt', 'other']]);
    const before = { interruptedTurnId: 'OLD', recoveryRevision: H('1'), canContinue: true }; const afterFailure = { interruptedTurnId: 'T1', recoveryRevision: H('2'), canContinue: true };
    const failure = { first: { requests_delta: 1, continue_events: 1, turn_id: 'T1' }, requests_after_failure: 2, requests_after_wait: 2, recovery_before: before, recovery_after_failure: afterFailure,
      second: { requests_before: 2, requests_after: 3, continue_events: 2, interrupted_turn_id: 'T1', turn_status: 'completed' }, duplicate: { ok: true, duplicate: true, turn_id: 'T1', requests_before: 3, requests_after: 3, continue_events_before: 2, continue_events_after: 2 } };
    judge(driver.evaluateProviderFailureContinue, failure, [['first.requests_delta', 0], ['first.continue_events', 2], ['requests_after_wait', 3], ['recovery_after_failure.canContinue', false], ['recovery_after_failure.interruptedTurnId', 'OLD'],
      ['recovery_after_failure.recoveryRevision', H('1')], ['recovery_after_failure', undefined], ['second.requests_after', 2], ['second.requests_before', 1], ['second.continue_events', 1], ['second.interrupted_turn_id', 'OTHER'],
      ['second.turn_status', 'failed'], ['duplicate.duplicate', false], ['duplicate.turn_id', 'T2'], ['duplicate.requests_after', 4], ['duplicate.continue_events_after', 3], ['duplicate.ok', false]]);
    const budgetAfter = { requests: 4, tool_starts: 1, turns: 3, continue_events: 1 };
    const budget = { before: { requests: 4, tool_starts: 1, turns: 2, continue_events: 0 }, after: budgetAfter, diagnostic: { code: 'A9_CONTEXT_BUDGET_EXCEEDED', budgetChars: 16000, estimatedChars: 24500 }, configured_budget: 16000,
      recovery_before: before, recovery_after: afterFailure };
    judge(driver.evaluateBudgetClick, budget, [['after.requests', 5], ['after.tool_starts', 2], ['after.turns', 2], ['after.turns', 4], ['after.continue_events', 0], ['diagnostic.code', 'OTHER'], ['diagnostic.budgetChars', 20000],
      ['diagnostic.estimatedChars', 15999], ['diagnostic.estimatedChars', undefined], ['configured_budget', 20000], ['recovery_after.canContinue', false], ['recovery_after', undefined], ['before.requests', undefined]]);
    judge(driver.evaluateBudgetChanged, { before: { requests: 4, continue_events: 2 }, after: { requests: 5, continue_events: 3 }, chars: 3000, configured_budget: 16000, turn_status: 'completed' },
      [['after.requests', 4], ['after.continue_events', 2], ['chars', 16001], ['chars', 0], ['chars', undefined], ['turn_status', 'failed'], ['configured_budget', 2000]]);
  });
  // M2-02 (ADR-0261): the failure outcome of an abnormal Provider answer is the persisted record of that same Turn, not the terminal event's data.
  // A real turn_failed carries only `error` or `code`/`finishReason`; the two shapes below are the ones the WIN7-50 run captured.
  test('M2 Provider outcomes: the same Turn\'s persisted status/outcome decides, the event data is recorded but never read as the outcome', () => {
    const persisted = (turn: string, status: string, outcome: string) => [{ turn_id: turn, status, outcome_json: JSON.stringify({ schemaVersion: 1, outcome, verification: 'not_applicable' }) }];
    const row = (reason: string, turn: string, written: any, starts: number, eventType: string, data: any, status = 'failed', outcome = 'failed') =>
      ({ reason, written, starts, terminal: { turnId: turn, eventType, data }, persisted: persisted(turn, status, outcome) });
    const errorShape = { error: 'Gateway stream ended without a finish_reason' };
    const codeShape = { code: 'A9_PROVIDER_RESPONSE_INCOMPLETE', finishReason: 'length' };
    const good = { rows: [
      row('tool_calls', 'T0', 'tool_calls', 1, 'turn_completed', { finalMessage: 'A2 fixture complete', outcome: 'completed_with_warnings', verification: 'unverified' }, 'completed_with_warnings', 'completed_with_warnings'),
      row('missing', 'T1', null, 0, 'turn_failed', errorShape),
      row('length', 'T2', null, 0, 'turn_failed', codeShape),
      row('content_filter', 'T3', null, 0, 'turn_failed', { code: 'A9_PROVIDER_RESPONSE_INCOMPLETE', finishReason: 'content_filter' }),
      row('stop', 'T4', null, 0, 'turn_failed', { error: 'Gateway stream returned tool calls with stop finish_reason' }),
      row('empty', 'T5', null, 0, 'turn_failed', errorShape),
      row('invalid_json', 'T6', null, 0, 'turn_failed', { code: 'A9_PROVIDER_RESPONSE_INCOMPLETE', finishReason: 'tool_calls' }),
    ] };
    expect(driver.PROVIDER_REASONS).toEqual(['tool_calls', 'missing', 'length', 'content_filter', 'stop', 'empty', 'invalid_json']);
    expect(driver.PROVIDER_FAILURE_REASONS).toEqual(['missing', 'length', 'content_filter', 'stop', 'empty', 'invalid_json']);
    // No product change is needed: both captured shapes pass on the persisted record alone, even though neither data carries an outcome.
    expect(good.rows[1].terminal.data.outcome).toBeUndefined(); expect(good.rows[2].terminal.data.outcome).toBeUndefined();
    expect(driver.evaluateProviderOutcomes(good).ok).toBe(true);
    expect(driver.evaluateProviderOutcomes({ rows: good.rows.map((r) => ({ ...r, terminal: { ...r.terminal, data: { ...r.terminal.data, outcome: 'failed' } } })) }).ok).toBe(true);
    const mutations: Array<[string, any]> = [
      // the closed reason set: one fewer, one more, a duplicate, a renamed reason, an unobserved reason
      ['rows', good.rows.slice(0, 6)], ['rows', good.rows.concat(row('other', 'T7', null, 0, 'turn_failed', errorShape))],
      ['rows.6.reason', 'missing'], ['rows.3.reason', 'tool_calls'], ['rows.2.reason', undefined], ['rows', []],
      // the terminal event and its Turn identity
      ['rows.1.terminal.turnId', 'T9'], ['rows.1.terminal.turnId', undefined], ['rows.2.terminal.eventType', 'turn_completed'], ['rows.2.terminal.eventType', undefined],
      ['rows.2.terminal', undefined], ['rows.2.terminal.data', undefined], ['rows.1.terminal.data', null],
      // the persisted record: absent, duplicated, wrong Turn, unparsable, missing outcome, successful or contradictory
      ['rows.1.persisted', []], ['rows.1.persisted', undefined], ['rows.1.persisted', good.rows[1].persisted.concat(good.rows[2].persisted)],
      ['rows.1.persisted.0.turn_id', 'T2'], ['rows.1.persisted.0.turn_id', undefined], ['rows.1.persisted.0.status', 'completed'], ['rows.1.persisted.0.status', 'completed_with_warnings'],
      ['rows.1.persisted.0.status', undefined], ['rows.1.persisted.0.outcome_json', '{not json'], ['rows.1.persisted.0.outcome_json', '{"schemaVersion":1}'],
      ['rows.1.persisted.0.outcome_json', 'null'], ['rows.1.persisted.0.outcome_json', '[]'], ['rows.1.persisted.0.outcome_json', JSON.stringify({ outcome: 'completed' })],
      ['rows.1.persisted.0.outcome_json', JSON.stringify({ outcome: 7 })], ['rows.1.persisted.0.outcome_json', undefined],
      ['rows.6.persisted.0.outcome_json', JSON.stringify({ outcome: 'cancelled' })],
      // side effects: a file written, a tool started, or the normal control missing its write/start/completed record
      ['rows.1.written', 'tool_calls'], ['rows.4.written', ''], ['rows.1.starts', 1], ['rows.5.starts', undefined], ['rows.0.written', null], ['rows.0.starts', 0], ['rows.0.starts', 2],
      ['rows.0.terminal.eventType', 'turn_failed'], ['rows.0.persisted.0.status', 'failed'], ['rows.0.persisted.0.outcome_json', JSON.stringify({ outcome: 'failed' })],
    ];
    for (const [pathText, replacement] of mutations) expect([pathText, JSON.stringify(replacement), driver.evaluateProviderOutcomes(setPath(good, pathText, replacement)).ok]).toEqual([pathText, JSON.stringify(replacement), false]);
    expect(driver.evaluateProviderOutcomes(undefined).ok).toBe(false); expect(driver.evaluateProviderOutcomes({}).ok).toBe(false);
    // The persisted facts of one Turn: exactly one row, and only a JSON object with a string outcome is an outcome.
    expect(driver.providerPersistedFacts(persisted('T', 'failed', 'failed'))).toEqual({ rows: 1, turn_id: 'T', status: 'failed', outcome: 'failed', parse_ok: true });
    for (const [value, count] of [[[], 0], [[good.rows[1].persisted[0], good.rows[1].persisted[0]], 2], [undefined, 0], [null, 0], ['x', 0]] as Array<[any, number]>)
      expect(driver.providerPersistedFacts(value)).toEqual({ rows: count, turn_id: null, status: null, outcome: null, parse_ok: false });
    for (const text of ['', '{}', 'null', '[]', '"failed"', '{', JSON.stringify({ outcome: null }), JSON.stringify({ outcome: ['failed'] })])
      expect(driver.providerPersistedFacts([{ turn_id: 'T', status: 'failed', outcome_json: text }]).parse_ok).toBe(false);
    for (const value of [undefined, null, 7, {}, { outcome_json: 7 }]) expect(driver.providerPersistedFacts([value as any]).parse_ok).toBe(false);
  });
  test('M3 external byte records, continuation checkpoint and late write', () => {
    const file = { path: 'ext_shell.txt', b0: H('1'), b1: H('2'), b1_text: 'shell1\n', expected_b1_text: 'shell1\n', b2: H('1') };
    const done = (restored: string[]) => ({ ok: true, driftReasons: [], outcome: { restored, errors: [], drifted: [] } });
    judge(driver.evaluateExternalBytes, { files: [file], review_paths: ['ext_shell.txt'], undo_results: [done(['ext_shell.txt (已恢复原始版本)']), { ...done(['ext_shell.txt (此前已撤销，未重复执行)']), driftReasons: [{ path: 'x' }] }], drift_results: [done([])] },
      [['files.0.b1', H('1')], ['files.0.b2', H('2')], ['files.0.b0', 'x'], ['files.0.b1_text', 'other\n'], ['files.0.expected_b1_text', undefined], ['review_paths', []], ['undo_results.0.ok', false], ['drift_results.0.driftReasons', [{ path: 'ext_shell.txt' }]],
        ['files', []], ['files.0.path', undefined], ['undo_results.0.outcome.errors', ['restore failed']], ['undo_results.0.outcome', undefined]]);
    // A file that no undo lists as restored is not restored, even when every undo says ok.
    expect(driver.evaluateExternalBytes({ files: [file], review_paths: ['ext_shell.txt'], undo_results: [done([]), done([])] }).ok).toBe(false);
    // `ok` with errors in the outcome, or with no outcome at all, is not a restored file.
    expect(driver.evaluateExternalBytes({ files: [file], review_paths: ['ext_shell.txt'], undo_results: [{ ok: true }] }).ok).toBe(false);
    expect(driver.evaluateExternalBytes({ files: [file], review_paths: ['ext_shell.txt'], undo_results: [done(['ext_shell.txt (已恢复原始版本)'])] }).ok).toBe(true);
    expect(driver.evaluateExternalBytes({ files: [file], review_paths: ['ext_shell.txt'], undo_results: [{ ...done(['ext_shell.txt (已恢复原始版本)']), driftReasons: [{ path: 'ext_shell.txt' }] }] }).ok).toBe(false);
    // Per-file step before a whole-Turn undo: the bytes right after the per-file undo are the proof.
    const second = { path: 'ext_edit.txt', b0: H('3'), b1: H('4'), b1_text: 'edit1\n', expected_b1_text: 'edit1\n', b2: H('3') };
    const perFile = { files: [second, file], review_paths: ['ext_edit.txt', 'ext_shell.txt'], undo_results: [done(['ext_shell.txt (已恢复原始版本)']), done(['ext_edit.txt (已恢复原始版本)', 'ext_shell.txt (此前已撤销，未重复执行)'])],
      drift_results: [done([])], require_per_file: true, per_file: { path: 'ext_shell.txt', result: done(['ext_shell.txt (已恢复原始版本)']), after: { 'ext_shell.txt': H('1'), 'ext_edit.txt': H('4') } } };
    judge(driver.evaluateExternalBytes, perFile, [['per_file.result.outcome.errors', ['x']], ['per_file.result.outcome.restored', []],
      ['per_file.result.ok', false], ['per_file.path', 'other.txt'], ['per_file.after', undefined], ['per_file', undefined]]);
    expect(driver.evaluateExternalBytes({ ...perFile, require_per_file: undefined, per_file: undefined }).ok).toBe(true);
    const withAfter = (patch: any) => ({ ...perFile, per_file: { ...perFile.per_file, after: { ...perFile.per_file.after, ...patch } } });
    expect(driver.evaluateExternalBytes(withAfter({ 'ext_shell.txt': H('2') })).ok).toBe(false); // the file is not back at its original bytes right after the per-file undo
    expect(driver.evaluateExternalBytes(withAfter({ 'ext_edit.txt': H('3') })).ok).toBe(false); // the other file was restored by the per-file undo
    expect(driver.evaluateExternalBytes(withAfter({ 'ext_edit.txt': undefined })).ok).toBe(false);
    judge(driver.evaluateContinuationCheckpoint, { continuation_turn_id: 'T', continue_events: 1, turn_status: 'completed', b0_text: 'cont0\n', b1_text: 'cont1\n', b2_text: 'cont0\n', checkpoint: { turn_id: 'T', session_id: 'c' },
      conversation_id: 'c', old_turn_checkpoints: 0, review_paths: ['cont_target.txt'], undo_ok: true },
    [['continue_events', 2], ['continuation_turn_id', undefined], ['turn_status', 'failed'], ['b1_text', 'cont0\n'], ['b0_text', 'x'], ['checkpoint.turn_id', 'OLD'], ['checkpoint.session_id', 'other'], ['checkpoint', undefined],
      ['old_turn_checkpoints', 1], ['review_paths', []], ['undo_ok', false], ['b2_text', 'cont1\n']]);
    const tree = [{ path: 'late_target.txt', sha256: H('3') }, { path: 'probe.txt', sha256: H('4') }];
    judge(driver.evaluateLateWrite, { review_ok: true, review_paths: ['late_target.txt'], b1: H('2'), b1_text: 'late1\n', late: H('3'), late_text: 'late2\n', after_undo: H('3'), drifted_paths: ['late_target.txt'], undo_ok: true, tree_before: tree, tree_after: tree },
      [['review_ok', false], ['review_paths', []], ['b1_text', 'late0\n'], ['late', H('2')], ['late_text', 'late1\n'], ['after_undo', H('2')], ['drifted_paths', []], ['drifted_paths', ['probe.txt']], ['undo_ok', false],
        ['tree_after', [tree[0]]], ['tree_after', [tree[0], { path: 'probe.txt', sha256: H('5') }]], ['tree_before', undefined]]);
  });
  test('M5 system prompt hashes and the managed-process Provider guard', () => {
    const body = { system_sha256: H('7'), system_chars: 2223, model: 'deepseek-v4-flash' };
    judge(driver.evaluateSystemPromptBody, { bodies: [body, { ...body }], expected_model: 'deepseek-v4-flash', system_prompt_version: 'a9-system-v1' },
      [['bodies', []], ['bodies.1.system_sha256', H('8')], ['bodies.0.system_sha256', 'x'], ['bodies.0.system_chars', 0], ['bodies.1.model', 'other'], ['system_prompt_version', ''], ['system_prompt_version', null], ['expected_model', 'other']]);
    judge(driver.evaluateProviderGuard, { running_before: true, attempt_ok: false, attempt_code: 'A9_PROVIDER_MANAGED_ACTIVE', running_after: true, pid_before: 4242, pid_after: 4242, model_before: 'a', model_after: 'a',
      base_url_before: 'http://127.0.0.1:1/v1', base_url_after: 'http://127.0.0.1:1/v1', requests_before: 5, requests_after: 5 },
    [['running_before', false], ['attempt_ok', true], ['attempt_code', 'A9_PROVIDER_CONFIG_INVALID'], ['attempt_code', undefined], ['running_after', false], ['pid_after', 4243], ['model_after', 'b'], ['base_url_after', 'x'], ['requests_after', 6], ['requests_before', undefined]]);
  });
  test('stopLeavesActionableCard stays the single judge of a still-actionable recovery card', () => {
    const before = { interruptedTurnId: 'a', recoveryRevision: H('1') };
    expect(driver.stopLeavesActionableCard(before, { interruptedTurnId: 'b', recoveryRevision: H('2'), canContinue: true })).toBe(true);
    expect(driver.stopLeavesActionableCard(before, { interruptedTurnId: 'a', recoveryRevision: H('2'), canContinue: true })).toBe(false);
    expect(driver.stopLeavesActionableCard(before, { canContinue: false })).toBe(false);
    expect(driver.stopLeavesActionableCard(null, null)).toBeNull();
  });
});

// Fixes of the first independent implementation review (codex, read-only): every blocking defect found by reading the source has a counterexample here.
describe('A9-36 supplement: implementation review round 1', () => {
  const supplement = require(path.join(releaseDir, 'a9-alpha2-supplement.cjs'));
  const driverSource = fs.readFileSync(path.resolve(__dirname, 'a9-batch2-driver-entry.cjs'), 'utf8');
  const orchestratorSource = fs.readFileSync(path.join(releaseDir, 'a9-alpha2-supplement.cjs'), 'utf8');
  const H = (n: string) => n.repeat(64).slice(0, 64); const G = 'a'.repeat(40);
  const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'a9-36-review1-'));
  const clone = (value: any) => JSON.parse(JSON.stringify(value));
  const setPath = (value: any, pathText: string, replacement: any) => { const copy = clone(value); const keys = pathText.split('.'); let node = copy; for (const key of keys.slice(0, -1)) node = node[key]; if (replacement === undefined) delete node[keys[keys.length - 1]]; else node[keys[keys.length - 1]] = replacement; return copy; };
  const judge = (fn: (facts: any) => any, good: any, mutations: Array<[string, any]>) => {
    expect(fn(good).ok).toBe(true);
    for (const [pathText, replacement] of mutations) expect([pathText, fn(setPath(good, pathText, replacement)).ok]).toEqual([pathText, false]);
    expect(fn(undefined).ok).toBe(false); expect(fn({}).ok).toBe(false);
  };
  // The text of one top-level declaration of the driver's main closure (two-space indent) up to the next one.
  const segment = (name: string) => {
    const start = driverSource.search(new RegExp(`^  (async function ${name}\\(|const ${name} = )`, 'm')); expect(start).toBeGreaterThan(0);
    const rest = driverSource.slice(start + 10); const next = rest.search(/^  (async function|function|const) /m);
    return driverSource.slice(start, next < 0 ? undefined : start + 10 + next);
  };
  const idsIn = (text: string) => {
    const found: number[] = [];
    for (const m of text.matchAll(/(?:supplementAssert\('[a-z0-9-]+'|record\('A2-M4-CONTINUE-SCHEMA'), (\d+),/g)) found.push(Number(m[1]));
    for (const m of text.matchAll(/auditStage\(\{ id: (\d+),/g)) found.push(Number(m[1]));
    return found.sort((a, b) => a - b);
  };

  test('each mode names its function and that function writes exactly the planned assertion ids of its Stage', () => {
    const functions: Record<string, string> = { supplement_continue_schema: 'continueSchema', supplement_policy_git: 'supplementPolicyGit', supplement_verification: 'supplementVerification',
      supplement_audit_output: 'supplementAuditOutput', supplement_audit_managed: 'supplementAuditManaged', supplement_audit_ownership: 'supplementAuditOwnership', supplement_continue: 'supplementContinue',
      supplement_budget: 'supplementBudget', supplement_review: 'supplementReview', supplement_review_restart: 'supplementReviewRestart', supplement_provider_guard: 'supplementProviderGuard',
      supplement_real_model: 'supplementRealModel' };
    const table = driverSource.slice(driverSource.indexOf('const SUPPLEMENT_MODE_TABLE = {'), driverSource.indexOf('// Pre-ready seams'));
    expect(Object.fromEntries([...table.matchAll(/(supplement_[a-z_]+): ([A-Za-z]+)/g)].map((m) => [m[1], m[2]]))).toEqual(functions);
    for (const stages of Object.values(supplement.STAGE_PLAN) as any[]) for (const stage of stages) expect([stage.mode, idsIn(segment(functions[stage.mode]))]).toEqual([stage.mode, stage.ids]);
  });

  test('P1-1: the open dialog answers by purpose: folder for the workspace, cmd.exe for an explicit CMD, anything else is refused', () => {
    const workspace = 'C:\\run\\中文 workspace'; const cmd = 'C:\\Windows\\System32\\cmd.exe';
    expect(driver.openDialogAnswer([{ webContents: {} }, { title: '选择只读代码工作区', properties: ['openDirectory'] }], workspace, cmd)).toEqual({ canceled: false, filePaths: [workspace] });
    expect(driver.openDialogAnswer([{ webContents: {} }, { title: '选择 cmd Shell 可执行文件', properties: ['openFile'], filters: [] }], workspace, cmd)).toEqual({ canceled: false, filePaths: [cmd] });
    for (const args of [[{ title: '选择 powershell Shell 可执行文件', properties: ['openFile'] }], [{ title: '选择 bash Shell 可执行文件', properties: ['openFile'] }], [{ properties: ['openFile'] }], [{ properties: [] }], [{}], [], undefined])
      expect(() => driver.openDialogAnswer(args as any, workspace, cmd)).toThrow('A9_36_UNEXPECTED_OPEN_DIALOG');
    // The stub is installed through this function, and the CMD configuration is checked before any command runs in it.
    expect(driverSource).toContain('dialog.showOpenDialog = async (...args) => openDialogAnswer(args, workspaceRoot, cmdExecutable);');
    const m1 = segment('supplementPolicyGit');
    expect(m1.indexOf("throw new Error('A9_36_CMD_NOT_CONFIGURED')")).toBeGreaterThan(m1.indexOf("configureShell({kind:\"cmd\""));
    expect(m1.indexOf("throw new Error('A9_36_CMD_NOT_CONFIGURED')")).toBeLessThan(m1.indexOf("supplementTurn('a2-cmd-test:"));
  });

  test('P1-2: the M1 test command runs on input that makes check.py exit 0', () => {
    const dir = temp(); fs.writeFileSync(path.join(dir, 'check.py'), supplement.TEST_SOURCE);
    const run = (content: string) => { fs.writeFileSync(path.join(dir, 'probe.txt'), content); return childProcess.spawnSync('python3', ['check.py'], { cwd: dir, encoding: 'utf8' }).status; };
    expect(run('topic branch content\n')).toBe(1); expect(run('local CMD commit content\n')).toBe(1); expect(run('value test\n')).toBe(0);
    const m1 = segment('supplementPolicyGit');
    const write = m1.indexOf("'value test\\n'"); const turn = m1.indexOf("supplementTurn('a2-cmd-test:");
    expect(write).toBeGreaterThan(m1.indexOf("a2-git-branch:")); expect(write).toBeLessThan(turn);
  });

  test('P1-3: an ordinary undo is not waited on a confirmation button; the button is clicked only when it appears', () => {
    const queue = segment('queueUndo');
    // The only wait for the confirm button is inside the combined poll that also accepts the outcome text.
    expect(queue.match(/确认撤销/g)).toHaveLength(1);
    expect(queue.indexOf('确认撤销')).toBeGreaterThan(queue.indexOf('undo outcome or confirmation') - 600);
    expect(queue).toContain("if (reached.text) return reached.text;");
    expect(queue).toContain('const outcomeText = /已撤销|外部修改|又被修改/;');
    // The product's own rule: the confirmation exists only after a crash reconciliation.
    const runtime = fs.readFileSync(path.resolve(__dirname, '../../product/a9-agent-runtime.js'), 'utf8');
    expect(runtime).toContain('reconcilePendingExternalBaseline');
    const workbench = fs.readFileSync(path.resolve(__dirname, '../../product/renderer/a9-workbench.js'), 'utf8');
    expect(workbench).toContain("if (response && response.needsConfirmation === true) {");
  });

  test('P1-4: fixture scripts write exact bytes (no CRLF conversion) and the Stage conditions compare those bytes', () => {
    for (const [name, text] of Object.entries(supplement.SCRIPT_FILES) as Array<[string, string]>) expect([name, /write_text\(/.test(text)]).toEqual([name, false]);
    const dir = temp(); for (const [name, text] of Object.entries(supplement.SCRIPT_FILES) as Array<[string, string]>) fs.writeFileSync(path.join(dir, name), text);
    expect(childProcess.spawnSync('python3', ['ext_modify.py', 'a.txt', 'bg1'], { cwd: dir, encoding: 'utf8' }).status).toBe(0);
    expect(fs.readFileSync(path.join(dir, 'a.txt'))).toEqual(Buffer.from('bg1\n', 'utf8'));
    fs.writeFileSync(path.join(dir, 'late.go'), 'go\n');
    expect(childProcess.spawnSync('python3', ['late_write.py'], { cwd: dir, encoding: 'utf8', timeout: 20000 }).status).toBe(0);
    expect(fs.readFileSync(path.join(dir, 'late_target.txt'))).toEqual(Buffer.from('late2\n', 'utf8'));
    expect(driverSource).toContain("textFile('ext_bg.txt') === 'bg1\\n'");
  });

  test('P1-5: the configuration the product itself saves (with updatedAt and probe) is accepted and rebuilt without them; foreign fields are refused', () => {
    const runtime = fs.readFileSync(path.resolve(__dirname, '../../product/a9-agent-runtime.js'), 'utf8');
    const written = runtime.slice(runtime.indexOf('writePersistedProviderConfig({\n      schemaVersion'), runtime.indexOf('persistence.recordToolEvent(a9SessionId, null, \'provider.configure\''));
    for (const key of ['schemaVersion', 'baseUrl', 'model', 'customHeaderNames', 'contextBudgetChars', 'keyRemembered', 'probe', 'updatedAt']) expect([key, written.includes(key)]).toEqual([key, true]);
    const make = (patch: any = {}) => {
      const source = temp(); const destination = temp(); const cred = path.join(source, 'a9-vault-apikey', 'credentials'); fs.mkdirSync(cred, { recursive: true });
      fs.writeFileSync(path.join(cred, 'credentials.v1.json'), JSON.stringify({ schemaVersion: 1, protection: 'electron-safe-storage-windows-dpapi-current-user', ciphertext: 'AAAA' }));
      fs.writeFileSync(path.join(source, 'a9-provider-config.v1.json'), JSON.stringify({ schemaVersion: 1, baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', customHeaderNames: [], contextBudgetChars: 64000, keyRemembered: true,
        probe: { classification: 'tool_calling', checkedAt: '2026-10-16T01:00:00.000Z', latencyMs: 812, hasStreaming: true }, updatedAt: '2026-10-16T01:00:00.000Z', ...patch }));
      return { source, destination };
    };
    const expected = { base_url: 'https://api.deepseek.com', model: 'deepseek-v4-flash' };
    const ok = make(); const copied = supplement.copyEncryptedConfig(ok.source, ok.destination, expected);
    expect(copied.copied_names).toEqual(['a9-provider-config.v1.json', path.join('a9-vault-apikey', 'credentials', 'credentials.v1.json')]);
    const rebuilt = JSON.parse(fs.readFileSync(path.join(ok.destination, 'a9-provider-config.v1.json'), 'utf8'));
    expect(Object.keys(rebuilt).sort()).toEqual(['baseUrl', 'contextBudgetChars', 'customHeaderNames', 'keyRemembered', 'model', 'schemaVersion']);
    for (const patch of [{ updatedAt: 5 }, { updatedAt: 'not a date' }, { extra: 1 }, { caBundle: 'x' }, { proxy: { host: 'h' } }, { keyRemembered: false }, { model: 'other' }, { contextBudgetChars: 100 }]) {
      const bad = make(patch); expect([JSON.stringify(patch), (() => { try { supplement.copyEncryptedConfig(bad.source, bad.destination, expected); return 'accepted'; } catch (_e) { return 'refused'; } })()]).toEqual([JSON.stringify(patch), 'refused']);
    }
  });

  test('P1-6: the restored real-Provider configuration carries no probe, so the page probes through its own control before the first Turn', () => {
    const workbench = fs.readFileSync(path.resolve(__dirname, '../../product/renderer/a9-workbench.js'), 'utf8');
    expect(workbench).toContain("snapshot.provider.probe.classification === 'tool_calling'");
    const real = segment('supplementRealModel');
    expect(real.indexOf('a9-provider-probe')).toBeGreaterThan(0);
    expect(real.indexOf('a9-provider-probe')).toBeLessThan(real.indexOf('supplementTurn('));
    expect(real).toContain("probe.classification === 'tool_calling'");
    expect(real).toContain("assert('m5-journey', 1,".replace('assert', 'supplementAssert'));
    // The probe's requests go through the counted wrapper and belong to the 40-request budget of the paid group.
    expect(driverSource).toContain('realNetwork.requests++');
  });

  test('P1-7: every M6 probe is limited by the authority expiry and the wall-clock limit, and a passed deadline fails the group', () => {
    const a = { expires_at: '2026-10-16T12:10:00.000Z', max_wall_seconds: 7200 }; const t0 = Date.parse('2026-10-16T12:00:00.000Z');
    expect(supplement.m6ProbeTimeout(a, t0, t0)).toBe(90000);
    expect(supplement.m6ProbeTimeout({ ...a, expires_at: '2026-10-16T12:00:30.000Z' }, t0, t0)).toBe(30000);
    expect(supplement.m6ProbeTimeout({ ...a, max_wall_seconds: 20 }, t0, t0)).toBe(20000);
    expect(supplement.m6ProbeTimeout(a, t0 - 7200000 + 5000, t0)).toBe(5000);
    expect(supplement.m6ProbeTimeout(a, t0 - 7200000, t0)).toBeLessThanOrEqual(0);
    expect(supplement.m6ProbeTimeout({ ...a, expires_at: '2026-10-16T11:59:00.000Z' }, t0, t0)).toBeLessThan(0);
    const run = orchestratorSource.slice(orchestratorSource.indexOf('async function runM6('), orchestratorSource.indexOf('async function run(a, request)'));
    expect(run).toContain('runProbe(a, scenario, work, probeDir, roots, timeoutMs)');
    expect(run).toContain('if (!(timeoutMs >= 1000)) { deadlineExceeded = true; break; }');
    expect(run).toContain("output.status = verdict.ok && !deadlineExceeded && probes.length === M6_SCENARIOS.length");
    expect(orchestratorSource).toContain('timeout: timeoutMs, maxBuffer: 1048576 });');
  });

  test('P1-8: a background effect is on disk before the product collects it: the Turn waits for it with a bounded foreground step', () => {
    for (const [prompt, names, last] of [['a2-ext:bg', ['start_process', 'shell'], 'python settle.py ext_bg.txt bg1'], ['a2-review:3', ['shell', 'start_process', 'shell'], 'python settle.py start-effect.txt'],
      ['a2-audit-managed', ['start_process', 'shell'], 'python settle.py bg_out.done - 3']] as any[]) {
      const tools = supplement.toolsFor(prompt, 'cmd', {}); expect(tools.map((t: any) => t.name)).toEqual(names); expect(tools[tools.length - 1].args.command).toBe(last);
    }
    // The product collects external changes only after a shell or start_process call (not at the final answer), which is why a sleep before the answer is not enough.
    const loop = fs.readFileSync(path.resolve(__dirname, '../../../core/src/a9-agent-loop.ts'), 'utf8');
    expect(loop).toContain("if (isShellTool || tc.name === 'start_process') {");
    // settle.py: returns when the file is there, not empty and (optionally) holds exactly the line; the grace argument is honoured.
    const dir = temp(); fs.writeFileSync(path.join(dir, 'settle.py'), supplement.SCRIPT_FILES['settle.py']);
    const settle = (...args: string[]) => childProcess.spawnSync('python3', ['settle.py', ...args], { cwd: dir, encoding: 'utf8', timeout: 25000 });
    fs.writeFileSync(path.join(dir, 'f.txt'), 'bg1\n');
    const done = settle('f.txt', 'bg1', '0.1'); expect(done.status).toBe(0); expect(done.stdout).toContain('A2-SETTLED f.txt');
    expect(settle('f.txt', '-', '0.1').status).toBe(0); expect(settle('f.txt').status).toBe(0);
    expect(supplement.SCRIPT_FILES['bg_out.py']).toContain("Path('bg_out.done')");
  });

  test('P2-1: two missing values are not "equal": every identity or expected value must be observed', () => {
    const frame = { turnId: 'T', text: 'A2-CHECK value 0' };
    expect(driver.evaluateTestStream({ frames: [{ text: 'A2-CHECK' }], order: { ok: true }, ends: [{ exit_code: 0, stdout: 'A2-CHECK' }], shell_kind: 'cmd', outcome: 'completed' }).ok).toBe(false);
    expect(driver.evaluateTestStream({ frames: [frame], order: { ok: true }, ends: [{ exit_code: 0, stdout: 'A2-CHECK' }], turn_id: 'T', shell_kind: 'cmd', outcome: 'completed' }).ok).toBe(true);
    const hole = { ok: false, code: 'A9_AUDIT_PERSISTENCE_FAILED', revision: 'r1' }; const audit = { trigger_installed: true, failing_event_rows: 0, turn_completed: false, never_exists: false, tool_result_requests: 0, max_tool_result_requests: 0,
      second_submit_ok: false, second_submit_code: 'A9_AUDIT_PERSISTENCE_FAILED', requests: { before: 0, after_turn: 1, after_submit: 1 }, require_continue: true, continue_attempts: [hole, { ...hole, revision: 'r2' }] };
    expect(driver.evaluateAuditStage(audit).ok).toBe(false);
    const file = { path: 'ext_bg.txt', b0: H('1'), b1: H('2'), b1_text: undefined, expected_b1_text: undefined, b2: H('1') };
    expect(driver.evaluateExternalBytes({ files: [file], review_paths: ['ext_bg.txt'], undo_results: [{ ok: true, outcome: { restored: ['ext_bg.txt (已恢复原始版本)'], errors: [], drifted: [] } }] }).ok).toBe(false);
    expect(driver.evaluateProviderGuard({ running_before: true, attempt_ok: false, attempt_code: 'A9_PROVIDER_MANAGED_ACTIVE', running_after: true, requests_before: 1, requests_after: 1 }).ok).toBe(false);
    judge(driver.evaluateProviderGuard, { running_before: true, attempt_ok: false, attempt_code: 'A9_PROVIDER_MANAGED_ACTIVE', running_after: true, pid_before: 4242, pid_after: 4242, model_before: 'm', model_after: 'm', base_url_before: 'http://127.0.0.1:1/v1', base_url_after: 'http://127.0.0.1:1/v1', requests_before: 1, requests_after: 1 },
      [['pid_before', undefined], ['pid_before', 0], ['pid_after', 4243], ['model_before', undefined], ['base_url_before', undefined], ['model_after', 'other'], ['requests_after', 2]]);
    const checkpoint = { continue_events: 1, turn_status: 'completed', b0_text: 'cont0\n', b1_text: 'cont1\n', b2_text: 'cont0\n', old_turn_checkpoints: 0, review_paths: ['cont_target.txt'], undo_ok: true };
    expect(driver.evaluateContinuationCheckpoint({ ...checkpoint, continuation_turn_id: 'T', checkpoint: { turn_id: 'T' } }).ok).toBe(false);
    expect(driver.evaluateContinuationCheckpoint({ ...checkpoint, checkpoint: {} }).ok).toBe(false);
  });

  test('P2-2: M1-A01 needs origin/main in every binding but the whole-command form, an unmoved origin, and a local main that stays one commit ahead', () => {
    const form = (n: number) => ({ bound: true, visible_bound_card: true, row_bound: true, no_execution: true, approval_decision: 'denied', remote: n === 16 ? null : 'origin', branch: n === 16 ? null : 'main' });
    const good = { forms: Array.from({ length: 19 }, (_, n) => form(n)), origin_main: G, refs_before: `refs/heads/main ${G}`, refs_after: `refs/heads/main ${G}`, local_main_before: 'b'.repeat(40), local_main_after: 'b'.repeat(40), unpushed_before: '1', unpushed_after: '1' };
    judge(driver.evaluateGitDenials, good, [['forms.3.remote', 'upstream'], ['forms.3.branch', 'dev'], ['forms.5.remote', null], ['forms.16.remote', 'origin'], ['forms.16.branch', 'main'], ['forms.2.no_execution', false], ['forms.4.approval_decision', 'approved'],
      ['forms.7.bound', false], ['forms.9.visible_bound_card', false], ['forms.11.row_bound', false], ['forms', good.forms.slice(0, 18)], ['refs_after', `refs/heads/main ${'c'.repeat(40)}`], ['refs_after', `refs/heads/main ${G}\nrefs/heads/side ${G}`],
      ['refs_before', `refs/heads/main ${'c'.repeat(40)}`], ['local_main_after', 'c'.repeat(40)], ['local_main_before', G], ['unpushed_before', '0'], ['unpushed_after', '0'], ['unpushed_after', undefined], ['origin_main', undefined]]);
    expect(driverSource).toContain('const WHOLE_COMMAND_FORM_INDEX = 16;');
    // The workspace seeded by the orchestrator really has main one commit ahead of origin/main, and no GIT_* variable of the operator's session reaches the setup.
    const parent = temp(); const workspace = path.join(parent, 'ws'); const origin = path.join(parent, 'origin.git'); fs.mkdirSync(workspace); fs.writeFileSync(path.join(workspace, 'probe.txt'), 'value 0\n');
    const saved = { GIT_DIR: process.env.GIT_DIR, GIT_WORK_TREE: process.env.GIT_WORK_TREE, GIT_CONFIG_COUNT: process.env.GIT_CONFIG_COUNT };
    process.env.GIT_DIR = path.join(parent, 'elsewhere'); process.env.GIT_WORK_TREE = path.join(parent, 'elsewhere'); process.env.GIT_CONFIG_COUNT = '1';
    let extra: any;
    try { extra = supplement.setupGitWorkspace('git', workspace, origin, path.join(parent, 'home')); }
    finally { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
    const git = (args: string[]) => childProcess.spawnSync('git', args, { cwd: workspace, encoding: 'utf8' }).stdout.trim();
    expect(git(['rev-list', '--count', 'refs/remotes/origin/main..refs/heads/main'])).toBe('1');
    expect(git(['rev-parse', 'refs/heads/main'])).not.toBe(extra.A9_ALPHA2_ORIGIN_MAIN);
    expect(git(['--git-dir', origin, 'rev-parse', 'refs/heads/main'])).toBe(extra.A9_ALPHA2_ORIGIN_MAIN);
    expect(fs.existsSync(path.join(parent, 'elsewhere'))).toBe(false);
    // A push that really ran would move origin's ref and now be seen.
    childProcess.spawnSync('git', ['push', 'origin', 'main'], { cwd: workspace });
    expect(driver.evaluateOriginRefs(extra.A9_ALPHA2_ORIGIN_MAIN, git(['--git-dir', origin, 'for-each-ref', '--format=%(refname) %(objectname)']))).toBe(false);
    const env = supplement.gitEnvironment({ GIT_DIR: 'x', git_work_tree: 'y', PATH: 'p', GIT_CONFIG_NOSYSTEM: '0' });
    expect(env).toEqual({ GIT_DIR: undefined, git_work_tree: undefined, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' });
    const homed = supplement.gitEnvironment({ GIT_DIR: 'x', XDG_CONFIG_HOME: '/operator/xdg' }, '/run/home');
    expect(homed).toMatchObject({ GIT_DIR: undefined, HOME: '/run/home', XDG_CONFIG_HOME: path.join('/run/home', 'xdg-config'), GIT_CONFIG_GLOBAL: path.join('/run/home', 'gitconfig-empty'), GIT_CONFIG_NOSYSTEM: '1' });
    expect(supplement.isolatedProfileEnvironment('C:\\run\\work\\m1\\main').HOME).toBe(path.join('C:\\run\\work\\m1\\main', 'profile-home'));
    expect(orchestratorSource).toContain("{ ...layout.env, ...gitEnvironment(process.env, layout.env.HOME), ...extra,");
  });

  test('P2-3: the per-file undo of the Shell Turn is proven by its own response and by the bytes right after it', () => {
    const shell = segment('supplementReview');
    expect(shell).toContain('require_per_file: true, per_file: { path: \'ext_shell.txt\', result: extFileUndo, after: shellAfterFile }');
    expect(shell.indexOf('const shellAfterFile')).toBeGreaterThan(shell.indexOf("undoFile(${JSON.stringify(ext.turnId)}, 'ext_shell.txt')"));
    expect(shell.indexOf('const shellAfterFile')).toBeLessThan(shell.indexOf("undoTurn(${JSON.stringify(ext.turnId)})"));
  });

  test('P2-4: M4 compares the approval rows before and after as well', () => {
    const schema = segment('continueSchema');
    expect(schema).toContain("approvals: supplementalRowsFacts(dbAll('SELECT * FROM a9_approvals ORDER BY rowid LIMIT 1001'))");
  });

  test('P2-5: the physical location of the run, data root, workspace and userData is resolved through links before it is judged', () => {
    expect(driverSource).toContain('fs.realpathSync.native(current)');
    expect(driverSource).toContain("real: { run_root: realRun ? realRun + path.sep : null, user_data: realOf(app.getPath('userData')), data_root: realOf(env.A9_BATCH2_DATAROOT), workspace: realOf(env.A9_BATCH2_WORKSPACE) }");
  });

  test('P2-6: the M6 baseline names what it was made from, and a baseline made from other inputs is refused before any probe runs', () => {
    const files = Object.fromEntries(['F42', 'FCandC', 'FCandN', 'C42', 'CCand'].map((n, i) => [n + '.sqlite', H(String(i + 1))]));
    const scenarios = Object.fromEntries(supplement.M6_SCENARIOS.map((s: any) => [s.name, { calls: [] }]));
    const baseline = { schema_version: 1, generator: 'm6-baseline', now: '2026-10-16T12:00:00.000Z', dev_node: 'v20.17.0', fixtures: Object.fromEntries(['F42', 'FCandC', 'FCandN', 'C42', 'CCand'].map((n, i) => [n, H(String(i + 1))])),
      persistence: { w42: supplement.M6_PINS.w42_persistence_sha256, cand: crypto.createHash('sha256').update('baseline candidate module').digest('hex') }, scenarios };
    const m6 = { w42_persistence_sha256: baseline.persistence.w42, cand_persistence_sha256: baseline.persistence.cand };
    const check = (value: any) => supplement.validateM6Baseline(value, files, m6).ok;
    expect(check(baseline)).toBe(true);
    expect(supplement.validateM6Baseline(baseline, files).ok).toBe(false);
    for (const patch of [{ cand_persistence_sha256: H('different') }, { w42_persistence_sha256: H('different') }]) expect(supplement.validateM6Baseline(baseline, files, { ...m6, ...patch }).ok).toBe(false);
    for (const [pathText, replacement] of [['now', '2026-10-16T12:00:01.000Z'], ['schema_version', 2], ['generator', 'other'], ['fixtures.F42', H('9')], ['fixtures.CCand', undefined], ['persistence.w42', H('9')], ['persistence.cand', undefined],
      ['persistence', undefined], ['scenarios.S5', undefined], ['scenarios', {}], ['fixtures', undefined]] as any[]) expect([pathText, check(setPath(baseline, pathText, replacement))]).toEqual([pathText, false]);
    expect(check({ ...baseline, fixtures: { ...baseline.fixtures, EXTRA: H('7') } })).toBe(false);
    expect(check(undefined)).toBe(false); expect(supplement.validateM6Baseline(baseline, { ...files, 'F42.sqlite': H('9') }, m6).ok).toBe(false); expect(supplement.validateM6Baseline(baseline, undefined, m6).ok).toBe(false);
    expect(orchestratorSource).toContain("if (!baselineBinding.ok) throw new Error('A9_36_M6_BASELINE_BINDING');");
  });

  test('P2-7: an M3 restart Stage reuses the review Stage and judges the zero replay; the facts it needs are those the review Stage wrote', () => {
    const m3 = supplement.STAGE_PLAN.m3; expect(m3.map((s: any) => [s.name, s.mode, s.ids, s.reuse])).toEqual([['main', 'supplement_review', Array.from({ length: 10 }, (_, n) => n + 1), undefined], ['restart', 'supplement_review_restart', [11], 'main']]);
    expect(orchestratorSource).toContain("...(stage.reuse ? { A9_ALPHA2_PRIOR_STAGE_DIR: path.join(attempt, stage.reuse) } : {}),");
    expect(segment('supplementReview')).toContain("out('a2-m3-end-state.json', { conversation_id: conv, first_turn_id: first.turnId, first_review_paths: paths, counts: reviewCounts(conv), tree: workspaceTree() });");
    expect(segment('supplementReviewRestart')).toContain("path.join(priorDir, 'a2-m3-end-state.json')");
    const tree = [{ path: 'a.txt', sha256: H('1') }, { path: 'probe.txt', sha256: H('2') }]; const counts = { turns: 9, tool_starts: 22, approvals: 3, checkpoints: 8, managed: 2 };
    const good = { prior: { conversation_id: 'c', first_turn_id: 'T1', first_review_paths: ['probe.txt', 'notes.md'], counts, tree }, conversation_id: 'c', requests_at_start: 0, requests_after_wait: 0, counts, tree,
      review_ok: true, review_paths: ['notes.md', 'probe.txt'], reundo: { ok: true, outcome: { restored: ['probe.txt (此前已撤销，未重复执行)', 'notes.md (此前已撤销，未重复执行)'], errors: [], drifted: [] } }, tree_after_undo: tree,
      next_outcome: 'completed', next_turn_id: 'T10', next_requests: 1 };
    judge(driver.evaluateReviewRestart, good, [['conversation_id', 'other'], ['prior.conversation_id', undefined], ['requests_at_start', 1], ['requests_after_wait', 1], ['requests_after_wait', undefined], ['counts.turns', 10], ['counts.tool_starts', 23], ['counts.approvals', 4],
      ['counts.checkpoints', 9], ['counts.managed', undefined], ['tree', [tree[0]]], ['prior.tree', undefined], ['review_ok', false], ['review_paths', ['probe.txt']], ['prior.first_review_paths', []],
      ['reundo.ok', false], ['reundo.outcome.errors', ['x']], ['reundo.outcome.drifted', ['probe.txt']], ['reundo.outcome.restored', ['probe.txt (已恢复原始版本)']], ['reundo.outcome.restored', []], ['reundo.outcome', undefined],
      ['tree_after_undo', [tree[0]]], ['next_outcome', 'failed'], ['next_turn_id', 'T1'], ['next_turn_id', undefined], ['next_requests', 0], ['next_requests', undefined]]);
  });

  test('P2-8: residue is queried right after the launch, before the result file is read', () => {
    const stage = orchestratorSource.slice(orchestratorSource.indexOf('async function runStage('), orchestratorSource.indexOf('async function runStages('));
    expect(stage.indexOf('result.postflight = postflight(')).toBeGreaterThan(stage.indexOf('exit = await smoke.launchDriver('));
    expect(stage.indexOf('result.postflight = postflight(')).toBeLessThan(stage.indexOf('contract.readJson(resultFile'));
    expect(stage.indexOf('if (launchError) throw launchError;')).toBeGreaterThan(stage.indexOf('result.postflight = postflight('));
  });

  // ---- round 2 -------------------------------------------------------------------------------------------------------------------------------------
  // runStage with in-memory stand-ins for the launch and the process list: it is the real orchestrator code, with no Electron.
  const stageRig = (over: any = {}, stageOver: any = null) => {
    const runRoot = fs.realpathSync(temp()); fs.mkdirSync(path.join(runRoot, 'ledger')); fs.writeFileSync(path.join(runRoot, 'ledger', '1.json'), JSON.stringify({ started_ms: Date.now() }));
    const stage = stageOver || supplement.STAGE_PLAN.m4[0]; const phaseRoot = path.join(runRoot, 'work', 'm4'); const attempt = path.join(runRoot, 'evidence', 'm4');
    fs.mkdirSync(path.join(runRoot, 'work'), { recursive: true }); fs.mkdirSync(attempt, { recursive: true });
    const a = { run_root: runRoot, expires_at: new Date(Date.now() + 600000).toISOString(), max_wall_seconds: 7200, tools: { git: { path: 'git' }, python: { path: 'python3' } }, candidate_root: path.join(runRoot, 'candidate'), provider: {}, credential_source: null, ...over };
    const calls = { launch: 0, list: 0 };
    const rows = (envForResult: any) => ({ mode: stage.mode, status: 'DONE', assertions: supplement.stageAssertionIds(stage).map((id: string) => ({ assertion_id: id, status: 'PASS' })), evidence: {}, envForResult });
    const smokeStub: any = { launchDriver: async (_rt: any, env: any, opts: any) => { calls.launch++; smokeStub.lastOpts = opts; if (smokeStub.reject) throw new Error('A9_TEST_LAUNCH_REJECTED'); fs.writeFileSync(env.A9_BATCH2_DRIVER_RESULT, JSON.stringify(rows(null))); return { pid: 4242, code: 0 }; },
      listProcesses: () => { calls.list++; if (smokeStub.onList) smokeStub.onList(); return { failed: false, rows: [] }; }, realExec: null, reject: false, onList: null, lastOpts: null };
    const rig: any = { runRoot, a, calls, smokeStub, phaseRoot, attempt, stage, onBegin: null };
    rig.run = () => supplement.runStage(a, {}, smokeStub, { phaseRoot, attempt, runtime: {}, fixture: { beginStage() { if (rig.onBegin) rig.onBegin(); } }, port: 1, envPath: '' }, stage);
    return rig;
  };

  test('R2 P1-1: a Stage that ends after the authority expired or the wall-clock limit is not a PASS; a used-up window starts nothing', async () => {
    const ok = stageRig(); const passed = await ok.run();
    expect([passed.status, passed.error, ok.calls.launch, ok.calls.list]).toEqual(['PASS', undefined, 1, 1]);
    // The residue query pushes the clock past the expiry: everything else is clean, the Stage still fails.
    const realNow = Date.now; let skew = 0; const spy = jest.spyOn(Date, 'now').mockImplementation(() => realNow() + skew);
    try {
      const late = stageRig(); late.smokeStub.onList = () => { skew = 10 * 60 * 1000 + 1000; };
      const lateResult = await late.run();
      expect([lateResult.status, lateResult.window_left_ms <= 0]).toEqual(['FAIL', true]);
      skew = 0;
      const wall = stageRig({ max_wall_seconds: 30 }); wall.smokeStub.onList = () => { skew = 31 * 1000; };
      expect((await wall.run()).status).toBe('FAIL');
      skew = 0;
    } finally { spy.mockRestore(); }
    // An expired authority starts nothing: no directory, no launch.
    const gone = stageRig({ expires_at: new Date(Date.now() - 1000).toISOString() }); const goneResult = await gone.run();
    expect([goneResult.status, goneResult.error, gone.calls.launch, fs.existsSync(path.join(gone.attempt, gone.stage.name))]).toEqual(['FAIL', 'A9_36_WINDOW_EXHAUSTED', 0, false]);
    expect(() => supplement.stageTimeout({ expires_at: '2026-10-16T12:00:00.500Z', max_wall_seconds: 7200 }, { timeoutMs: 600000 }, Date.parse('2026-10-16T12:00:00.000Z'), Date.parse('2026-10-16T12:00:00.000Z'))).toThrow('A9_36_WINDOW_EXHAUSTED');
    expect(supplement.stageTimeout({ expires_at: '2026-10-16T12:00:30.000Z', max_wall_seconds: 7200 }, { timeoutMs: 600000 }, Date.parse('2026-10-16T12:00:00.000Z'), Date.parse('2026-10-16T12:00:00.000Z'))).toBe(30000);
    expect(supplement.stageTimeout({ expires_at: '2026-10-16T14:00:00.000Z', max_wall_seconds: 7200 }, { timeoutMs: 120000 }, Date.parse('2026-10-16T12:00:00.000Z'), Date.parse('2026-10-16T12:00:00.000Z'))).toBe(120000);
    // Same ordering in the M6 group: the deadline is judged after the residue query and before the verdict.
    const m6 = orchestratorSource.slice(orchestratorSource.indexOf('async function runM6('), orchestratorSource.indexOf('async function run(a, request)'));
    expect(m6.indexOf('if (windowLeft(a, startedMs) <= 0) deadlineExceeded = true;')).toBeGreaterThan(m6.indexOf('output.postflight = postflight('));
    expect(m6.indexOf('output.m6.deadline_exceeded = deadlineExceeded;')).toBeLessThan(m6.indexOf('output.status = verdict.ok'));
  });

  test('R2 P2-4: a rejected launch still gets its residue query; the original error is kept', async () => {
    const rig = stageRig(); rig.smokeStub.reject = true; const result = await rig.run();
    expect([result.status, result.error, rig.calls.launch, rig.calls.list, result.postflight && result.postflight.failed, result.postflight && result.postflight.related]).toEqual(['FAIL', 'A9_TEST_LAUNCH_REJECTED', 1, 1, false, []]);
    // A residue query that fails is recorded as unknown, and an unknown residue is not clean.
    const broken = stageRig(); broken.smokeStub.reject = true; broken.smokeStub.onList = () => { throw new Error('A9_TEST_LIST_FAILED'); };
    const brokenResult = await broken.run();
    expect([brokenResult.status, brokenResult.error, brokenResult.postflight.failed, supplement.postflightClean(brokenResult.postflight)]).toEqual(['FAIL', 'A9_TEST_LAUNCH_REJECTED', true, false]);
  });

  test('R2 P2-2: a link below the run root is refused before the first write', async () => {
    const root = fs.realpathSync(temp()); const outside = fs.realpathSync(temp()); fs.mkdirSync(path.join(root, 'real'));
    fs.symlinkSync(outside, path.join(root, 'work'), 'dir');
    expect(() => supplement.assertPhysicallyInside(root, path.join(root, 'work', 'm1', 'main'))).toThrow('A9_36_PATH_LINK');
    expect(() => supplement.assertPhysicallyInside(root, path.join(root, 'real', 'a', 'b'))).not.toThrow();
    expect(() => supplement.assertPhysicallyInside(root, root)).toThrow('A9_36_PATH_OUTSIDE_RUN_ROOT');
    expect(() => supplement.assertPhysicallyInside(root, path.join(root, '..', 'elsewhere'))).toThrow('A9_36_PATH_OUTSIDE_RUN_ROOT');
    // A link in the middle of an existing chain, and a link that points back inside, are both refused: only real directories are allowed.
    fs.symlinkSync(path.join(root, 'real'), path.join(root, 'alias'), 'dir');
    expect(() => supplement.assertPhysicallyInside(root, path.join(root, 'alias', 'x'))).toThrow('A9_36_PATH_LINK');
    // runStage with `work` as a link: nothing is created in the outside directory, nothing is launched.
    const rig = stageRig(); fs.rmSync(path.join(rig.runRoot, 'work'), { recursive: true }); const away = fs.realpathSync(temp()); fs.symlinkSync(away, path.join(rig.runRoot, 'work'), 'dir');
    const result = await rig.run();
    expect([result.status, result.error, rig.calls.launch, fs.readdirSync(away)]).toEqual(['FAIL', 'A9_36_PATH_LINK', 0, []]);
    expect(orchestratorSource).toContain("assertPhysicallyInside(a.run_root, attempt); fs.mkdirSync(attempt, { recursive: true });");
    expect(orchestratorSource).toContain('assertPhysicallyInside(a.run_root, attempt); assertPhysicallyInside(a.run_root, phaseRoot); fs.mkdirSync(phaseRoot, { recursive: true });');
    expect(orchestratorSource).toContain('for (const p of [work, probeDir]) assertPhysicallyInside(a.run_root, p);');
  });

  test('R2 P2-1: the Git global configuration comes from an empty file, not from an inherited XDG_CONFIG_HOME or HOME', () => {
    const base = temp(); const leak = path.join(base, 'operator-xdg'); fs.mkdirSync(path.join(leak, 'git'), { recursive: true });
    fs.writeFileSync(path.join(leak, 'git', 'config'), '[user]\n\tname = leaked\n');
    const home = path.join(base, 'home'); fs.mkdirSync(home); fs.writeFileSync(path.join(home, 'gitconfig-empty'), '');
    const read = (extra: any) => childProcess.spawnSync('git', ['config', '--global', '--get', 'user.name'], { encoding: 'utf8', env: { ...process.env, ...extra } }).stdout.trim();
    // Control: with only HOME replaced, the inherited XDG configuration is still read.
    expect(read({ HOME: home, XDG_CONFIG_HOME: leak })).toBe('leaked');
    const isolated = supplement.gitEnvironment({ ...process.env, XDG_CONFIG_HOME: leak }, home);
    expect(read({ XDG_CONFIG_HOME: leak, ...isolated })).toBe('');
  });

  test('R2 P2-3: an undone path must be the expected file, and a no-drift response must carry its drift fields', () => {
    const file = { path: 'ext_shell.txt', b0: H('1'), b1: H('2'), b1_text: 'shell1\n', expected_b1_text: 'shell1\n', b2: H('1') };
    const done = (restored: string[]) => ({ ok: true, driftReasons: [], outcome: { restored, errors: [], drifted: [] } });
    const facts = (results: any[]) => ({ files: [file], review_paths: ['ext_shell.txt'], undo_results: results });
    expect(driver.evaluateExternalBytes(facts([done(['ext_shell.txt'])])).ok).toBe(true);
    expect(driver.evaluateExternalBytes(facts([done(['ext_shell.txt (已恢复原始版本)'])])).ok).toBe(true);
    for (const wrong of ['ext_shell.txt.evil (已恢复原始版本)', 'ext_shell.txtx', 'dir/ext_shell.txt (已恢复原始版本)', ' ext_shell.txt', 'EXT_SHELL.TXT (已恢复原始版本)'])
      expect([wrong, driver.evaluateExternalBytes(facts([done([wrong])])).ok]).toEqual([wrong, false]);
    const noReasons = done(['ext_shell.txt (已恢复原始版本)']); delete (noReasons as any).driftReasons;
    expect(driver.evaluateExternalBytes(facts([noReasons])).ok).toBe(false);
    const noDrifted: any = done(['ext_shell.txt (已恢复原始版本)']); delete noDrifted.outcome.drifted;
    expect(driver.evaluateExternalBytes(facts([noDrifted])).ok).toBe(false);
    const drifted: any = done(['ext_shell.txt (已恢复原始版本)']); drifted.outcome.drifted = ['ext_shell.txt'];
    expect(driver.evaluateExternalBytes(facts([drifted])).ok).toBe(false);
    // The per-file step names the file the same way.
    const perFile = (restored: string[]) => ({ ...facts([done(['ext_shell.txt (已恢复原始版本)'])]), require_per_file: true, per_file: { path: 'ext_shell.txt', result: done(restored), after: { 'ext_shell.txt': H('1') } } });
    expect(driver.evaluateExternalBytes(perFile(['ext_shell.txt (已恢复原始版本)'])).ok).toBe(true);
    expect(driver.evaluateExternalBytes(perFile(['ext_shell.txt.evil (已恢复原始版本)'])).ok).toBe(false);
  });

  test('R2 P2-5: a Stage function has no unconditional return or throw at its top level, so its assertions cannot be skipped by a stray early exit', () => {
    const names = ['continueSchema', 'supplementPolicyGit', 'supplementVerification', 'supplementAuditOutput', 'supplementAuditManaged', 'supplementAuditOwnership', 'supplementContinue', 'supplementBudget',
      'supplementReview', 'supplementReviewRestart', 'supplementProviderGuard', 'supplementRealModel'];
    for (const name of names) expect([name, segment(name).split('\n').filter((line) => /^    (return|throw)\b/.test(line))]).toEqual([name, []]);
    // The check has teeth: the mutation of the review round (a `return;` as the first statement) is seen.
    const text = segment('supplementReviewRestart'); const bodyStart = text.indexOf('{\n') + 2;
    const mutated = text.slice(0, bodyStart) + '    return;\n' + text.slice(bodyStart);
    expect(mutated.split('\n').filter((line) => /^    (return|throw)\b/.test(line)).length).toBe(1);
    // The assertion ids of each Stage appear in the function's text in ascending order, each once.
    for (const stages of Object.values(supplement.STAGE_PLAN) as any[]) for (const stage of stages) {
      const fn = { supplement_continue_schema: 'continueSchema', supplement_policy_git: 'supplementPolicyGit', supplement_verification: 'supplementVerification', supplement_audit_output: 'supplementAuditOutput',
        supplement_audit_managed: 'supplementAuditManaged', supplement_audit_ownership: 'supplementAuditOwnership', supplement_continue: 'supplementContinue', supplement_budget: 'supplementBudget',
        supplement_review: 'supplementReview', supplement_review_restart: 'supplementReviewRestart', supplement_provider_guard: 'supplementProviderGuard', supplement_real_model: 'supplementRealModel' }[stage.mode as string] as string;
      const found = idsIn(segment(fn)); expect([stage.mode, found.length, new Set(found).size]).toEqual([stage.mode, stage.ids.length, stage.ids.length]);
    }
  });

  // ---- round 3 -------------------------------------------------------------------------------------------------------------------------------------
  test('R3 P1-1: the launch gets the window that is left after the setup, and a window used up by the setup launches nothing', async () => {
    const realNow = Date.now; let skew = 0; const spy = jest.spyOn(Date, 'now').mockImplementation(() => realNow() + skew);
    try {
      const shrink = stageRig({ expires_at: new Date(realNow() + 30000).toISOString() }); shrink.onBegin = () => { skew = 25000; };
      const shrunk = await shrink.run();
      expect([shrunk.status, shrink.calls.launch]).toEqual(['PASS', 1]);
      expect(shrink.smokeStub.lastOpts.timeoutMs).toBeGreaterThan(0); expect(shrink.smokeStub.lastOpts.timeoutMs).toBeLessThanOrEqual(5000);
      skew = 0;
      const gone = stageRig({ expires_at: new Date(realNow() + 30000).toISOString() }); gone.onBegin = () => { skew = 40000; };
      const goneResult = await gone.run();
      expect([goneResult.status, goneResult.error, gone.calls.launch, goneResult.postflight]).toEqual(['FAIL', 'A9_36_WINDOW_EXHAUSTED', 0, { not_launched: true }]);
      skew = 0;
    } finally { spy.mockRestore(); }
    expect(() => supplement.stageTimeout({ expires_at: 'not a date', max_wall_seconds: 7200 }, { timeoutMs: 600000 }, 0, 0)).toThrow('A9_36_WINDOW_EXHAUSTED');
  });

  test('R3 P2-1: the profile directories, a reused HOME and the empty Git configuration are checked before the first write', async () => {
    const restart = supplement.STAGE_PLAN.m3.find((s: any) => s.name === 'restart');
    const reuseRig = (mutate: (rig: any, home: string, outside: string) => void) => {
      const rig = stageRig({}, restart); const home = path.join(rig.phaseRoot, 'main'); const outside = fs.realpathSync(temp());
      for (const dir of [home, path.join(home, '中文 workspace'), path.join(home, 'data'), path.join(home, 'profile-home')]) fs.mkdirSync(dir, { recursive: true });
      mutate(rig, home, outside); return { rig, home, outside };
    };
    // The reused profile-home is a link: nothing is written through it.
    const linked = reuseRig((_rig, home, outside) => { fs.rmSync(path.join(home, 'profile-home'), { recursive: true }); fs.symlinkSync(outside, path.join(home, 'profile-home'), 'dir'); });
    const linkedResult = await linked.rig.run();
    expect([linkedResult.status, linkedResult.error, linked.rig.calls.launch, fs.readdirSync(linked.outside)]).toEqual(['FAIL', 'A9_36_PATH_LINK', 0, []]);
    // Each profile directory is checked on its own, not only through the configuration file below HOME.
    for (const [name, key] of [['profile-local', 'LOCALAPPDATA'], ['profile-roaming', 'APPDATA'], ['temp', 'TEMP']]) {
      const profile = reuseRig((_rig, home, outside) => { fs.symlinkSync(outside, path.join(home, name), 'dir'); });
      const profileResult = await profile.rig.run();
      expect([key, profileResult.error, profile.rig.calls.launch, fs.readdirSync(profile.outside)]).toEqual([key, 'A9_36_PATH_LINK', 0, []]);
    }
    // The empty configuration file is a link, a directory or not empty.
    const fileLink = reuseRig((_rig, home, outside) => { fs.writeFileSync(path.join(outside, 'target'), ''); fs.symlinkSync(path.join(outside, 'target'), path.join(home, 'profile-home', 'gitconfig-empty')); });
    const fileLinkResult = await fileLink.rig.run();
    expect([fileLinkResult.error, fileLink.rig.calls.launch]).toEqual(['A9_36_PATH_LINK', 0]);
    const dirLeaf = reuseRig((_rig, home) => { fs.mkdirSync(path.join(home, 'profile-home', 'gitconfig-empty')); });
    expect([(await dirLeaf.rig.run()).error, dirLeaf.rig.calls.launch]).toEqual(['A9_36_PATH_NOT_DIRECTORY', 0]);
    const filled = reuseRig((_rig, home) => { fs.writeFileSync(path.join(home, 'profile-home', 'gitconfig-empty'), '[user]\n\tname = x\n'); });
    expect([(await filled.rig.run()).error, filled.rig.calls.launch]).toEqual(['A9_36_GIT_CONFIG_NOT_EMPTY', 0]);
    // A regular file where a directory is expected, in the middle of a chain, is refused; a regular file is the right leaf only when asked for.
    const root = fs.realpathSync(temp()); fs.mkdirSync(path.join(root, 'd')); fs.writeFileSync(path.join(root, 'd', 'f'), '');
    expect(() => supplement.assertPhysicallyInside(root, path.join(root, 'd', 'f', 'x'))).toThrow('A9_36_PATH_NOT_DIRECTORY');
    expect(() => supplement.assertPhysicallyInside(root, path.join(root, 'd', 'f'))).toThrow('A9_36_PATH_NOT_DIRECTORY');
    expect(() => supplement.assertPhysicallyInside(root, path.join(root, 'd', 'f'), 'file')).not.toThrow();
    expect(() => supplement.assertPhysicallyInside(root, path.join(root, 'd'), 'file')).toThrow('A9_36_PATH_NOT_DIRECTORY');
    // A reused HOME that is clean passes the same checks and the Stage goes on to the launch.
    const clean = reuseRig(() => undefined); fs.writeFileSync(path.join(clean.home, 'profile-home', 'gitconfig-empty'), '');
    for (const name of ['profile-local', 'profile-roaming', 'temp']) fs.mkdirSync(path.join(clean.home, name));
    expect((await clean.rig.run()).error).toBeUndefined(); expect(clean.rig.calls.launch).toBe(1);
  });

  test('R3 P2-2: a restored entry is the path alone or the path with one of the five notes of the checkpoint manager, by equality', () => {
    const file = { path: 'ext_shell.txt', b0: H('1'), b1: H('2'), b1_text: 'shell1\n', expected_b1_text: 'shell1\n', b2: H('1') };
    const done = (restored: string[]) => ({ ok: true, driftReasons: [], outcome: { restored, errors: [], drifted: [] } });
    const judged = (entry: string) => driver.evaluateExternalBytes({ files: [file], review_paths: ['ext_shell.txt'], undo_results: [done([entry])], require_per_file: true, per_file: { path: 'ext_shell.txt', result: done([entry]), after: { 'ext_shell.txt': H('1') } } }).ok;
    for (const note of driver.SUP_RESTORED_NOTES) expect([note, judged(`ext_shell.txt (${note})`)]).toEqual([note, true]);
    expect(judged('ext_shell.txt')).toBe(true);
    for (const bad of ['ext_shell.txt (other).txt (已恢复原始版本)', 'ext_shell.txt (not-closed', 'ext_shell.txt (已恢复原始版本', 'ext_shell.txt (已恢复其他版本)', 'ext_shell.txt (已恢复原始版本) ', 'ext_shell.txt (已恢复原始版本)(已恢复原始版本)'])
      expect([bad, judged(bad)]).toEqual([bad, false]);
    // The five notes are the ones the checkpoint manager writes, so the list cannot drift away from the product.
    const manager = fs.readFileSync(path.resolve(__dirname, '../../../workspace/src/checkpoint-manager.ts'), 'utf8');
    const written = [...manager.matchAll(/outcome\.restored\.push\(`\$\{relPath\} \(([^)]+)\)`\)/g)].map((m) => m[1]).sort();
    expect(written).toEqual([...driver.SUP_RESTORED_NOTES].sort());
  });
});

describe('Alpha2 supplemental public continuation schema', () => {
  function publicApi(runtime: any, preloadSource = fs.readFileSync(path.resolve(__dirname, '../../product/preload.js'), 'utf8')) {
    const { createA9ProductRequestHandler } = require('../../product/a9-product-ipc');
    const handle = createA9ProductRequestHandler({ isValidRendererSender: () => true, getA9Runtime: () => runtime });
    let exposed: any;
    const requests: any[] = [];
    vm.runInNewContext(preloadSource, {
      process: { env: {}, argv: [] },
      require: (name: string) => {
        if (name !== 'electron') throw new Error(`Unexpected preload import: ${name}`);
        return {
          contextBridge: { exposeInMainWorld: (key: string, value: any) => { if (key === 'win7Agent') exposed = value; } },
          ipcRenderer: { invoke: (channel: string, request: any) => { requests.push({ channel, request }); return handle({}, request); } },
        };
      },
    });
    return { api: exposed.a9, requests };
  }

  for (const item of driver.continuationSchemaCases()) {
    test(`${item.id} is refused before runtime dispatch`, async () => {
      const runtime = { continueTask: jest.fn(() => ({ ok: true })) };
      const { api, requests } = publicApi(runtime);
      const result = await api.continueTask(...item.args);
      expect(result).toMatchObject({ ok: false, error: { code: 'A9_PAYLOAD_INVALID' } });
      expect(runtime.continueTask).not.toHaveBeenCalled();
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({ channel: 'product:a9-request', request: { schemaVersion: 7, action: 'a9.task.continue' } });
    });
  }

  test('valid maximum-length identities reach the actual handler through the frozen public API', async () => {
    const runtime = { continueTask: jest.fn(() => ({ ok: true, sentinel: 'dispatched' })) };
    const { api } = publicApi(runtime);
    const args = ['c'.repeat(256), 't'.repeat(256), 'i'.repeat(256), 'a'.repeat(64)];
    expect(await api.continueTask(...args)).toEqual({ ok: true, sentinel: 'dispatched' });
    expect(runtime.continueTask).toHaveBeenCalledTimes(1);
    expect(runtime.continueTask).toHaveBeenCalledWith({ conversationId: args[0], taskId: args[1], interruptedTurnId: args[2], recoveryRevision: args[3] });
    for (const name of ['invoke', 'send', 'ipcRenderer', 'execute', 'exec', 'spawn', 'rawIpc']) expect(Object.keys(api)).not.toContain(name);
  });

  test('workspace comparison detects changed bytes and retains an empty-directory change', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a2-schema-facts-'));
    fs.writeFileSync(path.join(root, 'file.txt'), 'before');
    const before = driver.supplementalWorkspaceFacts(root);
    fs.writeFileSync(path.join(root, 'file.txt'), 'after!');
    expect(driver.supplementalWorkspaceFacts(root)).not.toEqual(before);
    fs.mkdirSync(path.join(root, 'empty'));
    expect(driver.supplementalWorkspaceFacts(root)).toEqual(expect.arrayContaining([{ path: 'empty', kind: 'directory' }]));
  });

  test('actual rejected IPC with the wrong preload values cannot produce supplemental PASS', async () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../product/preload.js'), 'utf8');
    const signature = 'conversationId, taskId, interruptedTurnId, recoveryRevision,\n    }),';
    expect(source).toContain(signature);
    const observe = async (preloadSource: string) => {
      const runtime = { continueTask: jest.fn(() => ({ ok: true })) };
      const { api, requests } = publicApi(runtime, preloadSource);
      const observations = [];
      for (const item of driver.continuationSchemaCases()) {
        const result = await api.continueTask(...item.args);
        observations.push({ id: item.id, ok: result.ok, code: result.error.code });
      }
      expect(runtime.continueTask).not.toHaveBeenCalled();
      return { observations, requests: requests.map(({ request }: any) => ({ action: request.action, ...driver.continuationRequestFacts(request),
        payload_keys: Object.keys(request.payload).sort(), ok: false, error: 'A9_PAYLOAD_INVALID' })) };
    };
    const valid = await observe(source);
    expect(driver.evaluateContinuationSchema(valid.observations, valid.requests)).toBe(true);
    const wrong = await observe(source.replace(signature, 'conversationId: "", taskId: "", interruptedTurnId: "", recoveryRevision: "",\n    }),'));
    expect(wrong.observations.every((item) => item.ok === false && item.code === 'A9_PAYLOAD_INVALID')).toBe(true);
    expect(driver.evaluateContinuationSchema(wrong.observations, wrong.requests)).toBe(false);
    const changedSchema = valid.requests.map((item, index) => index === 0 ? { ...item, schema_version: 6 } : item);
    expect(driver.evaluateContinuationSchema(valid.observations, changedSchema)).toBe(false);
    const changedKeys = valid.requests.map((item, index) => index === 0 ? { ...item, payload_keys: item.payload_keys.concat('extra') } : item);
    expect(driver.evaluateContinuationSchema(valid.observations, changedKeys)).toBe(false);
  });

  test('database fingerprints reject an in-place update or equal-count row replacement', () => {
    const before = driver.supplementalRowsFacts([{ id: 1, status: 'interrupted' }]);
    expect(driver.supplementalRowsFacts([{ id: 1, status: 'running' }])).not.toEqual(before);
    expect(driver.supplementalRowsFacts([{ id: 2, status: 'interrupted' }])).not.toEqual(before);
    expect(() => driver.supplementalRowsFacts(Array(1001).fill({}))).toThrow('A2_M4_DATABASE_ROW_LIMIT');
  });
});

const RUN_ID = '3f1c2a52-6b0e-4c1e-9f5e-0d7b8a1c2e44';
const TARGET = { machine_name: 'TEST-ONLY-HOST', account_name: 'TEST-ONLY\\runner', account_sid: 'S-1-5-21-1-2-3-1001', integrity_level: 'Medium', session_id: 1, elevated: false, in_job: false };
const sha = (value: string | Buffer) => crypto.createHash('sha256').update(value).digest('hex');
const temp = (label: string) => fs.mkdtempSync(path.join(os.tmpdir(), `a9-batch2-${label}-`));
// A process listing is two queries: the table (wmic_processes) and the command lines (wmic_process_commands, /format:list, printed on Win7 with
// CR CR LF line ends; rehearsal 11 R1). answers() serves both from one place; any other command gets an empty success.
const commandLineList = (entries: Array<[number, string]> = [[304, '\\SystemRoot\\System32\\smss.exe']]) => ({ status: 0, error: null, stderr: '',
  stdout: `\r\r\n${entries.map(([pid, command]) => `CommandLine=${command}\r\r\nProcessId=${pid}\r\r\n`).join('\r\r\n\r\r\n')}\r\r\n` });
const answers = (table: any, commands: any = commandLineList()) => (name: string) => {
  if (name === 'wmic_process_commands') return typeof commands === 'function' ? commands(name) : commands;
  if (name === 'wmic_processes') return typeof table === 'function' ? table(name) : table;
  return { status: 0, stdout: '', stderr: '', error: null };
};

function request(overrides: any = {}) {
  const base = overrides.base || temp('request');
  return requests.createRequest({
    runId: RUN_ID, phase: 'p01-env', requestIndex: 1, sourceCommit: 'a'.repeat(40), packageSha256: 'b'.repeat(64), manifestSha256: 'c'.repeat(64),
    kitSha256: 'd'.repeat(64), releaseAuthoritySha256: 'e'.repeat(64), candidateRoot: path.join(base, 'candidate'), evidenceRoot: path.join(base, 'evidence'),
    target: { ...TARGET }, externalFiles: {}, ...overrides,
  });
}
const completed = (index: number, phase: string, result = 'PASS', failureClass?: string) => ({ state: 'COMPLETED', request_index: index, phase, run_id: RUN_ID, digest: `${index}`.repeat(64).slice(0, 64), result, ...(failureClass ? { failure_class: failureClass } : {}) });
const consumed = (index: number, phase: string, at = new Date().toISOString()) => ({ state: 'CONSUMED', request_index: index, phase, run_id: RUN_ID, digest: `${index}`.repeat(64).slice(0, 64), consumed_at: at });

describe('A9-33 batch-2 evidence contract', () => {
  test('the contract is a closed set with the expected shape', () => {
    const check = fixtures.selfCheck();
    expect(check.problems).toEqual([]);
    expect(check).toMatchObject({ ok: true, cases: 37, assertions: 67, phases: 10, request_cost: 10, max_requests: 16, retry_headroom: 6 });
    expect(fixtures.PHASES.map((phase: any) => phase.id)).toEqual(['p01-env', 'p02-integrity', 'p03-chain', 'p04-streaming', 'p05-session-bg', 'p06-continue', 'p07-safe', 'p08-ui', 'p09-report', 'p10-postflight']);
    expect(fixtures.LIMITS).toEqual({ max_requests: 16, max_wall_seconds: 21600, desktop_windows: 1, max_background_processes: 3, request_ttl_seconds: 900 });
    expect(fixtures.CONTRACT).toMatchObject({ candidate: 'WIN7-55', candidate_tentative: true, lock_id: 'A9-BATCH2-INPUTS-D013-V26-MANAGED' });
    expect(fixtures.CONTRACT.result_ceiling).toMatch(/never the full Alpha 2/);
  });

  test('the owner-ruled narrowing removed CONT-02 and SAFE-01 and carries them as known limits', () => {
    const ids = fixtures.CASES.map((item: any) => item.case_id);
    expect(ids).not.toContain('B2-CONT-02-CRASH-POINTS-DEDUP');
    expect(ids).not.toContain('B2-SAFE-01-CURRENT-RULES-BUDGET');
    expect(fixtures.casesForPhase('p06-continue').map((item: any) => item.case_id)).toEqual(['B2-CONT-01-RESTART-ZERO-REQUEST', 'B2-CONT-03-APPROVAL-UNKNOWN-EFFECTS']);
    expect(fixtures.casesForPhase('p07-safe').map((item: any) => item.case_id)).toEqual(['B2-SAFE-02-AUDIT-HARD-STOP', ...fixtures.SECRET_CASE_IDS]);
    expect(fixtures.casesForPhase('p08-ui').map((item: any) => item.case_id)).toEqual(['B2-UI-01-CONTINUE-INTERACTION', 'B2-UI-02-LAYOUTS-DPI']);
    expect(fixtures.KNOWN_LIMITS.some((item: string) => item.startsWith('CONT-02 crash points'))).toBe(true);
    expect(fixtures.KNOWN_LIMITS.some((item: string) => item.startsWith('SAFE-01 incompressible'))).toBe(true);
    const evidence = fixtures.evidenceSet();
    expect(evidence).not.toContain('cont02-crash-points.json');
    expect(evidence).not.toContain('safe01-rules-budget.json');
    expect(evidence.length).toBe(67);
  });

  test('every assertion needs an observed value before a case can pass', () => {
    const bindings = { source_commit: 'a'.repeat(40), package_sha256: 'b'.repeat(64), manifest_sha256: 'c'.repeat(64), kit_sha256: 'd'.repeat(64) };
    const result = fixtures.newPhaseResult('p07-safe', RUN_ID, 3, bindings);
    expect(result.status).toBe('NOT_PERFORMED');
    for (const item of fixtures.casesForPhase('p07-safe')) for (const a of item.assertions) fixtures.setAssertion(result, item.case_id, a.assertion_id, 'PASS', 'seen');
    result.evidence = fixtures.evidenceForPhase('p07-safe').map((name: string) => ({ file: name, size: 1, sha256: sha(name) }));
    fixtures.finalizePhaseResult(result, null);
    expect(result.status).toBe('PASS');
    expect(fixtures.phaseResultProblems(result, { runId: RUN_ID, phase: 'p07-safe', bindings })).toEqual([]);
    // Blank observation, wrong run id, wrong binding, missing evidence and an unknown case each produce a named problem.
    const blank = JSON.parse(JSON.stringify(result)); blank.cases[0].assertions[0].observed = '  ';
    expect(fixtures.phaseResultProblems(blank, { runId: RUN_ID, phase: 'p07-safe', bindings })).toContain(`ASSERTION_NOT_PASS:${blank.cases[0].assertions[0].assertion_id}`);
    expect(fixtures.phaseResultProblems(result, { runId: 'other', phase: 'p07-safe', bindings })).toContain('RUN_ID');
    expect(fixtures.phaseResultProblems(result, { runId: RUN_ID, phase: 'p07-safe', bindings: { ...bindings, kit_sha256: '0'.repeat(64) } })).toContain('BINDING_KIT_SHA256');
    const noEvidence = JSON.parse(JSON.stringify(result)); noEvidence.evidence = [];
    expect(fixtures.phaseResultProblems(noEvidence, { runId: RUN_ID, phase: 'p07-safe', bindings }).some((item: string) => item.startsWith('EVIDENCE_NOT_LISTED:'))).toBe(true);
    const extra = JSON.parse(JSON.stringify(result)); extra.cases.push({ case_id: 'B2-UNKNOWN', status: 'PASS', assertions: [] });
    expect(fixtures.phaseResultProblems(extra, { runId: RUN_ID, phase: 'p07-safe', bindings })).toContain('CASE_UNEXPECTED:B2-UNKNOWN');
    // One FAIL fails the phase, one NOT_PERFORMED keeps it from passing, and an unknown assertion id is refused.
    const failing = fixtures.newPhaseResult('p07-safe', RUN_ID, 3, bindings);
    fixtures.setAssertion(failing, 'B2-SAFE-02-AUDIT-HARD-STOP', 'B2-SAFE-02-AUDIT-HARD-STOP-A01', 'FAIL', 'budget not reached');
    expect(fixtures.finalizePhaseResult(failing, null)).toMatchObject({ status: 'FAIL', failure_class: 'ASSERTION_FAILED' });
    expect(failing.first_failure).toMatchObject({ case_id: 'B2-SAFE-02-AUDIT-HARD-STOP' });
    expect(() => fixtures.setAssertion(failing, 'B2-SAFE-02-AUDIT-HARD-STOP', 'NOPE', 'PASS', 'x')).toThrow(/UNKNOWN_ASSERTION/);
    expect(() => fixtures.setAssertion(failing, 'B2-SAFE-02-AUDIT-HARD-STOP', 'B2-SAFE-02-AUDIT-HARD-STOP-A01', 'MAYBE', 'x')).toThrow(/STATUS_INVALID/);
  });

  test('an UNKNOWN or NOT_PERFORMED assertion never lets a case or a phase pass', () => {
    const bindings = { source_commit: 'a'.repeat(40), package_sha256: 'b'.repeat(64), manifest_sha256: 'c'.repeat(64), kit_sha256: 'd'.repeat(64) };
    const build = (override: string) => {
      const result = fixtures.newPhaseResult('p07-safe', RUN_ID, 3, bindings);
      const cases = fixtures.casesForPhase('p07-safe');
      for (const item of cases) for (const a of item.assertions) fixtures.setAssertion(result, item.case_id, a.assertion_id, 'PASS', 'seen');
      const target = cases[0];
      fixtures.setAssertion(result, target.case_id, target.assertions[0].assertion_id, override, 'could not observe');
      result.evidence = fixtures.evidenceForPhase('p07-safe').map((name: string) => ({ file: name, size: 1, sha256: sha(name) }));
      return { result, target };
    };
    const unknown = build('UNKNOWN');
    fixtures.finalizePhaseResult(unknown.result, null);
    expect(unknown.result.cases.find((item: any) => item.case_id === unknown.target.case_id).status).toBe('UNKNOWN');
    expect(unknown.result.status).toBe('NOT_PERFORMED');
    expect(unknown.result.failure_class).toBe('INCOMPLETE');
    const notPerformed = build('NOT_PERFORMED');
    fixtures.finalizePhaseResult(notPerformed.result, null);
    expect(notPerformed.result.cases.find((item: any) => item.case_id === notPerformed.target.case_id).status).toBe('NOT_PERFORMED');
    expect(notPerformed.result.status).toBe('NOT_PERFORMED');
    // A hand-forged PASS on the case or the phase over an UNKNOWN assertion is refused by the verifier.
    const forged = build('UNKNOWN');
    fixtures.finalizePhaseResult(forged.result, null);
    forged.result.cases.find((item: any) => item.case_id === forged.target.case_id).status = 'PASS';
    forged.result.status = 'PASS';
    forged.result.failure_class = null;
    const problems = fixtures.phaseResultProblems(forged.result, { runId: RUN_ID, phase: 'p07-safe', bindings });
    expect(problems.length).toBeGreaterThan(0);
    expect(problems).toContain(`ASSERTION_NOT_PASS:${forged.target.assertions[0].assertion_id}`);
  });

  test('a named phase failure outranks assertions that all passed', () => {
    const bindings = { source_commit: 'a'.repeat(40), package_sha256: 'b'.repeat(64), manifest_sha256: 'c'.repeat(64), kit_sha256: 'd'.repeat(64) };
    const result = fixtures.newPhaseResult('p07-safe', RUN_ID, 3, bindings);
    for (const item of fixtures.casesForPhase('p07-safe')) for (const a of item.assertions) fixtures.setAssertion(result, item.case_id, a.assertion_id, 'PASS', 'seen');
    result.evidence = fixtures.evidenceForPhase('p07-safe').map((name: string) => ({ file: name, size: 1, sha256: sha(name) }));
    // A driver ERROR or non-zero exit names a failure class; every assertion recorded before it cannot make the phase PASS.
    fixtures.finalizePhaseResult(result, 'DRIVER_SAFE_RULES_FAILED');
    expect(result).toMatchObject({ status: 'FAIL', failure_class: 'DRIVER_SAFE_RULES_FAILED' });
    expect(result.first_failure).toMatchObject({ case_id: null, detail: 'DRIVER_SAFE_RULES_FAILED' });
    expect(fixtures.phaseResultProblems(result, { runId: RUN_ID, phase: 'p07-safe', bindings })).toEqual([]);
  });

  test('the exit and layout assertions say only what can be observed from outside', () => {
    const exit = fixtures.CASES.find((item: any) => item.case_id === 'B2-CH-06-NORMAL-EXIT').assertions[1].description;
    expect(exit).toMatch(/product process exits with a recorded exit code and time/);
    expect(exit).toMatch(/creation-date identity/);
    expect(exit).not.toMatch(/same-instance exit codes/);
    const layouts = fixtures.CASES.find((item: any) => item.case_id === 'B2-UI-02-LAYOUTS-DPI').assertions[0].description;
    expect(layouts).toMatch(/not Windows DPI scaling/);
    expect(layouts).toMatch(/continuation card button/);
  });

  test('scripted Provider scenarios are bounded and stateless apart from hold and shell kind', () => {
    const user = (token: string) => [{ role: 'user', content: `please run ${token}` }];
    const step = (token: string, tools: any[] = [], state: any = {}) => fixtures.providerStep({ messages: [...user(token), ...tools] }, state);
    expect(step('b2:bg-start')).toMatchObject({ tool: { name: 'start_process' } });
    expect(step('b2:bg-start', [{ role: 'tool', content: 'ok' }])).toEqual({ content: 'background process started.' });
    expect(step('b2:bg-three', [1, 2, 3].map(() => ({ role: 'tool', content: 'ok' }))).tool.name).toBe('start_process');
    expect(step('b2:bg-three', [1, 2, 3, 4].map(() => ({ role: 'tool', content: 'ok' })))).toHaveProperty('content');
    expect(step('b2:bg-long')).toMatchObject({ tool: { name: 'start_process' } });
    expect(step('b2:bg-long', [{ role: 'tool', content: 'ok' }])).toEqual({ content: 'long background process started.' });
    // WIN7-45 (formal review of WIN7-43, P1): a command that exits at once is a fast exit, not a readiness failure; the failed start has its own scenario.
    expect(step('b2:bg-fast-exit')).toMatchObject({ tool: { name: 'start_process', args: { command: expect.stringMatching(/exit 9$/) } } });
    expect(step('b2:bg-fast-exit', [{ role: 'tool', content: 'ok' }])).toEqual({ content: 'fast exit observed.' });
    expect(step('b2:bg-ready-fail')).toEqual({ content: 'no scenario token; nothing executed.' });
    expect(step('b2:bg-badcwd')).toMatchObject({ tool: { name: 'start_process', args: { cwd: 'b2-no-such-directory' } } });
    expect(step('b2:bg-badcwd', [{ role: 'tool', content: 'err' }])).toEqual({ content: 'start failure observed.' });
    // The release candidate is the one finite long command: it ends by itself after the hold bound even when nobody removes it.
    const released = step('b2:bg-release', [], { shellKind: 'powershell' });
    expect(released).toMatchObject({ tool: { name: 'start_process' } });
    expect(released.tool.args.command).toContain(`1..${fixtures.FIXTURE_BOUNDS.release_hold_seconds} `);
    expect(step('b2:bg-release', [], { shellKind: 'cmd' }).tool.args.command).toContain(`1,1,${fixtures.FIXTURE_BOUNDS.release_hold_seconds}`);
    expect(fixtures.FIXTURE_BOUNDS.release_hold_seconds).toBe(300);
    expect(step('b2:bg-release', [{ role: 'tool', content: 'ok' }])).toEqual({ content: 'release candidate started.' });
    expect(step('b2:hold')).toMatchObject({ tool: { name: 'write' } });
    expect(step('b2:hold', [{ role: 'tool', content: 'ok' }])).toMatchObject({ tool: { name: 'delete', args: { permanent: true } } });
    expect(step('b2:hold', [{ role: 'tool', content: 'ok' }, { role: 'tool', content: 'ok' }])).toEqual({ hold: true });
    // After a hold the continue request reads current facts once and never replays the old calls.
    expect(step('b2:hold', [], { afterHold: true })).toMatchObject({ tool: { name: 'read' } });
    expect(step('b2:hold', [{ role: 'tool', content: 'x' }], { afterHold: true }).content).toMatch(/continued/);
    expect(step('no token here')).toEqual({ content: 'no scenario token; nothing executed.' });
    // Shell kind selects the command syntax; commands carry hard tick bounds.
    expect(step('b2:s01', [], { shellKind: 'powershell' }).tool.args.command).toMatch(/ForEach-Object/);
    expect(step('b2:s01', [], { shellKind: 'cmd' }).tool.args.command).toMatch(/^for \/L/);
    expect(fixtures.backgroundCommandCmd(9999)).toContain(`1,1,${fixtures.FIXTURE_BOUNDS.max_ticks}`);
    expect(fixtures.backgroundCommandPowerShell(0)).toContain('1..1 ');
    expect(() => fixtures.shellCommand('cmd', { name: 'free-text' })).toThrow(/SHELL_COMMAND_UNKNOWN/);
    // Cursor and handle extraction follow the product's cursor format.
    const cursor = `${'a'.repeat(32)}.3.17`;
    expect(fixtures.extractNextCursor({ content: JSON.stringify({ nextCursor: cursor }) })).toBe(cursor);
    expect(fixtures.extractNextCursor({ content: 'nothing' })).toBe('cursor-missing');
    expect(fixtures.extractHandleId({ content: JSON.stringify({ handleId: 'h-1.2' }) })).toBe('h-1.2');
  });

  test('the S04 encoding commands write exact byte halves and the secret is split across chunks', () => {
    const fx = fixtures.encodingFixtures();
    expect(fx.cp936_zhongwen.toString('hex')).toBe('d6d0cec4');
    expect(fx.crlf.toString('utf8')).toContain('\r\n');
    for (const label of ['utf8', 'utf16le', 'cp936', 'crlf']) {
      const command = fixtures.encodingCommandPowerShell(label);
      const parts = [...command.matchAll(/\[byte\[\]\]@\(([\d,]*)\)/g)].map((m: any) => Buffer.from(m[1].split(',').filter(Boolean).map(Number)));
      expect(parts).toHaveLength(2);
      expect(parts[0].length).toBeGreaterThan(0);
      expect(parts[1].length).toBeGreaterThan(0);
      expect(Buffer.concat(parts).equals({ utf8: fx.utf8, utf16le: fx.utf16le, cp936: fx.cp936_zhongwen, crlf: fx.crlf }[label as 'utf8'])).toBe(true);
    }
    expect(() => fixtures.encodingCommandPowerShell('latin9')).toThrow(/ENCODING_LABEL_UNKNOWN/);
    const split = fixtures.secretSplitAcrossChunks();
    expect(split.chunks).toHaveLength(2);
    expect(split.chunks.some((chunk: Buffer) => chunk.toString('latin1').includes(split.secret))).toBe(false);
    expect(Buffer.concat(split.chunks).toString('latin1')).toContain(split.secret);
  });
});

describe('A9-33 batch-2 request and ledger', () => {
  test('a request is bound, closed to unknown fields, and has no command field', () => {
    const good = request();
    expect(requests.structuralProblems(good)).toEqual([]);
    expect(good).not.toHaveProperty('command');
    const mutate = (change: (r: any) => void) => { const copy = JSON.parse(JSON.stringify(good)); change(copy); copy.digest = requests.requestDigest(copy); return requests.structuralProblems(copy); };
    expect(mutate((r) => { r.command = 'calc.exe'; })).toContain('UNKNOWN_FIELD:command');
    expect(mutate((r) => { r.phase = 'p99-unknown'; })).toContain('PHASE');
    expect(mutate((r) => { r.target.elevated = true; })).toContain('TARGET_ELEVATED');
    expect(mutate((r) => { delete r.target.in_job; })).toContain('TARGET_IN_JOB');
    expect(mutate((r) => { r.bindings.package_sha256 = 'xyz'; })).toContain('BINDING_PACKAGE_SHA256');
    expect(mutate((r) => { r.expires_at = new Date(Date.parse(r.issued_at) + 901000).toISOString(); })).toContain('LIFETIME');
    expect(mutate((r) => { r.request_index = 17; })).toContain('REQUEST_INDEX');
    expect(mutate((r) => { r.evidence_root = path.join(r.candidate_root, 'evidence'); })).toContain('EVIDENCE_ROOT_NOT_EXTERNAL');
    expect(requests.structuralProblems({ ...good, digest: 'f'.repeat(64) })).toContain('DIGEST');
    expect(() => requests.createRequest({ ...{ runId: RUN_ID, phase: 'p01-env', requestIndex: 1 }, ttlSeconds: 901 })).toThrow(/TTL_INVALID/);
  });

  test('an integrity request must name four external files outside the candidate with a matching pin', () => {
    const base = temp('integrity-request');
    const externalFiles = Object.fromEntries(['package_zip', 'formal_input_lock', 'approval_registry', 'release_authority'].map((key) => [key, { path: path.join(base, 'external', `${key}.bin`), sha256: 'e'.repeat(64) }]));
    const good = request({ base, phase: 'p02-integrity', requestIndex: 2, externalFiles });
    expect(requests.structuralProblems(good)).toEqual([]);
    const argv = requests.argvForRequest(good);
    expect(path.basename(argv.program)).toBe('electron.exe');
    expect(argv.args[0]).toBe(path.join(good.candidate_root, 'validation', 'a9-batch2-package-integrity.cjs'));
    expect(argv.args).toContain(`--release-authority-sha256=${'e'.repeat(64)}`);
    expect(argv.env).toEqual({ ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '' });
    expect(() => request({ base, phase: 'p02-integrity', requestIndex: 2, externalFiles: { ...externalFiles, release_authority: { ...externalFiles.release_authority, sha256: '1'.repeat(64) } } })).toThrow(/AUTHORITY_PIN_MISMATCH/);
    expect(() => request({ base, phase: 'p02-integrity', requestIndex: 2, externalFiles: { ...externalFiles, package_zip: { path: path.join(good.candidate_root, 'inside.zip'), sha256: 'e'.repeat(64) } } })).toThrow(/EXTERNAL_PACKAGE_ZIP_INSIDE_CANDIDATE/);
    expect(() => request({ base, phase: 'p02-integrity', requestIndex: 2, externalFiles: {} })).toThrow(/EXTERNAL_PACKAGE_ZIP/);
  });

  test('every phase derives only electron.exe in Node mode with one packaged script', () => {
    for (const phase of fixtures.PHASES) {
      const base = temp(`argv-${phase.id}`);
      const needed = requests.externalsNeeded(phase);
      const externalFiles = Object.fromEntries(needed.map((key: string) => [key, { path: path.join(base, 'ext', key), sha256: 'e'.repeat(64) }]));
      const derived = requests.argvForRequest(request({ base, phase: phase.id, requestIndex: phase.order, externalFiles }));
      // Exactly the phases that read the pinned authority receive it as an argument, and nothing else carries a path.
      expect(derived.args.some((item: string) => item.startsWith('--release-authority='))).toBe(phase.script === 'integrity' || phase.script === 'report');
      expect(path.basename(derived.program)).toBe('electron.exe');
      expect(derived.args[0]).toMatch(/validation[\\/]a9-batch2-(package-integrity|smoke|report)\.cjs$/);
      expect(derived.args).toContain(`--phase=${phase.id}`);
      expect(derived.args.some((item: string) => /^--(command|exec|shell)=/.test(item))).toBe(false);
    }
  });

  test('a report request must carry the pinned authority and hands it to the report script', () => {
    const base = temp('report-argv');
    const authority = { path: path.join(base, 'ext', 'release-authority.json'), sha256: 'e'.repeat(64) };
    expect(() => request({ base, phase: 'p09-report', requestIndex: 9, externalFiles: {} })).toThrow(/EXTERNAL_RELEASE_AUTHORITY/);
    const good = request({ base, phase: 'p09-report', requestIndex: 9, externalFiles: { release_authority: authority } });
    const argv = requests.argvForRequest(good);
    expect(argv.args[0]).toBe(path.join(good.candidate_root, 'validation', 'a9-batch2-report.cjs'));
    expect(argv.args).toContain(`--release-authority=${authority.path}`);
    expect(argv.args).toContain(`--release-authority-sha256=${'e'.repeat(64)}`);
    expect(requests.argvForRequest(request({ base, phase: 'p10-postflight', requestIndex: 10 })).args.some((item: string) => item.startsWith('--release-authority'))).toBe(false);
    expect(() => request({ base, phase: 'p09-report', requestIndex: 9, externalFiles: { release_authority: { path: path.join(base, 'candidate', 'a.json'), sha256: 'e'.repeat(64) } } })).toThrow(/INSIDE_CANDIDATE/);
    expect(() => request({ base, phase: 'p09-report', requestIndex: 9, externalFiles: { release_authority: { ...authority, sha256: '1'.repeat(64) } } })).toThrow(/AUTHORITY_PIN_MISMATCH/);
  });

  test('bindings, target and external entries are closed to unknown keys', () => {
    const good = request();
    const redigest = (value: any) => ({ ...value, digest: requests.requestDigest(value) });
    expect(requests.structuralProblems(redigest({ ...good, bindings: { ...good.bindings, command: 'cmd /c calc' } }))).toContain('BINDING_UNKNOWN_FIELD:command');
    expect(requests.structuralProblems(redigest({ ...good, target: { ...good.target, command: 'cmd /c calc' } }))).toContain('TARGET_UNKNOWN_FIELD:command');
    expect(requests.structuralProblems(redigest({ ...good, external_files: { release_authority: { path: path.join(os.tmpdir(), 'a.json'), sha256: 'e'.repeat(64), command: 'x' } } })))
      .toContain('EXTERNAL_UNKNOWN_FIELD:release_authority.command');
  });

  test('consuming claims the attempt directory exclusively, so a second consumer of the same request stops', () => {
    const first = request();
    const root = first.evidence_root;
    const attempt = requests.consumeRequest(first, root);
    expect(fs.existsSync(path.join(attempt, 'request.json'))).toBe(true);
    expect(() => requests.consumeRequest(first, root)).toThrow(/A9_BATCH2_REQUEST_ALREADY_CLAIMED/);
    expect(requests.readLedger(root).filter((entry: any) => entry.state === 'CONSUMED')).toHaveLength(1);
    // A claim left behind without a ledger entry keeps that request index closed instead of being reused.
    const orphan = request();
    fs.mkdirSync(requests.attemptDirectory(orphan.evidence_root, 1, 'p01-env'), { recursive: true });
    expect(() => requests.consumeRequest(orphan, orphan.evidence_root)).toThrow(/ALREADY_CLAIMED/);
    expect(requests.readLedger(orphan.evidence_root)).toEqual([]);
  });

  test('a request refused before it is recorded releases its claim, so the right request can still use that index', () => {
    const base = temp('release-claim');
    const good = request({ base });
    const root = good.evidence_root;
    // Index 3 while nothing is consumed is out of order; the refusal must not leave a claim that closes index 3.
    const early = request({ base, phase: 'p03-chain', requestIndex: 3 });
    expect(() => requests.consumeRequest(early, root)).toThrow(/A9_BATCH2_REQUEST_INDEX_NOT_NEXT/);
    expect(fs.existsSync(requests.attemptDirectory(root, 3, 'p03-chain'))).toBe(false);
    expect(requests.readLedger(root)).toEqual([]);
    // The in-order request still goes through; the refused index stays free for its turn.
    expect(fs.existsSync(path.join(requests.consumeRequest(good, root), 'request.json'))).toBe(true);
  });

  test('another claim on the same index, even for a different phase, stops the consumer and leaves no claim of its own', () => {
    const base = temp('index-claim');
    const first = request({ base });
    const root = first.evidence_root;
    // A claim of index 1 for another phase (a rival, or a crash leftover) already exists.
    fs.mkdirSync(requests.attemptDirectory(root, 1, 'p02-integrity'), { recursive: true });
    expect(() => requests.consumeRequest(first, root)).toThrow(/A9_BATCH2_REQUEST_ALREADY_CLAIMED/);
    expect(fs.existsSync(requests.attemptDirectory(root, 1, 'p01-env'))).toBe(false);
    expect(requests.readLedger(root)).toEqual([]);
  });

  test('two processes consuming one index for different phases at the same moment never both win', async () => {
    const base = temp('index-race');
    const one = request({ base });
    const two = request({ base, phase: 'p03-chain', requestIndex: 1 });
    const files = [one, two].map((req, i) => {
      const file = path.join(base, `race-${i}.json`);
      fs.writeFileSync(file, JSON.stringify(req));
      return file;
    });
    const startAt = Date.now() + 2000;
    const run = (file: string) => new Promise<number>((resolve) => {
      const script = `const r=require(${JSON.stringify(path.join(releaseDir, 'a9-batch2-desktop-request.cjs'))});`
        + `const q=JSON.parse(require('fs').readFileSync(${JSON.stringify(file)},'utf8'));while(Date.now()<${startAt}){}`
        + 'try{r.consumeRequest(q,q.evidence_root);process.exit(0)}catch(e){process.exit(3)}';
      childProcess.spawn(process.execPath, ['-e', script], { stdio: 'ignore' }).on('exit', (code) => resolve(code === null ? -1 : code));
    });
    const codes = await Promise.all(files.map(run));
    const wins = codes.filter((code) => code === 0).length;
    // Both backing off is allowed (fail closed); both winning is the defect.
    expect(wins).toBeLessThanOrEqual(1);
    expect(codes.every((code) => code === 0 || code === 3)).toBe(true);
    const consumedEntries = requests.readLedger(one.evidence_root).filter((entry: any) => entry.state === 'CONSUMED');
    expect(consumedEntries).toHaveLength(wins);
  }, 30_000);

  test('the report verifier requires exactly the closed list of negative controls', () => {
    expect(report.REQUIRED_NEGATIVES).toEqual(['NEG-WRONG-PIN', 'NEG-WRONG-CANDIDATE', 'NEG-MISSING-EVIDENCE', 'NEG-EDITED-EVIDENCE', 'NEG-EDITED-REPORT',
      'NEG-STRIPPED-OBSERVATION', 'NEG-REPLAYED-REQUEST', 'NEG-ORPHAN-COMPLETION']);
    expect(Object.isFrozen(report.REQUIRED_NEGATIVES)).toBe(true);
    expect(new Set(report.REQUIRED_NEGATIVES).size).toBe(report.REQUIRED_NEGATIVES.length);
  });

  test('two processes consuming the same request at the same moment cannot both win', async () => {
    const req = request();
    const requestFile = path.join(path.dirname(req.evidence_root), 'race-request.json');
    fs.mkdirSync(path.dirname(requestFile), { recursive: true });
    fs.writeFileSync(requestFile, JSON.stringify(req));
    const startAt = Date.now() + 2000;
    const script = `const r=require(${JSON.stringify(path.join(releaseDir, 'a9-batch2-desktop-request.cjs'))});`
      + `const q=JSON.parse(require('fs').readFileSync(${JSON.stringify(requestFile)},'utf8'));while(Date.now()<${startAt}){}`
      + 'try{r.consumeRequest(q,q.evidence_root);process.exit(0)}catch(e){process.stderr.write(String(e.message));process.exit(3)}';
    const run = () => new Promise<number>((resolve) => {
      const child = childProcess.spawn(process.execPath, ['-e', script], { stdio: 'ignore' });
      child.on('exit', (code) => resolve(code === null ? -1 : code));
    });
    const codes = await Promise.all([run(), run()]);
    expect(codes.slice().sort()).toEqual([0, 3]);
    expect(requests.readLedger(req.evidence_root).filter((entry: any) => entry.state === 'CONSUMED')).toHaveLength(1);
  }, 30_000);

  test('a completion needs its own consumption, happens once and a PASS needs a PASS result file', () => {
    const req = request();
    const root = req.evidence_root;
    expect(() => requests.completeRequest(req, root, 'FAIL', 'X')).toThrow(/A9_BATCH2_LEDGER_NOT_CONSUMED/);
    const attempt = requests.consumeRequest(req, root);
    expect(() => requests.completeRequest({ ...req, digest: 'f'.repeat(64) }, root, 'FAIL', 'X')).toThrow(/NOT_CONSUMED/);
    fs.writeFileSync(path.join(attempt, 'phase-result.json'), JSON.stringify({ status: 'FAIL' }));
    expect(() => requests.completeRequest(req, root, 'PASS')).toThrow(/A9_BATCH2_LEDGER_RESULT_NOT_PASS/);
    fs.writeFileSync(path.join(attempt, 'phase-result.json'), JSON.stringify({ status: 'PASS' }));
    requests.completeRequest(req, root, 'PASS');
    expect(() => requests.completeRequest(req, root, 'PASS')).toThrow(/A9_BATCH2_LEDGER_ALREADY_COMPLETED/);
    expect(requests.readLedger(root).map((entry: any) => entry.state)).toEqual(['CONSUMED', 'COMPLETED']);
  });

  test('the report verifier rejects a completion that no consumed request produced', () => {
    const root = temp('orphan');
    const authorityFile = path.join(root, 'authority.json');
    const body = JSON.stringify({ kind: 'WIN7_45_RELEASE_AUTHORITY', status: 'APPROVED_FOR_WIN7_45_VALIDATION', run_id: RUN_ID,
      candidate: { source_commit: 'a'.repeat(40), package_sha256: 'b'.repeat(64), manifest_sha256: 'c'.repeat(64), kit_sha256: 'd'.repeat(64) } });
    fs.writeFileSync(authorityFile, body);
    fs.writeFileSync(path.join(root, requests.LEDGER_FILE), `${JSON.stringify(completed(1, 'p01-env'))}\n`);
    const io = { exists: (file: string) => fs.existsSync(file), readFile: (file: string) => fs.readFileSync(file) };
    const verdict = report.verifyRun(io, { runRoot: root, authorityPath: authorityFile, authoritySha256: sha(body), requireAll: false, through: 'p01-env' });
    expect(verdict.ok).toBe(false);
    expect(verdict.problems).toContain('LEDGER_COMPLETION_ORPHAN');
    // A consumed request with the same index, phase, run and digest is accepted as the source of the completion.
    fs.writeFileSync(path.join(root, requests.LEDGER_FILE), `${JSON.stringify(consumed(1, 'p01-env'))}\n${JSON.stringify(completed(1, 'p01-env'))}\n`);
    expect(report.verifyRun(io, { runRoot: root, authorityPath: authorityFile, authoritySha256: sha(body), requireAll: false, through: 'p01-env' }).problems).not.toContain('LEDGER_COMPLETION_ORPHAN');
  });

  test('the controller never turns a failed Job query into "not in a Job"', () => {
    const text = fs.readFileSync(path.join(releaseDir, 'a9-batch2-desktop-controller.ps1'), 'utf8');
    expect(text).not.toMatch(/\[void\]\[B2Native\]::IsProcessInJob/);
    expect(text).toMatch(/\$jobQueryOk = \[B2Native\]::IsProcessInJob/);
    expect(text).toMatch(/\$jobText = 'unknown'/);
    expect(text).toMatch(/\$jobJson = 'null'/);
    // The request script reads anything but the words true and false as null, which never equals the approved boolean.
    const first = request();
    const requestFile = path.join(path.dirname(first.evidence_root), 'job-request.json');
    fs.mkdirSync(path.dirname(requestFile), { recursive: true });
    fs.writeFileSync(requestFile, JSON.stringify(first));
    const identity = ['--actual-machine-name=TEST-ONLY-HOST', '--actual-account-sid=S-1-5-21-1-2-3-1001', '--actual-integrity-level=Medium', '--actual-session-id=1', '--actual-elevated=false'];
    expect(requests.main(['verify', `--request=${requestFile}`, ...identity, '--actual-in-job=false'])).toEqual({ ok: true });
    const unknown = requests.main(['verify', `--request=${requestFile}`, ...identity, '--actual-in-job=unknown']);
    expect(unknown.ok).toBe(false);
    expect(unknown.problems).toContain('TARGET_MISMATCH:in_job');
    // The refusal shows what was observed, so an unknown value is visible next to the approved boolean.
    expect(unknown.actual_target).toMatchObject({ machine_name: 'TEST-ONLY-HOST', session_id: 1, elevated: false, in_job: null });
  });

  test('the controller retries a failed Job query, keeps the attempts and the Win32 error, and never reports a failed query as false', () => {
    const text = fs.readFileSync(path.join(releaseDir, 'a9-batch2-desktop-controller.ps1'), 'utf8');
    expect(text).toMatch(/while \(\(-not \$jobQueryOk\) -and \(\$jobAttempts -lt 5\)\)/);
    expect(text).toMatch(/\$jobQueryOk = \[B2Native\]::IsProcessInJob\(\$jobHandle, \[IntPtr\]::Zero, \[ref\]\$inJob\)/);
    expect(text).toContain('[B2Native]::GetCurrentProcess()');
    expect(text).toContain('GetLastWin32Error()');
    // After the loop only a successful query yields a boolean word; every other outcome is the word unknown.
    expect(text).toMatch(/if \(\$jobQueryOk\) \{ \$jobText = \$inJob\.ToString\(\)\.ToLower\(\) \} else \{ \$jobText = 'unknown' \}/);
    expect(text).toContain('"in_job_attempts":');
    expect(text).toContain('"in_job_last_error":');
    // A refusal prints the observed identity, including the attempts and the last error.
    expect(text).toMatch(/The request was refused: ' \+ \$derived\.Out \+ \$derived\.Err \+ ' actual_identity: '/);
    expect(text).toContain("' in_job_attempts=' + $identity.InJobAttempts");
    expect(/[^\x00-\x7f]/.test(text)).toBe(false);
    expect(text.includes('\r')).toBe(false);
  });

  test('verification refuses replay, wrong order, missing prerequisites, expiry and identity drift', () => {
    const first = request();
    expect(requests.verifyRequest(first, { now: new Date(), runId: RUN_ID, ledger: [] })).toEqual({ ok: true, problems: [] });
    const replay = requests.verifyRequest(first, { now: new Date(), ledger: [{ ...consumed(1, 'p01-env'), digest: first.digest }, completed(1, 'p01-env')] });
    expect(replay.problems).toEqual(expect.arrayContaining(['REPLAYED', 'REQUEST_INDEX_NOT_NEXT']));
    const second = request({ phase: 'p02-integrity', requestIndex: 2, externalFiles: Object.fromEntries(['package_zip', 'formal_input_lock', 'approval_registry', 'release_authority'].map((key) => [key, { path: path.join(os.tmpdir(), 'ext', key), sha256: 'e'.repeat(64) }])) });
    expect(requests.verifyRequest(second, { now: new Date(), ledger: [consumed(1, 'p01-env'), completed(1, 'p01-env', 'FAIL', 'ENV')] }).problems).toContain('PREREQUISITE_NOT_PASSED:p01-env');
    expect(requests.verifyRequest(second, { now: new Date(), ledger: [consumed(1, 'p01-env')] }).problems).toContain('PREVIOUS_REQUEST_NOT_COMPLETED');
    expect(requests.verifyRequest(first, { now: new Date(Date.parse(first.expires_at) + 1000), ledger: [] }).problems).toContain('EXPIRED');
    expect(requests.verifyRequest(first, { now: new Date(Date.parse(first.issued_at) - 60000), ledger: [] }).problems).toContain('NOT_YET_VALID');
    expect(requests.verifyRequest(first, { now: new Date(), runId: 'other-run', ledger: [] }).problems).toContain('RUN_ID_MISMATCH');
    expect(requests.verifyRequest(first, { now: new Date(), ledger: [{ ...consumed(1, 'p01-env'), run_id: '11111111-1111-4111-8111-111111111111' }] }).problems).toContain('LEDGER_RUN_ID_MISMATCH');
    const actual = (target: any) => requests.verifyRequest(first, { now: new Date(), ledger: [], actual: { target, manifestSha256: 'c'.repeat(64), kitSha256: 'd'.repeat(64), packageSha256: 'b'.repeat(64) } }).problems;
    expect(actual({ ...TARGET })).toEqual([]);
    expect(actual({ ...TARGET, in_job: true })).toContain('TARGET_MISMATCH:in_job');
    expect(actual({ ...TARGET, account_sid: 'S-1-5-21-9-9-9-1' })).toContain('TARGET_MISMATCH:account_sid');
    expect(actual({ ...TARGET, elevated: true })).toContain('TARGET_MISMATCH:elevated');
    expect(requests.verifyRequest(first, { now: new Date(), ledger: [], actual: { manifestSha256: '0'.repeat(64) } }).problems).toContain('MANIFEST_HASH_MISMATCH');
    // The request count and the wall-clock budget are hard limits.
    const full = Array.from({ length: 16 }, (_, i) => [consumed(i + 1, 'p01-env'), completed(i + 1, 'p01-env')]).flat();
    expect(requests.verifyRequest(request({ requestIndex: 16 }), { now: new Date(), ledger: full }).problems).toContain('REQUEST_CAP_REACHED');
    const late = [consumed(1, 'p01-env', new Date(Date.now() - (fixtures.LIMITS.max_wall_seconds + 100) * 1000).toISOString()), completed(1, 'p01-env')];
    expect(requests.verifyRequest(request({ requestIndex: 2 }), { now: new Date(), ledger: late }).problems).toContain('WALL_TIME_EXCEEDED');
  });

  test('two failures of the same class stop the run until the cause is written', () => {
    const fails = [consumed(1, 'p01-env'), completed(1, 'p01-env', 'FAIL', 'ENV_UNKNOWN'), consumed(2, 'p01-env'), completed(2, 'p01-env', 'FAIL', 'ENV_UNKNOWN')];
    expect(requests.sameClassFailureTwice(fails)).toBe(true);
    expect(requests.verifyRequest(request({ requestIndex: 3 }), { now: new Date(), ledger: fails }).problems).toContain('SAME_CLASS_FAILURE_TWICE_DIAGNOSE_FIRST');
    const mixed = [...fails.slice(0, 3), completed(2, 'p01-env', 'FAIL', 'OTHER')];
    expect(requests.sameClassFailureTwice(mixed)).toBe(false);
    expect(requests.sameClassFailureTwice([completed(1, 'p01-env', 'PASS'), completed(2, 'p02-integrity', 'FAIL', 'X')])).toBe(false);
  });

  test('the ledger only appends, and a result is hashed into the completion entry', () => {
    const run = request();
    const evidenceRoot = run.evidence_root;
    const attempt = requests.consumeRequest(run, evidenceRoot, new Date('2026-10-12T00:00:00Z'));
    expect(attempt).toBe(requests.attemptDirectory(evidenceRoot, 1, 'p01-env'));
    expect(JSON.parse(fs.readFileSync(path.join(attempt, 'request.json'), 'utf8')).digest).toBe(run.digest);
    expect(requests.readLedger(evidenceRoot)).toHaveLength(1);
    // PASS needs the result file; FAIL does not.
    expect(() => requests.completeRequest(run, evidenceRoot, 'PASS', '')).toThrow(/RESULT_FILE_MISSING/);
    expect(requests.derivedResult(run, evidenceRoot, 0)).toEqual({ result: 'FAIL', failureClass: 'PHASE_RESULT_MISSING' });
    const resultFile = path.join(attempt, 'phase-result.json');
    fs.writeFileSync(resultFile, JSON.stringify({ status: 'PASS' }));
    expect(requests.derivedResult(run, evidenceRoot, 0)).toEqual({ result: 'PASS', failureClass: '' });
    expect(requests.derivedResult(run, evidenceRoot, 3)).toEqual({ result: 'FAIL', failureClass: 'EXIT_CODE_MISMATCH' });
    fs.writeFileSync(resultFile, JSON.stringify({ status: 'NOT_PERFORMED', failure_class: 'INCOMPLETE' }));
    expect(requests.derivedResult(run, evidenceRoot, 0)).toEqual({ result: 'FAIL', failureClass: 'INCOMPLETE' });
    fs.writeFileSync(resultFile, JSON.stringify({ status: 'PASS' }));
    requests.completeRequest(run, evidenceRoot, 'PASS', '');
    const ledger = requests.readLedger(evidenceRoot);
    expect(ledger.map((entry: any) => entry.state)).toEqual(['CONSUMED', 'COMPLETED']);
    expect(ledger[1].result_sha256).toBe(sha(fs.readFileSync(resultFile)));
    expect(() => requests.completeRequest(run, evidenceRoot, 'MAYBE', '')).toThrow(/RESULT_INVALID/);
    fs.appendFileSync(path.join(evidenceRoot, requests.LEDGER_FILE), 'not json\n');
    expect(() => requests.readLedger(evidenceRoot)).toThrow(/LEDGER_CORRUPT/);
  });

  test('the command line derives a result from the phase file and refuses a stale request', () => {
    const run = request();
    const file = path.join(temp('cli'), 'request.json');
    fs.writeFileSync(file, JSON.stringify(run));
    const asked = (...args: string[]) => requests.main([...args, `--request=${file}`]);
    expect(asked('verify')).toEqual({ ok: true });
    const verdict = asked('argv', '--manifest-sha256=' + '0'.repeat(64));
    expect(verdict).toMatchObject({ ok: false });
    expect(verdict.problems).toContain('MANIFEST_HASH_MISMATCH');
    const argv = asked('argv', '--manifest-sha256=' + 'c'.repeat(64), '--kit-sha256=' + 'd'.repeat(64));
    expect(argv.lines[0]).toMatch(/electron\.exe$/);
    const consumedResult = asked('consume');
    expect(consumedResult.attempt_directory).toBe(requests.attemptDirectory(run.evidence_root, 1, 'p01-env'));
    // Consumed once means refused the second time.
    expect(asked('consume').problems).toContain('REPLAYED');
    expect(() => requests.main(['unknown', `--request=${file}`])).toThrow(/COMMAND_UNKNOWN/);
    fs.writeFileSync(path.join(consumedResult.attempt_directory, 'phase-result.json'), JSON.stringify({ status: 'PASS' }));
    expect(asked('complete', '--result=auto', '--exit-code=0')).toEqual({ ok: true, result: 'PASS', failure_class: null });
  });
});

describe('A9-33 batch-2 smoke pieces', () => {
  const FACTS = () => ({
    node: { electron: '22.3.27', node: '16.17.1', modules: '110', exec_path: path.join('/candidate', 'electron.exe'), platform: 'win32', arch: 'x64', os_release: '6.1.7601', hostname: 'TEST-ONLY-HOST' },
    ver: 'Microsoft Windows [Version 6.1.7601]', chcp: 'Active code page: 936',
    wmic_os: { version: '6.1.7601', service_pack: 'Service Pack 1', architecture: '64-bit', build: '7601' },
    whoami_user: '"TEST-ONLY\\runner","S-1-5-21-1-2-3-1001"', whoami_groups: '"Mandatory Label\\Medium Mandatory Level","Label","S-1-16-8192","Mandatory group"',
    session_id: 1, powershell_version: '2.0', powershell_codepages: '936,936', hotfixes: ['KB1'], hotfix_command_status: 0, processes_total: 40, stale_processes: [],
    free_bytes: 5 * 1024 * 1024 * 1024, controller_identity: { account_sid: 'S-1-5-21-1-2-3-1001', session_id: 1, elevated: false, in_job: false },
  });
  const status = (list: any[]) => list.map((item) => item.status);

  test('environment assertions pass only on exact facts and keep unknown facts unknown', () => {
    const req = { target: TARGET, evidence_root: '/evidence' };
    expect(status(smoke.evaluateEnvironment(FACTS(), req, '/candidate'))).toEqual(['PASS', 'PASS', 'PASS', 'PASS', 'PASS']);
    const stale = { ...FACTS(), stale_processes: [{ pid: 9, name: 'spike02_helper.exe' }] };
    expect(smoke.evaluateEnvironment(stale, req, '/candidate')[0].status).toBe('FAIL');
    expect(smoke.evaluateEnvironment({ ...FACTS(), controller_identity: null }, req, '/candidate')[1].status).toBe('UNKNOWN');
    expect(smoke.evaluateEnvironment({ ...FACTS(), controller_identity: { ...FACTS().controller_identity, in_job: true } }, req, '/candidate')[1].status).toBe('FAIL');
    expect(smoke.evaluateEnvironment({ ...FACTS(), controller_identity: { ...FACTS().controller_identity, elevated: true } }, req, '/candidate')[1].status).toBe('FAIL');
    expect(smoke.evaluateEnvironment({ ...FACTS(), node: { ...FACTS().node, arch: 'ia32' } }, req, '/candidate')[0].status).toBe('FAIL');
    expect(smoke.evaluateEnvironment({ ...FACTS(), node: { ...FACTS().node, electron: '23.0.0' } }, req, '/candidate')[2].status).toBe('FAIL');
    expect(smoke.evaluateEnvironment({ ...FACTS(), powershell_version: null }, req, '/candidate')[3].status).toBe('UNKNOWN');
    expect(smoke.evaluateEnvironment({ ...FACTS(), free_bytes: null }, req, '/candidate')[4].status).toBe('UNKNOWN');
    expect(smoke.evaluateEnvironment({ ...FACTS(), free_bytes: 10 }, req, '/candidate')[4].status).toBe('FAIL');
    expect(smoke.evaluateEnvironment(FACTS(), { target: TARGET, evidence_root: '/candidate/evidence' }, '/candidate')[4].status).toBe('FAIL');
    expect(smoke.evaluateEnvironment({ ...FACTS(), ver: '' }, req, '/candidate')[0].status).toBe('UNKNOWN');
  });

  test('parsers read wmic CSV, whoami output and integrity labels', () => {
    expect(smoke.parseCsvLine('a,"b,c","d""e"')).toEqual(['a', 'b,c', 'd"e']);
    const rows = smoke.parseWmicCsv('\r\r\nNode,Name,ProcessId\r\r\nHOST,electron.exe,12\r\r\nHOST,"a,b.exe",13\r\r\n');
    expect(rows).toEqual([{ Node: 'HOST', Name: 'electron.exe', ProcessId: '12' }, { Node: 'HOST', Name: 'a,b.exe', ProcessId: '13' }]);
    expect(smoke.parseWmicCsv('')).toEqual([]);
    expect(smoke.parseWhoamiSid('"DOM\\user","S-1-5-21-1-2-3-1001"\r\n')).toEqual({ account: 'DOM\\user', sid: 'S-1-5-21-1-2-3-1001' });
    expect(smoke.parseIntegrity('x S-1-16-12288 y')).toBe('High');
    expect(smoke.parseIntegrity('S-1-16-4096')).toBe('Low');
    expect(smoke.parseIntegrity('nothing')).toBeNull();
  });

  test('the environment collector walks up its own parents and counts only foreign trees as stale', () => {
    const csv = [
      'Node,CreationDate,ExecutablePath,Name,ParentProcessId,ProcessId,SessionId',
      'H,1,C:\\run\\cand\\electron.exe,electron.exe,5,100,1',
      'H,1,C:\\Windows\\cmd.exe,cmd.exe,1,5,1',
      'H,1,C:\\run\\cand\\electron.exe,electron.exe,1,200,1',
      'H,1,C:\\elsewhere\\spike02_helper.exe,spike02_helper.exe,1,300,1',
      'H,1,C:\\Windows\\notepad.exe,notepad.exe,1,400,1',
    ].join('\r\n');
    const exec = (name: string) => (name === 'wmic_process_commands' ? commandLineList() : { status: 0, stdout: name === 'wmic_processes' ? csv : name === 'ver' ? 'Microsoft Windows [Version 6.1.7601]' : '', stderr: '', error: null });
    const facts = smoke.collectEnvironment(exec, { pid: 100, watchedRoots: ['C:\\run\\cand'], freeBytes: 1, controllerIdentity: null });
    expect(facts.stale_processes.map((item: any) => item.pid).sort()).toEqual([200, 300]);
    expect(facts.session_id).toBe(1);
    expect(facts.processes_total).toBe(5);
    // A throwing command becomes an error result, never a crash or a pass.
    const broken = smoke.collectEnvironment(() => { throw new Error('boom'); }, { pid: 1, watchedRoots: [], freeBytes: 0 });
    expect(broken.ver).toBe('');
    expect(broken.stale_processes).toEqual([]);
    expect(() => smoke.realExec('rm -rf')).toThrow(/COMMAND_NOT_ALLOWED/);
    expect(Object.keys(smoke.FIXED_COMMANDS).sort()).toEqual(['chcp', 'powershell_codepages', 'powershell_version', 'ver', 'whoami_groups', 'whoami_user', 'wmic_hotfix', 'wmic_os', 'wmic_process_commands', 'wmic_processes']);
    // The command-line query is fixed: two columns, list format, no filter (a filter would need quoting; rehearsal 11 R1 ran exactly this).
    expect(smoke.FIXED_COMMANDS.wmic_process_commands).toEqual({ file: 'wmic.exe', args: ['process', 'get', 'ProcessId,CommandLine', '/format:list'] });
  });

  test('the secret scan sees the split secret after joining, and its positive control must fire', () => {
    const secret = fixtures.testOnlySecret();
    expect(smoke.scanBytesForSecrets(Buffer.from(`x ${secret}`), [])).toEqual(['api-key-prefix']);
    expect(smoke.scanBytesForSecrets(Buffer.from('plain text'), [secret])).toEqual([]);
    expect(smoke.scanBytesForSecrets(Buffer.from(`x ${secret.slice(0, 12)}`), [secret])).toEqual([]);
    expect(smoke.scanBytesForSecrets(Buffer.from(['Authorization:', ' Bearer ', 'abcdefghijklmnop', '0123456789'].join('')), [])).toEqual(['bearer-token']);
    const root = temp('scan');
    fs.writeFileSync(path.join(root, 'clean.txt'), 'nothing here');
    fs.writeFileSync(path.join(root, 'image.png'), Buffer.from(secret));
    const clean = smoke.scanRun(root, secret);
    expect(clean).toMatchObject({ positive_control_detected: true, files_scanned: 1 });
    expect(clean.findings).toEqual([]);
    fs.mkdirSync(path.join(root, 'sub'));
    fs.writeFileSync(path.join(root, 'sub', 'leak.log'), `token ${secret}`);
    const dirty = smoke.scanRun(root, secret);
    expect(dirty.findings.map((item: any) => item.file)).toEqual([path.join('sub', 'leak.log')]);
    // Without the configured literal the control cannot fire, and the scan says so instead of passing silently.
    expect(smoke.scanRun(root, '').positive_control_detected).toBe(false);
  });

  test('the api-key-prefix pattern needs a left boundary so task ids and binary symbol names are not secrets (rehearsal 8, p10)', () => {
    const secret = fixtures.testOnlySecret();
    // Shapes that rehearsal 8 reported as findings: a task id inside JSON evidence and Vulkan symbol names in an Electron binary.
    const taskId = `task-${'1791978065779'}-vt8baz`;
    const symbols = ['SubgroupEqMask-SubgroupEqMask-04370', 'VkPipelineLayoutMask-commandBuffer-parameter'];
    const oldPattern = /sk-[A-Za-z0-9_-]{20,}/;
    expect(oldPattern.test(taskId)).toBe(true);
    for (const symbol of symbols) expect(oldPattern.test(symbol)).toBe(true);
    expect(smoke.scanBytesForSecrets(Buffer.from(`{"taskId": "${taskId}", "linked_task": "${taskId}"}`), [])).toEqual([]);
    expect(smoke.scanBytesForSecrets(Buffer.from(`k=${taskId}`), [])).toEqual([]);
    for (const symbol of symbols) expect(smoke.scanBytesForSecrets(Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(symbol), Buffer.from([0])]), [])).toEqual([]);
    // A letter or a digit directly before "sk-" keeps it out; every other predecessor still counts as a key start.
    for (const before of ['a', 'Z', '9']) expect(smoke.scanBytesForSecrets(Buffer.from(`${before}${secret}`), [])).toEqual([]);
    const starts = ['', ' ', '"', "'", '=', ':', '\n', '\0', 'Bearer ', 'key_', 'x-'];
    for (const before of starts) expect(smoke.scanBytesForSecrets(Buffer.from(`${before}${secret}`), [])).toEqual(['api-key-prefix']);
    expect(smoke.scanBytesForSecrets(Buffer.concat([Buffer.from([0xe9]), Buffer.from(secret)]), [])).toEqual(['api-key-prefix']);
    expect(smoke.scanBytesForSecrets(Buffer.from(`{"apiKey":"${secret}"}`), [])).toEqual(['api-key-prefix']);
    // The length floor is exactly 20 characters after the prefix.
    expect(smoke.scanBytesForSecrets(Buffer.from(` sk-${'A'.repeat(20)}`), [])).toEqual(['api-key-prefix']);
    expect(smoke.scanBytesForSecrets(Buffer.from(` sk-${'A'.repeat(19)}`), [])).toEqual([]);
    // A real key later in a text that also holds a task id is still found.
    expect(smoke.scanBytesForSecrets(Buffer.from(`${taskId} ${secret}`), [])).toEqual(['api-key-prefix']);
    // The configured literal does not depend on the boundary.
    expect(smoke.scanBytesForSecrets(Buffer.from(`a${secret}`), [secret])).toEqual(['configured-secret-literal']);
    const root = temp('scan-boundary');
    fs.writeFileSync(path.join(root, 'events.json'), `{"taskId": "${taskId}"}`);
    fs.writeFileSync(path.join(root, 'runtime.dll'), Buffer.concat([Buffer.from([0x4d, 0x5a, 0]), Buffer.from(symbols.join('\0'))]));
    const clean = smoke.scanRun(root, secret);
    expect(clean).toMatchObject({ positive_control_detected: true, files_scanned: 2 });
    expect(clean.findings).toEqual([]);
    fs.writeFileSync(path.join(root, 'leak.log'), `token="${secret}"`);
    const dirty = smoke.scanRun(root, secret);
    expect(dirty.findings.map((item: any) => item.file)).toEqual(['leak.log']);
  });

  test('the api-key-prefix scan judges the character before a key after undoing JSON, hex and URL layers, and keeps the full key charset (codex rounds 7, 8 and 9)', () => {
    const secret = fixtures.testOnlySecret();
    // A key that is not the configured one, so only the pattern can report it. "_" and "-" sit inside its first 20 characters.
    const other = `sk-${'Q'.repeat(8)}_${'r'.repeat(8)}-${'7'.repeat(8)}`;
    const taskId = `task-${'1791978065779'}-vt8baz`;
    const symbols = ['SubgroupEqMask-SubgroupEqMask-04370', 'VkPipelineLayoutMask-commandBuffer-parameter'];
    const found = (text: string) => smoke.scanBytesForSecrets(Buffer.from(text), []);
    // N1: JSON.stringify writes control characters as \n \t \r \f \b \u00XX, so the byte before the key is a letter or a digit.
    for (const control of ['\n', '\t', '\r', '\f', '\b', '\u0000', '\u001b']) {
      const json = JSON.stringify({ message: `${control}${other}` });
      expect(json).not.toContain(control);
      expect(found(json)).toEqual(['api-key-prefix']);
    }
    // Escaped twice, as a JSON text held inside a JSON string.
    expect(found(JSON.stringify(JSON.stringify(`\n${other}`)))).toEqual(['api-key-prefix']);
    expect(found(JSON.stringify(JSON.stringify({ message: `\t${other}` })))).toEqual(['api-key-prefix']);
    // URL percent-encoding, hex escapes and unicode escapes.
    // The last two build the escape of a line feed from two escapes: the run is decoded through every lead-in in it, not only the last one.
    for (const before of ['%20', '%0A', '%0d', '%7C', '\\x0a', '\\x1B', '\\u000a', '\\u00E9', '\\n', '\\t', '\\r', '\\f', '\\b', '%5C%6E', '\\x5c\\x6e']) {
      expect(found(`q=${before}${other}`)).toEqual(['api-key-prefix']);
    }
    // A predecessor that is not a complete escape is still a word: one hex digit, an unknown escape letter, a bare letter or digit.
    for (const before of ['%2', '\\u00e', '\\x0', '\\d', '\\q', 'n', 't', 'content', 'ab12', 'u0000', 'x0a', 'g', 'Z', 'q', 'zz', '%g', '\\g']) {
      expect(found(`${before}${other}`)).toEqual([]);
    }
    // Task ids and binary symbol names stay out, also directly behind an escape.
    expect(found(JSON.stringify({ message: `\n${taskId}`, other: `\t${taskId}` }))).toEqual([]);
    expect(found(`q=%20${taskId}`)).toEqual([]);
    for (const symbol of symbols) expect(found(JSON.stringify({ symbol: `\u0000${symbol}` }))).toEqual([]);
    // A task id and a real key in one text: the key is found.
    expect(found(JSON.stringify({ message: `\n${taskId}\n${other}` }))).toEqual(['api-key-prefix']);
    // N2: the key body may hold "_" and "-" inside its first 20 characters, so both belong to the charset.
    expect(found(` sk-${'A'.repeat(10)}_${'B'.repeat(10)}`)).toEqual(['api-key-prefix']);
    expect(found(` sk-${'A'.repeat(10)}-${'B'.repeat(10)}`)).toEqual(['api-key-prefix']);
    expect(found(` sk-${'A'.repeat(10)}.${'B'.repeat(10)}`)).toEqual([]);
    // Round 8, N3: serializers stacked on each other. The key stays readable and only the character before it hides behind layers.
    const url = (text: string) => encodeURIComponent(text);
    const json = (text: string) => JSON.stringify({ message: text });
    const layered: Array<[string, string]> = [
      ['URL of JSON LF', url(json(`\n${other}`))],
      ['URL of inspect ESC', url(util.inspect({ message: `\x1b${other}` }))],
      ['URL of URL LF', `q=${url(url(`\n${other}`))}`],
      ['URL of URL space', `q=${url(url(` ${other}`))}`],
      ['JSON of URL of URL LF', JSON.stringify({ url: url(url(`\n${other}`)) })],
      ['JSON of URL of JSON LF', JSON.stringify({ url: url(json(`\n${other}`)) })],
      ['URL x3 of JSON NUL (12 characters before the key)', url(url(url(json(`\0${other}`))))],
      ['URL x3 of JSON LF (four decoding layers)', url(url(url(json(`\n${other}`))))],
      ['JSON x3 of LF', JSON.stringify(JSON.stringify(JSON.stringify(`\n${other}`)))],
      ['upper case unicode escape', `x\\u000A${other}`],
    ];
    for (const [name, text] of layered) expect({ name, hits: found(text) }).toEqual({ name, hits: ['api-key-prefix'] });
    // Round 8, N4: an escape that decodes to a letter or a digit is a word character, as in the plain letter before the key.
    for (const before of ['%61', '%41', '%39', '\\u0061', '\\x61', '\\u0039', '%2561']) expect({ before, hits: found(`q=${before}${other}`) }).toEqual({ before, hits: [] });
    // Composition: up to three layers of the suite's serializers over one character and the key. The answer follows the character that
    // sits right before the key after all layers are undone: a control, separator or non-ASCII character reports, a letter or digit does not.
    const serializers: Record<string, (text: string) => string> = {
      J: (text) => JSON.stringify(text),
      O: (text) => JSON.stringify({ message: text }),
      U: (text) => encodeURIComponent(text),
      I: (text) => util.inspect(text),
      P: (text) => util.inspect({ message: text }),
    };
    const sequences: string[][] = [[]];
    for (let depth = 1; depth <= 3; depth += 1) {
      for (const previous of sequences.filter((sequence) => sequence.length === depth - 1)) for (const name of Object.keys(serializers)) sequences.push(previous.concat(name));
    }
    const separators = ['\n', '\t', '\r', '\f', '\b', '\0', '\x1b', '\x7f', '\x0b', ' ', '"', "'", '=', ':', '/', '\\', '%', '\u00e9', '\u4e2d', '\u2028'];
    const wordCharacters = ['a', 'Z', '9', 't', 'n'];
    const wrong: string[] = [];
    for (const sequence of sequences) {
      for (const [character, expected] of [...separators.map((value) => [value, true]), ...wordCharacters.map((value) => [value, false])] as Array<[string, boolean]>) {
        let text = `${character}${other}`;
        for (const name of sequence) text = serializers[name](text);
        if (found(text).includes('api-key-prefix') !== expected) wrong.push(`${sequence.join('>') || 'plain'} ${JSON.stringify(character)} expected=${expected}`);
      }
    }
    expect(sequences).toHaveLength(156);
    expect(wrong).toEqual([]);
    // Exactly six decoding layers resolve: a letter under six URL layers is a word character, under seven the scan reports (codex round 9, N8).
    const urlTimes = (text: string, times: number) => {
      let value = text;
      for (let layer = 0; layer < times; layer += 1) value = url(value);
      return value;
    };
    const letterUnder = (layers: number) => urlTimes('%61', layers - 1);
    for (const layers of [1, 2, 5, 6]) expect({ layers, hits: found(`q=${letterUnder(layers)}${other}`) }).toEqual({ layers, hits: [] });
    for (const layers of [7, 8, 9]) expect({ layers, hits: found(`q=${letterUnder(layers)}${other}`) }).toEqual({ layers, hits: ['api-key-prefix'] });
    // Round 9, N6: a nested escape is judged whole. From 48 URL layers on, 97 or more characters stand before the key; none of them hides it.
    for (const layers of [1, 6, 7, 8, 47, 48, 49, 50, 60, 100, 300, 511, 512, 600]) {
      expect({ layers, hits: found(urlTimes(`\n${other}`, layers)) }).toEqual({ layers, hits: ['api-key-prefix'] });
    }
    for (const layers of [48, 50, 100]) {
      expect({ layers, hits: found(urlTimes(` ${other}`, layers)) }).toEqual({ layers, hits: ['api-key-prefix'] });
      expect({ layers, hits: found(JSON.stringify({ message: urlTimes(` ${other}`, layers) })) }).toEqual({ layers, hits: ['api-key-prefix'] });
      expect({ layers, hits: found(urlTimes(JSON.stringify({ message: `\n${other}` }), layers)) }).toEqual({ layers, hits: ['api-key-prefix'] });
    }
    // Round 9, N7: layers used up by an unrelated escape elsewhere on the line do not count against the word in front of the key.
    for (const layers of [1, 7, 8, 9, 50]) {
      for (const word of [taskId, ...symbols, `ask-${'A'.repeat(24)}`]) {
        expect({ layers, word, hits: found(JSON.stringify({ url: urlTimes(' ', layers), name: word })) }).toEqual({ layers, word, hits: [] });
      }
      expect({ layers, hits: found(JSON.stringify({ url: urlTimes(' ', layers), message: `\n${other}` })) }).toEqual({ layers, hits: ['api-key-prefix'] });
    }
    // A run of escape characters that is 1024 characters long is not judged and reports; one character shorter is decoded and stays a word.
    expect(found(`.${'a'.repeat(1023)}${other}`)).toEqual([]);
    expect(found(`.${'a'.repeat(1024)}${other}`)).toEqual(['api-key-prefix']);
    expect(found(`${'a'.repeat(1023)}${other}`)).toEqual([]);
    expect(found(`${'a'.repeat(1024)}${other}`)).toEqual(['api-key-prefix']);
    // Accepted over-detection (KL-7 candidate): a Windows directory named like "t" plus "sk-" and a key-length tail is indistinguishable
    // from an escaped tab, in the raw path and in its JSON form alike. The scan errs on the side of reporting.
    expect(found(`C:\\t${other}\\file.log`)).toEqual(['api-key-prefix']);
    expect(found(JSON.stringify({ path: `C:\\t${other}\\file.log` }))).toEqual(['api-key-prefix']);
    // Cost: p10 scans the 150 MB Electron binary in the run root. A pattern that tests the predecessor before the literal "sk-"
    // costs about 70 times the plain literal search; this one must stay within a small multiple of it.
    const filler = Buffer.from('ab12 Cd34-ef_56 '.repeat(2 * 1024 * 1024));
    const best = (run: () => unknown) => {
      let fastest = Infinity;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const started = process.hrtime.bigint();
        run();
        fastest = Math.min(fastest, Number(process.hrtime.bigint() - started) / 1e6);
      }
      return fastest;
    };
    const plainMs = best(() => /sk-[A-Za-z0-9_-]{20,}/.test(filler.toString('latin1')));
    const scanMs = best(() => smoke.scanBytesForSecrets(filler, []));
    expect(scanMs).toBeLessThan(plainMs * 10 + 100);
    // Many candidates that are all rejected: only the run of escape characters before each one may be decoded, never the whole text before it.
    const dense = Buffer.from('ask-AAAAAAAAAAAAAAAAAAAAAAAA '.repeat(20000));
    const denseStarted = process.hrtime.bigint();
    expect(smoke.scanBytesForSecrets(dense, [])).toEqual([]);
    expect(Number(process.hrtime.bigint() - denseStarted) / 1e6).toBeLessThan(1500);
    // Candidates behind long runs of escape characters: the runs of different candidates do not overlap, so the cost stays linear.
    const runs = Buffer.from(`${'a'.repeat(500)}sk-${'a'.repeat(20)}`.repeat(20000));
    const runsStarted = process.hrtime.bigint();
    expect(smoke.scanBytesForSecrets(runs, [])).toEqual([]);
    expect(Number(process.hrtime.bigint() - runsStarted) / 1e6).toBeLessThan(1500);
    // The whole run: an escaped key in an events file is a finding, and no executable or library extension is skipped.
    const root = temp('scan-escape');
    fs.writeFileSync(path.join(root, 'escaped.json'), JSON.stringify({ message: `\n${other}` }));
    for (const name of ['leak.exe', 'leak.dll', 'leak.json', 'leak.txt', 'leak']) {
      fs.writeFileSync(path.join(root, name), Buffer.concat([Buffer.from([0x4d, 0x5a, 0, 0]), Buffer.from(`token=${secret}`)]));
    }
    for (const name of ['skip.png', 'skip.sqlite', 'skip.db', 'skip.ico', 'skip.pak']) fs.writeFileSync(path.join(root, name), Buffer.from(secret));
    // Round 8, N5: hidden files, a hidden directory and a key far beyond the first kilobytes or megabytes are scanned as well.
    fs.writeFileSync(path.join(root, '.hidden.log'), `token=${secret}`);
    fs.mkdirSync(path.join(root, '.dot'));
    fs.writeFileSync(path.join(root, '.dot', 'leak.log'), `token=${secret}`);
    fs.writeFileSync(path.join(root, 'deep.log'), Buffer.concat([Buffer.alloc(2 * 1024 * 1024 + 17, 0x20), Buffer.from(`token=${secret}`)]));
    const scan = smoke.scanRun(root, secret);
    expect(scan.positive_control_detected).toBe(true);
    // A9-39 also scans raw SQLite/database bytes; the two historical skip fixtures must now be findings.
    expect(scan.files_scanned).toBe(11);
    expect([...scan.findings].sort((left: any, right: any) => (left.file < right.file ? -1 : 1))).toEqual([
      { file: path.join('.dot', 'leak.log'), hits: ['api-key-prefix', 'configured-secret-literal'] },
      { file: '.hidden.log', hits: ['api-key-prefix', 'configured-secret-literal'] },
      { file: 'deep.log', hits: ['api-key-prefix', 'configured-secret-literal'] },
      { file: 'escaped.json', hits: ['api-key-prefix'] },
      { file: 'leak', hits: ['api-key-prefix', 'configured-secret-literal'] },
      { file: 'leak.dll', hits: ['api-key-prefix', 'configured-secret-literal'] },
      { file: 'leak.exe', hits: ['api-key-prefix', 'configured-secret-literal'] },
      { file: 'leak.json', hits: ['api-key-prefix', 'configured-secret-literal'] },
      { file: 'leak.txt', hits: ['api-key-prefix', 'configured-secret-literal'] },
      { file: 'skip.db', hits: ['api-key-prefix', 'configured-secret-literal'] },
      { file: 'skip.sqlite', hits: ['api-key-prefix', 'configured-secret-literal'] },
    ]);
  });

  test('suite files hold no literal that the producer payload scan or the encoding rules would reject', () => {
    const sources = ['a9-batch2-fixtures.cjs', 'a9-batch2-desktop-request.cjs', 'a9-batch2-package-integrity.cjs', 'a9-batch2-report.cjs', 'a9-batch2-smoke.cjs',
      'a9-batch2-desktop-controller.ps1', 'A9_BATCH2_WIN7_VALIDATION.md', 'RUN_A9_BATCH2_INTEGRITY.cmd', 'RUN_A9_BATCH2_SMOKE.cmd', 'RUN_A9_BATCH2_REPORT_VERIFY.cmd']
      .map((name) => path.join(releaseDir, name)).concat(path.resolve(__dirname, 'a9-batch2-driver-entry.cjs'));
    const patterns = [/sk-[A-Za-z0-9_-]{20,}/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /Authorization\s*:\s*Bearer\s+[A-Za-z0-9._-]{16,}/i];
    for (const file of sources) {
      const bytes = fs.readFileSync(file);
      const text = bytes.toString('utf8');
      expect(patterns.some((pattern) => pattern.test(text))).toBe(false);
      expect(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false);
      if (file.endsWith('.cmd')) {
        expect(bytes.every((byte) => byte < 0x80)).toBe(true);
        expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
        expect(text.endsWith('\r\n')).toBe(true);
      } else {
        expect(text).not.toContain('\r');
        if (file.endsWith('.ps1')) expect(bytes.every((byte) => byte < 0x80)).toBe(true);
      }
    }
    // The controller reads no command from a request and has no dynamic evaluation.
    const controller = fs.readFileSync(path.join(releaseDir, 'a9-batch2-desktop-controller.ps1'), 'utf8');
    expect(controller).not.toMatch(/Invoke-Expression|\biex\b|ConvertFrom-Json|-EncodedCommand/i);
  });

  test('the loopback Provider answers scripted steps, records them, holds on demand and reports counters', async () => {
    const log = path.join(temp('provider'), 'provider.jsonl');
    fs.writeFileSync(log, '');
    const fixture = new smoke.ProviderFixture(log);
    const port = await fixture.listen();
    const call = (method: string, route: string, body?: any): Promise<{ status: number; text: string }> => new Promise((resolve, reject) => {
      const data = body === undefined ? null : JSON.stringify(body);
      const req = http.request({ host: '127.0.0.1', port, method, path: route, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, (response) => {
        let text = ''; response.on('data', (chunk) => { text += chunk; }); response.on('end', () => resolve({ status: response.statusCode || 0, text }));
      });
      req.on('error', reject); if (data) req.write(data); req.end();
    });
    try {
      const probe = await call('POST', '/v1/chat/completions', { tools: [{ function: { name: 'probe_test_echo' } }], messages: [] });
      expect(probe.text).toContain('probe_ok');
      const chat = await call('POST', '/v1/chat/completions', { tools: [{ function: { name: 'start_process', parameters: { properties: { command: {} } } } }], messages: [{ role: 'user', content: 'b2:bg-start' }] });
      expect(chat.text).toContain('start_process');
      expect(chat.text).toContain('[DONE]');
      const counters = JSON.parse((await call('GET', '/__b2/counters')).text);
      expect(counters).toMatchObject({ requests: 1, held: 0 });
      const state = JSON.parse((await call('POST', '/__b2/state', { shellKind: 'powershell', afterHold: true })).text);
      expect(state.state).toMatchObject({ shellKind: 'powershell', afterHold: true });
      expect((await call('POST', '/__b2/state', { shellKind: 'bash-oops' })).status).toBe(200);
      expect(fixture.state.shellKind).toBe('cmd');
      expect((await call('GET', '/__b2/nothing')).status).toBe(404);
      const lines = fs.readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({ index: 1, step: 'tool:start_process', tool_params: { start_process: ['command'] } });
      expect(lines[0].prompt_sha256).toBe(sha('b2:bg-start'));
    } finally { await fixture.close(); }
  });

  test('log helpers read tool parameter names and the unknown-result count of a continue prompt', () => {
    expect(smoke.toolParameterNames({ tools: [{ function: { name: 'stop_process', parameters: { properties: { handleId: {} } } } }, { function: { name: 'x' } }, null] })).toEqual({ stop_process: ['handleId'], x: [] });
    expect(smoke.toolParameterNames(null)).toEqual({});
    const prompt = `继续\n${JSON.stringify({ unknownResults: [{ a: 1 }, { b: 2 }] })}\n不得重放已完成的工具调用`;
    expect(smoke.recoveryUnknownCount(prompt)).toBe(2);
    expect(smoke.recoveryUnknownCount('no facts')).toBeNull();
    expect(smoke.recoveryUnknownCount('\n{broken}\n不得重放')).toBeNull();
  });

  test('driver plans cover every driver phase mode and only kill-on-marker modes end by themselves not', () => {
    const planned = Object.values(smoke.DRIVER_PLANS).flat() as string[];
    expect(planned.sort()).toEqual(Object.keys(smoke.DRIVER_MODES).sort());
    expect(Object.keys(smoke.DRIVER_PLANS)).toEqual(['p03-chain', 'p04-streaming', 'p05-session-bg', 'p06-continue', 'p07-safe', 'p08-ui']);
    for (const spec of Object.values(smoke.DRIVER_MODES) as any[]) expect(spec.timeoutMs).toBeGreaterThan(0);
    expect(Object.entries(smoke.DRIVER_MODES).filter(([, spec]: any) => spec.killOnMarker).map(([mode]) => mode).sort())
      .toEqual(['chain_interrupt', 'continue_interrupt', 'continue_unknown_interrupt', 'ui_interrupt']);
    // The guard modes feed the last p06 mode through part files, so their order is part of the contract.
    // WIN7-45: the release journey is the last mode of p05, because the product exits there and leaves one command to the system.
    expect(smoke.DRIVER_PLANS['p05-session-bg']).toEqual(['session_bg', 'session_restart', 'release_exit']);
    expect(smoke.DRIVER_MODES.release_exit).toEqual({ timeoutMs: 300000, dialogButton: 1 });
    expect(Object.entries(smoke.DRIVER_MODES).filter(([, spec]: any) => spec.dialogButton !== undefined).map(([mode, spec]: any) => `${mode}:${spec.dialogButton}`).sort()).toEqual(['chain_exit:0', 'release_exit:1']);
    expect(smoke.DRIVER_PLANS['p06-continue']).toEqual(['continue_guards', 'continue_interrupt', 'continue_restart', 'continue_unknown_interrupt', 'continue_mode_guard', 'continue_unknown']);
    // Every planned mode has a runner in the driver's mode table, and the driver no longer claims unimplemented assertions.
    const source = fs.readFileSync(path.resolve(__dirname, 'a9-batch2-driver-entry.cjs'), 'utf8');
    const table = /const MODE_TABLE = \{([\s\S]*?)\n  \};/.exec(source);
    expect(table).not.toBeNull();
    const tableModes = Array.from((table as RegExpExecArray)[1].matchAll(/([a-z0-9_]+): [A-Za-z0-9]+/g)).map((match) => match[1]).sort();
    expect(tableModes).toEqual(Object.keys(smoke.DRIVER_MODES).sort());
    expect(source).not.toMatch(/NOT_IMPLEMENTED|notPerformed\(|continue_crash_points/);
    expect(() => smoke.clickExitDialog('c.ps1', 0, 0)).toThrow(/ARGUMENT_INVALID/);
    expect(() => smoke.clickExitDialog('c.ps1', 5, 3)).toThrow(/ARGUMENT_INVALID/);
    let seen: any = null;
    const out = smoke.clickExitDialog('c.ps1', 77, 2, (file: string, args: string[]) => { seen = { file, args }; return { status: 0, stdout: 'clicked index 2', stderr: '' }; });
    expect(out).toMatchObject({ status: 0, stdout: 'clicked index 2' });
    expect(seen.file).toBe('powershell.exe');
    expect(seen.args).toEqual(expect.arrayContaining(['-Action', 'ClickDialog', '-ProcessId', '77', '-ButtonIndex', '2']));
  });

  function fakeChild(pid: number) {
    const child: any = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.pid = pid;
    return child;
  }

  test('launching a driver records its exit, a marker kill, a dialog click and a spawn error', async () => {
    const runtime = { electronPath: 'electron.exe', appRoot: 'app' };
    const clean = fakeChild(2147483000);
    const exit = smoke.launchDriver(runtime, { A9_BATCH2_MODE: 'x', ELECTRON_RUN_AS_NODE: '1' }, { timeoutMs: 5000 }, (_file: string, _args: string[], options: any) => {
      expect(options.env.ELECTRON_RUN_AS_NODE).toBeUndefined();
      expect(options.env.A9_BATCH2_MODE).toBe('x');
      return clean;
    });
    clean.stdout.emit('data', 'hello');
    clean.emit('close', 0, null);
    expect(await exit).toMatchObject({ code: 0, killed_by: null, stdout: 'hello', pid: 2147483000 });

    const dir = temp('launch');
    const marker = path.join(dir, 'm.ready');
    const dialogMarker = path.join(dir, 'dialog.marker');
    const killed = fakeChild(2147483001);
    const waiting = smoke.launchDriver(runtime, {}, { timeoutMs: 20000, killMarker: marker, dialogMarker, cleanupScope: { bind: () => undefined, observeBinding: () => undefined, terminate: jest.fn() }, clickDialog: (pid: number) => ({ status: 0, stdout: `clicked ${pid}`, stderr: '' }) }, () => killed);
    fs.writeFileSync(dialogMarker, '{}');
    await new Promise((resolve) => setTimeout(resolve, 600));
    fs.writeFileSync(marker, '{}');
    await new Promise((resolve) => setTimeout(resolve, 600));
    killed.emit('close', null, 'SIGKILL');
    const result = await waiting;
    expect(result).toMatchObject({ killed_by: 'marker', signal: 'SIGKILL' });
    expect(result.dialog_click).toMatchObject({ status: 0, stdout: 'clicked 2147483001' });

    const broken = fakeChild(2147483002);
    const failed = smoke.launchDriver(runtime, {}, { timeoutMs: 5000 }, () => broken);
    broken.emit('error', new Error('ENOENT electron.exe'));
    expect(await failed).toMatchObject({ code: null, spawn_error: 'ENOENT electron.exe' });
  });

  test('rehearsal 17: a released driver exit does not wait for descendant-held stdio or kill its old PID', async () => {
    jest.useFakeTimers();
    const kill = jest.spyOn(process, 'kill').mockImplementation(() => true);
    const child = fakeChild(2147483090);
    child.stdout.unref = jest.fn(); child.stderr.unref = jest.fn();
    child.stdout.destroy = jest.fn(); child.stderr.destroy = jest.fn();
    let result: any = null;
    const pending = smoke.launchDriver({ electronPath: 'electron.exe', appRoot: 'app' }, { A9_BATCH2_MODE: 'release_exit' }, { timeoutMs: 300000 }, () => child).then((r: any) => { result = r; return r; });
    try {
      child.stdout.emit('data', 'driver done');
      child.emit('exit', 0, null); // The command still holds both pipes: no close event yet.
      await Promise.resolve();
      expect(result).toMatchObject({ code: 0, killed_by: null, stdout: 'driver done' });
      expect(child.stdout.unref).toHaveBeenCalledTimes(1); expect(child.stderr.unref).toHaveBeenCalledTimes(1);
      expect(child.stdout.destroy).not.toHaveBeenCalled(); expect(child.stderr.destroy).not.toHaveBeenCalled();
      jest.advanceTimersByTime(310000);
      expect(kill).not.toHaveBeenCalled();
      child.emit('close', 9, 'SIGTERM');
      expect(await pending).toBe(result); expect(result.code).toBe(0);
    } finally { child.emit('close', 0, null); await pending; kill.mockRestore(); jest.useRealTimers(); }
  });

  test.each([[17, null], [null, 'SIGTERM']])('rehearsal 17: release exit preserves a non-success result (%s, %s)', async (code, signal) => {
    jest.useFakeTimers(); const child = fakeChild(2147483091); let result: any = null;
    const pending = smoke.launchDriver({ electronPath: 'electron.exe', appRoot: 'app' }, { A9_BATCH2_MODE: 'release_exit' }, { timeoutMs: 300000 }, () => child).then((r: any) => { result = r; return r; });
    try {
      child.emit('exit', code, signal); await Promise.resolve();
      expect(result).toMatchObject({ code, signal, killed_by: null });
      child.emit('close', 0, null); expect((await pending).code).toBe(code);
    } finally { child.emit('close', code, signal); await pending; jest.useRealTimers(); }
  });

  test('rehearsal 17: ordinary driver modes still wait for their stdout close', async () => {
    const child = fakeChild(2147483092); child.stdout.unref = jest.fn(); let result: any = null;
    const pending = smoke.launchDriver({ electronPath: 'electron.exe', appRoot: 'app' }, { A9_BATCH2_MODE: 'chain_exit' }, { timeoutMs: 5000 }, () => child).then((r: any) => { result = r; return r; });
    try {
      child.emit('exit', 0, null); await Promise.resolve(); expect(result).toBeNull();
      child.stdout.emit('data', 'last ordinary output'); child.emit('close', 0, null);
      expect(await pending).toMatchObject({ code: 0, stdout: 'last ordinary output' }); expect(child.stdout.unref).not.toHaveBeenCalled();
    } finally { child.emit('close', 0, null); await pending; }
  });

  test('rehearsal 17: an actual release timeout stays a timeout after the exit event', async () => {
    jest.useFakeTimers(); const kill = jest.fn();
    const child = fakeChild(2147483093); let result: any = null;
    const pending = smoke.launchDriver({ electronPath: 'electron.exe', appRoot: 'app' }, { A9_BATCH2_MODE: 'release_exit' }, { timeoutMs: 1000, cleanupScope: { bind: () => undefined, observeBinding: () => undefined, terminate: kill } }, () => child).then((r: any) => { result = r; return r; });
    try {
      jest.advanceTimersByTime(1000); child.emit('exit', 0, null); await Promise.resolve();
      expect(result).toMatchObject({ code: 0, killed_by: 'timeout' }); expect(kill).toHaveBeenCalledTimes(1);
    } finally { child.emit('close', 0, null); await pending; jest.useRealTimers(); }
  });

  function phaseContext(phase: string, index = 1) {
    const base = temp(`ctx-${phase}`);
    const candidateRoot = path.join(base, 'candidate');
    fs.mkdirSync(path.join(candidateRoot, 'validation'), { recursive: true });
    fs.writeFileSync(path.join(candidateRoot, 'release-manifest.json'), '{"manifest":"TEST_ONLY"}\n');
    fs.writeFileSync(path.join(candidateRoot, 'A9_BATCH2_VALIDATION_KIT.json'), '{"kit":"TEST_ONLY"}\n');
    const runRoot = path.join(base, 'run');
    const run = requests.createRequest({
      runId: RUN_ID, phase, requestIndex: index, sourceCommit: 'a'.repeat(40), packageSha256: 'b'.repeat(64),
      manifestSha256: sha(fs.readFileSync(path.join(candidateRoot, 'release-manifest.json'))), kitSha256: sha(fs.readFileSync(path.join(candidateRoot, 'A9_BATCH2_VALIDATION_KIT.json'))),
      releaseAuthoritySha256: 'e'.repeat(64), candidateRoot, evidenceRoot: runRoot, target: { ...TARGET }, externalFiles: {},
    });
    const attempt = requests.attemptDirectory(runRoot, index, phase);
    fs.mkdirSync(attempt, { recursive: true });
    fs.writeFileSync(path.join(attempt, 'request.json'), JSON.stringify(run));
    const argv = [`--candidate-root=${candidateRoot}`, `--evidence-root=${attempt}`, `--run-root=${runRoot}`, `--phase=${phase}`, `--run-id=${RUN_ID}`];
    return { ctx: smoke.createContext(argv, { pid: 4242 }), candidateRoot, runRoot, attempt, argv };
  }

  test('a phase context refuses a request that does not match its arguments or hashes', () => {
    const { argv, candidateRoot } = phaseContext('p01-env');
    expect(() => smoke.createContext(argv.map((item: string) => (item.startsWith('--phase=') ? '--phase=p10-postflight' : item)), {})).toThrow(/REQUEST_ARGUMENT_MISMATCH/);
    expect(() => smoke.createContext(argv.map((item: string) => (item.startsWith('--run-id=') ? '--run-id=11111111-1111-4111-8111-111111111111' : item)), {})).toThrow(/REQUEST_ARGUMENT_MISMATCH/);
    fs.writeFileSync(path.join(candidateRoot, 'A9_BATCH2_VALIDATION_KIT.json'), '{"kit":"EDITED"}\n');
    expect(() => smoke.createContext(argv, {})).toThrow(/REQUEST_BINDING_MISMATCH/);
  });

  test('the environment phase writes its evidence and never passes on unobserved facts', () => {
    const { ctx, attempt } = phaseContext('p01-env');
    const exec = (name: string) => ({ status: 0, stdout: name === 'ver' ? 'Microsoft Windows [Version 6.1.7601]' : '', stderr: '', error: null });
    const result = smoke.runEnvironmentPhase(ctx, exec);
    expect(result.status).not.toBe('PASS');
    for (const name of ['g0-env.json', 'g0-identity.json', 'g0-processes-before.json', 'phase-result.json']) expect(fs.existsSync(path.join(attempt, name))).toBe(true);
    const stored = JSON.parse(fs.readFileSync(path.join(attempt, 'phase-result.json'), 'utf8'));
    expect(stored.cases[0].assertions.map((item: any) => item.assertion_id)).toEqual(['B2-G0-ENV-A01', 'B2-G0-ENV-A02', 'B2-G0-ENV-A03', 'B2-G0-ENV-A04', 'B2-G0-ENV-A05']);
    expect(stored.cases[0].assertions[1].status).toBe('UNKNOWN');
    expect(() => smoke.writeEvidence(ctx, 'not-in-contract.json', {})).toThrow(/EVIDENCE_NOT_IN_CONTRACT/);
  });

  test('a driver phase applies driver assertions, keeps unobserved ones open and names a failed mode', async () => {
    const { ctx, attempt } = phaseContext('p07-safe');
    const runtime = { electronPath: 'electron.exe', appRoot: 'app', driverSha256: sha('driver') };
    const assertions = [{ case_id: 'B2-SAFE-02-AUDIT-HARD-STOP', assertion_id: 'B2-SAFE-02-AUDIT-HARD-STOP-A01', status: 'PASS', observed: 'hard stop before side effect' }];
    const result = await smoke.runDriverPhase(ctx, {
      runtime, exec: (name: string) => ({ status: 0, stdout: name === 'wmic_processes' ? 'Node,ProcessId,ParentProcessId,Name,ExecutablePath,SessionId,CreationDate\nPC,2,0,other.exe,C:\\other.exe,5,20261017000000.000000+000\n' : 'CommandLine=x\nProcessId=2\n', stderr: '', error: null }),
      launchDriver: async (_runtime: any, env: any) => {
        expect(smoke.DRIVER_PLANS['p07-safe']).toContain(env.A9_BATCH2_MODE);
        expect(env.A9_BATCH2_SECRET_LITERAL).toBe(fixtures.testOnlySecret());
        expect(env.A9_BATCH2_FIXTURE_URL).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/v1$/);
        const mode = env.A9_BATCH2_MODE; const spec = smoke.PHASE2_MODES[mode];
        const modeAssertions = spec && !mode.endsWith('_prepare') && !mode.endsWith('_save') && !(mode === 'secrets_a38_05')
          ? fixtures.CASES.find((c: any) => c.case_id === spec.caseId).assertions.map((a: any) => ({ case_id: spec.caseId, assertion_id: a.assertion_id, status: 'PASS', observed: 'TEST_ONLY observed' })) : spec ? [] : assertions;
        if (spec) {
          expect(env.WIN7AGENT_PORTABLE).toBe('0'); expect(env.LOCALAPPDATA).toContain(path.join('secrets', spec.caseId.slice(3).toLowerCase(), 'profile'));
          expect(env.A9_BATCH2_WORKSPACE).toContain(path.join('secrets', spec.caseId.slice(3).toLowerCase(), 'workspace'));
          fs.writeFileSync(path.join(attempt, `${mode}-prequit.json`), JSON.stringify({ sid: TARGET.account_sid, tree: [{ pid: 999, created: '20261017000000.000000+000' }], wmic_failures: 0 }));
        }
        fs.writeFileSync(env.A9_BATCH2_DRIVER_RESULT, JSON.stringify({ status: 'DONE', assertions: modeAssertions }));
        return { code: 0, signal: null, killed_by: null, duration_ms: 1, stdout: 'out', stderr: '', pid: 1 };
      },
    });
    // SAFE-02 remains observed; each A9-39 case requires its own assertions and isolated roots.
    expect(result.cases.map((item: any) => item.case_id)).toEqual(['B2-SAFE-02-AUDIT-HARD-STOP', ...fixtures.SECRET_CASE_IDS]);
    expect(JSON.parse(fs.readFileSync(path.join(attempt, 'driver-launches.json'), 'utf8')).launches).toHaveLength(16);
    expect(result.cases[0].status).toBe('PASS');
    expect(fs.readFileSync(path.join(attempt, 'product.log'), 'utf8')).toContain('==== safe_rules (exit=0; killed_by=null) ====');
    expect(JSON.parse(fs.readFileSync(path.join(attempt, 'driver-launches.json'), 'utf8')).launches[0]).toMatchObject({ mode: 'safe_rules', code: 0 });

    const failing = phaseContext('p07-safe', 2);
    const failed = await smoke.runDriverPhase(failing.ctx, {
      runtime, exec: () => ({ status: 0, stdout: '', stderr: '', error: null }),
      launchDriver: async (_runtime: any, env: any) => {
        fs.writeFileSync(env.A9_BATCH2_DRIVER_RESULT, JSON.stringify({ status: 'ERROR', error: 'step x: DOM id missing', assertions: [] }));
        return { code: 2, signal: null, killed_by: null, duration_ms: 1, stdout: '', stderr: 'boom', pid: 2 };
      },
    });
    expect(failed).toMatchObject({ status: 'NOT_PERFORMED', failure_class: 'DRIVER_SAFE_RULES_FAILED' });
    expect(JSON.parse(fs.readFileSync(path.join(failing.attempt, 'driver-launches.json'), 'utf8')).launches[0].driver_error).toContain('DOM id missing');
    await expect(smoke.runDriverPhase(phaseContext('p01-env').ctx, {})).rejects.toThrow(/NOT_A_DRIVER_PHASE/);
  });

  test('a driver ERROR or non-zero exit fails the phase even when every assertion was already recorded as PASS', async () => {
    const { ctx } = phaseContext('p07-safe');
    const runtime = { electronPath: 'electron.exe', appRoot: 'app', driverSha256: sha('driver') };
    const assertions = fixtures.casesForPhase('p07-safe').flatMap((c: any) => c.assertions.map((a: any) => ({ case_id: c.case_id, assertion_id: a.assertion_id, status: 'PASS', observed: 'hard stop before side effect' })));
    const result = await smoke.runDriverPhase(ctx, {
      runtime, exec: () => ({ status: 0, stdout: '', stderr: '', error: null }),
      launchDriver: async (_runtime: any, env: any) => {
        fs.writeFileSync(env.A9_BATCH2_DRIVER_RESULT, JSON.stringify({ status: 'ERROR', error: 'cleanup threw after the assertion', assertions }));
        return { code: 2, signal: null, killed_by: null, duration_ms: 1, stdout: '', stderr: '', pid: 5 };
      },
    });
    expect(result).toMatchObject({ status: 'FAIL', failure_class: 'DRIVER_SAFE_RULES_FAILED' });
    expect(result.cases[0].status).toBe('PASS');
    const exitOnly = phaseContext('p07-safe', 2);
    const nonZero = await smoke.runDriverPhase(exitOnly.ctx, {
      runtime, exec: () => ({ status: 0, stdout: '', stderr: '', error: null }),
      launchDriver: async (_runtime: any, env: any) => {
        fs.writeFileSync(env.A9_BATCH2_DRIVER_RESULT, JSON.stringify({ status: 'DONE', assertions }));
        return { code: 7, signal: null, killed_by: null, duration_ms: 1, stdout: '', stderr: '', pid: 6 };
      },
    });
    expect(nonZero).toMatchObject({ status: 'FAIL', failure_class: 'DRIVER_SAFE_RULES_FAILED' });
  });

  test('the smoke corrupts the mode settings before the unresolved-mode mode starts and restores the original bytes afterwards', async () => {
    // The product reads the settings once at startup (rehearsal 4: corrupting after startup only reached the drift check), so the file must already be unreadable at launch.
    expect(smoke.CORRUPT_MODE_SETTINGS).toBe(driver.CORRUPT_MODE_SETTINGS);
    expect(smoke.DRIVER_MODES.continue_mode_guard.corruptModeSettings).toBe(true);
    expect(Object.entries(smoke.DRIVER_MODES).filter(([, spec]: any) => spec.corruptModeSettings).map(([mode]) => mode)).toEqual(['continue_mode_guard']);

    const { ctx, runRoot, attempt } = phaseContext('p06-continue');
    const modes = path.join(runRoot, 'data', 'p06-continue', 'workspace-modes');
    fs.mkdirSync(modes, { recursive: true });
    const original = Buffer.from('{"schemaVersion":2,"permissionMode":"full_access","workspaceRoot":"X"}\n', 'utf8');
    fs.writeFileSync(path.join(modes, 'abc.json'), original);
    fs.writeFileSync(path.join(modes, 'abc.v1.json'), 'v1 file must stay untouched');
    const runtime = { electronPath: 'electron.exe', appRoot: 'app', driverSha256: sha('driver') };
    const seen: Record<string, any> = {};
    // The interrupt modes are killed by the harness, so each is followed by a sweep; it needs a usable process table (codex round 11, N1).
    const processTable = 'Node,CreationDate,ExecutablePath,Name,ParentProcessId,ProcessId,SessionId\r\nHOST,20261014172412.000000+000,C:\\Windows\\System32\\smss.exe,smss.exe,4,304,0\r\n';
    const result = await smoke.runDriverPhase(ctx, {
      runtime, exec: answers({ status: 0, stdout: processTable, stderr: '', error: null }),
      strays: { kill: () => undefined, wait: async () => undefined },
      launchDriver: async (_runtime: any, env: any) => {
        seen[env.A9_BATCH2_MODE] = { content: fs.readFileSync(path.join(modes, 'abc.json'), 'utf8'), flag: env.A9_BATCH2_MODE_SETTINGS_CORRUPTED || null, v1: fs.readFileSync(path.join(modes, 'abc.v1.json'), 'utf8') };
        fs.writeFileSync(env.A9_BATCH2_DRIVER_RESULT, JSON.stringify({ status: 'DONE', assertions: [] }));
        return { code: 0, signal: null, killed_by: env.A9_BATCH2_MODE.endsWith('interrupt') ? 'marker' : null, duration_ms: 1, stdout: '', stderr: '', pid: 1 };
      },
    });
    void result;
    expect(seen.continue_guards.content).toBe(original.toString('utf8'));
    expect(seen.continue_mode_guard).toMatchObject({ content: smoke.CORRUPT_MODE_SETTINGS, flag: '1', v1: 'v1 file must stay untouched' });
    // The next mode starts from the original bytes again, and the launch record says what was done.
    expect(seen.continue_unknown.content).toBe(original.toString('utf8'));
    expect(seen.continue_unknown.flag).toBeNull();
    expect(fs.readFileSync(path.join(modes, 'abc.json'))).toEqual(original);
    const launches = JSON.parse(fs.readFileSync(path.join(attempt, 'driver-launches.json'), 'utf8')).launches;
    expect(launches.find((item: any) => item.mode === 'continue_mode_guard').mode_settings).toMatchObject({ files_found: 1, corrupted: true, restore: { restored: true, matches_original: true } });
    expect(launches.find((item: any) => item.mode === 'continue_guards').mode_settings).toBeUndefined();
  });

  test('without exactly one settings file the smoke touches nothing and the mode learns that it was not corrupted', async () => {
    const dataRoot = temp('modes-none');
    expect(smoke.corruptModeSettings(dataRoot)).toMatchObject({ files_found: 0, corrupted: false, file: null });
    fs.mkdirSync(path.join(dataRoot, 'workspace-modes'), { recursive: true });
    fs.writeFileSync(path.join(dataRoot, 'workspace-modes', 'a.json'), 'a');
    fs.writeFileSync(path.join(dataRoot, 'workspace-modes', 'b.json'), 'b');
    const two = smoke.corruptModeSettings(dataRoot);
    expect(two).toMatchObject({ files_found: 2, corrupted: false });
    expect(fs.readFileSync(path.join(dataRoot, 'workspace-modes', 'a.json'), 'utf8')).toBe('a');
    expect(smoke.restoreModeSettings(two)).toMatchObject({ restored: false, matches_original: false });
    // A restore that cannot write reports the failure instead of claiming success.
    fs.rmSync(path.join(dataRoot, 'workspace-modes', 'b.json'));
    const one = smoke.corruptModeSettings(dataRoot);
    expect(one.corrupted).toBe(true);
    fs.rmSync(path.join(dataRoot, 'workspace-modes'), { recursive: true, force: true });
    expect(smoke.restoreModeSettings(one)).toMatchObject({ restored: false, matches_original: false });
  });

  test('the driver no longer corrupts the settings itself and waits for an idle, ready composer', () => {
    const source = fs.readFileSync(path.resolve(__dirname, 'a9-batch2-driver-entry.cjs'), 'utf8');
    const body = source.slice(source.indexOf('async function continueModeGuard'), source.indexOf('async function continueUnknown'));
    expect(body).not.toMatch(/writeFileSync\(/ );
    expect(body).toContain('settings_corrupt_at_start');
    expect(source).not.toContain('A9_BATCH2_DRIVER_PRODUCT_BUSY');
    // The send button stays disabled while the prompt is empty, so the wait for it must come after the text is typed.
    expect(source).not.toContain('composerReady');
    expect(source).toMatch(/async function submit\(prompt\) \{\s*await waitComposer\(composerOpen, 30000, 'composer open'\);[\s\S]*?p\.value = \$\{JSON\.stringify\(prompt\)\}[\s\S]*?await waitComposer\(sendEnabled, 30000, 'send enabled'\);[\s\S]*?\.click\(\)/);
    expect(source).toMatch(/async function runPrompt\(token, timeoutMs\) \{\s*await waitIdle\(/);
    // The two audit follow-ups are the observation itself: they click without waiting and record the composer state.
    expect((source.match(/await submitRaw\('b2:s01'\)/g) || []).length).toBe(2);
  });

  describe('the submit wait against the real renderer composer logic (rehearsal 5: p03 stopped at the first submission)', () => {
    const rendererSource = fs.readFileSync(path.resolve(__dirname, '../../product/renderer/a9-workbench.js'), 'utf8');
    const driverSource = fs.readFileSync(path.resolve(__dirname, 'a9-batch2-driver-entry.cjs'), 'utf8');
    const slice = (source: string, from: string, to: string) => {
      const start = source.indexOf(from);
      const end = source.indexOf(to, start);
      expect(start).toBeGreaterThan(-1);
      expect(end).toBeGreaterThan(start);
      return source.slice(start, end);
    };

    // The composer functions come from the shipped renderer; only the DOM nodes and the snapshot are stubs.
    function page(snapshot: any, running = false) {
      const nodes: Record<string, any> = {};
      const clicks: string[] = [];
      let resize: () => void = () => undefined;
      const node = (id: string) => (nodes[id] = nodes[id] || {
        id, value: '', hidden: false, disabled: false, textContent: '', dataset: {}, style: {},
        scrollHeight: 20,
        dispatchEvent(event: any) { if (id === 'task-prompt' && event.type === 'input') resize(); },
        click() { if (!this.disabled) clicks.push(`${id}:${nodes['task-prompt'].value}`); },
      });
      ['task-prompt', 'run-task', 'cancel-task', 'rail-stop', 'session-status', 'cancel-task-label', 'rail-stop-label'].forEach(node);
      const code = slice(rendererSource, 'function canSubmit()', '// ADR-0114 事件数据层');
      const box: any = {
        state: { snapshot, running }, SUPPORTED_MODES: new Set(['full_access', 'read_only']), el: node,
        text: (id: string, value: any) => { node(id).textContent = String(value); }, runtimeDiagnostic: () => 'diagnostic',
      };
      vm.runInNewContext(`${code}\n;this.sync = syncComposer; this.resize = resizeComposer;`, box);
      resize = box.resize;
      box.sync();
      const doc = { getElementById: (id: string) => node(id) };
      const exec = async (source: string) => vm.runInNewContext(source, { document: doc, Event: class { type: string; constructor(type: string) { this.type = type; } } });
      return { nodes, clicks, box, exec };
    }
    const ready = () => ({ status: 'ready', mode: 'full_access', provider: { configured: true, probe: { classification: 'tool_calling' } }, agentStatus: 'idle', managedProcesses: [], controls: { canStop: false, stopKind: 'none' } });

    // The driver's own wait and submit code, cut out of the source and run against the page above.
    function driverComposer(p: any) {
      const code = [slice(driverSource, 'async function waitFor(condition, timeoutMs, label)', '// ---- SQLite inspection'), slice(driverSource, 'const composerState = ', '  // Idle means no Turn is running.')].join('\n');
      const box: any = { exec: p.exec, sleep: () => new Promise((resolve) => setTimeout(resolve, 2)), Date, JSON, Boolean, Error, Promise, String };
      vm.runInNewContext(`${code}\n;this.api = { submit, composerState, waitComposer, composerOpen, sendEnabled };`, box);
      return box.api;
    }

    test('an empty prompt leaves the send button disabled and typing enables it, as the driver now relies on', () => {
      const p = page(ready());
      expect(p.nodes['run-task']).toMatchObject({ hidden: false, disabled: true });
      expect(p.nodes['task-prompt'].disabled).toBe(false);
      p.nodes['task-prompt'].value = 'b2:hello';
      p.nodes['task-prompt'].dispatchEvent({ type: 'input' });
      expect(p.nodes['run-task'].disabled).toBe(false);
      expect(rendererSource).toMatch(/function canSubmit\(\) \{[\s\S]*?el\('task-prompt'\)\.value\.trim\(\)/);
      expect(rendererSource).toMatch(/el\('task-prompt'\)\.addEventListener\('input', \(\) => \{ resizeComposer\(\);/);
    });

    test('submit types into the empty composer, waits for the button and clicks exactly once', async () => {
      const p = page(ready());
      await driverComposer(p).submit('b2:first');
      expect(p.clicks).toEqual(['run-task:b2:first']);
    });

    test('submit waits while a Turn is running and goes through once the composer opens', async () => {
      const p = page(ready(), true);
      p.box.sync();
      const d = driverComposer(p);
      expect(await d.composerState()).toEqual({ send_hidden: true, send_disabled: true, prompt_disabled: true });
      setTimeout(() => { p.box.state.running = false; p.box.sync(); }, 30);
      await d.submit('b2:after-turn');
      expect(p.clicks).toEqual(['run-task:b2:after-turn']);
    });

    test('a blocked composer never clicks and the timeout names the state', async () => {
      const blocked = ready();
      blocked.mode = 'unselected';
      const p = page(blocked);
      const d = driverComposer(p);
      await expect(d.waitComposer(d.composerOpen, 60, 'composer open')).rejects.toThrow(/^TIMEOUT:composer open:composer=\{"send_hidden":false,"send_disabled":true,"prompt_disabled":true\}/);
      expect(p.clicks).toEqual([]);
    });
  });

  describe('rehearsal 14: create a conversation only after the real directory control becomes available', () => {
    const rendererSource = fs.readFileSync(path.resolve(__dirname, '../../product/renderer/a9-workbench.js'), 'utf8');
    const driverSource = fs.readFileSync(path.resolve(__dirname, 'a9-batch2-driver-entry.cjs'), 'utf8');
    const slice = (source: string, from: string, to: string) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));
    function directory(options: { enableAt?: number; switchAfter?: number; permanentlyBlocked?: boolean; atLimit?: boolean; loseClickReply?: boolean; staleDirectory?: boolean; reloadFailure?: boolean } = {}) {
      let now = 0;
      let activeId = 'before';
      let clicks = 0;
      let clickedAt: number | null = null;
      let reloads = 0;
      let loaded: (() => void) | null = null;
      const submitted: string[] = [];
      const nodes: Record<string, any> = {};
      const node = (id: string) => (nodes[id] ||= { textContent: '', disabled: false, hidden: false,
        click() { if (this.disabled) throw new Error('A disabled control was clicked'); clicks += 1; clickedAt = now; } });
      const box: any = { state: { searchQuery: '' }, el: node, text: (id: string, value: any) => { node(id).textContent = String(value); },
        appendConversationGroup: () => undefined, appendConversationRow: () => undefined };
      vm.runInNewContext(`${slice(rendererSource, 'function renderConversationDirectory(snapshot)', '  function hydrateDraft(snapshot)')}\nthis.render = renderConversationDirectory;`, box);
      const render = (stale = false) => box.render({ conversations: [{ sessionId: activeId, state: 'active' }], activeConversationId: activeId,
        conversationControls: { canSwitch: !stale && !options.permanentlyBlocked && now >= (options.enableAt ?? 0), maxActive: options.atLimit ? 1 : 16 } });
      render(Boolean(options.staleDirectory));
      const driver: any = { Date: { now: () => now }, Error, String,
        conversationId: async () => activeId,
        win: { webContents: {
          once: (_event: string, callback: () => void) => { loaded = callback; },
          reload: () => { reloads += 1; if (options.reloadFailure) throw new Error('renderer reload failed'); render(); if (loaded) loaded(); },
        } },
        submit: async (token: string) => { submitted.push(token); }, waitIdle: async () => undefined,
        events: async () => ({ events: [] }), toolEndsFor: () => [], settleResidue: async () => ({ residue: [], newFacts: [] }),
        exec: async (source: string) => {
          const result = vm.runInNewContext(source, { document: { readyState: 'complete', getElementById: node },
            window: { win7AgentA9Workbench: { refreshSnapshot: async () => { render(); return { activeConversationId: activeId }; } } } });
          if (options.loseClickReply && clicks > 0) throw new Error('click reply unavailable');
          return result;
        },
        sleep: async (ms: number) => { now += ms; if (clickedAt !== null && now - clickedAt >= (options.switchAfter ?? 0)) activeId = 'after'; if (!options.staleDirectory) render(); } };
      vm.runInNewContext(`${slice(driverSource, 'async function waitFor(condition, timeoutMs, label)', '  // ---- SQLite inspection')}\n${slice(driverSource, 'let workbenchRefreshFailure = null;', '  // A conversation switch')}\n${slice(driverSource, 'async function reloadRenderer()', '  // Samples DOM')}\n${slice(driverSource, 'const fastOutcome = async (token, label)', '    const fast = await fastOutcome')}\nthis.create = newConversation; this.fast = fastOutcome;`, driver);
      return { create: driver.create, fast: driver.fast, clicks: () => clicks, time: () => now, reloads: () => reloads, submitted, button: node('conversation-new') };
    }

    test('waits for the renderer to enable the button, clicks once and waits for the changed conversation', async () => {
      const p = directory({ enableAt: 500, switchAfter: 750 });
      expect(p.button.disabled).toBe(true);
      expect(await p.create()).toBe('after');
      expect(p.clicks()).toBe(1);
      expect(p.time()).toBeLessThan(20000);
    });

    test('never bypasses the disabled control when switching is blocked or the conversation limit is reached', async () => {
      for (const options of [{ permanentlyBlocked: true }, { atLimit: true }]) {
        const p = directory(options);
        await expect(p.create()).rejects.toThrow('TIMEOUT:new conversation:');
        expect(p.clicks()).toBe(0);
        expect(p.time()).toBe(20000);
        expect(p.button.disabled).toBe(true);
      }
    });

    test('does not click again while creation is pending and keeps the original total deadline', async () => {
      const p = directory({ enableAt: 19500, switchAfter: 1000 });
      await expect(p.create()).rejects.toThrow('TIMEOUT:new conversation:');
      expect(p.clicks()).toBe(1);
      expect(p.time()).toBe(20000);
    });

    test('an uncertain click result fails without repeating an action that may already have happened', async () => {
      const p = directory({ loseClickReply: true });
      await expect(p.create()).rejects.toThrow('click reply unavailable');
      expect(p.clicks()).toBe(1);
    });

    test('rehearsal 15: a BG probe reloads the renderer whose directory stayed blocked after the process exited', async () => {
      const p = directory({ staleDirectory: true, switchAfter: 500 });
      expect(p.button.disabled).toBe(true);
      await p.fast('b2:bg-badcwd', 'bg-badcwd');
      expect(p.reloads()).toBe(1);
      expect(p.clicks()).toBe(1);
      expect(p.submitted).toEqual(['b2:bg-badcwd']);
    });

    test('rehearsal 15: a reload preserves real conversation blockers and the original click deadline', async () => {
      for (const options of [{ permanentlyBlocked: true }, { atLimit: true }]) {
        const p = directory(options);
        await expect(p.fast('b2:bg-badcwd', 'bg-badcwd')).rejects.toThrow('TIMEOUT:new conversation:');
        expect(p.reloads()).toBe(1);
        expect(p.clicks()).toBe(0);
        expect(p.submitted).toEqual([]);
        expect(p.time()).toBe(20800); // Existing reload settle (800ms), then the unchanged 20s click budget.
      }
    });

    test('rehearsal 15: a renderer reload failure prevents clicking and submitting the next probe', async () => {
      const p = directory({ reloadFailure: true });
      await expect(p.fast('b2:bg-badcwd', 'bg-badcwd')).rejects.toThrow('renderer reload failed');
      expect(p.reloads()).toBe(1);
      expect(p.clicks()).toBe(0);
      expect(p.submitted).toEqual([]);
    });
  });

  test('the normal-exit tree assertion needs an observed non-empty tree and a working process listing', () => {
    const csv = (rows: string[]) => `Node,CreationDate,ExecutablePath,Name,ParentProcessId,ProcessId\r\n${rows.join('\r\n')}\r\n`;
    const unrelated = 'HOST,20260101000001.000000+000,C:\\Windows\\notepad.exe,notepad.exe,1,7';
    const helper = { pid: 500, parent: 100, name: 'spike02_helper.exe', created: '20260101000000.000000+000' };
    const exitLaunch = (over: any = {}) => ({ mode: 'chain_exit', code: 0, signal: null, killed_by: null, started_at: 'a', ended_at: 'b', duration_ms: 1, pid: 1, dialog_click: { status: 0 }, ...over });
    const run = (treeFile: any, exec: any, launch: any = exitLaunch()) => {
      const { ctx, attempt } = phaseContext('p03-chain');
      for (const name of fixtures.evidenceForPhase('p03-chain')) if (name !== 'phase-result.json') fs.writeFileSync(path.join(attempt, name), 'x');
      if (treeFile) fs.writeFileSync(path.join(attempt, 'chain-exit-tree-before.json'), JSON.stringify(treeFile));
      smoke.finishChainEvidence(ctx, [launch], null, exec, path.join(attempt, 'no-data'));
      const assertion = ctx.result.cases.find((item: any) => item.case_id === 'B2-CH-06-NORMAL-EXIT').assertions[1];
      return { status: assertion.status, observed: assertion.observed, held: JSON.parse(fs.readFileSync(path.join(attempt, '06-held-exit.json'), 'utf8')) };
    };
    const listing = (rows: string[]) => answers({ status: 0, stdout: csv(rows), stderr: '', error: null });
    const passed = run({ tree: [helper], wmic_failures: 0 }, listing([unrelated]));
    expect(passed.status).toBe('PASS');
    expect(passed.held).toMatchObject({ tree_observed: true, survivors: [], listing_failed: false });
    expect(passed.held.absence_observed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(passed.held.exit_code_scope).toMatch(/descendants are checked by creation-date identity only/);
    // Nothing observed is never absence: a failed query, an empty tree, a missing record and a failed listing are all UNKNOWN.
    expect(run({ tree: [helper], wmic_failures: 1 }, listing([unrelated])).status).toBe('UNKNOWN');
    expect(run({ tree: [], wmic_failures: 0 }, listing([unrelated])).status).toBe('UNKNOWN');
    expect(run(null, listing([unrelated])).status).toBe('UNKNOWN');
    expect(run({ tree: [helper], wmic_failures: 0 }, () => { throw new Error('wmic missing'); }).status).toBe('UNKNOWN');
    expect(run({ tree: [helper], wmic_failures: 0 }, listing([])).status).toBe('UNKNOWN');
    // The real executor returns a status or an error instead of throwing: a partial listing from a failed command is no listing.
    const partial = csv([unrelated]);
    const nonZero = run({ tree: [helper], wmic_failures: 0 }, () => ({ status: 1, stdout: partial, stderr: 'denied', error: null }));
    expect(nonZero.status).toBe('UNKNOWN');
    expect(nonZero.held.listing_failed).toBe(true);
    const timedOut = run({ tree: [helper], wmic_failures: 0 }, () => ({ status: 0, stdout: partial, stderr: '', error: 'spawnSync wmic.exe ETIMEDOUT' }));
    expect(timedOut.status).toBe('UNKNOWN');
    expect(timedOut.held.listing_failed).toBe(true);
    expect(run({ tree: [helper], wmic_failures: 0 }, () => ({ status: null, stdout: partial, stderr: '', error: null })).status).toBe('UNKNOWN');
    // A survivor of the same pid and creation stamp, or a bad exit, fails.
    expect(run({ tree: [helper], wmic_failures: 0 }, listing([unrelated, 'HOST,20260101000000.000000+000,C:\\x\\h.exe,spike02_helper.exe,100,500'])).status).toBe('FAIL');
    expect(run({ tree: [helper], wmic_failures: 0 }, listing([unrelated]), exitLaunch({ code: 1 })).status).toBe('FAIL');
  });

  test('the normal-exit residue check does not count the smoke process itself', () => {
    const csv = (rows: string[]) => `Node,CreationDate,ExecutablePath,Name,ParentProcessId,ProcessId\r\n${rows.join('\r\n')}\r\n`;
    const helper = { pid: 500, parent: 100, name: 'spike02_helper.exe', created: '20260101000000.000000+000' };
    const run = (rowsFor: (candidateRoot: string, ownPid: number) => string[]) => {
      const { ctx, attempt } = phaseContext('p03-chain');
      for (const name of fixtures.evidenceForPhase('p03-chain')) if (name !== 'phase-result.json') fs.writeFileSync(path.join(attempt, name), 'x');
      fs.writeFileSync(path.join(attempt, 'chain-exit-tree-before.json'), JSON.stringify({ tree: [helper], wmic_failures: 0 }));
      const launch = { mode: 'chain_exit', code: 0, signal: null, killed_by: null, started_at: 'a', ended_at: 'b', duration_ms: 1, pid: 1, dialog_click: { status: 0 } };
      // The filter compares path prefixes as written, so the row reuses the context's own candidate root spelling.
      const candidateExe = `${ctx.candidateRoot}${path.sep}electron.exe`;
      const exec = answers({ status: 0, stdout: csv(rowsFor(candidateExe, ctx.pid)), stderr: '', error: null });
      smoke.finishChainEvidence(ctx, [launch], null, exec, path.join(attempt, 'no-data'));
      const assertion = ctx.result.cases.find((item: any) => item.case_id === 'B2-CH-06-NORMAL-EXIT').assertions[1];
      return { status: assertion.status, ownPid: ctx.pid, post: JSON.parse(fs.readFileSync(path.join(attempt, '06-postflight.json'), 'utf8')) };
    };
    const other = 'HOST,20260101000001.000000+000,C:\\Windows\\notepad.exe,notepad.exe,1,7';
    // The smoke runs as the candidate's electron.exe: its own row under the candidate root is not residue.
    const own = run((exe, ownPid) => [other, `HOST,20260101000002.000000+000,${exe},electron.exe,1,${ownPid}`]);
    expect(own.status).toBe('PASS');
    expect(own.post.residue).toEqual([]);
    expect(own.post.own_pids_excluded).toContain(own.ownPid);
    // Any other process under the candidate root still fails the assertion.
    const stray = run((exe, ownPid) => [other, `HOST,20260101000002.000000+000,${exe},electron.exe,1,${ownPid}`, `HOST,20260101000003.000000+000,${exe},electron.exe,1,${ownPid + 100000}`]);
    expect(stray.status).toBe('FAIL');
    expect(stray.post.residue).toEqual([{ pid: stray.ownPid + 100000, name: 'electron.exe', image_source: 'executable_path' }]);
  });

  describe('release exit (B2-BG-03 A02, WIN7-45)', () => {
    const csv = (rows: string[]) => `Node,CreationDate,ExecutablePath,Name,ParentProcessId,ProcessId\r\n${rows.join('\r\n')}\r\n`;
    const instant = async () => undefined;
    const other = 'HOST,20260101000001.000000+000,C:\\Windows\\notepad.exe,notepad.exe,1,7';
    const shell = { pid: 800, parent: 500, name: 'powershell.exe', created: '20260101000010.000000+000' };
    const shellRow = (over: { created?: string; pid?: number } = {}) => `HOST,${over.created ?? shell.created},C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe,powershell.exe,${shell.parent},${over.pid || shell.pid}`;
    const exitLaunch = (over: any = {}) => ({ mode: 'release_exit', code: 0, signal: null, killed_by: null, started_at: 'a', ended_at: 'b', duration_ms: 1, pid: 1, dialog_click: { status: 0 }, ...over });
    const sequenceOk = { ok: true, sequence: ['owned', 'release_intent', 'released'], release_ids: ['r1', 'r1'], same_release_id: true, events: 3 };
    const handle = { handleId: 'sh-1', pid: shell.pid, status: 'running', ownership: 'owned' };
    const beforeFile = (over: any = {}) => ({ handle, handle_pid_in_command_tree: true, tree: [shell], command_tree: [shell], wmic_failures: 0, ...over });
    const files = (over: any = {}) => ({
      'release-exit-before.json': beforeFile(),
      'release-dialog-response.json': { dialog: { response: 1 }, buttons_ok: true, returned_index: 1, timed_out: false },
      'release-ownership-events.json': { sequence: sequenceOk },
      ...over,
    });
    // The released command lives until a kill for its id arrives; kills of other ids change nothing.
    // A rows callback may answer 'fail' to make that one listing fail (the query throws); `dead` holds the ids a kill removed (the shell and `killable` ids).
    const run = async (opts: { files?: any; launch?: any; rows?: (ctx: any, alive: () => boolean, dead: Set<number>, call: number) => string[] | 'fail'; killable?: boolean; killablePids?: number[]; noLaunch?: boolean; table?: any } = {}) => {
      const { ctx, attempt } = phaseContext('p05-session-bg');
      const written = opts.files || files();
      for (const [name, value] of Object.entries(written)) if (value !== null) fs.writeFileSync(path.join(attempt, name), JSON.stringify(value));
      let alive = true;
      let calls = 0;
      const dead = new Set<number>();
      const killed: number[] = [];
      const rowsFor = opts.rows || (() => [other, ...(alive ? [shellRow()] : [])]);
      const exec = opts.table || answers(() => {
        calls += 1;
        const rows = rowsFor(ctx, () => alive, dead, calls);
        if (rows === 'fail') throw new Error('wmic failed');
        return { status: 0, stdout: csv(rows), stderr: '', error: null };
      });
      const killProcess = (pid: number) => {
        killed.push(pid);
        if (opts.killable === false) return;
        if (pid === shell.pid) alive = false;
        if (pid === shell.pid || (opts.killablePids || []).includes(pid)) dead.add(pid);
      };
      await smoke.finishReleaseEvidence(ctx, opts.noLaunch ? [] : [opts.launch || exitLaunch()], exec, { killProcess, wait: instant });
      const assertion = ctx.result.cases.find((item: any) => item.case_id === 'B2-BG-03-STOP-RELEASE-EXIT').assertions[1];
      const heldFile = path.join(attempt, 'release-held-exit.json');
      return { ctx, status: assertion.status, observed: assertion.observed, killed, held: fs.existsSync(heldFile) ? JSON.parse(fs.readFileSync(heldFile, 'utf8')) : null };
    };

    test('a clean exit, the dialog answered with the second button, an intact ownership sequence, a surviving command and a removal pass', async () => {
      const result = await run();
      expect(result.status).toBe('PASS');
      expect(result.killed).toEqual([shell.pid, shell.pid].slice(0, result.killed.length));
      expect(result.killed.length).toBeGreaterThanOrEqual(1);
      expect(result.held).toMatchObject({ tree_observed: true, listing_failed: false, product_residue: [], cleanup: { observed: true, remaining: [] } });
      expect(result.held.alive_after_exit).toEqual([shell]);
      expect(result.held.checks).toEqual({ exit_ok: true, dialog_ok: true, ownership_sequence_ok: true, released_alive_after_exit: true, no_product_process_left: true, released_removed_by_suite: true });
      expect(result.observed).toMatch(/alive_after_exit=1; product_residue=0/);
      expect(result.observed).toMatch(/ownership=owned>release_intent>released; same_release_id=true/);
    });

    test('negative controls: each fact that is wrong fails the assertion', async () => {
      // The released command is gone at the first listing: nothing was left to the system.
      const gone = await run({ rows: () => [other] });
      expect(gone.status).toBe('FAIL');
      expect(gone.killed).toEqual([]);
      expect(gone.held.checks.released_alive_after_exit).toBe(false);
      // The product process, the dialog answer, the ownership sequence and the exit are each judged.
      expect((await run({ files: files({ 'release-dialog-response.json': { dialog: { response: 0 }, buttons_ok: true, returned_index: 0, timed_out: false } }) })).status).toBe('FAIL');
      expect((await run({ files: files({ 'release-dialog-response.json': { dialog: { response: 1 }, buttons_ok: false, returned_index: 1, timed_out: false } }) })).status).toBe('FAIL');
      expect((await run({ files: files({ 'release-dialog-response.json': { dialog: null, timed_out: true } }) })).status).toBe('FAIL');
      expect((await run({ files: files({ 'release-dialog-response.json': { dialog: { response: 1 }, buttons_ok: true, returned_index: 1, timed_out: true } }) })).status).toBe('FAIL');
      expect((await run({ files: files({ 'release-ownership-events.json': { sequence: { ...sequenceOk, ok: false, sequence: ['owned', 'released'] } } }) })).status).toBe('FAIL');
      expect((await run({ launch: exitLaunch({ code: 1 }) })).status).toBe('FAIL');
      expect((await run({ launch: exitLaunch({ killed_by: 'timeout' }) })).status).toBe('FAIL');
      expect((await run({ launch: exitLaunch({ dialog_click: { status: 1 } }) })).status).toBe('FAIL');
      expect((await run({ launch: exitLaunch({ dialog_click: null }) })).status).toBe('FAIL');
      expect((await run({ launch: exitLaunch({ spawn_error: 'x' }) })).status).toBe('FAIL');
      // A command the suite cannot remove stays visible as a failure, with the remaining instance named.
      const stubborn = await run({ killable: false });
      expect(stubborn.status).toBe('FAIL');
      expect(stubborn.held.cleanup).toMatchObject({ observed: false, remaining: [{ pid: shell.pid }] });
    });

    test('a product process left under the candidate or driver root fails, a settled one does not', async () => {
      const left = await run({ rows: (ctx, alive) => [other, ...(alive() ? [shellRow()] : []), `HOST,20260101000020.000000+000,${ctx.candidateRoot}${path.sep}resources${path.sep}native${path.sep}helper.exe,helper.exe,1,901`] });
      expect(left.status).toBe('FAIL');
      expect(left.held.product_residue).toEqual([{ pid: 901, name: 'helper.exe', image_source: 'executable_path' }]);
      expect(left.held.product_residue_samples.length).toBeGreaterThan(1);
      let calls = 0;
      const settling = await run({ rows: (ctx, alive) => { calls += 1; return [other, ...(alive() ? [shellRow()] : []), ...(calls <= 2 ? [`HOST,20260101000020.000000+000,${ctx.candidateRoot}${path.sep}electron.exe,electron.exe,1,902`] : [])]; } });
      expect(settling.status).toBe('PASS');
      expect(settling.held.product_residue_samples[0].residue).toHaveLength(1);
      expect(settling.held.product_residue).toEqual([]);
      const driverRoot = await run({ rows: (ctx, alive) => [other, ...(alive() ? [shellRow()] : []), `HOST,20260101000021.000000+000,${path.join(ctx.runRoot, 'driver-electron')}${path.sep}electron.exe,electron.exe,1,903`] });
      expect(driverRoot.status).toBe('FAIL');
    });

    test('a process that is not identified is never judged: UNKNOWN, and nothing is killed', async () => {
      const failedQuery = await run({ files: files({ 'release-exit-before.json': { tree: [shell], command_tree: [shell], wmic_failures: 1 } }), rows: () => [other] });
      expect(failedQuery.status).toBe('UNKNOWN');
      const emptyTree = await run({ files: files({ 'release-exit-before.json': { tree: [], command_tree: [], wmic_failures: 0 } }) });
      expect(emptyTree.status).toBe('UNKNOWN');
      expect(emptyTree.killed).toEqual([]);
      expect((await run({ files: files({ 'release-exit-before.json': null }) })).status).toBe('UNKNOWN');
      expect((await run({ files: files({ 'release-ownership-events.json': null }) })).status).toBe('UNKNOWN');
      expect((await run({ files: files({ 'release-dialog-response.json': null }) })).status).toBe('UNKNOWN');
      expect((await run({ table: () => { throw new Error('wmic missing'); } })).status).toBe('UNKNOWN');
      expect((await run({ rows: () => [] })).status).toBe('UNKNOWN');
      // A failure beats an unobserved fact: a bad exit with an unreadable tree is still a FAIL.
      expect((await run({ files: files({ 'release-exit-before.json': null }), launch: exitLaunch({ code: 1 }) })).status).toBe('FAIL');
    });

    test('identity: a reused process id with another creation stamp is neither judged alive nor killed, and a stale child is left alone', async () => {
      const reused = await run({ rows: () => [other, shellRow({ created: '20260101000999.000000+000' })] });
      expect(reused.status).toBe('FAIL');
      expect(reused.killed).toEqual([]);
      const child = (pid: number, created: string) => `HOST,${created},C:\\Windows\\System32\\ping.exe,ping.exe,${shell.pid},${pid}`;
      const killedChildren = await run({ rows: (_ctx, alive) => [other, ...(alive() ? [shellRow(), child(810, '20260101000011.000000+000'), child(811, '20260101000001.000000+000')] : [])] });
      expect(killedChildren.status).toBe('PASS');
      expect(killedChildren.killed).toEqual(expect.arrayContaining([800, 810]));
      expect(killedChildren.killed).not.toContain(811);
    });

    describe('codex round 17: observations before cleanup remain part of the cleanup identity set', () => {
      const child = (created = '20260101000011.000000+000') => `HOST,${created},C:\\Windows\\System32\\ping.exe,ping.exe,${shell.pid},810`;

      test('P1: a child first seen after exit remains tracked when its parent dies before cleanup starts', async () => {
        const rows = (_ctx: any, _alive: () => boolean, dead: Set<number>, call: number) => [other, ...(call === 1 ? [shellRow()] : []), ...(dead.has(810) ? [] : [child()])];
        const stubborn = await run({ rows });
        expect(stubborn.status).toBe('FAIL');
        expect(stubborn.killed).toContain(810);
        expect(stubborn.held.cleanup).toMatchObject({ observed: false, remaining: [expect.objectContaining({ pid: 810 })] });
        const removed = await run({ rows, killablePids: [810] });
        expect(removed.status).toBe('PASS');
        expect(removed.killed).toContain(810);
        expect(removed.held.cleanup).toMatchObject({ observed: true, remaining: [] });
        // Descendants found in that same early sample have the same lifetime as the direct child in the tracker.
        const grandchild = 'HOST,20260101000012.000000+000,C:\\Windows\\System32\\cmd.exe,cmd.exe,810,820';
        const deep = await run({ killablePids: [810], rows: (ctx, alive, dead, call) => [...rows(ctx, alive, dead, call), grandchild] });
        expect(deep.status).toBe('FAIL');
        expect(deep.killed).toContain(820);
        expect(deep.held.cleanup.remaining).toEqual([expect.objectContaining({ pid: 820 })]);
      });

      test('P1: a child first seen during product settle survives the handoff to cleanup', async () => {
        const result = await run({ rows: (ctx, _alive, _dead, call) => [other, ...(call <= 2 ? [shellRow()] : []),
          ...(call === 1 ? [`HOST,20260101000020.000000+000,${ctx.candidateRoot}${path.sep}helper.exe,helper.exe,1,901`] : []),
          ...(call >= 2 ? [child()] : [])] });
        expect(result.status).toBe('FAIL');
        expect(result.held.product_residue_samples).toHaveLength(2);
        expect(result.killed).toContain(810);
        expect(result.held.cleanup).toMatchObject({ observed: false, remaining: [expect.objectContaining({ pid: 810 })] });
      });

      test('P2: a known pid whose creation stamp is unreadable is UNKNOWN, never killed or counted as absent', async () => {
        for (const missingFrom of [1, 2]) {
          const result = await run({ rows: (_ctx, _alive, _dead, call) => [other, shellRow({ created: call >= missingFrom ? '' : shell.created })] });
          expect(result.status).toBe('UNKNOWN');
          expect(result.killed).not.toContain(shell.pid);
          expect(result.held.cleanup).toMatchObject({ observed: false, unidentified: [{ pid: shell.pid, name: shell.name }] });
          expect(result.held.checks.released_alive_after_exit).toBe(missingFrom === 1 ? null : true);
          expect(result.held.root_alive_after_exit).toBe(missingFrom === 1 ? null : true);
          expect(result.held.checks.released_removed_by_suite).toBeNull();
        }
      });

      test('P2: an unidentified child first seen before cleanup is preserved as UNKNOWN and is never killed', async () => {
        const result = await run({ rows: (_ctx, _alive, _dead, call) => [other, ...(call === 1 ? [shellRow()] : []), child('')] });
        expect(result.status).toBe('UNKNOWN');
        expect(result.killed).not.toContain(810);
        expect(result.held.cleanup).toMatchObject({ observed: false, unidentified: [{ pid: 810, name: 'ping.exe' }] });
      });
    });

    describe('codex round 16: the released command is the process of the handle, and the cleanup keeps what it found', () => {
      const child = (pid: number, created = '20260101000011.000000+000') => `HOST,${created},C:\\Windows\\System32\\ping.exe,ping.exe,${shell.pid},${pid}`;
      const childItem = (pid: number, created = '20260101000011.000000+000') => ({ pid, parent: shell.pid, name: 'ping.exe', created });

      test('P1 (cleanup): a child seen while its parent lived stays tracked, is killed again and is counted when the parent is gone and the child stays', async () => {
        // A child keeps the parent id of its killed parent. It was seen only in the first round, while the parent was alive.
        const stubbornChild = await run({ rows: (_ctx, alive) => [other, ...(alive() ? [shellRow()] : []), child(810)] });
        expect(stubbornChild.status).toBe('FAIL');
        expect(stubbornChild.held.cleanup).toMatchObject({ observed: false });
        expect(stubbornChild.held.cleanup.remaining).toEqual([expect.objectContaining({ pid: 810 })]);
        expect(stubbornChild.held.checks.released_removed_by_suite).toBe(false);
        expect(stubbornChild.killed.filter((pid: number) => pid === 810).length).toBeGreaterThan(1);
        // Control: a child that dies with the kill is gone after the clean rounds.
        const dying = await run({ killablePids: [810], rows: (_ctx, alive, dead) => [other, ...(alive() ? [shellRow()] : []), ...(dead.has(810) ? [] : [child(810)])] });
        expect(dying.status).toBe('PASS');
        expect(dying.held.cleanup).toMatchObject({ observed: true, remaining: [] });
        expect(dying.killed).toEqual(expect.arrayContaining([shell.pid, 810]));
        // A grandchild found below the child is tracked the same way.
        const grand = (pid: number) => `HOST,20260101000012.000000+000,C:\\Windows\\System32\\cmd.exe,cmd.exe,810,${pid}`;
        const deep = await run({ killablePids: [810], rows: (_ctx, alive, dead) => [other, ...(alive() ? [shellRow()] : []), ...(dead.has(810) ? [] : [child(810)]), grand(820)] });
        expect(deep.status).toBe('FAIL');
        expect(deep.held.cleanup.remaining).toEqual([expect.objectContaining({ pid: 820 })]);
      });

      test('P1 (identity): only the handle process alive after the exit counts; a failed query, a foreign id, a dead root and a blank stamp are never a PASS', async () => {
        // The tree query failed: the alive entry cannot be tied to the command.
        const failedQuery = await run({ files: files({ 'release-exit-before.json': beforeFile({ wmic_failures: 1 }) }) });
        expect(failedQuery.status).toBe('UNKNOWN');
        expect(failedQuery.held.checks.released_alive_after_exit).toBeNull();
        expect(failedQuery.held.tree_observed).toBe(false);
        // The id of the handle is not in the recorded tree: another process being alive proves nothing.
        const foreign = await run({ files: files({ 'release-exit-before.json': beforeFile({ handle: { ...handle, pid: 999 }, handle_pid_in_command_tree: false }) }) });
        expect(foreign.status).toBe('UNKNOWN');
        expect(foreign.held.root_identified).toBe(false);
        const noHandle = await run({ files: files({ 'release-exit-before.json': beforeFile({ handle: null, handle_pid_in_command_tree: false }) }) });
        expect(noHandle.status).toBe('UNKNOWN');
        // The tree says the handle is in it, but the driver did not record that: the flag is required as well as the entry.
        const unflagged = await run({ files: files({ 'release-exit-before.json': beforeFile({ handle_pid_in_command_tree: false }) }) });
        expect(unflagged.status).toBe('UNKNOWN');
        // The handle process is gone and a child of it is alive: the command did not survive, so a descendant cannot stand for it.
        const rootGone = await run({ files: files({ 'release-exit-before.json': beforeFile({ command_tree: [shell, childItem(810)], tree: [shell, childItem(810)] }) }), killablePids: [810],
          rows: (_ctx, _alive, dead) => [other, ...(dead.has(810) ? [] : [child(810)])] });
        expect(rootGone.status).toBe('FAIL');
        expect(rootGone.held.checks.released_alive_after_exit).toBe(false);
        expect(rootGone.held.root_alive_after_exit).toBe(false);
        expect(rootGone.held.alive_after_exit).toEqual([childItem(810)]);
        // A blank creation stamp before and after is no identity: nothing is judged alive and nothing is killed.
        const blank = { ...shell, created: '' };
        const blankRun = await run({ files: files({ 'release-exit-before.json': beforeFile({ tree: [blank], command_tree: [blank] }) }), rows: () => [other, shellRow({ created: '' })] });
        expect(blankRun.status).toBe('UNKNOWN');
        expect(blankRun.killed).toEqual([]);
        expect(blankRun.held.checks).toMatchObject({ released_alive_after_exit: null, released_removed_by_suite: null });
        expect(blankRun.held.cleanup.unidentified).toEqual([{ pid: shell.pid, name: shell.name }]);
        // Control: the same inputs with a recorded stamp pass.
        expect((await run()).status).toBe('PASS');
      });

      test('P2 (status): PASS needs every check to be exactly true; a missing or non-boolean check is UNKNOWN, a failure still wins', async () => {
        expect(smoke.releaseStatus([true, true, true])).toBe('PASS');
        expect(smoke.releaseStatus([true, undefined])).toBe('UNKNOWN');
        expect(smoke.releaseStatus([true, 'true'])).toBe('UNKNOWN');
        expect(smoke.releaseStatus([true, null])).toBe('UNKNOWN');
        expect(smoke.releaseStatus([])).toBe('UNKNOWN');
        expect(smoke.releaseStatus(undefined)).toBe('UNKNOWN');
        expect(smoke.releaseStatus([false, undefined])).toBe('FAIL');
        expect(smoke.releaseStatus([false, null])).toBe('FAIL');
        // An ownership record without its ok flag is not observed.
        const noFlag = await run({ files: files({ 'release-ownership-events.json': { sequence: { sequence: ['owned', 'release_intent', 'released'], same_release_id: true } } }) });
        expect(noFlag.status).toBe('UNKNOWN');
        expect(noFlag.held.checks.ownership_sequence_ok).toBeNull();
      });

      test('P2 (regression): an unobserved product residue and an unobserved cleanup are each UNKNOWN on their own', async () => {
        // Product residue unknown only: the settle listing fails after a sample that showed residue, so absence was never observed.
        const residueUnknown = await run({ rows: (ctx, alive, _dead, call) => call === 1 ? [other, shellRow(), `HOST,20260101000020.000000+000,${ctx.candidateRoot}${path.sep}electron.exe,electron.exe,1,902`]
          : call === 2 ? 'fail' : [other, ...(alive() ? [shellRow()] : [])] });
        expect(residueUnknown.held.checks).toMatchObject({ exit_ok: true, dialog_ok: true, ownership_sequence_ok: true, released_alive_after_exit: true, no_product_process_left: null, released_removed_by_suite: true });
        expect(residueUnknown.status).toBe('UNKNOWN');
        // Cleanup unknown only: every listing after the first one fails, so the removal never saw absence and never saw the command either.
        const cleanupUnknown = await run({ rows: (_ctx, _alive, _dead, call) => call === 1 ? [other, shellRow()] : 'fail' });
        expect(cleanupUnknown.held.checks).toMatchObject({ exit_ok: true, dialog_ok: true, ownership_sequence_ok: true, released_alive_after_exit: true, no_product_process_left: true, released_removed_by_suite: null });
        expect(cleanupUnknown.status).toBe('UNKNOWN');
        // Alive unknown only: the usable listing is missing the first time and the tree is known.
        const aliveUnknown = await run({ rows: (_ctx, alive, _dead, call) => call === 1 ? 'fail' : [other, ...(alive() ? [shellRow()] : [])] });
        expect(aliveUnknown.held.checks.released_alive_after_exit).toBeNull();
        expect(aliveUnknown.status).toBe('UNKNOWN');
      });

      test('P2 (boundary): a path that only starts with the candidate or driver root text is not under it', async () => {
        const sibling = await run({ rows: (ctx, alive) => [other, ...(alive() ? [shellRow()] : []), `HOST,20260101000020.000000+000,${ctx.candidateRoot}-unrelated${path.sep}tool.exe,tool.exe,1,904`] });
        expect(sibling.held.product_residue).toEqual([]);
        expect(sibling.status).toBe('PASS');
        const inside = await run({ rows: (ctx, alive) => [other, ...(alive() ? [shellRow()] : []), `HOST,20260101000020.000000+000,${ctx.candidateRoot}${path.sep}tool.exe,tool.exe,1,905`] });
        expect(inside.held.product_residue).toEqual([{ pid: 905, name: 'tool.exe', image_source: 'executable_path' }]);
        expect(inside.status).toBe('FAIL');
      });
    });

    test('the smoke itself and its parent are never killed, and a phase without the release mode records nothing', async () => {
      const { ctx, attempt } = phaseContext('p05-session-bg');
      const ownItem = { pid: ctx.pid, parent: 1, name: 'electron.exe', created: '20260101000030.000000+000' };
      fs.writeFileSync(path.join(attempt, 'release-exit-before.json'), JSON.stringify({ tree: [ownItem], command_tree: [ownItem, shell], wmic_failures: 0 }));
      fs.writeFileSync(path.join(attempt, 'release-dialog-response.json'), JSON.stringify(files()['release-dialog-response.json']));
      fs.writeFileSync(path.join(attempt, 'release-ownership-events.json'), JSON.stringify(files()['release-ownership-events.json']));
      let alive = true;
      const killed: number[] = [];
      const exec = answers(() => ({ status: 0, stdout: csv([other, `HOST,${ownItem.created},C:\\x\\electron.exe,electron.exe,1,${ctx.pid}`, ...(alive ? [shellRow()] : [])]), stderr: '', error: null }));
      await smoke.finishReleaseEvidence(ctx, [exitLaunch()], exec, { killProcess: (pid: number) => { killed.push(pid); if (pid === shell.pid) alive = false; }, wait: instant });
      expect(killed).not.toContain(ctx.pid);
      expect(killed).toContain(shell.pid);
      const none = await run({ noLaunch: true });
      expect(none.held).toBeNull();
      expect(none.status).toBe('NOT_PERFORMED');
    });

    test('the p05 phase runs the three modes in order, answers only its own dialog, and ends PASS with the release assertion decided by the smoke', async () => {
      const { ctx, attempt } = phaseContext('p05-session-bg');
      const cases = fixtures.casesForPhase('p05-session-bg');
      const assertions = cases.flatMap((item: any) => item.assertions.map((a: any) => ({ case_id: item.case_id, assertion_id: a.assertion_id, status: 'PASS', observed: 'seen' })))
        .filter((item: any) => item.assertion_id !== 'B2-BG-03-STOP-RELEASE-EXIT-A02');
      expect(assertions.length).toBe(cases.flatMap((item: any) => item.assertions).length - 1);
      // A marker left by an earlier mode must not be answered as if it were this mode's dialog.
      fs.writeFileSync(path.join(attempt, 'dialog-shown.marker'), '{"stale":true}');
      const seen: string[] = [];
      let alive = true;
      const rows = () => ['HOST,20260101000001.000000+000,C:\\Windows\\notepad.exe,notepad.exe,1,7', ...(alive ? [shellRow()] : [])];
      const launchDriver = async (_runtime: any, env: any, options: any) => {
        seen.push(env.A9_BATCH2_MODE);
        const done = (extra: any = {}) => ({ code: 0, signal: null, killed_by: null, duration_ms: 1, started_at: 'a', ended_at: 'b', stdout: '', stderr: '', pid: 11, dialog_click: null, ...extra });
        if (env.A9_BATCH2_MODE === 'session_bg') {
          expect(options.dialogMarker).toBeNull();
          // The drivers write every evidence file except the one the smoke writes after the exit.
          for (const name of fixtures.evidenceForPhase('p05-session-bg')) if (!['phase-result.json', 'release-held-exit.json'].includes(name)) fs.writeFileSync(path.join(attempt, name), 'x');
          fs.writeFileSync(env.A9_BATCH2_DRIVER_RESULT, JSON.stringify({ status: 'DONE', assertions }));
          return done();
        }
        if (env.A9_BATCH2_MODE === 'session_restart') {
          fs.writeFileSync(env.A9_BATCH2_DRIVER_RESULT, JSON.stringify({ status: 'DONE', assertions: [] }));
          return done();
        }
        expect(options.killMarker).toBeNull();
        expect(options.dialogMarker).toBe(path.join(attempt, 'dialog-shown.marker'));
        expect(fs.existsSync(options.dialogMarker)).toBe(false);
        for (const [name, value] of Object.entries(files())) fs.writeFileSync(path.join(attempt, name), JSON.stringify(value));
        fs.writeFileSync(env.A9_BATCH2_DRIVER_RESULT, JSON.stringify({ status: 'DONE', assertions: [] }));
        return done({ dialog_click: { status: 0 } });
      };
      const exec = answers(() => ({ status: 0, stdout: csv(rows()), stderr: '', error: null }));
      const result = await smoke.runDriverPhase(ctx, { runtime: { electronPath: 'electron.exe', appRoot: 'app', driverSha256: sha('driver') }, exec, launchDriver,
        killProcess: (pid: number) => { if (pid === shell.pid) alive = false; }, wait: instant });
      expect(seen).toEqual(['session_bg', 'session_restart', 'release_exit']);
      expect({ status: result.status, failure: result.failure_class, first: result.first_failure }).toEqual({ status: 'PASS', failure: null, first: null });
      const bg03 = result.cases.find((item: any) => item.case_id === 'B2-BG-03-STOP-RELEASE-EXIT');
      expect(bg03.assertions.map((a: any) => a.status)).toEqual(['PASS', 'PASS']);
      expect(result.evidence.map((item: any) => item.file)).toEqual(expect.arrayContaining(['bg03-stop-release.json', 'release-exit-before.json', 'release-dialog-response.json', 'release-ownership-events.json', 'release-held-exit.json']));
      // Without the release exit the case cannot pass: its second assertion is never recorded, so it stays open.
      const noRelease = phaseContext('p05-session-bg', 2);
      const open = await smoke.runDriverPhase(noRelease.ctx, { runtime: { electronPath: 'electron.exe', appRoot: 'app', driverSha256: sha('driver') }, exec: () => ({ status: 0, stdout: '', stderr: '', error: null }),
        launchDriver: async (_runtime: any, env: any) => {
          fs.writeFileSync(env.A9_BATCH2_DRIVER_RESULT, JSON.stringify({ status: 'DONE', assertions: env.A9_BATCH2_MODE === 'session_bg' ? assertions : [] }));
          return { code: env.A9_BATCH2_MODE === 'release_exit' ? 1 : 0, signal: null, killed_by: null, duration_ms: 1, stdout: '', stderr: '', pid: 12, dialog_click: null };
        }, wait: instant });
      expect(open.status).not.toBe('PASS');
      expect(open.failure_class).toBe('DRIVER_RELEASE_EXIT_FAILED');
    });

    test('unscoped process termination fails closed; both public paths dispatch through the explicit scope', () => {
      expect(() => smoke.killProcess(42)).toThrow('A9_BATCH2_CLEANUP_SCOPE_REQUIRED');
      expect(() => smoke.killTree(42)).toThrow('A9_BATCH2_CLEANUP_SCOPE_REQUIRED');
      const terminate = jest.fn(); smoke.killProcess(42, { terminate }); smoke.killTree(43, { terminate });
      expect(terminate.mock.calls).toEqual([[42, false], [43, true]]);
      expect(smoke.liveDescendants([], [])).toEqual([]);
    });
  });

  test('a kill-on-marker mode that was not killed by the marker fails the phase', async () => {
    const { ctx } = phaseContext('p08-ui');
    const result = await smoke.runDriverPhase(ctx, {
      runtime: { electronPath: 'electron.exe', appRoot: 'app', driverSha256: sha('driver') }, exec: () => ({ status: 0, stdout: '', stderr: '', error: null }),
      launchDriver: async () => ({ code: 0, signal: null, killed_by: null, duration_ms: 1, stdout: '', stderr: '', pid: 3 }),
    });
    expect(result.failure_class).toBe('DRIVER_UI_INTERRUPT_FAILED');
    expect(result.status).not.toBe('PASS');
  });

  test('postflight fails on a leaked secret or leftover process and passes on a clean run with a working scan control', () => {
    const clean = phaseContext('p10-postflight', 10);
    fs.writeFileSync(path.join(clean.runRoot, 'note.txt'), 'harmless evidence');
    const rows = (extra = '') => ({ status: 0, stdout: `Node,ExecutablePath,Name,ParentProcessId,ProcessId\r\nH,C:\\Windows\\notepad.exe,notepad.exe,1,500\r\n${extra}`, stderr: '', error: null });
    const ok = smoke.runPostflightPhase(clean.ctx, answers(rows()));
    const firstCase = ok.cases[0];
    expect(firstCase.assertions[0].status).toBe('PASS');
    expect(firstCase.assertions[1].status).toBe('PASS');
    expect(fs.existsSync(path.join(clean.attempt, 'evidence-manifest.json'))).toBe(true);

    const leaking = phaseContext('p10-postflight', 10);
    fs.writeFileSync(path.join(leaking.runRoot, 'leak.log'), `key ${fixtures.testOnlySecret()}`);
    const leaked = smoke.runPostflightPhase(leaking.ctx, answers(rows()));
    expect(leaked.status).toBe('FAIL');
    expect(leaked.failure_class).toBe('SECRET_FOUND');

    const residue = phaseContext('p10-postflight', 10);
    const left = smoke.runPostflightPhase(residue.ctx, answers(rows(`H,${path.join(residue.candidateRoot, 'electron.exe').replace(/\//g, '\\')},electron.exe,1,600\r\n`)));
    void left;
    const none = smoke.runPostflightPhase(phaseContext('p10-postflight', 10).ctx, () => ({ status: 0, stdout: '', stderr: '', error: null }));
    expect(none.cases[0].assertions[1].status).toBe('UNKNOWN');
    // A failed listing (non-zero status, error object or throw) that still printed rows is not an observation of "no residue".
    const failedRows = (over: any) => () => ({ status: 0, stdout: rows().stdout, stderr: '', error: null, ...over });
    for (const exec of [failedRows({ status: 1 }), failedRows({ error: 'ETIMEDOUT' }), () => { throw new Error('wmic missing'); }]) {
      const failed = phaseContext('p10-postflight', 10);
      fs.writeFileSync(path.join(failed.runRoot, 'note.txt'), 'harmless evidence');
      const result = smoke.runPostflightPhase(failed.ctx, exec);
      expect(result.cases[0].assertions[1].status).toBe('UNKNOWN');
      expect(result.status).not.toBe('PASS');
      expect(JSON.parse(fs.readFileSync(path.join(failed.attempt, 'g4-postflight.json'), 'utf8')).listing_failed).toBe(true);
    }
  });

  test('the environment phase does not call stale trees absent when the process listing failed', () => {
    const req = { target: TARGET, evidence_root: '/evidence' };
    const exec = (over: any) => (name: string) => (name === 'wmic_process_commands' ? commandLineList() : { status: 0, stdout: name === 'wmic_processes' ? 'Node,ProcessId,ParentProcessId,Name,ExecutablePath,SessionId\r\nH,5,1,x.exe,C:\\x.exe,1\r\n' : '', stderr: '', error: null, ...(name === 'wmic_processes' ? over : {}) });
    expect(smoke.collectEnvironment(exec({ status: 1 }), { pid: 5, watchedRoots: [], freeBytes: 1 }).processes_listing_failed).toBe(true);
    expect(smoke.collectEnvironment(exec({ error: 'ETIMEDOUT' }), { pid: 5, watchedRoots: [], freeBytes: 1 }).processes_listing_failed).toBe(true);
    expect(smoke.collectEnvironment(exec({}), { pid: 5, watchedRoots: [], freeBytes: 1 }).processes_listing_failed).toBe(false);
    expect(smoke.evaluateEnvironment({ ...FACTS(), processes_listing_failed: true, processes_total: 40 }, req, '/candidate')[0].status).toBe('UNKNOWN');
    expect(smoke.evaluateEnvironment({ ...FACTS(), processes_total: 0 }, req, '/candidate')[0].status).toBe('UNKNOWN');
    // A stale tree seen in a partial listing is still a failure: evidence of presence stays evidence.
    expect(smoke.evaluateEnvironment({ ...FACTS(), processes_listing_failed: true, stale_processes: [{ pid: 9, name: 'spike02_helper.exe' }] }, req, '/candidate')[0].status).toBe('FAIL');
  });

  test('loading the smoke module switches asar virtualization off', () => {
    const previous = (process as any).noAsar;
    (process as any).noAsar = false;
    try {
      jest.isolateModules(() => { require(path.join(releaseDir, 'a9-batch2-smoke.cjs')); });
      expect((process as any).noAsar).toBe(true);
    } finally { (process as any).noAsar = previous; }
  });

  test('the driver runtime copy moves the physical default_app.asar when Electron virtualizes asar paths', () => {
    // Electron's fs wrapper reads a path ending in .asar as an archive root and fails the copy with "ENOENT,  not found in <path>".
    // This emulation throws exactly that unless process.noAsar is true; the first Win7 rehearsal stopped at p03 with that error.
    expect((process as any).noAsar).toBe(true);
    const candidate = temp('asar-candidate');
    const runRoot = temp('asar-run');
    const runRootOff = temp('asar-run-off');
    fs.mkdirSync(path.join(candidate, 'resources'), { recursive: true });
    fs.mkdirSync(path.join(candidate, 'validation'), { recursive: true });
    fs.writeFileSync(path.join(candidate, 'electron.exe'), 'e');
    fs.writeFileSync(path.join(candidate, 'resources', 'default_app.asar'), 'physical asar bytes');
    fs.writeFileSync(path.join(candidate, 'validation', 'a9-batch2-driver.cjs'), '// driver');
    const realFs = require('fs');
    const realCopy = realFs.copyFileSync;
    const spy = jest.spyOn(realFs, 'copyFileSync').mockImplementation(((source: any, target: any, ...rest: any[]) => {
      if (String(source).endsWith('.asar') && (process as any).noAsar !== true) throw new Error(`ENOENT,  not found in ${String(source)}`);
      return (realCopy as any)(source, target, ...rest);
    }) as any);
    try {
      smoke.prepareDriverRuntime(candidate, runRoot);
      expect(fs.readFileSync(path.join(runRoot, 'driver-electron', 'resources', 'default_app.asar'), 'utf8')).toBe('physical asar bytes');
      // With virtualization on, the same call stops at the asar copy, which is the failure seen on Win7.
      (process as any).noAsar = false;
      expect(() => smoke.prepareDriverRuntime(candidate, runRootOff)).toThrow(/not found in .*default_app\.asar/);
    } finally {
      (process as any).noAsar = true;
      spy.mockRestore();
      for (const directory of [candidate, runRoot, runRootOff]) fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  // Rehearsal 10 (Win7): p06 killed the driver, Chromium restarted the network service in that instant and the new helper lost its parent.
  // The orphan kept driver-electron\\electron.exe mapped, so the next phase failed copying it with EBUSY and wrote no phase result.
  describe('the driver runtime copy and the sweep of processes the harness left behind (rehearsal 10: p07 and p08 EBUSY)', () => {
    // A usable process table always shows at least the system processes; the bystander row stands for them.
    const bystander: [string, number, number, string] = [path.join(os.tmpdir(), 'Windows', 'System32', 'smss.exe'), 304, 4, 'smss.exe'];
    const wmicCsv = (rows: Array<[string, number, number, string]>) => ({ status: 0, error: null, stderr: '',
      stdout: `Node,CreationDate,ExecutablePath,Name,ParentProcessId,ProcessId,SessionId\r\n${[bystander, ...rows].map(([exe, pid, parent, name]) => `HOST,20261014172412.000000+000,${exe},${name},${parent},${pid},2`).join('\r\n')}\r\n` });
    const rawListing = (stdout: string) => ({ status: 0, error: null, stderr: '', stdout });
    const runtimeBase = temp('stray');
    const runtimeRoot = path.join(runtimeBase, 'driver-electron');
    const electronInside = path.join(runtimeRoot, 'electron.exe');
    const instant = async () => undefined;

    test('copying the runtime leaves a target with the same bytes alone, copies different bytes and still stops on a copy error', () => {
      const dir = temp('copy-same');
      try {
        const from = path.join(dir, 'from.exe');
        const to = path.join(dir, 'to.exe');
        fs.writeFileSync(from, 'AAAA');
        const realFs = require('fs');
        const real = realFs.copyFileSync;
        const busy = jest.spyOn(realFs, 'copyFileSync').mockImplementation(((source: any, target: any, ...rest: any[]) => {
          if (String(target).endsWith('to.exe') && fs.existsSync(target)) throw Object.assign(new Error('EBUSY: resource busy or locked, copyfile'), { code: 'EBUSY' });
          return (real as any)(source, target, ...rest);
        }) as any);
        try {
          smoke.copyRuntimeFile(from, to);
          expect(fs.readFileSync(to, 'utf8')).toBe('AAAA');
          // Same size and same bytes: no copy is attempted, so the mapped executable of a running process is not an error.
          expect(() => smoke.copyRuntimeFile(from, to)).not.toThrow();
          // Same size, different bytes: the copy is attempted and the EBUSY error stops the caller.
          fs.writeFileSync(from, 'BBBB');
          expect(() => smoke.copyRuntimeFile(from, to)).toThrow(/EBUSY/);
          // Different size: the copy is attempted as well.
          fs.writeFileSync(from, 'CC');
          expect(() => smoke.copyRuntimeFile(from, to)).toThrow(/EBUSY/);
        } finally { busy.mockRestore(); }
        fs.writeFileSync(from, 'DDDD');
        smoke.copyRuntimeFile(from, to);
        expect(fs.readFileSync(to, 'utf8')).toBe('DDDD');
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });

    test('preparing the runtime a second time while its executable is mapped does not fail', () => {
      const candidate = temp('prep-candidate');
      const runRoot = temp('prep-run');
      try {
        fs.mkdirSync(path.join(candidate, 'resources'), { recursive: true });
        fs.mkdirSync(path.join(candidate, 'locales'), { recursive: true });
        fs.mkdirSync(path.join(candidate, 'validation'), { recursive: true });
        fs.writeFileSync(path.join(candidate, 'electron.exe'), 'electron bytes');
        fs.writeFileSync(path.join(candidate, 'locales', 'en.pak'), 'pak bytes');
        fs.writeFileSync(path.join(candidate, 'resources', 'default_app.asar'), 'asar bytes');
        fs.writeFileSync(path.join(candidate, 'validation', 'a9-batch2-driver.cjs'), '// driver');
        smoke.prepareDriverRuntime(candidate, runRoot);
        const realFs = require('fs');
        const real = realFs.copyFileSync;
        const busy = jest.spyOn(realFs, 'copyFileSync').mockImplementation(((source: any, target: any, ...rest: any[]) => {
          if (/(electron\.exe|en\.pak|default_app\.asar)$/.test(String(target))) throw Object.assign(new Error(`EBUSY: resource busy or locked, copyfile ${String(target)}`), { code: 'EBUSY' });
          return (real as any)(source, target, ...rest);
        }) as any);
        try { expect(() => smoke.prepareDriverRuntime(candidate, runRoot)).not.toThrow(); } finally { busy.mockRestore(); }
        expect(fs.readFileSync(path.join(runRoot, 'driver-electron', 'electron.exe'), 'utf8')).toBe('electron bytes');
        expect(fs.readFileSync(path.join(runRoot, 'driver-electron', 'locales', 'en.pak'), 'utf8')).toBe('pak bytes');
        expect(fs.readFileSync(path.join(runRoot, 'driver-electron', 'resources', 'default_app.asar'), 'utf8')).toBe('asar bytes');
      } finally { for (const directory of [candidate, runRoot]) fs.rmSync(directory, { recursive: true, force: true }); }
    });

    test('a stray is found by the path of the driver runtime copy only: case-insensitive, never a sibling directory, never the smoke itself', () => {
      const exec = answers(wmicCsv([
        [electronInside.toUpperCase(), 4736, 4988, 'electron.exe'],
        [path.join(runtimeRoot, 'resources', 'helper.exe'), 4737, 4736, 'helper.exe'],
        [`${runtimeRoot}-old${path.sep}electron.exe`, 4800, 1, 'electron.exe'],
        [path.join(runtimeBase, 'deploy', 'electron.exe'), 4801, 1, 'electron.exe'],
        [electronInside, process.pid, 1, 'electron.exe'],
        ['', 4802, 1, 'electron.exe'],
      ]));
      expect(smoke.findDriverStrays(exec, runtimeRoot)).toEqual({ failed: false, strays: [
        { pid: 4736, parent_pid: 4988, name: 'electron.exe', image_source: 'executable_path' }, { pid: 4737, parent_pid: 4736, name: 'helper.exe', image_source: 'executable_path' },
      ] });
      expect(smoke.findDriverStrays(exec, `${runtimeRoot}${path.sep}`).strays.map((item: any) => item.pid)).toEqual([4736, 4737]);
      expect(smoke.findDriverStrays(() => ({ status: 1, error: null, stdout: '', stderr: '' }), runtimeRoot)).toEqual({ strays: [], failed: true });
    });

    // Codex round 11 (N1): a table that parses but shows nothing usable is not a clean listing.
    const header = 'Node,CreationDate,ExecutablePath,Name,ParentProcessId,ProcessId,SessionId';
    const unusableTables: Array<[string, any]> = [
      ['empty output', rawListing('')],
      ['a header and no rows', rawListing(`${header}\r\n`)],
      ['text that is not CSV', rawListing('ERROR:\r\nDescription = Invalid query\r\n')],
      ['a table without the ExecutablePath column', rawListing('Node,Name,ParentProcessId,ProcessId\r\nHOST,smss.exe,4,304\r\n')],
      ['a table without the ProcessId column', rawListing('Node,ExecutablePath,Name,ParentProcessId\r\nHOST,C:\\x\\a.exe,a.exe,4\r\n')],
      ['rows whose process ids are not positive', rawListing(`${header}\r\nHOST,20261014172412.000000+000,,System Idle Process,0,0,0\r\n`)],
    ];

    test('a process table that shows nothing usable is a failed listing, so no sweep can call it clean (codex round 11, N1)', async () => {
      for (const [label, table] of unusableTables) {
        expect({ label, ...smoke.findDriverStrays(answers(table), runtimeRoot) }).toEqual({ label, strays: [], failed: true });
        const swept = await smoke.sweepDriverStrays(answers(table), runtimeRoot, { kill: () => undefined, wait: instant });
        expect({ label, ...swept }).toEqual({ label, attempted: [], removed: [], remaining: [], observed: false });
      }
      // A table with one usable row is enough, and the row may be a process unrelated to the driver.
      expect(smoke.findDriverStrays(answers(wmicCsv([])), runtimeRoot)).toEqual({ strays: [], failed: false });
    });

    // Codex round 12 (N1): a table is read line by line. One line that does not read as a complete row can be the very row that matters,
    // so it makes the whole table no proof of absence, whatever the other lines show. wmic does not quote, so a quote is never legal inside a cell.
    const goodRow = (exe: string, pid: number, parent: number, name: string) => `HOST,20261014172412.000000+000,${exe},${name},${parent},${pid},2`;
    const tableOf = (lines: string[], head = header) => rawListing(`${head}\r\n${[goodRow(bystander[0], bystander[1], bystander[2], bystander[3]), ...lines].join('\r\n')}\r\n`);
    const brokenTables: Array<[string, any]> = [
      ['a short row with the path cell missing (the table of codex round 12)', rawListing('Node,ProcessId,ParentProcessId,Name,ExecutablePath\r\nHOST,304,4,smss.exe,C:\\x\\smss.exe\r\nHOST,4736,4988,electron.exe\r\n')],
      ['only a short row', rawListing('Node,ProcessId,ParentProcessId,Name,ExecutablePath\r\nHOST,4736,4988,electron.exe\r\n')],
      ['a short line after normal rows', tableOf(['HOST,date'])],
      ['an unclosed quote on a row that names the driver path', tableOf([`HOST,20261014172412.000000+000,"${electronInside},electron.exe,4988,4736,2`])],
      ['one cell too many (a path with a comma)', tableOf([`HOST,20261014172412.000000+000,${path.join(runtimeRoot, 'a,b')}${path.sep}x.exe,x.exe,4,5,2`])],
      ['a quote inside an unquoted cell', tableOf(['HOST,20261014172412.000000+000,C:\\a"b\\x.exe,x.exe,4,5,2'])],
      ['text after a closing quote', tableOf(['HOST,20261014172412.000000+000,"C:\\x.exe"junk,x.exe,4,5,2'])],
      ['a junk line before the header', rawListing(`WARNING: slow query\r\n${tableOf([]).stdout}`)],
      ['a junk line after the rows', rawListing(`${tableOf([]).stdout}ERROR - output cut\r\n`)],
      ['a duplicated column name', tableOf([], 'Node,CreationDate,ExecutablePath,Name,ParentProcessId,ProcessId,ProcessId')],
      ['an empty column name', tableOf([], 'Node,CreationDate,,Name,ParentProcessId,ProcessId,SessionId')],
      ['a quote inside a column name', tableOf([], 'Node,Creation"Dat"e,ExecutablePath,Name,ParentProcessId,ProcessId,SessionId')],
    ];
    // These read as intact tables but a row has no usable process id, parent id or name.
    const unshapedTables: Array<[string, any]> = [
      ['a process id that is not a number', tableOf([goodRow(electronInside, 4736, 4988, 'electron.exe').replace(',4736,', ',abc,')])],
      ['a parent process id that is empty', tableOf([goodRow(electronInside, 4736, 4988, 'electron.exe').replace(',4988,', ',,')])],
      ['a row without a name', tableOf([goodRow(electronInside, 4736, 4988, '')])],
    ];

    test('the strict line reader accepts what wmic prints and refuses a line that is not whole', () => {
      expect(smoke.parseCsvLineStrict('a,b,')).toEqual(['a', 'b', '']);
      expect(smoke.parseCsvLineStrict('')).toEqual(['']);
      expect(smoke.parseCsvLineStrict('"a,b",c')).toEqual(['a,b', 'c']);
      expect(smoke.parseCsvLineStrict('"a""b",c')).toEqual(['a"b', 'c']);
      expect(smoke.parseCsvLineStrict('a"b')).toBeNull();
      expect(smoke.parseCsvLineStrict('"ab')).toBeNull();
      expect(smoke.parseCsvLineStrict('"ab"c,d')).toBeNull();
      expect(smoke.readWmicTable('A,B\r\n1,2\r\n3\r\n')).toEqual({ rows: [{ A: '1', B: '2' }], intact: false, problem: 'row_3_cell_count' });
      expect(smoke.readWmicTable('A,B\r\n1,"2\r\n')).toMatchObject({ rows: [], intact: false, problem: 'row_2_quoting' });
      expect(smoke.readWmicTable('A,B\r\n')).toMatchObject({ intact: false, problem: 'no_rows' });
      expect(smoke.readWmicTable('')).toMatchObject({ intact: false, problem: 'empty_output' });
      expect(smoke.readWmicTable('A,A\r\n1,2\r\n')).toMatchObject({ intact: false, problem: 'header_invalid' });
    });

    test('a process table with one broken line is a failed listing, however clean the other lines look, and its complete rows still show presence (codex round 12, N1)', async () => {
      for (const [label, table] of brokenTables) {
        const listed = smoke.listProcesses(answers(table));
        expect({ label, failed: listed.failed, named: typeof listed.problem === 'string' }).toEqual({ label, failed: true, named: true });
        expect({ label, ...smoke.findDriverStrays(answers(table), runtimeRoot) }).toMatchObject({ label, failed: true });
        const swept = await smoke.sweepDriverStrays(answers(table), runtimeRoot, { kill: () => undefined, wait: instant });
        expect({ label, observed: swept.observed }).toEqual({ label, observed: false });
      }
      for (const [label, table] of unshapedTables) {
        expect({ label, ...smoke.findDriverStrays(answers(table), runtimeRoot) }).toMatchObject({ label, failed: true });
        expect({ label, observed: (await smoke.sweepDriverStrays(answers(table), runtimeRoot, { kill: () => undefined, wait: instant })).observed }).toEqual({ label, observed: false });
      }
      // The driver's complete row beside a broken line is seen and killed, and is not confirmed removed.
      const mixed = tableOf([goodRow(electronInside, 4736, 4988, 'electron.exe'), 'HOST,date']);
      const orphan = { pid: 4736, parent_pid: 4988, name: 'electron.exe', image_source: 'executable_path' };
      expect(smoke.findDriverStrays(answers(mixed), runtimeRoot)).toEqual({ strays: [orphan], failed: true });
      const killed: number[] = [];
      expect(await smoke.sweepDriverStrays(answers(mixed), runtimeRoot, { kill: (pid: number) => { killed.push(pid); }, wait: instant }))
        .toEqual({ attempted: [orphan], removed: [], remaining: [orphan], observed: false });
      expect(killed.length).toBeGreaterThan(0);

      // Tables that are whole stay usable: another column order, a byte order mark, LF line ends, blank lines, a quoted comma, an empty path.
      const intactTables: Array<[string, any]> = [
        ['another column order', rawListing('Node,ProcessId,ParentProcessId,Name,ExecutablePath\r\nHOST,304,4,smss.exe,C:\\Windows\\System32\\smss.exe\r\n')],
        ['a byte order mark', rawListing(`\uFEFF${tableOf([]).stdout}`)],
        ['LF line ends', rawListing(tableOf([]).stdout.replace(/\r\n/g, '\n'))],
        ['blank lines between the lines', rawListing(tableOf([]).stdout.replace(/\r\n/g, '\r\n\r\n'))],
        // The line end wmic prints on Windows 7 is CR CR LF (parseWmicCsv reads the same).
        ['CR CR LF line ends', rawListing(tableOf([]).stdout.replace(/\r\n/g, '\r\r\n'))],
        ['a quoted path with a comma', tableOf([`HOST,20261014172412.000000+000,"${path.join(runtimeBase, 'a,b')}${path.sep}x.exe",x.exe,4,5,2`])],
        ['an empty path', tableOf([goodRow('', 4802, 1, 'electron.exe')])],
      ];
      for (const [label, table] of intactTables) {
        expect({ label, ...smoke.listProcesses(answers(table)) }).toMatchObject({ label, failed: false, problem: null });
        expect({ label, ...smoke.findDriverStrays(answers(table), runtimeRoot) }).toMatchObject({ label, failed: false });
      }
    });

    test('whatever single line of a process table is damaged, the table stops proving absence (seeded corruption of 8-row tables)', () => {
      let seed = 20261014;
      const rand = (limit: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % limit; };
      const rows = Array.from({ length: 8 }, (_v, index) => goodRow(`C:\\Windows\\System32\\p${index}.exe`, 300 + index, 4, `p${index}.exe`));
      const build = (lines: string[]) => rawListing(`${header}\r\n${lines.join('\r\n')}\r\n`);
      expect(smoke.findDriverStrays(answers(build(rows)), runtimeRoot).failed).toBe(false);
      const split = (line: string) => line.split(',');
      const corruptions: Array<[string, (line: string) => string]> = [
        ['a cell removed', (line) => { const cells = split(line); cells.splice(rand(cells.length - 1) + 1, 1); return cells.join(','); }],
        ['a cell added', (line) => { const cells = split(line); cells.splice(rand(cells.length), 0, 'extra'); return cells.join(','); }],
        ['a lone quote at the end of a cell', (line) => { const cells = split(line); const at = rand(cells.length); cells[at] = `${cells[at]}"`; return cells.join(','); }],
        ['a cell that opens a quote and never closes it', (line) => { const cells = split(line); cells[rand(cells.length)] = '"unclosed'; return cells.join(','); }],
        // Cut inside the line and short of its last comma, so the cut line has fewer cells than the header.
        ['a line cut short', (line) => line.slice(0, rand(line.lastIndexOf(',')) + 1)],
        ['a process id that is not a number', (line) => line.replace(/,(\d+),2$/, ',x$1,2')],
        ['a junk line instead of the row', () => 'ERROR - no row here'],
      ];
      for (const [label, corrupt] of corruptions) {
        for (let trial = 0; trial < 40; trial += 1) {
          const damaged = rows.slice();
          const at = rand(damaged.length);
          damaged[at] = corrupt(damaged[at]);
          expect({ label, trial, damaged: damaged[at], failed: smoke.findDriverStrays(answers(build(damaged)), runtimeRoot).failed }).toEqual({ label, trial, damaged: damaged[at], failed: true });
        }
      }
    });

    test('the environment check, the post-flight check and the chain post-check read a broken table as a failed listing as well (codex round 12, N1)', () => {
      const environment = (table: any) => smoke.collectEnvironment(answers(table), { pid: 5, watchedRoots: [], freeBytes: 1 });
      expect(environment(tableOf([])).processes_listing_failed).toBe(false);
      expect(environment(tableOf(['HOST,date'])).processes_listing_failed).toBe(true);
      let index = 11;
      const postflight = (table: any) => {
        const made = phaseContext('p10-postflight', index);
        index += 1;
        fs.writeFileSync(path.join(made.runRoot, 'note.txt'), 'harmless evidence');
        return smoke.runPostflightPhase(made.ctx, answers(table)).cases[0].assertions[1].status;
      };
      expect(postflight(tableOf([]))).toBe('PASS');
      expect(postflight(tableOf(['HOST,date']))).toBe('UNKNOWN');
      expect(postflight(tableOf(['HOST,20261014172412.000000+000,"unclosed,x.exe,4,5,2']))).toBe('UNKNOWN');
    });

    test('the sweep removes a stray, needs two clean rounds, does not call a failed listing clean and reports what survives', async () => {
      const killed: number[] = [];
      const waits: number[] = [];
      const hooks = { kill: (pid: number) => { killed.push(pid); }, wait: async (ms: number) => { waits.push(ms); } };
      const stray = (pid: number) => ({ pid, parent_pid: 4988, name: 'electron.exe', image_source: 'executable_path' });
      // The orphan exists from the first listing on and dies after the kill; two clean listings in a row end the sweep.
      let calls = 0;
      const dying = () => { calls += 1; return calls === 1 ? wmicCsv([[electronInside, 4736, 4988, 'electron.exe']]) : wmicCsv([]); };
      const first = await smoke.sweepDriverStrays(answers(dying), runtimeRoot, hooks);
      expect(first).toEqual({ attempted: [stray(4736)], removed: [stray(4736)], remaining: [], observed: true });
      expect(killed).toEqual([4736]);
      expect(calls).toBe(3);
      expect(waits.every((ms) => ms === 500)).toBe(true);

      // A helper that appears only in the second round (a restart after the first listing) is still removed.
      killed.length = 0;
      calls = 0;
      const late = () => { calls += 1; return calls === 2 ? wmicCsv([[electronInside, 4900, 4988, 'electron.exe']]) : wmicCsv([]); };
      expect(await smoke.sweepDriverStrays(answers(late), runtimeRoot, hooks)).toMatchObject({ attempted: [{ pid: 4900 }], removed: [{ pid: 4900 }], remaining: [], observed: true });
      expect(killed).toEqual([4900]);

      // A stray found after one clean round resets the count: clean, stray, clean, clean needs four listings (codex round 11, X02).
      calls = 0;
      const reset = () => { calls += 1; return calls === 2 ? wmicCsv([[electronInside, 4901, 4988, 'electron.exe']]) : wmicCsv([]); };
      expect(await smoke.sweepDriverStrays(answers(reset), runtimeRoot, hooks)).toMatchObject({ removed: [{ pid: 4901 }], observed: true });
      expect(calls).toBe(4);

      // The eighth round is still used: six rounds with a stray, then two clean ones end observed (codex round 11, X03).
      calls = 0;
      const lateClean = () => { calls += 1; return calls <= 6 ? wmicCsv([[electronInside, 4902, 4988, 'electron.exe']]) : wmicCsv([]); };
      expect(await smoke.sweepDriverStrays(answers(lateClean), runtimeRoot, hooks)).toMatchObject({ attempted: [{ pid: 4902 }], removed: [{ pid: 4902 }], remaining: [], observed: true });
      expect(calls).toBe(8);

      // A stray that survives every kill is attempted, not removed, and reported (codex round 11, N3).
      const stubborn = () => wmicCsv([[electronInside, 5000, 1, 'electron.exe']]);
      const survived = await smoke.sweepDriverStrays(answers(stubborn), runtimeRoot, hooks);
      expect(survived).toEqual({ attempted: [{ pid: 5000, parent_pid: 1, name: 'electron.exe', image_source: 'executable_path' }], removed: [], remaining: [{ pid: 5000, parent_pid: 1, name: 'electron.exe', image_source: 'executable_path' }], observed: false });

      // A listing that never succeeds shows nothing.
      const blind = await smoke.sweepDriverStrays(() => ({ status: 1, error: 'wmic failed', stdout: '', stderr: '' }), runtimeRoot, hooks);
      expect(blind).toEqual({ attempted: [], removed: [], remaining: [], observed: false });

      // A stray seen only in a failed listing is attempted; without a usable listing afterwards it is not confirmed removed.
      calls = 0;
      const partial = () => {
        calls += 1;
        if (calls === 1) return wmicCsv([]);
        if (calls === 2) return { ...wmicCsv([[electronInside, 5100, 1, 'electron.exe']]), status: 1 };
        return { status: 1, error: 'wmic failed', stdout: '', stderr: '' };
      };
      expect(await smoke.sweepDriverStrays(answers(partial), runtimeRoot, hooks)).toMatchObject({ attempted: [{ pid: 5100 }], removed: [], observed: false });

      // A failed listing between clean ones restarts the count.
      let step = 0;
      const flaky = () => { step += 1; return step === 2 ? { status: 1, error: 'x', stdout: '', stderr: '' } : wmicCsv([]); };
      expect(await smoke.sweepDriverStrays(answers(flaky), runtimeRoot, hooks)).toEqual({ attempted: [], removed: [], remaining: [], observed: true });
      expect(step).toBe(4);
    });

    // Rehearsal 11, R1 (Win7 real machine, read-only, before any run): the orphan PID 4736 that rehearsal 10 left had ExecutablePath empty in the
    // suite's own table query and a whole command line in the list query. It had one thread, no CPU time and two handles: created, first thread
    // never run. The sweep that matched ExecutablePath read the real table as intact and selected nothing.
    const orphanCommand = (exe: string) => `"${exe}" --type=utility --utility-sub-type=network.mojom.NetworkService --lang=zh-CN --service-sandbox-type=none --user-data-dir="C:\\Users\\agent\\AppData\\Local\\Win7CodingAgent" --mojo-platform-channel-handle=1724 --field-trial-handle=1164,i,11018407756519213193,6108635375228123541,131072 --disable-features=SpareRendererForSitePerProcess,WinRetrieveSuggestionsOnlyOnDemand /prefetch:8`;
    const unreadableRow = (pid: number, parent = 4988, name = 'electron.exe') => goodRow('', pid, parent, name);
    const commandsFor = (...entries: Array<[number, string]>) => commandLineList([[bystander[1], bystander[0]], ...entries]);
    const viaCommand = (pid: number, parent = 4988, name = 'electron.exe') => ({ pid, parent_pid: parent, name, image_source: 'command_line' });

    test('the list reader accepts what wmic prints and refuses a listing that is not whole (rehearsal 11 R1)', () => {
      const keys = ['ProcessId', 'CommandLine'];
      const block = (pid: string, command: string) => `CommandLine=${command}\r\r\nProcessId=${pid}\r\r\n`;
      const command = orphanCommand('C:\\x\\electron.exe');
      const text = `\r\r\n\r\r\n${[block('0', ''), block('4', ''), block('4736', command)].join('\r\r\n\r\r\n')}\r\r\n`;
      const read = smoke.readWmicList(text, keys);
      expect(read).toEqual({ rows: [{ CommandLine: '', ProcessId: '0' }, { CommandLine: '', ProcessId: '4' }, { CommandLine: command, ProcessId: '4736' }], intact: true, problem: null });
      // Commas, quotes and equals signs stay in the value; the line end and the order of the properties do not matter.
      expect(smoke.readWmicList(text.replace(/\r\r\n/g, '\n'), keys)).toEqual(read);
      expect(smoke.readWmicList(text.replace(/\r\r\n/g, '\r\n'), keys)).toEqual(read);
      expect(smoke.readWmicList('ProcessId=7\r\nCommandLine=a=b\r\n', keys)).toEqual({ rows: [{ ProcessId: '7', CommandLine: 'a=b' }], intact: true, problem: null });
      // A separator that holds only spaces still separates blocks.
      expect(smoke.readWmicList('ProcessId=7\r\nCommandLine=a\r\n  \r\nProcessId=8\r\nCommandLine=b\r\n', keys).rows).toHaveLength(2);
      const refused: Array<[string, string, string, number]> = [
        ['empty output', '', 'empty_output', 0],
        ['blank lines only', '\r\r\n\r\r\n', 'empty_output', 0],
        ['text that is not a list', 'ERROR:\r\nDescription = Invalid query\r\n', 'block_1_line', 0],
        ['a junk line inside a block', `${block('4', 'a')}junk\r\r\n`, 'block_1_line', 0],
        ['a property nobody asked for', 'Name=x\r\r\nProcessId=4\r\r\nCommandLine=\r\r\n', 'block_1_line', 0],
        ['a repeated property', 'ProcessId=4\r\r\nProcessId=5\r\r\nCommandLine=\r\r\n', 'block_1_line', 0],
        ['a property name in another case', 'processid=4\r\r\nCommandLine=\r\r\n', 'block_1_line', 0],
        ['a line that starts with an equals sign', '=4\r\r\nProcessId=4\r\r\nCommandLine=\r\r\n', 'block_1_line', 0],
        ['a block without a ProcessId', 'CommandLine=a\r\r\n', 'block_1_keys', 0],
        ['a block without a CommandLine', 'ProcessId=4\r\r\n', 'block_1_keys', 0],
        ['a command line broken over two lines', 'CommandLine=a\r\r\nb\r\r\nProcessId=4\r\r\n', 'block_1_line', 0],
        ['a blank line inside a block', 'CommandLine=a\r\r\n\r\r\nProcessId=4\r\r\n', 'block_1_keys', 0],
        ['an incomplete block after a complete one', `${block('4', 'a')}\r\r\nProcessId=5\r\r\n`, 'block_2_keys', 1],
        ['a cut inside the last block', `${block('4', 'a')}\r\r\nCommandLine=b`, 'block_2_keys', 1],
        ['a line without an equals sign that begins like a property', 'ProcessIdx\r\r\nCommandLine=\r\r\n', 'block_1_line', 0],
        ['a damaged block before a complete one', `junk\r\r\n\r\r\n${block('4', 'a')}`, 'block_1_line', 1],
      ];
      for (const [label, input, problem, kept] of refused) {
        const got = smoke.readWmicList(input, keys);
        expect({ label, intact: got.intact, problem: got.problem, kept: got.rows.length }).toEqual({ label, intact: false, problem, kept });
      }
    });

    test('a listing whose command-line query failed or is not whole is a failed listing that names the query, and the table rows still show presence (rehearsal 11 R1)', async () => {
      const table = tableOf([goodRow(electronInside, 4736, 4988, 'electron.exe')]);
      const ok = commandLineList();
      const driverRow = { pid: 4736, parent_pid: 4988, name: 'electron.exe', image_source: 'executable_path' };
      const bad: Array<[string, any, string]> = [
        ['a non-zero status', { ...ok, status: 1 }, 'command_lines_exit_status'],
        ['an error object', { ...ok, error: 'ETIMEDOUT' }, 'command_lines_command_error'],
        ['a cut-off output', { ...ok, truncated: true }, 'command_lines_truncated'],
        ['empty output', { ...ok, stdout: '' }, 'command_lines_empty_output'],
        ['a broken block', { ...ok, stdout: `${ok.stdout}junk\r\r\n` }, 'command_lines_block_2_line'],
        ['a process id that is not a number', { ...ok, stdout: ok.stdout.replace('ProcessId=304', 'ProcessId=abc') }, 'command_lines_process_id'],
        ['no result', () => undefined, 'command_lines_no_result'],
        ['a throw', () => { throw new Error('wmic missing'); }, 'command_lines_exec_threw'],
      ];
      for (const [label, commands, problem] of bad) {
        const listed = smoke.listProcesses(answers(table, commands));
        expect({ label, failed: listed.failed, problem: listed.problem, rows: listed.rows.length }).toEqual({ label, failed: true, problem, rows: 2 });
        expect({ label, ...smoke.findDriverStrays(answers(table, commands), runtimeRoot) }).toEqual({ label, strays: [driverRow], failed: true });
        const swept = await smoke.sweepDriverStrays(answers(table, commands), runtimeRoot, { kill: () => undefined, wait: instant });
        expect({ label, observed: swept.observed }).toEqual({ label, observed: false });
      }
      // A table that is not whole is named first; a table whose command failed is not asked for command lines at all.
      expect(smoke.listProcesses(answers(tableOf(['HOST,date']))).problem).toBe('row_3_cell_count');
      let asked = 0;
      const failedTable = smoke.listProcesses(answers({ ...table, status: 1 }, () => { asked += 1; return ok; }));
      expect({ failed: failedTable.failed, problem: failedTable.problem, asked }).toEqual({ failed: true, problem: 'exit_status', asked: 0 });
      expect(smoke.listProcesses(answers(table))).toMatchObject({ failed: false, problem: null });
      // A process id printed with blanks around it still names its process.
      const padded = smoke.listProcesses(answers(tableOf([unreadableRow(4736)]), { ...ok, stdout: `${ok.stdout}CommandLine=${orphanCommand(electronInside)}\r\r\nProcessId= 4736 \r\r\n` }));
      expect(padded.failed).toBe(false);
      expect(padded.rows.find((row: any) => row.ProcessId === '4736')).toMatchObject({ ImageSource: 'command_line' });
    });

    test('whatever single line of the command-line list is damaged, the listing stops proving absence (seeded corruption of 8-block lists)', () => {
      let seed = 20261015;
      const rand = (limit: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % limit; };
      const blocks = Array.from({ length: 8 }, (_v, index) => [`CommandLine=C:\\Windows\\System32\\p${index}.exe /x,"y"=1`, `ProcessId=${300 + index}`]);
      const textOf = (parts: string[][]) => `\r\r\n${parts.map((part) => `${part.join('\r\r\n')}\r\r\n`).join('\r\r\n')}`;
      const listOf = (stdout: string) => ({ status: 0, error: null, stderr: '', stdout });
      const listing = (stdout: string) => smoke.listProcesses(answers(tableOf([]), listOf(stdout)));
      expect(listing(textOf(blocks))).toMatchObject({ failed: false, problem: null });
      const corruptions: Array<[string, (part: string[]) => void]> = [
        ['the ProcessId line removed', (part) => { part.splice(1, 1); }],
        ['the CommandLine line removed', (part) => { part.splice(0, 1); }],
        ['a line repeated', (part) => { part.push(part[rand(2)]); }],
        ['a junk line inside the block', (part) => { part.splice(rand(3), 0, 'junk'); }],
        ['a command line broken over two lines', (part) => { part[0] = `${part[0]}\r\r\ncontinued`; }],
        ['a blank line inside the block', (part) => { part.splice(1, 0, ''); }],
        ['a property name cut short', (part) => { const at = rand(2); part[at] = part[at].slice(0, 1 + rand(part[at].indexOf('='))); }],
        ['a process id that is not a number', (part) => { part[1] = `ProcessId=x${rand(100)}`; }],
      ];
      for (const [label, corrupt] of corruptions) {
        for (let trial = 0; trial < 40; trial += 1) {
          const damaged = blocks.map((part) => part.slice());
          corrupt(damaged[rand(damaged.length)]);
          const text = textOf(damaged);
          expect({ label, trial, failed: listing(text).failed }).toEqual({ label, trial, failed: true });
        }
      }
      // A cut-off output inside the last block, short of its ProcessId line.
      const whole = textOf(blocks);
      const lastStart = whole.lastIndexOf('CommandLine=');
      const lastProcess = whole.lastIndexOf('ProcessId=');
      for (let trial = 0; trial < 40; trial += 1) {
        const cut = whole.slice(0, lastStart + 1 + rand(lastProcess - lastStart - 1));
        expect({ trial, failed: listing(cut).failed }).toEqual({ trial, failed: true });
      }
    });

    test('a row takes its image from ExecutablePath, and from its command line only when wmic left the path empty (rehearsal 11 R1)', () => {
      const table = tableOf([
        goodRow(electronInside, 4737, 4736, 'electron.exe'),
        unreadableRow(4736),
        unreadableRow(4738),
        goodRow('', 4739, 1, 'x.exe'),
        goodRow('C:\\Windows\\notepad.exe', 4740, 1, 'notepad.exe'),
      ]);
      const commands = commandsFor([4737, 'C:\\somewhere\\else.exe'], [4736, orphanCommand(electronInside)], [4738, ''], [4740, `"${electronInside}" --decoy`]);
      const listed = smoke.listProcesses(answers(table, commands));
      expect(listed).toMatchObject({ failed: false, problem: null });
      const byPid = (pid: number) => listed.rows.find((row: any) => Number(row.ProcessId) === pid);
      expect(byPid(4737)).toMatchObject({ ImagePath: electronInside, ImageSource: 'executable_path' });
      expect(byPid(4736)).toMatchObject({ ImagePath: orphanCommand(electronInside).slice(1), ImageSource: 'command_line' });
      expect(byPid(4738)).toMatchObject({ ImagePath: '', ImageSource: 'none' });
      expect(byPid(4739)).toMatchObject({ ImagePath: '', ImageSource: 'none' });
      expect(byPid(4740)).toMatchObject({ ImagePath: 'C:\\Windows\\notepad.exe', ImageSource: 'executable_path' });
      // The readable path decides for a row that has one; the command line decides only for an empty path.
      expect(smoke.findDriverStrays(answers(table, commands), runtimeRoot)).toEqual({ failed: false, strays: [
        { pid: 4737, parent_pid: 4736, name: 'electron.exe', image_source: 'executable_path' }, viaCommand(4736),
      ] });
      // The same table with no command lines to read shows nothing: what rehearsal 10 left stayed invisible to the path rule.
      expect(smoke.findDriverStrays(answers(tableOf([unreadableRow(4736)]), commandsFor([4736, ''])), runtimeRoot)).toEqual({ strays: [], failed: false });
      // A command line names the runtime copy when it starts with it: quoted or not, in any letter case, followed by any arguments.
      for (const command of [orphanCommand(electronInside), orphanCommand(electronInside).replace(/"/g, ''), orphanCommand(electronInside).toUpperCase(), `${electronInside} --type=utility`]) {
        expect(smoke.findDriverStrays(answers(tableOf([unreadableRow(4736)]), commandsFor([4736, command])), runtimeRoot)).toEqual({ failed: false, strays: [viaCommand(4736)] });
      }
      // It does not when the runtime copy is only mentioned, or belongs to a sibling directory, to the deploy tree or to another run.
      const elsewhere = [
        `C:\\Windows\\System32\\cmd.exe /c ${electronInside}`,
        `"${runtimeRoot}-old${path.sep}electron.exe" --type=utility`,
        `"${path.join(runtimeBase, 'deploy', 'electron.exe')}"`,
        `"${path.join(runtimeBase, 'other', 'driver-electron', 'electron.exe')}" --type=utility`,
        '',
      ];
      for (const command of elsewhere) {
        expect(smoke.findDriverStrays(answers(tableOf([unreadableRow(4736)]), commandsFor([4736, command])), runtimeRoot)).toEqual({ strays: [], failed: false });
      }
    });

    test('the sweep finds, kills and confirms the removal of an orphan that only its command line identifies (rehearsal 11 R1: PID 4736)', async () => {
      const killed: number[] = [];
      const hooks = { kill: (pid: number) => { killed.push(pid); }, wait: instant };
      let round = 0;
      const table = () => { round += 1; return round === 1 ? tableOf([unreadableRow(4736)]) : tableOf([]); };
      const commands = () => (round === 1 ? commandsFor([4736, orphanCommand(electronInside)]) : commandsFor());
      expect(await smoke.sweepDriverStrays(answers(table, commands), runtimeRoot, hooks))
        .toEqual({ attempted: [viaCommand(4736)], removed: [viaCommand(4736)], remaining: [], observed: true });
      expect(killed).toEqual([4736]);
      expect(round).toBe(3);

      // An orphan that no kill removes is reported as remaining, found by its command line.
      killed.length = 0;
      const stuck = answers(tableOf([unreadableRow(4736)]), commandsFor([4736, orphanCommand(electronInside)]));
      expect(await smoke.sweepDriverStrays(stuck, runtimeRoot, hooks)).toEqual({ attempted: [viaCommand(4736)], removed: [], remaining: [viaCommand(4736)], observed: false });
      expect(killed.length).toBeGreaterThan(0);

      // When the command-line query never works, the empty-path row cannot be told apart from a system process: the sweep must not call it clean.
      const blind = answers(tableOf([unreadableRow(4736)]), { status: 1, error: 'wmic failed', stdout: '', stderr: '' });
      expect(await smoke.sweepDriverStrays(blind, runtimeRoot, hooks)).toEqual({ attempted: [], removed: [], remaining: [], observed: false });
    });

    test('the environment, post-flight and chain post-check read an empty-path process by its command line as well (rehearsal 11 R1)', () => {
      const orphanTable = tableOf([unreadableRow(4736)]);
      // G0: a process under a watched root is stale however its image was learned; a failed command-line query makes the listing failed.
      const facts = smoke.collectEnvironment(answers(orphanTable, commandsFor([4736, orphanCommand(electronInside)])), { pid: 5, watchedRoots: [runtimeRoot], freeBytes: 1 });
      expect(facts.processes_listing_failed).toBe(false);
      expect(facts.stale_processes).toEqual([{ pid: 4736, parent: 4988, name: 'electron.exe', path: orphanCommand(electronInside).slice(1, 261), image_source: 'command_line', session: 2 }]);
      const blindFacts = smoke.collectEnvironment(answers(orphanTable, { status: 1, error: 'x', stdout: '', stderr: '' }), { pid: 5, watchedRoots: [runtimeRoot], freeBytes: 1 });
      expect(blindFacts).toMatchObject({ processes_listing_failed: true, stale_processes: [] });

      // p10: an empty-path process under the run root is residue; without command lines the listing is failed and the verdict is UNKNOWN.
      const made = phaseContext('p10-postflight', 14);
      fs.writeFileSync(path.join(made.runRoot, 'note.txt'), 'harmless evidence');
      const driverExe = path.join(made.runRoot, 'driver-electron', 'electron.exe');
      const post = smoke.runPostflightPhase(made.ctx, answers(orphanTable, commandsFor([4736, orphanCommand(driverExe)])));
      expect(post.cases[0].assertions[1].status).toBe('FAIL');
      expect(post.failure_class).toBe('PROCESS_RESIDUE');
      expect(JSON.parse(fs.readFileSync(path.join(made.attempt, 'g4-postflight.json'), 'utf8')).residue)
        .toEqual([{ pid: 4736, name: 'electron.exe', path: orphanCommand(driverExe).slice(1, 261), image_source: 'command_line' }]);
      const unseen = phaseContext('p10-postflight', 15);
      fs.writeFileSync(path.join(unseen.runRoot, 'note.txt'), 'harmless evidence');
      expect(smoke.runPostflightPhase(unseen.ctx, answers(orphanTable, { status: 1, error: 'x', stdout: '', stderr: '' })).cases[0].assertions[1].status).toBe('UNKNOWN');

      // The chain post-check lists residue under the run's driver copy the same way.
      const chain = phaseContext('p03-chain');
      for (const name of fixtures.evidenceForPhase('p03-chain')) if (name !== 'phase-result.json') fs.writeFileSync(path.join(chain.attempt, name), 'x');
      fs.writeFileSync(path.join(chain.attempt, 'chain-exit-tree-before.json'), JSON.stringify({ tree: [{ pid: 500, parent: 100, name: 'spike02_helper.exe', created: '20260101000000.000000+000' }], wmic_failures: 0 }));
      const launch = { mode: 'chain_exit', code: 0, signal: null, killed_by: null, started_at: 'a', ended_at: 'b', duration_ms: 1, pid: 1, dialog_click: { status: 0 } };
      const chainExe = path.join(chain.ctx.runRoot, 'driver-electron', 'electron.exe');
      smoke.finishChainEvidence(chain.ctx, [launch], null, answers(orphanTable, commandsFor([4736, orphanCommand(chainExe)])), path.join(chain.attempt, 'no-data'));
      const verdict = chain.ctx.result.cases.find((item: any) => item.case_id === 'B2-CH-06-NORMAL-EXIT').assertions[1];
      expect(verdict.status).toBe('FAIL');
      expect(JSON.parse(fs.readFileSync(path.join(chain.attempt, '06-postflight.json'), 'utf8')).residue).toEqual([{ pid: 4736, name: 'electron.exe', image_source: 'command_line' }]);
    });

    test('a driver killed by the harness is followed by a recorded sweep; a normal exit is not swept; a stray that stays or a listing that fails ends the phase', async () => {
      const runtime = { electronPath: 'electron.exe', appRoot: 'app', driverSha256: sha('driver') };
      const assertions = fixtures.casesForPhase('p07-safe').flatMap((c: any) => c.assertions.map((a: any) => ({ case_id: c.case_id, assertion_id: a.assertion_id, status: 'PASS', observed: 'hard stop before side effect' })));
      const kills: number[] = [];
      const hooksFor = (killedBy: string | null, execFor: any) => ({
        runtime, exec: execFor, strays: { kill: (pid: number) => { kills.push(pid); }, wait: instant },
        launchDriver: async (_runtime: any, env: any) => {
          fs.writeFileSync(env.A9_BATCH2_DRIVER_RESULT, JSON.stringify({ status: 'DONE', assertions }));
          for (const name of fixtures.evidenceForPhase('p07-safe')) fs.writeFileSync(path.join(env.A9_BATCH2_ATTEMPT_DIR, name), '{}');
          if (smoke.PHASE2_MODES[env.A9_BATCH2_MODE]) fs.writeFileSync(path.join(env.A9_BATCH2_ATTEMPT_DIR, `${env.A9_BATCH2_MODE}-prequit.json`), JSON.stringify({ sid: TARGET.account_sid, tree: [{ pid: 999, created: '20261017000000.000000+000' }], wmic_failures: 0 }));
          return { code: killedBy ? 1 : 0, signal: null, killed_by: killedBy, duration_ms: 1, stdout: '', stderr: '', pid: 1 };
        },
      });
      const ctxPhase = (phase: string, index: number) => {
        const made = phaseContext(phase, index);
        (made.ctx as any).runRoot = path.join(runtimeBase, `run-${index}`);
        return made;
      };
      const ctxRoot = (index: number) => ctxPhase('p07-safe', index);
      // Normal exit: the fifteen new modes observe their post-exit trees; no sweep, kill or strays entry.
      let listings = 0;
      const normal = ctxRoot(1);
      const normalResult = await smoke.runDriverPhase(normal.ctx, hooksFor(null, answers(() => { listings += 1; return wmicCsv([]); })));
      expect(normalResult.status).toBe('PASS');
      expect(listings).toBe(Object.keys(smoke.PHASE2_MODES).length);
      expect(kills).toEqual([]);
      expect(JSON.parse(fs.readFileSync(path.join(normal.attempt, 'driver-launches.json'), 'utf8')).launches[0].strays).toBeUndefined();

      // The UI phase starts with a kill-on-marker mode. A harness kill is followed by a sweep that removes this run's stray and records it.
      const uiHooks = (killedBy: string | null, execFor: any) => ({
        runtime, exec: execFor, strays: { kill: (pid: number) => { kills.push(pid); }, wait: instant },
        launchDriver: async (_runtime: any, env: any) => {
          fs.writeFileSync(env.A9_BATCH2_DRIVER_RESULT, JSON.stringify({ status: 'DONE', assertions: [] }));
          const killedMode = env.A9_BATCH2_MODE === 'ui_interrupt';
          return { code: killedMode ? 1 : 0, signal: null, killed_by: killedMode ? killedBy : null, duration_ms: 1, stdout: '', stderr: '', pid: 1 };
        },
      });
      const launchesOf = (attempt: string) => JSON.parse(fs.readFileSync(path.join(attempt, 'driver-launches.json'), 'utf8')).launches;
      const marker = ctxPhase('p08-ui', 2);
      const markerExe = path.join(runtimeBase, 'run-2', 'driver-electron', 'electron.exe');
      let first = true;
      kills.length = 0;
      await smoke.runDriverPhase(marker.ctx, uiHooks('marker', answers(() => {
        if (first) { first = false; return wmicCsv([[markerExe, 6002, 1, 'electron.exe']]); }
        return wmicCsv([]);
      })));
      expect(kills).toEqual([6002]);
      const markerLaunches = launchesOf(marker.attempt);
      expect(markerLaunches.map((item: any) => item.mode)).toEqual(['ui_interrupt', 'ui_continue', 'ui_layouts']);
      expect(markerLaunches[0].strays).toEqual({ attempted: [{ pid: 6002, parent_pid: 1, name: 'electron.exe', image_source: 'executable_path' }], removed: [{ pid: 6002, parent_pid: 1, name: 'electron.exe', image_source: 'executable_path' }], remaining: [], observed: true });
      expect(markerLaunches[0].failed).toBeUndefined();
      expect(markerLaunches[1].strays).toBeUndefined();

      // A timeout kill is a harness kill as well: the sweep runs, and the launch then fails by the existing rule (only a marker kill is expected).
      const timeout = ctxPhase('p08-ui', 3);
      const timeoutExe = path.join(runtimeBase, 'run-3', 'driver-electron', 'electron.exe');
      first = true;
      kills.length = 0;
      await smoke.runDriverPhase(timeout.ctx, uiHooks('timeout', answers(() => {
        if (first) { first = false; return wmicCsv([[timeoutExe, 6003, 1, 'electron.exe']]); }
        return wmicCsv([]);
      })));
      expect(kills).toEqual([6003]);
      expect(launchesOf(timeout.attempt)[0]).toMatchObject({ killed_by: 'timeout', failed: true, strays: { attempted: [{ pid: 6003 }], removed: [{ pid: 6003 }], remaining: [] } });

      // A stray that survives the kill: the launch is failed with a named reason and no later mode starts.
      const stuck = ctxPhase('p08-ui', 4);
      const stuckExe = path.join(runtimeBase, 'run-4', 'driver-electron', 'electron.exe');
      const stuckResult = await smoke.runDriverPhase(stuck.ctx, uiHooks('marker', answers(wmicCsv([[stuckExe, 6100, 1, 'electron.exe']]))));
      expect(stuckResult.status).not.toBe('PASS');
      const stuckLaunches = launchesOf(stuck.attempt);
      expect(stuckLaunches).toHaveLength(1);
      expect(stuckLaunches[0]).toMatchObject({ failed: true, driver_error: 'DRIVER_STRAY_PROCESS_NOT_REMOVED', strays: { attempted: [{ pid: 6100 }], removed: [], remaining: [{ pid: 6100 }], observed: false } });

      // A process table that comes back empty (exit 0, no rows) cannot show absence: the phase stops after the first killed mode (codex round 11, N1).
      const empty = ctxPhase('p08-ui', 6);
      const emptyResult = await smoke.runDriverPhase(empty.ctx, uiHooks('marker', answers(rawListing(''))));
      expect(emptyResult.status).not.toBe('PASS');
      const emptyLaunches = launchesOf(empty.attempt);
      expect(emptyLaunches.map((item: any) => item.mode)).toEqual(['ui_interrupt']);
      expect(emptyLaunches[0]).toMatchObject({ failed: true, driver_error: 'DRIVER_STRAY_PROCESS_NOT_REMOVED', strays: { attempted: [], removed: [], observed: false } });

      // A table with one broken line cannot show absence either (codex round 12, N1).
      const damaged = ctxPhase('p08-ui', 7);
      const damagedResult = await smoke.runDriverPhase(damaged.ctx, uiHooks('marker', answers(tableOf(['HOST,date']))));
      expect(damagedResult.status).not.toBe('PASS');
      const damagedLaunches = launchesOf(damaged.attempt);
      expect(damagedLaunches.map((item: any) => item.mode)).toEqual(['ui_interrupt']);
      expect(damagedLaunches[0]).toMatchObject({ failed: true, driver_error: 'DRIVER_STRAY_PROCESS_NOT_REMOVED', strays: { observed: false } });

      // A sweep that cannot list processes cannot show absence either.
      const blind = ctxPhase('p08-ui', 5);
      await smoke.runDriverPhase(blind.ctx, uiHooks('marker', answers({ status: 1, error: 'wmic failed', stdout: '', stderr: '' })));
      expect(launchesOf(blind.attempt)[0]).toMatchObject({ failed: true, driver_error: 'DRIVER_STRAY_PROCESS_NOT_REMOVED', strays: { observed: false } });

      // The orphan of rehearsal 10 had no readable path; only its command line names the driver runtime copy (rehearsal 11 R1).
      const hidden = ctxPhase('p08-ui', 8);
      const hiddenExe = path.join(runtimeBase, 'run-8', 'driver-electron', 'electron.exe');
      let seen = 0;
      kills.length = 0;
      await smoke.runDriverPhase(hidden.ctx, uiHooks('marker', answers(() => { seen += 1; return seen === 1 ? tableOf([unreadableRow(6200)]) : tableOf([]); }, () => (seen === 1 ? commandsFor([6200, orphanCommand(hiddenExe)]) : commandsFor()))));
      expect(kills).toEqual([6200]);
      expect(launchesOf(hidden.attempt)[0].strays).toEqual({ attempted: [viaCommand(6200)], removed: [viaCommand(6200)], remaining: [], observed: true });
      expect(launchesOf(hidden.attempt)[0].failed).toBeUndefined();
    });

    test('a driver phase whose runtime copy cannot be prepared ends with a named failure class and a phase result', async () => {
      const made = phaseContext('p07-safe', 9);
      // The test candidate has no resources\\default_app.asar, so the copy throws before any driver starts.
      const result = await smoke.runDriverPhase(made.ctx, { exec: () => ({ status: 0, stdout: '', stderr: '', error: null }) });
      expect(result).toMatchObject({ status: 'NOT_PERFORMED', failure_class: 'DRIVER_RUNTIME_PREPARE_FAILED' });
      expect(JSON.parse(fs.readFileSync(path.join(made.attempt, 'phase-result.json'), 'utf8'))).toMatchObject({ failure_class: 'DRIVER_RUNTIME_PREPARE_FAILED' });
      expect(JSON.parse(fs.readFileSync(path.join(made.attempt, 'driver-launches.json'), 'utf8')).runtime_prepare_error).toMatch(/default_app\.asar|ENOENT/);
    });

    afterAll(() => { fs.rmSync(runtimeBase, { recursive: true, force: true }); });
  });

  test('a listing cut off at the cap is a failed listing, and the complete rows of a failed listing still show presence', () => {
    const csv = (rows: string[]) => `Node,CreationDate,ExecutablePath,Name,ParentProcessId,ProcessId\r\n${rows.join('\r\n')}\r\n`;
    const helperRow = 'HOST,20260101000000.000000+000,C:\\x\\h.exe,spike02_helper.exe,100,500';
    const helper = { pid: 500, parent: 100, name: 'spike02_helper.exe', created: '20260101000000.000000+000' };
    const filler = (count: number) => Array.from({ length: count }, (_v, i) => `HOST,20260101000001.000000+000,C:\\Windows\\filler${i}.exe,filler${i}.exe,1,${1000 + i}`);
    const exitLaunch = { mode: 'chain_exit', code: 0, signal: null, killed_by: null, started_at: 'a', ended_at: 'b', duration_ms: 1, pid: 1, dialog_click: { status: 0 } };
    const runExit = (exec: any) => {
      const { ctx, attempt } = phaseContext('p03-chain');
      for (const name of fixtures.evidenceForPhase('p03-chain')) if (name !== 'phase-result.json') fs.writeFileSync(path.join(attempt, name), 'x');
      fs.writeFileSync(path.join(attempt, 'chain-exit-tree-before.json'), JSON.stringify({ tree: [helper], wmic_failures: 0 }));
      smoke.finishChainEvidence(ctx, [exitLaunch], null, exec, path.join(attempt, 'no-data'));
      const assertion = ctx.result.cases.find((item: any) => item.case_id === 'B2-CH-06-NORMAL-EXIT').assertions[1];
      return { status: assertion.status, held: JSON.parse(fs.readFileSync(path.join(attempt, '06-held-exit.json'), 'utf8')) };
    };
    // The real executor cuts its output at the cap. A cut listing loses the tail rows, so it must say so instead of reporting absence.
    const realChild = require('child_process');
    const big = csv([...filler(4000), helperRow]);
    expect(big.length).toBeGreaterThan(262144);
    const listText = commandLineList().stdout;
    const spy = jest.spyOn(realChild, 'spawnSync').mockImplementation(((_file: any, args: any) => ({ status: 0, stdout: (args as string[]).includes('/format:list') ? listText : big, stderr: '', error: undefined })) as any);
    try {
      const cut = smoke.realExec('wmic_processes');
      expect(cut).toMatchObject({ status: 0, truncated: true });
      expect(cut.stdout.length).toBe(262144);
      expect(cut.error).toMatch(/^stdout_truncated:/);
      expect(smoke.listProcesses((name: string) => smoke.realExec(name)).failed).toBe(true);
      const lost = runExit((name: string) => smoke.realExec(name));
      expect(lost.status).toBe('UNKNOWN');
      expect(lost.held).toMatchObject({ listing_failed: true, survivors: [] });
      // The same helper in a listing under the cap is seen, and the survivor fails the assertion.
      spy.mockImplementation(((_file: any, args: any) => ({ status: 0, stdout: (args as string[]).includes('/format:list') ? listText : csv([...filler(1000), helperRow]), stderr: '', error: undefined })) as any);
      expect(smoke.realExec('wmic_processes').truncated).toBe(false);
      const seen = runExit((name: string) => smoke.realExec(name));
      expect(seen.status).toBe('FAIL');
      expect(seen.held.survivors).toHaveLength(1);
    } finally { spy.mockRestore(); }

    // A failed listing proves no absence, yet a complete row it printed is still evidence that the helper is alive.
    const failedWith = (over: any, text: string) => () => ({ status: 0, stdout: text, stderr: '', error: null, ...over });
    for (const over of [{ status: 1 }, { error: 'ETIMEDOUT' }, { truncated: true }]) {
      const present = runExit(failedWith(over, csv([helperRow])));
      expect(present.status).toBe('FAIL');
      expect(present.held).toMatchObject({ listing_failed: true });
      expect(present.held.survivors).toHaveLength(1);
    }
    // A row cut in half is evidence of nothing; a failed listing without the helper stays UNKNOWN.
    const halfRow = `${csv([])}HOST,20260101000000.000000+000,C:\\x\\h.exe,spike02_helper.exe,100`;
    expect(runExit(failedWith({ status: 1 }, halfRow)).status).toBe('UNKNOWN');
    expect(runExit(failedWith({ status: 1 }, csv(filler(3)))).status).toBe('UNKNOWN');
    const header = 'Node,Name,ProcessId';
    const text = `${header}\r\nH,a.exe,1\r\nH,b.exe`;
    expect(smoke.parseWmicCsv(text, { completeOnly: true })).toEqual([{ Node: 'H', Name: 'a.exe', ProcessId: '1' }]);
    expect(smoke.parseWmicCsv(text)).toHaveLength(2);

    // The postflight phase and the environment phase read a failed listing the same way: residue and stale trees seen are failures.
    const residue = phaseContext('p10-postflight', 10);
    fs.writeFileSync(path.join(residue.runRoot, 'note.txt'), 'harmless evidence');
    const residueRow = `H,${path.join(residue.candidateRoot, 'electron.exe')},electron.exe,1,600`;
    const post = smoke.runPostflightPhase(residue.ctx, () => ({ status: 1, stdout: `Node,ExecutablePath,Name,ParentProcessId,ProcessId\r\n${residueRow}\r\n`, stderr: '', error: null }));
    expect(post.cases[0].assertions[1].status).toBe('FAIL');
    expect(post.failure_class).toBe('PROCESS_RESIDUE');
    const staleCsv = 'Node,ProcessId,ParentProcessId,Name,ExecutablePath,SessionId\r\nH,9,1,spike02_helper.exe,C:\\old\\spike02_helper.exe,1\r\n';
    const collected = smoke.collectEnvironment((name: string) => ({ status: name === 'wmic_processes' ? 1 : 0, stdout: name === 'wmic_processes' ? staleCsv : '', stderr: '', error: null }), { pid: 5, watchedRoots: [], freeBytes: 1 });
    expect(collected.processes_listing_failed).toBe(true);
    expect(collected.stale_processes).toHaveLength(1);
    expect(smoke.evaluateEnvironment({ ...FACTS(), processes_listing_failed: true, stale_processes: collected.stale_processes }, { target: TARGET, evidence_root: '/evidence' }, '/candidate')[0].status).toBe('FAIL');
  });
});

describe('A9-33 batch-2 driver evaluators', () => {
  const event = (eventId: number, data: any, eventType = 'tool_output', turnId = 't1') => ({ eventId, turnId, eventType, payload: { data } });

  test('persisted tool output frames must keep one consecutive sequence per tool call', () => {
    const events = [
      event(1, { toolCallId: 'c1', stream: 'stdout', outputSeq: 1, text: 'tick 1\n' }),
      event(2, { toolCallId: 'c1', stream: 'stderr', outputSeq: 2, text: 'err 1\n' }),
      event(3, { toolCallId: 'c2', stream: 'stdout', outputSeq: 1, text: 'other' }),
      event(4, { toolCallId: 'c1', stream: 'stdout', outputSeq: 3, text: 'tick 2\n', truncated: true }),
      event(5, { toolName: 'x' }, 'tool_end'),
    ];
    const frames = driver.framesFromEvents(events);
    expect(frames).toHaveLength(4);
    expect(driver.evaluateStreamOrder(frames)).toMatchObject({ ok: true, calls: 2, frames: 4, problems: [] });
    expect(driver.textsPerStream(frames, 'stdout')).toBe('tick 1\nothertick 2\n');
    expect(driver.textsPerStream(frames, 'stderr')).toBe('err 1\n');
    const gap = driver.framesFromEvents([event(1, { toolCallId: 'c1', stream: 'stdout', outputSeq: 1, text: 'a' }), event(2, { toolCallId: 'c1', stream: 'stdout', outputSeq: 3, text: 'b' })]);
    expect(driver.evaluateStreamOrder(gap)).toMatchObject({ ok: false, problems: ['call=c1:position=2:outputSeq=3'] });
    expect(driver.evaluateStreamOrder([])).toMatchObject({ ok: false });
    expect(driver.eventData({ payload: { flat: 1 } })).toEqual({ flat: 1 });
  });

  test('display after persistence is proven only by observations, never by silence', () => {
    expect(driver.evaluateDomAfterDb([{ t: 1, domFrameTexts: ['tick 1'], dbFrameTexts: ['tick 1', 'tick 2'], ipcEventIds: [4], dbEventIds: [4, 5] }])).toMatchObject({ ok: true, observations: 2 });
    expect(driver.evaluateDomAfterDb([{ t: 1, domFrameTexts: ['tick 9'], dbFrameTexts: ['tick 1'], ipcEventIds: [], dbEventIds: [] }]).violations).toEqual([{ t: 1, kind: 'dom', text: 'tick 9' }]);
    expect(driver.evaluateDomAfterDb([{ t: 1, domFrameTexts: [], dbFrameTexts: ['x'], ipcEventIds: [7], dbEventIds: [] }]).violations[0]).toMatchObject({ kind: 'ipc', eventId: 7 });
    expect(driver.evaluateDomAfterDb([{ t: 1, domFrameTexts: [], dbFrameTexts: ['x'], ipcEventIds: [], dbEventIds: [] }]).ok).toBeNull();
    expect(driver.evaluateLiveTick(1000, 4200)).toMatchObject({ ok: true, lead_ms: 3200 });
    expect(driver.evaluateLiveTick(4000, 4500)).toMatchObject({ ok: false, lead_ms: 500 });
    expect(driver.evaluateLiveTick(null, 4500)).toMatchObject({ ok: false, reason: 'missing observation' });
  });

  test('the background observation outlives the Turn end until output frames arrive (rehearsal 2, p03 B2-CH-02)', () => {
    // Rehearsal 2 on Win7: the Turn completed 13 ms after start_process returned and the first tick was stored 451 ms later.
    // The old rule (6 frames or the Turn end) closed the observation after two samples with 0 frames.
    expect(driver.backgroundObservationDone(0, true, 489)).toBe(false);
    expect(driver.backgroundObservationDone(5, true, 3000)).toBe(false);
    expect(driver.backgroundObservationDone(6, false, 1500)).toBe(true);
    expect(driver.backgroundObservationDone(6, true, 10)).toBe(true);
    // A command that never writes still ends once the Turn is over and the grace period has passed; the overall timeout is observeUntil's.
    expect(driver.backgroundObservationDone(0, true, 7999)).toBe(false);
    expect(driver.backgroundObservationDone(0, true, 8000)).toBe(true);
    expect(driver.backgroundObservationDone(0, false, 60000)).toBe(false);
    expect(driver.backgroundObservationDone(2, 'yes', 9000)).toBe(false);
    const source = fs.readFileSync(path.resolve(__dirname, 'a9-batch2-driver-entry.cjs'), 'utf8');
    expect(source).toMatch(/observeUntil\(async \(evts, _dom, t\) => backgroundObservationDone\(framesFromEvents\(evts\)\.length, terminalReached\(evts\), t\), 90000, 'background frames'\)/);
    expect(source).not.toMatch(/framesFromEvents\(evts\)\.length >= 6 \|\| terminalReached\(evts\)/);
  });

  test('B2-CH-02-A01 asserts the stored and snapshot output while the process runs and only records the page (KL-3, rehearsal 3)', () => {
    // Rehearsal 3 on Win7: the snapshot showed 2, 4, then 6 frames from 1198 ms on while the page showed none, because the Turn had ended.
    const rehearsal3 = [0, 495, 1027, 1198, 1542, 2045].map((t, i) => ({ t, frames: [0, 0, 0, 2, 4, 6][i], ipcEventIds: Array.from({ length: [0, 0, 0, 2, 4, 6][i] }, (_x, n) => n + 1), domFrameTexts: [] }));
    const seen = driver.evaluateBackgroundOutput(rehearsal3, 1, 'tick 1\r\ntick 2\r\n', 'err 1\r\n');
    expect(seen).toMatchObject({ ok: true, first_ipc_ms: 1198, ipc_frames_max: 6, dom_frames_max: 0, stdout_has_tick: true, stderr_has_err: true });
    // The page showing frames is recorded too (a later product fix would show up here), and still passes.
    const shown = driver.evaluateBackgroundOutput(rehearsal3.map((sample) => ({ ...sample, domFrameTexts: sample.frames ? ['tick 1'] : [] })), 1, 'tick 1', 'err 1');
    expect(shown).toMatchObject({ ok: true, dom_frames_max: 1 });
    // Missing facts still fail: no snapshot frames, no running process, one stream missing, stored frames the snapshot never showed.
    expect(driver.evaluateBackgroundOutput(rehearsal3.map((sample) => ({ ...sample, ipcEventIds: [] })), 1, 'tick 1', 'err 1').ok).toBe(false);
    expect(driver.evaluateBackgroundOutput(rehearsal3, 0, 'tick 1', 'err 1').ok).toBe(false);
    expect(driver.evaluateBackgroundOutput(rehearsal3, 2, 'tick 1', 'err 1').ok).toBe(false);
    expect(driver.evaluateBackgroundOutput(rehearsal3, 1, '', 'err 1').ok).toBe(false);
    expect(driver.evaluateBackgroundOutput(rehearsal3, 1, 'tick 1', '').ok).toBe(false);
    expect(driver.evaluateBackgroundOutput([{ t: 5, frames: 0, ipcEventIds: [3], domFrameTexts: [] }], 1, 'tick 1', 'err 1').ok).toBe(false);
    expect(driver.evaluateBackgroundOutput(undefined, 1, 'tick 1', 'err 1')).toMatchObject({ ok: false, first_ipc_ms: null });
    // The journey records through the evaluator, the contract text names KL-3, and B2-S01 keeps the page check inside an active Turn.
    const source = fs.readFileSync(path.resolve(__dirname, 'a9-batch2-driver-entry.cjs'), 'utf8');
    expect(source).toMatch(/record\('B2-CH-02-BACKGROUND', 1, statusOf\(withGuard\(bgOutput\.ok, domOrder\.ok\)\)/);
    expect(source).not.toMatch(/visibleBeforeEnd/);
    expect(source).toMatch(/evaluateLiveTick\(first\.firstVisible, first\.toolEndedAt\)/);
    const assertionText = fixtures.casesForPhase('p03-chain').find((item: any) => item.case_id === 'B2-CH-02-BACKGROUND').assertions[0].description;
    expect(assertionText).toMatch(/IPC snapshot/);
    expect(assertionText).toMatch(/KL-3/);
  });

  test('the background fixture runs the longest bounded command so Stop and the exit dialog find it alive', () => {
    const start = (kind: string) => fixtures.providerStep({ messages: [{ role: 'user', content: 'please run b2:bg-start' }] }, { shellKind: kind }).tool.args.command;
    expect(start('powershell')).toBe(fixtures.backgroundCommandPowerShell(fixtures.FIXTURE_BOUNDS.max_ticks));
    expect(start('cmd')).toBe(fixtures.backgroundCommandCmd(fixtures.FIXTURE_BOUNDS.max_ticks));
    expect(start('powershell')).toContain(`1..${fixtures.FIXTURE_BOUNDS.max_ticks} `);
  });

  test('ClickDialog presses the button through the dialog window first, then UI Automation, and explains a miss', () => {
    const text = fs.readFileSync(path.join(releaseDir, 'a9-batch2-desktop-controller.ps1'), 'utf8');
    const block = text.slice(text.indexOf("if ($Action -eq 'ClickDialog')"), text.indexOf("# ---- Run ---"));
    expect(block.length).toBeGreaterThan(1000);
    // Win32 first: push button windows of the product process, BM_CLICK posted (never sent), control text through WM_GETTEXT.
    expect(block).toMatch(/Add-Type -TypeDefinition @'/);
    expect(block).toMatch(/PostMessage\(new IntPtr\(hwnd\), 0x00F5, IntPtr\.Zero, IntPtr\.Zero\)/);
    expect(block).toMatch(/0x000D/);
    expect(block).toMatch(/\$child\[1\] -eq 'Button'/);
    // The Win32 type is compiled only here and a compile failure falls back to UI Automation instead of ending the action.
    expect(block).toMatch(/\} catch \{ \$win32Error = /);
    expect(text.indexOf('B2Dialog')).toBeGreaterThan(text.indexOf("if ($Action -eq 'ClickDialog')"));
    // UI Automation only looks at dialog windows (#32770) of the process, never at the Chromium window.
    expect(block).toMatch(/ClassNameProperty, '#32770'/);
    expect(block).not.toMatch(/RootElement\.FindAll\(\[System\.Windows\.Automation\.TreeScope\]::Children, \$byProcess\)\s*\n\s*foreach \(\$window in \$windows\)/);
    // A miss lists windows, child controls and UI Automation items as ASCII and still exits with code 3.
    expect(block).toMatch(/Ascii-Safe/);
    expect(block).toMatch(/' W\['/);
    expect(block).toMatch(/' U\['/);
    expect(block).toMatch(/Fail \$text 3/);
    expect(block).not.toMatch(/Invoke-Expression|\biex\b|ConvertFrom-Json|-EncodedCommand/i);
    // C# in the here-string is C# 2.0 syntax, so it also compiles under PowerShell 2.0: no lambdas, var or string interpolation.
    const csharp = block.slice(block.indexOf("@'") + 2, block.indexOf("\n'@"));
    expect(csharp).not.toMatch(/=>|\bvar\b|\$"/);
    expect(csharp).not.toContain('$');
    // The click output reaches the evidence whole (limit 8000), not cut at 2000.
    const long = 'x'.repeat(9000);
    const out = smoke.clickExitDialog('c.ps1', 77, 0, () => ({ status: 3, stdout: '', stderr: long }));
    expect(out.stderr.length).toBe(8000);
  });

  test('display before persistence is found from stored timestamps, DOM ghosts and tokens that never reached the database', () => {
    const base = { t: 1, dbFrameTexts: ['tick 1'], ipcEventIds: [], dbEventIds: [], domReadEndMs: 1000 };
    const stored = (persistedAtMs: number | undefined) => [{ eventId: 1, text: 'tick 1', persistedAtMs }];
    // Persisted before the DOM read ended: nothing observed against the order.
    expect(driver.evaluateDomAfterDb([{ ...base, domFrameTexts: ['tick 1'], domTokens: [] }], stored(900))).toMatchObject({ ok: true, unchecked_without_timestamp: 0, persisted_timestamps_used: true });
    // Persisted after a DOM read that already showed it: displayed before persisted.
    const early = driver.evaluateDomAfterDb([{ ...base, domFrameTexts: ['tick 1'], domTokens: [] }], stored(1500));
    expect(early.ok).toBe(false);
    expect(early.violations[0]).toMatchObject({ kind: 'displayed_before_persisted', persistedAtMs: 1500, domReadEndMs: 1000 });
    // A frame with no usable stored timestamp cannot be ordered: UNKNOWN, not PASS.
    expect(driver.evaluateDomAfterDb([{ ...base, domFrameTexts: ['tick 1'], domTokens: [] }], stored(undefined))).toMatchObject({ ok: null, unchecked_without_timestamp: 1 });
    // A DOM frame the database read of the same sample did not have is a violation even though the database has it later.
    expect(driver.evaluateDomAfterDb([{ ...base, dbFrameTexts: [], domFrameTexts: ['tick 1'], domTokens: [] }], stored(900)).violations[0]).toMatchObject({ kind: 'dom' });
    // Output tokens the stream area showed but the database never held (a ghost frame) are violations.
    const ghost = driver.evaluateDomAfterDb([{ ...base, domFrameTexts: [], domTokens: ['tick 77'] }], stored(900));
    expect(ghost.ok).toBe(false);
    expect(ghost.violations[0]).toMatchObject({ kind: 'dom_token', text: 'tick 77' });
    // Without stored timestamps the old subset check still applies and an empty observation is UNKNOWN.
    expect(driver.evaluateDomAfterDb([{ ...base, domFrameTexts: ['tick 1'], domTokens: [] }]).ok).toBe(true);
    expect(driver.evaluateDomAfterDb([{ ...base, domFrameTexts: [], domTokens: [] }], stored(900)).ok).toBeNull();
  });

  test('a stopped continuation turn is retryable only as interrupted, and only when a new actionable card exists', () => {
    expect(driver.retryableStopStatus('interrupted')).toBe(true);
    // The product writes no recovery fact for a cancelled turn, so cancelled is never retryable.
    for (const status of ['cancelled', 'completed', 'running', 'failed', null, undefined]) expect(driver.retryableStopStatus(status)).toBe(false);
    const before = { interruptedTurnId: 'turn-old', recoveryRevision: 'rev-old' };
    expect(driver.stopLeavesActionableCard(before, { canContinue: true, interruptedTurnId: 'turn-new', recoveryRevision: 'rev-new' })).toBe(true);
    // Same turn or same revision: the card did not move on. A task that cannot continue: no actionable card.
    expect(driver.stopLeavesActionableCard(before, { canContinue: true, interruptedTurnId: 'turn-old', recoveryRevision: 'rev-new' })).toBe(false);
    expect(driver.stopLeavesActionableCard(before, { canContinue: true, interruptedTurnId: 'turn-new', recoveryRevision: 'rev-old' })).toBe(false);
    expect(driver.stopLeavesActionableCard(before, { canContinue: false, interruptedTurnId: 'turn-new', recoveryRevision: 'rev-new' })).toBe(false);
    // A missing fact is never an answer: null stays UNKNOWN.
    expect(driver.stopLeavesActionableCard(before, null)).toBeNull();
    expect(driver.stopLeavesActionableCard(null, { canContinue: true, interruptedTurnId: 'a', recoveryRevision: 'b' })).toBeNull();
    expect(driver.stopLeavesActionableCard(before, { interruptedTurnId: 'a', recoveryRevision: 'b' })).toBeNull();
    expect(driver.statusOf(driver.withGuard(driver.retryableStopStatus('cancelled'), true))).toBe('FAIL');
    expect(driver.statusOf(driver.withGuard(driver.retryableStopStatus('interrupted'), null))).toBe('UNKNOWN');
    expect(driver.statusOf(driver.withGuard(driver.retryableStopStatus('interrupted'), true))).toBe('PASS');
  });

  test('stream output tokens include stdout, so a never-stored out frame is a ghost and a same-millisecond persist is not proof', () => {
    expect(['tick 1', 'out 2', 'err 3', 'tick 12'].every((token) => new RegExp(driver.OUTPUT_TOKEN_PATTERN.source).test(token))).toBe(true);
    expect('x out 999 y err 1 tick 2'.match(driver.OUTPUT_TOKEN_PATTERN)).toEqual(['out 999', 'err 1', 'tick 2']);
    const base = { t: 1, dbFrameTexts: ['out 1', 'err 1'], domFrameTexts: [], ipcEventIds: [], dbEventIds: [], domReadEndMs: 1000 };
    // DOM shows out 1, err 1 and a never-stored out 999: the ghost is a violation even though the stored frames match.
    const ghost = driver.evaluateDomAfterDb([{ ...base, domTokens: ['out 1', 'err 1', 'out 999'] }]);
    expect(ghost.ok).toBe(false);
    expect(ghost.violations[0]).toMatchObject({ kind: 'dom_token', text: 'out 999' });
    expect(driver.evaluateDomAfterDb([{ ...base, domTokens: ['out 1', 'err 1'] }]).ok).toBe(true);
    // Same millisecond: neither a violation nor proof of order, so the answer is UNKNOWN; one millisecond earlier is fine, later is a violation.
    const sample = { ...base, dbFrameTexts: ['tick 1'], domFrameTexts: ['tick 1'], domTokens: [] };
    const stored = (persistedAtMs: number) => [{ eventId: 1, text: 'tick 1', persistedAtMs }];
    expect(driver.evaluateDomAfterDb([sample], stored(1000))).toMatchObject({ ok: null, tied_same_millisecond: 1 });
    expect(driver.evaluateDomAfterDb([sample], stored(999)).ok).toBe(true);
    expect(driver.evaluateDomAfterDb([sample], stored(1001)).ok).toBe(false);
    // A prefix of a stored token is not that token: out 9 is a ghost next to a stored out 99, tick 2 next to tick 20.
    for (const [storedText, shown] of [['out 99\r\n', 'out 9'], ['tick 20\n', 'tick 2'], ['err 100', 'err 10']]) {
      const prefixGhost = driver.evaluateDomAfterDb([{ ...base, dbFrameTexts: [storedText], domTokens: [shown] }]);
      expect(prefixGhost.ok).toBe(false);
      expect(prefixGhost.violations[0]).toMatchObject({ kind: 'dom_token', text: shown });
    }
    // Whole tokens, a token that ends the stored text (it may still be growing) and a token split across frames are stored.
    expect(driver.storedHasToken('out 99\r\nout 9\r\n', 'out 9')).toBe(true);
    expect(driver.storedHasToken('out 9', 'out 9')).toBe(true);
    expect(driver.storedHasToken('xout 9', 'out 9')).toBe(false);
    expect(driver.evaluateDomAfterDb([{ ...base, dbFrameTexts: ['out ', '12\r\n'], domTokens: ['out 12'] }]).ok).toBe(true);
  });

  test('the layout verdict needs an enabled, visible, reachable continuation card in every layout and the shorter window', () => {
    const control = { hidden: false, inViewport: true, reachable: true };
    const row = (card: any) => ({ pane_state_ok: true, drawer_open: false, controls: { 'task-prompt': control, 'run-task': control, 'cancel-task': control, card_button: card } });
    const card = { ...control, disabled: false };
    const shorter = (cardButton: any) => ({ inViewport: true, card_button: cardButton });
    const good = driver.evaluateUiLayouts([row(card), row(card)], shorter({ inViewport: true, reachable: true, disabled: false }), { card_found: true });
    expect(good).toMatchObject({ status: 'PASS', bad: 0, card_bad: 0, card_observed: true, shorter_card_ok: true });
    // A disabled card button is not usable, visible and reachable though it is.
    expect(driver.evaluateUiLayouts([row({ ...card, disabled: true })], shorter({ inViewport: true, reachable: true, disabled: false }), { card_found: true }).status).toBe('FAIL');
    expect(driver.evaluateUiLayouts([row(card)], shorter({ inViewport: true, reachable: true, disabled: true }), { card_found: true }).status).toBe('FAIL');
    // Hidden, covered or outside the viewport fails; a failing base control fails whatever the card does.
    expect(driver.evaluateUiLayouts([row({ ...card, reachable: false })], shorter({ inViewport: true, reachable: true, disabled: false }), { card_found: true }).status).toBe('FAIL');
    expect(driver.evaluateUiLayouts([{ controls: { ...row(card).controls, 'run-task': { ...control, hidden: true } } }], shorter({ inViewport: true, reachable: true, disabled: false }), { card_found: true }).status).toBe('FAIL');
    // No card found, a layout without the card, or no rows at all: UNKNOWN, never PASS.
    expect(driver.evaluateUiLayouts([row(null)], shorter(null), { card_found: false }).status).toBe('UNKNOWN');
    expect(driver.evaluateUiLayouts([row(card), row(null)], shorter({ inViewport: true, reachable: true, disabled: false }), { card_found: true }).status).toBe('UNKNOWN');
    expect(driver.evaluateUiLayouts([], shorter({ inViewport: true, reachable: true, disabled: false }), { card_found: true }).status).toBe('UNKNOWN');
  });

  test('an open drawer is judged by its close control, and a pane state that was not reached is never a PASS', () => {
    const control = { hidden: false, inViewport: true, reachable: true };
    const covered = { ...control, reachable: false };
    const card = { ...control, disabled: false };
    const shorter = { inViewport: true, card_button: { inViewport: true, reachable: true, disabled: false } };
    const docked = { pane_state_ok: true, drawer_open: false, controls: { 'task-prompt': control, 'run-task': control, 'cancel-task': control, card_button: card } };
    // The inspector drawer (below 1200 px) covers the composer and the card by design; its close control is what must be reachable.
    const drawer = (close: any) => ({ pane_state_ok: true, drawer_open: true, controls: { 'task-prompt': covered, 'run-task': covered, 'cancel-task': covered, card_button: { ...covered, disabled: false }, drawer_close: close } });
    const good = driver.evaluateUiLayouts([docked, drawer(control)], shorter, { card_found: true });
    expect(good).toMatchObject({ status: 'PASS', bad: 0, card_bad: 0, drawer_rows: 1, docked_rows: 1, state_unobserved: 0 });
    // A drawer that cannot be closed, or whose close control is missing, fails the layout.
    expect(driver.evaluateUiLayouts([docked, drawer(covered)], shorter, { card_found: true })).toMatchObject({ status: 'FAIL', bad: 1 });
    expect(driver.evaluateUiLayouts([docked, drawer(undefined)], shorter, { card_found: true }).status).toBe('FAIL');
    // A covered composer without an open drawer is still a failure.
    expect(driver.evaluateUiLayouts([{ ...docked, controls: { ...docked.controls, 'run-task': covered } }], shorter, { card_found: true }).status).toBe('FAIL');
    // Rows that never reached the wanted pane state, or only drawer rows, cannot carry a PASS.
    expect(driver.evaluateUiLayouts([docked, { ...docked, pane_state_ok: false }], shorter, { card_found: true })).toMatchObject({ status: 'UNKNOWN', state_unobserved: 1 });
    expect(driver.evaluateUiLayouts([docked, { ...docked, pane_state_ok: undefined }], shorter, { card_found: true }).status).toBe('UNKNOWN');
    expect(driver.evaluateUiLayouts([drawer(control)], shorter, { card_found: true }).status).toBe('UNKNOWN');
  });

  test('secret, CRLF, paging and status helpers behave on edge input', () => {
    expect(driver.secretLeak('abc sk-TESTONLYBA', 'sk-TESTONLYBATCH20123456789abcdef')).toEqual({ leaked: true, checked: true });
    expect(driver.secretLeak('clean', 'sk-TESTONLYBATCH20123456789abcdef')).toEqual({ leaked: false, checked: true });
    expect(driver.secretLeak('anything', '')).toEqual({ leaked: false, checked: false });
    expect(driver.normalizeCrlf('a\r\nb\r\n')).toBe('a\nb\n');
    const full = [1, 2, 3, 4, 5].map((eventId) => ({ eventId }));
    expect(driver.evaluatePaging(full, [[{ eventId: 4 }, { eventId: 5 }], [{ eventId: 2 }, { eventId: 3 }], [{ eventId: 1 }]])).toMatchObject({ ok: true, pages: 3 });
    expect(driver.evaluatePaging(full, [[{ eventId: 4 }, { eventId: 5 }], [{ eventId: 1 }]]).ok).toBe(false);
    expect(driver.evaluatePaging([], [])).toMatchObject({ ok: false });
    expect(driver.combineStatus(['PASS', 'PASS'])).toBe('PASS');
    expect(driver.combineStatus(['PASS', 'FAIL', 'UNKNOWN'])).toBe('FAIL');
    expect(driver.combineStatus(['PASS', 'UNKNOWN'])).toBe('UNKNOWN');
    expect(driver.combineStatus(['PASS', 'NOT_PERFORMED'])).toBe('NOT_PERFORMED');
    expect(driver.combineStatus([])).toBe('UNKNOWN');
    expect(driver.assertionId('B2-SAFE-02', 2)).toBe('B2-SAFE-02-A02');
  });

  test('process tree helpers match a process only by pid and creation stamp', () => {
    const rows = [
      { ProcessId: '10', ParentProcessId: '1', Name: 'electron.exe', CreationDate: 'a' },
      { ProcessId: '11', ParentProcessId: '10', Name: 'cmd.exe', CreationDate: 'b' },
      { ProcessId: '12', ParentProcessId: '11', Name: 'ping.exe', CreationDate: 'c' },
      { ProcessId: '13', ParentProcessId: '1', Name: 'other.exe', CreationDate: 'd' },
      { ProcessId: '10', ParentProcessId: '12', Name: 'loop.exe', CreationDate: 'z' },
    ];
    const tree = driver.descendantsOf(rows, 10);
    expect(tree.map((item: any) => item.pid)).toEqual([11, 12]);
    const baseline = driver.descendantsOf(rows.slice(0, 2), 10);
    expect(driver.newProcesses(baseline, tree).map((item: any) => item.pid)).toEqual([12]);
    expect(driver.stillAlive(tree, [{ ProcessId: '12', CreationDate: 'c' }, { ProcessId: '11', CreationDate: 'reused-pid' }]).map((item: any) => item.pid)).toEqual([12]);
    expect(driver.stillAlive(tree, [])).toEqual([]);
  });

  describe('a process tree leaves out a stale ParentProcessId (rehearsal 11, p03: the explorer.exe of another session named the pid of the new helper)', () => {
    const row = (pid: number, parent: number, name: string, created: string) => ({ ProcessId: String(pid), ParentProcessId: String(parent), Name: name, CreationDate: created });
    const driverRow = row(7656, 6204, 'electron.exe', '20261015082741.000000+480');
    const helper = row(3864, 7656, 'spike02_helper.exe', '20261015082743.073720+480');
    const shell = row(7144, 3864, 'powershell.exe', '20261015082743.089320+480');
    // The rows of the rehearsal 11 p03 listing: explorer.exe (session 1, created 2026-09-24) keeps the pid of a parent that exited long ago.
    const explorer = row(3908, 3864, 'explorer.exe', '20260924215846.364600+480');
    const explorerChild = row(4100, 3908, 'ctfmon.exe', '20260924215900.000000+480');
    const rows = [driverRow, helper, explorer, shell, explorerChild];

    test('a child older than its parent is a stale link: it and its subtree are not in the tree, and the link is reported', () => {
      const stale: any[] = [];
      const tree = driver.descendantsOf(rows, 7656, stale);
      expect(tree.map((item: any) => item.pid)).toEqual([3864, 7144]);
      expect(stale).toEqual([{ pid: 3908, parent: 3864, name: 'explorer.exe', created: '20260924215846.364600+480' }]);
      // The same instance in the next listing is not a survivor of anything, because it was never part of the tree.
      expect(driver.stillAlive(tree, rows).map((item: any) => item.pid)).toEqual([3864, 7144]);
      expect(driver.stillAlive(tree, [explorer, explorerChild])).toEqual([]);
    });

    test('the stale argument is optional, and an argument that is not an array is ignored', () => {
      expect(driver.descendantsOf(rows, 7656).map((item: any) => item.pid)).toEqual([3864, 7144]);
      for (const notAnArray of [null, undefined, {}, true, 'x']) {
        expect(driver.descendantsOf(rows, 7656, notAnArray).map((item: any) => item.pid)).toEqual([3864, 7144]);
      }
    });

    test('the stamp of the root is the stamp of the row of the root, not of a row that names the root as its parent', () => {
      const first = row(8000, 7656, 'child.exe', '20261015082750.000000+480');
      const second = row(8001, 7656, 'child.exe', '20261015082745.000000+480');
      const stale: any[] = [];
      expect(driver.descendantsOf([driverRow, first, second], 7656, stale).map((item: any) => item.pid)).toEqual([8000, 8001]);
      expect(stale).toEqual([]);
    });

    test('a child created after its parent, or at the same instant, stays in the tree', () => {
      const same = row(8000, 7656, 'child.exe', '20261015082741.000000+480');
      const later = row(8001, 7656, 'child.exe', '20261015082741.000001+480');
      expect(driver.descendantsOf([driverRow, same, later], 7656).map((item: any) => item.pid)).toEqual([8000, 8001]);
    });

    test('stamps are compared in UTC, so different offsets decide by the real order of the two instants', () => {
      const parent = row(7656, 1, 'electron.exe', '20261015082743.000000+480');
      const laterUtc = row(8000, 7656, 'child.exe', '20261015002743.500000+000');
      const earlierUtc = row(8001, 7656, 'child.exe', '20261015002742.500000+000');
      const stale: any[] = [];
      expect(driver.descendantsOf([parent, laterUtc, earlierUtc], 7656, stale).map((item: any) => item.pid)).toEqual([8000]);
      expect(stale.map((item: any) => item.pid)).toEqual([8001]);
      expect(driver.wmiStampMicros('19700101000000.000001+000')).toBe(1);
      expect(driver.wmiStampMicros('19700101080000.000000+480')).toBe(0);
      expect(driver.wmiStampMicros('19691231235959.999999+000')).toBe(-1);
      expect(driver.wmiStampMicros('19700101000000.000000-060')).toBe(60 * 60 * 1000 * 1000);
    });

    test('a stamp that cannot be read decides nothing: the link stays', () => {
      for (const bad of ['', 'a', '20261015082741.448520', '20261015082741.448520+48', '2026101508274.448520+480', ' ', 'x20261015082741.448520+480', '20261015082741.448520+480x', '20261015082741,448520+480']) {
        expect(driver.wmiStampMicros(bad)).toBeNull();
        const old = row(8000, 7656, 'old.exe', bad);
        expect(driver.descendantsOf([driverRow, old], 7656).map((item: any) => item.pid)).toEqual([8000]);
      }
      expect(driver.wmiStampMicros(undefined)).toBeNull();
      // Space around a stamp, as a CSV cell may carry it, does not change its value.
      expect(driver.wmiStampMicros(' 20261015082741.448520+480 ')).toBe(driver.wmiStampMicros('20261015082741.448520+480'));
      expect(driver.wmiStampMicros('20261015082741.448520+480')).not.toBeNull();
      // The parent is unreadable or has no row of its own: an older child stays.
      const olderChild = row(8000, 7656, 'old.exe', '20200101000000.000000+000');
      expect(driver.descendantsOf([olderChild], 7656).map((item: any) => item.pid)).toEqual([8000]);
      expect(driver.descendantsOf([{ ...driverRow, CreationDate: 'unreadable' }, olderChild], 7656).map((item: any) => item.pid)).toEqual([8000]);
      expect(driver.descendantsOf([{ ...driverRow, CreationDate: undefined }, olderChild], 7656).map((item: any) => item.pid)).toEqual([8000]);
      // An unreadable parent stamp keeps even a child whose stamp lies before 1970.
      expect(driver.descendantsOf([{ ...driverRow, CreationDate: 'unreadable' }, row(8000, 7656, 'old.exe', '19691231235959.999999+000')], 7656).map((item: any) => item.pid)).toEqual([8000]);
    });

    test('each level is checked against its own parent, not against the root', () => {
      const mid = row(8000, 7656, 'mid.exe', '20261015082750.000000+480');
      const olderThanMid = row(8001, 8000, 'leaf.exe', '20261015082745.000000+480');
      const newerThanMid = row(8002, 8000, 'leaf.exe', '20261015082751.000000+480');
      const stale: any[] = [];
      expect(driver.descendantsOf([driverRow, mid, olderThanMid, newerThanMid], 7656, stale).map((item: any) => item.pid)).toEqual([8000, 8002]);
      expect(stale.map((item: any) => item.pid)).toEqual([8001]);
    });
  });

  test('tool end events are classified from persisted facts', () => {
    const ends = [
      event(1, { toolName: 'start_process', ok: true }, 'tool_end'),
      event(2, { toolName: 'stop_process', ok: false, error: { code: 'A9_HANDLE_NOT_OWNED' } }, 'tool_end'),
      event(3, { toolName: 'read_process_output', result: 'A9_CURSOR_INVALID' }, 'tool_end'),
      event(4, { toolName: 'read_process_output', status: 'failed' }, 'tool_end'),
    ];
    expect(driver.toolEndsFor(ends, 'read_process_output')).toHaveLength(2);
    expect(driver.toolEndFailed(ends[0])).toBe(false);
    expect(driver.toolEndFailed(ends[1])).toBe(true);
    expect(driver.toolEndFailed(ends[2])).toBe(true);
    expect(driver.toolEndFailed(ends[3])).toBe(true);
    expect(driver.toolEndFailed({ eventId: 5, payload: { data: { toolName: 'x', ok: true, status: 'ok' } } })).toBe(false);
    expect(driver.summarizeToolEnd(ends[1])).toMatchObject({ toolName: 'stop_process', ok: false, error: 'A9_HANDLE_NOT_OWNED' });
    expect(driver.EXIT_BUTTONS).toEqual(['停止后退出', '留给系统后退出', '取消']);
    expect(driver.sha256('a')).toBe(sha('a'));
  });
  test('tool end events are classified from the escaped JSON result a real product writes (rehearsal 4)', () => {
    // The shape is copied from rehearsal 4 evidence: data.result is a JSON string, there is no top-level ok or error.
    const real = (toolName: string, result: unknown) => event(10, { schemaVersion: 1, toolName, callId: 'c', step: 1, result: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }, 'tool_end');
    const started = real('start_process', { status: 'background_started', exitCode: null, stdout: '[Background process started; handle sh-1]', stderr: '' });
    const limit = real('start_process', { status: 'failed', exitCode: null, stdout: '', stderr: '已达到托管后台进程上限 (3)，请先停止已有后台进程' });
    const unknownHandle = real('read_process_output', { error: { code: 'A9_MANAGED_HANDLE_UNKNOWN', message: 'A9_MANAGED_HANDLE_UNKNOWN' } });
    const badCursor = real('read_process_output', { error: { code: 'A9_MANAGED_CURSOR_INVALID', message: 'A9_MANAGED_CURSOR_INVALID' } });
    const entries = real('read_process_output', { handleId: 'sh-1', entries: [], nextCursor: 'x.1.0' });
    const stopped = real('stop_process', { handleId: 'sh-1', status: 'stopped', exitCode: 1, cleanupRequired: false });
    // BG-01 judges the four starts, BG-02 the four reads, BG-03 the two stops.
    expect([started, started, started, limit].map(driver.toolEndFailed)).toEqual([false, false, false, true]);
    expect([unknownHandle, badCursor, entries, entries].map(driver.toolEndFailed)).toEqual([true, true, false, false]);
    expect([stopped, stopped].map(driver.toolEndFailed)).toEqual([false, false]);
    // Command output nested in a structured result never turns a successful call into a failure.
    expect(driver.toolEndFailed(real('shell', { status: 'completed', exitCode: 0, stdout: '"status": "failed" A9_X_LIMIT', stderr: 'A9_Y_INVALID' }))).toBe(false);
    // An object result, a plain-text product code and a plain-text success are all classified.
    expect(driver.toolEndFailed(event(11, { toolName: 'x', result: { error: { code: 'A9_Z' } } }, 'tool_end'))).toBe(true);
    expect(driver.toolEndFailed(real('read_process_output', 'A9_MANAGED_HANDLE_UNKNOWN'))).toBe(true);
    expect(driver.toolEndFailed(real('read_process_output', 'all good'))).toBe(false);
    expect(driver.toolEndFailed(event(12, { toolName: 'x' }, 'tool_end'))).toBe(false);
    // The summary names the structured status and error code, and keeps enough of the result to read the refusal message.
    expect(driver.summarizeToolEnd(unknownHandle)).toMatchObject({ toolName: 'read_process_output', ok: null, error: 'A9_MANAGED_HANDLE_UNKNOWN', failed: true });
    expect(driver.summarizeToolEnd(limit)).toMatchObject({ result_status: 'failed', failed: true });
    expect(driver.summarizeToolEnd(limit).result_head).toContain('上限');
    expect(driver.summarizeToolEnd(started)).toMatchObject({ result_status: 'background_started', failed: false, error: null });
    expect(driver.toolEndResult(event(13, { result: '{not json' }, 'tool_end'))).toEqual({ parsed: null, text: '{not json' });
  });
  test('streamed rows are judged once in the live-output blocks, not once in the whole page (rehearsal 4)', () => {
    const counts = (blocks: number, live: number[], body: number[] = live) => ({ live_blocks: blocks, per_text: live.map((count, index) => ({ text: `t${index}`, live: count, body: body[index] })) });
    expect(driver.evaluateStreamedOnce(counts(1, [1, 1, 1]), ['a', 'b', 'c'])).toBe(true);
    // The same text also sits in the tool result detail: two in the page is fine, two in the live blocks is a duplicate.
    expect(driver.evaluateStreamedOnce(counts(1, [1, 1], [2, 2]), ['a', 'b'])).toBe(true);
    expect(driver.evaluateStreamedOnce(counts(1, [1, 2]), ['a', 'b'])).toBe(false);
    expect(driver.evaluateStreamedOnce(counts(2, [1, 1]), ['a', 'b'])).toBe(false);
    expect(driver.evaluateStreamedOnce(counts(0, [0, 0]), ['a', 'b'])).toBe(false);
    expect(driver.evaluateStreamedOnce(counts(1, [1]), ['a', 'b'])).toBeNull();
    expect(driver.evaluateStreamedOnce(null, ['a'])).toBeNull();
    expect(driver.evaluateStreamedOnce(counts(1, [1]), [])).toBeNull();
    expect(driver.evaluateStreamedOnce({ live_blocks: undefined, per_text: [{ live: 1 }] }, ['a'])).toBeNull();
  });
  test('managed residue items name every live or unconfirmed fact and keep its identifying fields', () => {
    const facts = [
      { handleId: 'h1', lastProbeStatus: 'stopped', ownershipState: 'owned' },
      { handleId: 'h2', lastProbeStatus: 'running', ownershipState: 'owned', pidReusePossible: true },
      { handleId: 'h3', lastProbeStatus: 'failed', cleanupRequired: true },
      { handleId: 'h4', lastProbeStatus: 'identity_mismatch' },
      { handleId: 'h5', lastProbeStatus: 'released' },
    ];
    expect(driver.managedResidueItems(facts).map((item: any) => item.handleId)).toEqual(['h2', 'h3', 'h4']);
    expect(driver.managedResidueItems(undefined)).toEqual([]);
    expect(driver.managedFactSummary(facts[1])).toEqual({ handleId: 'h2', status: 'running', cleanup_required: false, ownership: 'owned', recovery: null, pid_reuse_possible: true });
    expect(driver.managedFactSummary(facts[2])).toMatchObject({ handleId: 'h3', status: 'failed', cleanup_required: true });
  });
  describe('BG-03 (WIN7-45): stop, fast exit, failed start and release are judged apart', () => {
    const real = (toolName: string, result: unknown, eventId = 10) => ({ eventId, eventType: 'tool_end', payload: { data: { schemaVersion: 1, toolName, callId: 'c', step: 1, result: JSON.stringify(result) } }, data: { schemaVersion: 1, toolName, callId: 'c', step: 1, result: JSON.stringify(result) } });
    const started = real('start_process', { status: 'background_started', exitCode: null, stdout: '[Background process started; handle sh-1]', stderr: '' });
    const refused = real('start_process', { status: 'failed', exitCode: null, stdout: '', stderr: 'working directory does not exist' });
    const helperFailed = real('start_process', { error: { code: 'A9_BACKGROUND_HELPER_START_FAILED', message: 'A9_BACKGROUND_HELPER_START_FAILED' } });
    const stopped = real('stop_process', { handleId: 'sh-1', status: 'stopped', exitCode: 1, cleanupRequired: false });
    const stoppedAgain = real('stop_process', { handleId: 'sh-1', status: 'stopped', exitCode: 1, cleanupRequired: false });
    const exited = { handleId: 'sh-2', lastProbeStatus: 'exited', cleanupRequired: false, ownershipState: 'owned' };
    const failedFact = { handleId: 'sh-3', lastProbeStatus: 'failed', cleanupRequired: false, ownershipState: 'owned' };
    const healthy = (over: any = {}) => ({ stops: [stopped, stoppedAgain], afterStopFacts: [{ handleId: 'sh-1', lastProbeStatus: 'stopped' }], fast: { ends: [started], newFacts: [exited], residue: [] }, bad: { ends: [refused], newFacts: [], residue: [] }, ...over });

    test('the failed-start path is read from the tool end: refused, helper start failed or started', () => {
      expect(driver.classifyFailedStart([refused])).toBe('refused');
      expect(driver.classifyFailedStart([helperFailed])).toBe('helper_start_failed');
      expect(driver.classifyFailedStart([started])).toBe('started');
      expect(driver.classifyFailedStart([])).toBeNull();
      expect(driver.classifyFailedStart([refused, refused])).toBeNull();
      expect(driver.classifyFailedStart(undefined)).toBeNull();
      expect(driver.BAD_CWD_PATHS).toEqual(['refused', 'helper_start_failed', 'started']);
    });

    test('a double stop, a fast exit and a failed start that leave no process pass, whichever path the failed start took', () => {
      expect(driver.evaluateBg03Facts(healthy())).toMatchObject({ status: 'PASS', path: 'refused' });
      const viaHelper = driver.evaluateBg03Facts(healthy({ bad: { ends: [helperFailed], newFacts: [failedFact], residue: [] } }));
      expect(viaHelper).toMatchObject({ status: 'PASS', path: 'helper_start_failed' });
      expect(viaHelper.text).toMatch(/failed_start=PASS \[path=helper_start_failed/);
    });

    test('negative control: the earlier verdict (one start that ended, no release) cannot stand for the three claims', () => {
      // WIN7-43 passed with ready_fail_ends=1 where the one start had succeeded. A fast exit now needs a started handle that ended by itself,
      // and the failed start needs its own scenario: two successful starts in place of one failed start are not a failed start.
      const twoStarts = driver.evaluateBg03Facts(healthy({ bad: { ends: [started], newFacts: [exited], residue: [] } }));
      expect(twoStarts.status).toBe('UNKNOWN');
      expect(twoStarts.path).toBe('started');
      expect(twoStarts.text).toMatch(/the start did not fail/);
    });

    test('mutations: each missing or wrong fact changes the verdict', () => {
      expect(driver.evaluateBg03Facts(healthy({ stops: [stopped] })).status).toBe('FAIL');
      expect(driver.evaluateBg03Facts(healthy({ stops: [stopped, real('stop_process', { error: { code: 'TypeError: x' } })] })).status).toBe('FAIL');
      expect(driver.evaluateBg03Facts(healthy({ afterStopFacts: [{ handleId: 'sh-1', lastProbeStatus: 'running' }] })).status).toBe('FAIL');
      // The fast exit must be a started handle that ended: a failed start, a handle still running or one that needs cleanup is a failure.
      expect(driver.evaluateBg03Facts(healthy({ fast: { ends: [refused], newFacts: [], residue: [] } })).status).toBe('FAIL');
      expect(driver.evaluateBg03Facts(healthy({ fast: { ends: [started], newFacts: [{ ...exited, lastProbeStatus: 'running' }], residue: [] } })).status).toBe('FAIL');
      expect(driver.evaluateBg03Facts(healthy({ fast: { ends: [started], newFacts: [{ ...exited, cleanupRequired: true }], residue: [] } })).status).toBe('FAIL');
      expect(driver.evaluateBg03Facts(healthy({ fast: { ends: [started], newFacts: [exited], residue: [{ handleId: 'sh-2' }] } })).status).toBe('FAIL');
      expect(driver.evaluateBg03Facts(healthy({ fast: { ends: [started], newFacts: [], residue: [] } })).status).toBe('FAIL');
      expect(driver.evaluateBg03Facts(healthy({ fast: { ends: [refused], newFacts: [exited], residue: [] } })).status).toBe('FAIL');
      // A failed start that leaves a live, unconfirmed or cleanup-required fact is a failure on every path; a start that did not fail is never PASS.
      expect(driver.evaluateBg03Facts(healthy({ bad: { ends: [refused], newFacts: [{ handleId: 'sh-9', lastProbeStatus: 'running' }], residue: [{ handleId: 'sh-9' }] } })).status).toBe('FAIL');
      expect(driver.evaluateBg03Facts(healthy({ bad: { ends: [helperFailed], newFacts: [{ ...failedFact, cleanupRequired: true }], residue: [{ handleId: 'sh-3' }] } })).status).toBe('FAIL');
      expect(driver.evaluateBg03Facts(healthy({ bad: { ends: [started], newFacts: [{ handleId: 'sh-4', lastProbeStatus: 'running' }], residue: [{ handleId: 'sh-4' }] } })).status).toBe('FAIL');
      expect(driver.evaluateBg03Facts(healthy({ bad: { ends: [], newFacts: [], residue: [] } })).status).toBe('FAIL');
      // Nothing given is nothing observed (codex round 16): UNKNOWN. An observed empty list of tool ends is a FAIL (above).
      expect(driver.evaluateBg03Facts({}).status).toBe('UNKNOWN');
      // Each guard also holds alone: the first stop failing, residue from an older handle, and a cleanup flag on a new fact the residue list does not name.
      expect(driver.evaluateBg03Facts(healthy({ stops: [real('stop_process', { error: { code: 'A9_MANAGED_HANDLE_UNKNOWN' } }), stoppedAgain] })).status).toBe('FAIL');
      expect(driver.evaluateBg03Facts(healthy({ bad: { ends: [refused], newFacts: [], residue: [{ handleId: 'sh-old', lastProbeStatus: 'running' }] } })).status).toBe('FAIL');
      expect(driver.evaluateBg03Facts(healthy({ bad: { ends: [helperFailed], newFacts: [{ ...failedFact, cleanupRequired: true }], residue: [] } })).status).toBe('FAIL');
      expect(driver.evaluateBg03Facts(healthy({ bad: { ends: [refused], newFacts: [{ handleId: 'sh-5', lastProbeStatus: 'identity_mismatch' }], residue: [] } })).status).toBe('FAIL');
    });

    test('codex round 16 (P2): a list that was not given is UNKNOWN, a state the check does not know is never a finished one, a start must say it started', () => {
      const odd = { handleId: 'sh-8', lastProbeStatus: 'not_observed', cleanupRequired: false };
      const plain = { eventId: 11, eventType: 'tool_end', payload: { data: { toolName: 'start_process', result: 'started somehow' } }, data: { toolName: 'start_process', result: 'started somehow' } };
      const exitedStatus = real('start_process', { status: 'exited', exitCode: 9, stdout: '', stderr: '' });
      // Lists that were not given.
      expect(driver.evaluateBg03Facts(healthy({ bad: { ends: [helperFailed] } })).status).toBe('UNKNOWN');
      expect(driver.evaluateBg03Facts(healthy({ bad: { ends: [helperFailed], newFacts: [failedFact] } })).status).toBe('UNKNOWN');
      expect(driver.evaluateBg03Facts(healthy({ fast: { ends: [started], newFacts: [exited] } })).status).toBe('UNKNOWN');
      expect(driver.evaluateBg03Facts(healthy({ fast: undefined })).status).toBe('UNKNOWN');
      expect(driver.evaluateBg03Facts(healthy({ stops: undefined })).status).toBe('UNKNOWN');
      expect(driver.evaluateBg03Facts(healthy({ afterStopFacts: undefined })).status).toBe('UNKNOWN');
      // A state outside the product's vocabulary is not a finished one; a cleanup state is a failure.
      expect(driver.evaluateBg03Facts(healthy({ bad: { ends: [helperFailed], newFacts: [odd], residue: [] } })).status).toBe('UNKNOWN');
      expect(driver.evaluateBg03Facts(healthy({ bad: { ends: [refused], newFacts: [{ ...odd, lastProbeStatus: 'cleanup_required' }], residue: [] } })).status).toBe('FAIL');
      expect(driver.evaluateBg03Facts(healthy({ bad: { ends: [refused], newFacts: [null], residue: [] } })).status).toBe('UNKNOWN');
      expect(driver.evaluateBg03Facts(healthy({ fast: { ends: [started], newFacts: [{ ...exited, lastProbeStatus: 'not_observed' }], residue: [] } })).status).toBe('UNKNOWN');
      expect(driver.evaluateBg03Facts(healthy({ fast: { ends: [started], newFacts: [{ ...exited, lastProbeStatus: 'stopped' }], residue: [] } })).status).toBe('FAIL');
      // The start of a fast exit must say it started: no readable result is UNKNOWN, another status is a FAIL.
      expect(driver.evaluateBg03Facts(healthy({ fast: { ends: [real('start_process', {})], newFacts: [exited], residue: [] } })).status).toBe('UNKNOWN');
      expect(driver.evaluateBg03Facts(healthy({ fast: { ends: [plain], newFacts: [exited], residue: [] } })).status).toBe('UNKNOWN');
      expect(driver.evaluateBg03Facts(healthy({ fast: { ends: [exitedStatus], newFacts: [exited], residue: [] } })).status).toBe('FAIL');
      // A start that carries an error is a failed start even when its status text says started.
      expect(driver.evaluateBg03Facts(healthy({ fast: { ends: [real('start_process', { status: 'background_started', error: { code: 'A9_X' } })], newFacts: [exited], residue: [] } })).status).toBe('FAIL');
      // The unchanged healthy input still passes, and the details name what was observed.
      expect(driver.evaluateBg03Facts(healthy()).text).toMatch(/observed=true/);
    });

    test('the exit dialog facts name the three buttons in order and the returned index', () => {
      const entry = (buttons: any, response: number) => ({ shown_at: 't', buttons, response });
      const ok = driver.exitDialogFacts(entry(['停止后退出', '留给系统后退出', '取消'], 1), 1);
      expect(ok).toMatchObject({ buttons_ok: true, returned_index: 1, active_managed_before_quit: 1, timed_out: false, expected_buttons: driver.EXIT_BUTTONS });
      expect(driver.exitDialogFacts(entry(['留给系统后退出', '停止后退出', '取消'], 1), 1).buttons_ok).toBe(false);
      expect(driver.exitDialogFacts(entry(['停止后退出', '留给系统后退出'], 1), 1).buttons_ok).toBe(false);
      expect(driver.exitDialogFacts(entry(undefined, 1), 1).buttons_ok).toBe(false);
      expect(driver.exitDialogFacts(entry(['停止后退出', '留给系统后退出', '取消'], 0), 1).returned_index).toBe(0);
      expect(driver.exitDialogFacts(null, 0)).toMatchObject({ buttons_ok: false, returned_index: null });
      const source = fs.readFileSync(path.resolve(__dirname, 'a9-batch2-driver-entry.cjs'), 'utf8');
      expect(source).toContain("out('release-dialog-response.json', exitDialogFacts(entry, active.length));");
    });

    const row = (id: number, state: string, releaseId?: string, handleId = 'sh-1') => ({ id, created_at: `2026-10-15T00:00:0${id}.000Z`, payload_json: JSON.stringify({ schemaVersion: 1, handleId, ownershipState: state, ...(releaseId ? { releaseId } : {}), requestId: 'r', owner: {} }) });

    test('the ownership events must run owned, release_intent, released with one release id', () => {
      const good = driver.evaluateReleaseSequence([row(1, 'owned'), row(2, 'release_intent', 'rel_1'), row(3, 'released', 'rel_1')], 'sh-1');
      expect(good).toMatchObject({ ok: true, sequence: ['owned', 'release_intent', 'released'], release_ids: ['rel_1', 'rel_1'], same_release_id: true, events: 3 });
      expect(driver.RELEASE_SEQUENCE).toEqual(['owned', 'release_intent', 'released']);
      // Events of other handles are not counted.
      const mixed = driver.evaluateReleaseSequence([row(1, 'owned'), row(2, 'owned', undefined, 'sh-7'), row(3, 'release_intent', 'rel_1'), row(4, 'released', 'rel_1')], 'sh-1');
      expect(mixed.ok).toBe(true);
      // Mutations: no intent, another release id, no release at all, a missing id, extra events and an unreadable store.
      expect(driver.evaluateReleaseSequence([row(1, 'owned'), row(2, 'released', 'rel_1')], 'sh-1').ok).toBe(false);
      expect(driver.evaluateReleaseSequence([row(1, 'owned'), row(2, 'release_intent', 'rel_1'), row(3, 'released', 'rel_2')], 'sh-1')).toMatchObject({ ok: false, same_release_id: false });
      expect(driver.evaluateReleaseSequence([row(1, 'owned'), row(2, 'release_intent', 'rel_1')], 'sh-1').ok).toBe(false);
      expect(driver.evaluateReleaseSequence([row(1, 'owned'), row(2, 'release_intent'), row(3, 'released')], 'sh-1').ok).toBe(false);
      expect(driver.evaluateReleaseSequence([row(1, 'owned'), row(2, 'release_intent', 'rel_1'), row(3, 'release_unknown', 'rel_1')], 'sh-1').ok).toBe(false);
      expect(driver.evaluateReleaseSequence([row(1, 'owned'), row(2, 'release_intent', 'rel_1'), row(3, 'released', 'rel_1'), row(4, 'released', 'rel_1')], 'sh-1').ok).toBe(false);
      expect(driver.evaluateReleaseSequence([], 'sh-1').ok).toBe(false);
      expect(driver.evaluateReleaseSequence([{ id: 1, created_at: 'x', payload_json: '{broken' }], 'sh-1').ok).toBe(false);
      expect(driver.evaluateReleaseSequence(null, 'sh-1').ok).toBeNull();
      expect(driver.evaluateReleaseSequence([row(1, 'owned')], '').ok).toBeNull();
    });

    test('the driver keeps no ready-failure claim and the release mode asks for no assertion of its own', () => {
      const source = fs.readFileSync(path.resolve(__dirname, 'a9-batch2-driver-entry.cjs'), 'utf8');
      expect(source).not.toMatch(/b2:bg-ready-fail|ready_fail_ends|exit_without_dialog=pending/);
      expect(source).toContain("record('B2-BG-03-STOP-RELEASE-EXIT', 1, verdict.status,");
      expect(source).toContain("fastOutcome('b2:bg-fast-exit'");
      expect(source).toContain("fastOutcome('b2:bg-badcwd'");
      expect(source).toContain("submit('b2:bg-release')");
      const mode = /async function releaseExit\(\) \{([\s\S]*?)\n  \}\n/.exec(source);
      expect(mode).not.toBeNull();
      // A02 is decided by the smoke after the product is gone; the driver only records what the product shows before and while it exits.
      expect((mode as RegExpExecArray)[1]).not.toMatch(/record\(/);
      for (const name of ['release-exit-before.json', 'release-dialog-response.json', 'release-ownership-events.json']) expect((mode as RegExpExecArray)[1]).toContain(name);
    });

    test('the case lists both assertions, five evidence files and the known limit for the helper readiness failure', () => {
      const bg03 = fixtures.CASES.find((item: any) => item.case_id === 'B2-BG-03-STOP-RELEASE-EXIT');
      expect(bg03.assertions).toHaveLength(2);
      expect(bg03.assertions[0].description).toMatch(/exits at once/);
      expect(bg03.assertions[0].description).toMatch(/KL-12/);
      expect(bg03.assertions[1].description).toMatch(/leave to system/);
      expect(bg03.assertions[1].description).toMatch(/release_intent and then released/);
      expect(bg03.evidence).toEqual(['bg03-stop-release.json', 'release-exit-before.json', 'release-dialog-response.json', 'release-ownership-events.json', 'release-held-exit.json']);
      const kl12 = fixtures.KNOWN_LIMITS.filter((item: string) => item.startsWith('KL-12'));
      expect(kl12).toHaveLength(1);
      expect(kl12[0]).toMatch(/D-013/);
      expect(kl12[0]).toMatch(/trusted-shell-runner-contract\.test\.ts/);
    });
  });
  test('guard sub-results never turn an unobserved fact into PASS', () => {
    expect(driver.subResult('x', true, 'seen')).toEqual({ name: 'x', status: 'PASS', detail: 'seen' });
    expect(driver.subResult('x', false, 'bad').status).toBe('FAIL');
    expect(driver.subResult('x', null, 'not reached').status).toBe('UNKNOWN');
    expect(driver.subResult('x', undefined).status).toBe('UNKNOWN');
    expect(driver.summarizeSubs([driver.subResult('a', true), driver.subResult('b', true)])).toEqual({ status: 'PASS', text: 'a=PASS; b=PASS' });
    expect(driver.summarizeSubs([driver.subResult('a', true), driver.subResult('b', null)]).status).toBe('UNKNOWN');
    expect(driver.summarizeSubs([driver.subResult('a', false), driver.subResult('b', null)]).status).toBe('FAIL');
    expect(driver.summarizeSubs([]).status).toBe('UNKNOWN');
  });

  test('a guard counts as refused only with the named error and no Provider request or continue event', () => {
    const refused = { ok: false, error: { code: 'A9_CONTINUE_REVISION_MISMATCH' } };
    const still = { before: 4, after: 4 };
    expect(driver.guardRefused(refused, 'A9_CONTINUE_REVISION_MISMATCH', still, { before: 0, after: 0 })).toBe(true);
    expect(driver.guardRefused(refused, 'A9_CONTINUE_IDENTITY_MISMATCH', still, { before: 0, after: 0 })).toBe(false);
    expect(driver.guardRefused(refused, 'A9_CONTINUE_REVISION_MISMATCH', { before: 4, after: 5 }, { before: 0, after: 0 })).toBe(false);
    expect(driver.guardRefused(refused, 'A9_CONTINUE_REVISION_MISMATCH', still, { before: 0, after: 1 })).toBe(false);
    expect(driver.guardRefused({ ok: true }, 'A9_CONTINUE_REVISION_MISMATCH', still, { before: 0, after: 0 })).toBe(false);
    expect(driver.guardRefused(null, 'A9_CONTINUE_REVISION_MISMATCH', still, { before: 0, after: 0 })).toBe(false);
    // Counters that were not observed are UNKNOWN, never "unchanged": undefined === undefined must not prove a refusal.
    expect(driver.guardRefused(refused, 'A9_CONTINUE_REVISION_MISMATCH', undefined, { before: 0, after: 0 })).toBeNull();
    expect(driver.guardRefused(refused, 'A9_CONTINUE_REVISION_MISMATCH', {}, {})).toBeNull();
    expect(driver.guardRefused(refused, 'A9_CONTINUE_REVISION_MISMATCH', { before: 1, after: 1 }, { before: 'x', after: 'x' })).toBeNull();
    expect(driver.subResult('g', driver.guardRefused(refused, 'A9_CONTINUE_REVISION_MISMATCH', {}, {})).status).toBe('UNKNOWN');
    // A failed base condition stays FAIL even when the guard answer is unknown, and an unknown guard keeps a good base UNKNOWN.
    expect(driver.withGuard(false, null)).toBe(false);
    expect(driver.withGuard(true, null)).toBeNull();
    expect(driver.withGuard(true, true)).toBe(true);
    expect(driver.withGuard(true, false)).toBe(false);
    expect(driver.statusOf(null)).toBe('UNKNOWN');
  });

  test('the UI-01 journey passes only from a complete observed set and names the broken step', () => {
    const card = (button = '继续', disabled = false) => ({ text: '继续中断任务', button, disabled });
    const full = (): any => ({
      card0: card(),
      enter: { button_focused: true, busy_label: true, button_disabled: true, focus_in_card: true, scroll: { testable: true, before: 0, after: 1 }, continue_events_while_busy: 1, continue_events_after_extra_keys: 1,
        enter_delivery: { key: 'Enter', keydown: true, keypress: true, keyup: true, clicks: 1, delivered: true, keydown_target: 'BUTTON', page_focused: true },
        extra_enter: { key: 'Enter', keydown: true, keypress: false, keyup: true, clicks: 0, delivered: false, keydown_target: 'BODY' },
        extra_space: { key: 'Space', keydown: true, keypress: false, keyup: true, clicks: 0, delivered: true, keydown_target: 'BODY' } },
      stopped: { card: card(), focus_in_card: true, interrupted_turn_changed: true, revision_changed: true },
      view_return: { card: card() },
      space: { continue_events_total: 2, ipc_continue_calls_total: 2, second_turn_status: 'completed' },
    });
    const verdict = (facts: any) => driver.summarizeSubs(driver.evaluateUiJourney(facts));
    expect(driver.evaluateUiJourney(full())).toHaveLength(9);
    expect(verdict(full())).toMatchObject({ status: 'PASS' });
    expect(verdict({})).toMatchObject({ status: 'UNKNOWN' });
    expect(verdict(null)).toMatchObject({ status: 'UNKNOWN' });
    const failures: Array<[string, (f: any) => void]> = [
      ['loading_feedback', (f) => { f.enter.busy_label = false; }],
      ['loading_feedback', (f) => { f.enter.button_disabled = false; }],
      ['focus_stays_on_card_while_busy', (f) => { f.enter.focus_in_card = false; }],
      ['no_scroll_theft', (f) => { f.enter.scroll.after = 400; }],
      ['one_dispatch_while_busy', (f) => { f.enter.continue_events_after_extra_keys = 2; }],
      ['stop_returns_actionable_new_card', (f) => { f.stopped.card.disabled = true; }],
      ['stop_returns_actionable_new_card', (f) => { f.stopped.revision_changed = false; }],
      ['stop_returns_actionable_new_card', (f) => { f.stopped.interrupted_turn_changed = false; }],
      ['focus_on_card_after_stop', (f) => { f.stopped.focus_in_card = false; }],
      ['view_return_keeps_card', (f) => { f.view_return.card.disabled = true; }],
      ['space_retry_creates_one_more_turn', (f) => { f.space.continue_events_total = 3; }],
      ['space_retry_creates_one_more_turn', (f) => { f.space.second_turn_status = 'interrupted'; }],
    ];
    for (const [name, mutate] of failures) {
      const facts = full(); mutate(facts);
      const subs = driver.evaluateUiJourney(facts);
      expect(subs.find((item: any) => item.name === name).status).toBe('FAIL');
      expect(driver.summarizeSubs(subs).status).toBe('FAIL');
    }
    // A scroll area that cannot scroll proves nothing, so it stays UNKNOWN instead of PASS; a missing step stays UNKNOWN too.
    const flat = full(); flat.enter.scroll = { testable: false, before: 0, after: 0 };
    expect(driver.evaluateUiJourney(flat).find((item: any) => item.name === 'no_scroll_theft').status).toBe('UNKNOWN');
    expect(verdict(flat).status).toBe('UNKNOWN');
    const noSpace = full(); noSpace.space = null;
    expect(verdict(noSpace).status).toBe('UNKNOWN');
  });

  test('UI-01: the two Enter assertions are judged only when the page saw a real Enter keypress (rehearsal 7: no click in 9.96 s, cause UNKNOWN)', () => {
    const base = (): any => ({
      card0: { text: 'c', button: '继续', disabled: false },
      enter: { button_focused: true, busy_label: false, button_disabled: null, focus_in_card: true, scroll: { testable: true, before: 0, after: 0 }, continue_events_while_busy: 0, continue_events_after_extra_keys: 1,
        enter_delivery: { key: 'Enter', keydown: true, keypress: false, keyup: true, clicks: 0, delivered: false, keydown_target: 'BUTTON', page_focused: true },
        extra_enter: { key: 'Enter', keydown: true, keypress: false, keyup: true, clicks: 0, delivered: false, keydown_target: 'BODY' },
        extra_space: { key: 'Space', keydown: true, keypress: false, keyup: true, clicks: 0, delivered: true, keydown_target: 'BODY' } },
      stopped: { card: { text: 'c', button: '继续', disabled: false }, focus_in_card: true, interrupted_turn_changed: true, revision_changed: true },
      view_return: { card: { text: 'c', button: '继续', disabled: false } },
      space: { continue_events_total: 2, ipc_continue_calls_total: 2, second_turn_status: 'completed' },
    });
    const byName = (subs: any[], name: string) => subs.find((item: any) => item.name === name);
    // The rehearsal 7 facts with the new delivery record: the key reached the page as keydown and keyup but never as a keypress with char code 13, so UNKNOWN, not FAIL.
    const lost = driver.evaluateUiJourney(base());
    expect(byName(lost, 'loading_feedback').status).toBe('UNKNOWN');
    expect(byName(lost, 'one_dispatch_while_busy').status).toBe('UNKNOWN');
    expect(byName(lost, 'loading_feedback').detail).toContain('keypress13=false');
    expect(driver.summarizeSubs(lost).status).toBe('UNKNOWN');
    // The assertions that do not depend on Enter keep their own verdicts.
    expect(byName(lost, 'stop_returns_actionable_new_card').status).toBe('PASS');
    expect(byName(lost, 'space_retry_creates_one_more_turn').status).toBe('PASS');
    // A delivered Enter that produced no busy label and no event is a product FAIL.
    const delivered = base(); delivered.enter.enter_delivery = { key: 'Enter', keydown: true, keypress: true, keyup: true, clicks: 0, delivered: true, keydown_target: 'BUTTON', page_focused: true };
    const product = driver.evaluateUiJourney(delivered);
    expect(byName(product, 'loading_feedback').status).toBe('FAIL');
    expect(byName(product, 'one_dispatch_while_busy').status).toBe('FAIL');
    // No delivery record at all is UNKNOWN as well: the old facts shape cannot carry a PASS.
    const legacy = base(); legacy.enter.busy_label = true; legacy.enter.button_disabled = true; legacy.enter.continue_events_while_busy = 1; delete legacy.enter.enter_delivery;
    expect(byName(driver.evaluateUiJourney(legacy), 'loading_feedback').status).toBe('UNKNOWN');
    expect(byName(driver.evaluateUiJourney(legacy), 'one_dispatch_while_busy').status).toBe('UNKNOWN');
  });

  test('UI-01 (codex round 4): the repeated-input challenge counts only when the page saw the extra keys, and an Enter that went to the page body is UNKNOWN', () => {
    const card = { text: 'c', button: '继续', disabled: false };
    const full = (): any => ({
      card0: card,
      enter: { button_focused: true, busy_label: true, button_disabled: true, focus_in_card: true, scroll: { testable: true, before: 0, after: 0 }, continue_events_while_busy: 1, continue_events_after_extra_keys: 1,
        enter_delivery: { key: 'Enter', keydown: true, keypress: true, keyup: true, clicks: 1, delivered: true, keydown_target: 'BUTTON', page_focused: true },
        extra_enter: { key: 'Enter', keydown: true, keypress: false, keyup: true, clicks: 0, delivered: false, keydown_target: 'BODY' },
        extra_space: { key: 'Space', keydown: true, keypress: false, keyup: true, clicks: 0, delivered: true, keydown_target: 'BODY' } },
      stopped: { card, focus_in_card: true, interrupted_turn_changed: true, revision_changed: true },
      view_return: { card },
      space: { continue_events_total: 2, ipc_continue_calls_total: 2, second_turn_status: 'completed' },
    });
    const sub = (facts: any, name: string) => driver.evaluateUiJourney(facts).find((item: any) => item.name === name);
    expect(driver.summarizeSubs(driver.evaluateUiJourney(full())).status).toBe('PASS');
    // The finding of codex round 4: neither extra key reached the page, yet the old check answered PASS.
    const noExtras = full(); noExtras.enter.extra_enter = { ...noExtras.enter.extra_enter, keydown: false, keyup: false }; noExtras.enter.extra_space = { ...noExtras.enter.extra_space, keydown: false, keyup: false };
    expect(sub(noExtras, 'one_dispatch_while_busy').status).toBe('UNKNOWN');
    expect(driver.summarizeSubs(driver.evaluateUiJourney(noExtras)).status).toBe('UNKNOWN');
    const oneExtra = full(); oneExtra.enter.extra_space.keydown = false;
    expect(sub(oneExtra, 'one_dispatch_while_busy').status).toBe('UNKNOWN');
    const missingExtra = full(); delete missingExtra.enter.extra_enter;
    expect(sub(missingExtra, 'one_dispatch_while_busy').status).toBe('UNKNOWN');
    expect(sub(missingExtra, 'one_dispatch_while_busy').detail).toContain('extra_enter_keydown=not observed');
    // The extra keys reached the page and a second dispatch happened: FAIL.
    const twice = full(); twice.enter.continue_events_after_extra_keys = 2;
    expect(sub(twice, 'one_dispatch_while_busy').status).toBe('FAIL');
    // A disabled button need not click: extra keys with zero clicks are the normal case.
    expect(full().enter.extra_enter.clicks).toBe(0);
    // The extra keys do not matter for loading_feedback.
    expect(sub(noExtras, 'loading_feedback').status).toBe('PASS');
    // An Enter that the page gave to the body, or a focus call that did not land on the button, is UNKNOWN for both Enter assertions.
    const body = full(); body.enter.enter_delivery.keydown_target = 'BODY';
    const unfocused = full(); unfocused.enter.button_focused = false;
    const unknownFocus = full(); delete unknownFocus.enter.button_focused;
    for (const facts of [body, unfocused, unknownFocus]) {
      expect(sub(facts, 'loading_feedback').status).toBe('UNKNOWN');
      expect(sub(facts, 'one_dispatch_while_busy').status).toBe('UNKNOWN');
    }
    expect(sub(body, 'loading_feedback').detail).toContain('keydown_target=BODY');
    expect(sub(unfocused, 'loading_feedback').detail).toContain('button_focused=false');
  });

  test('key input: a char event carries the typed character, and the page-side summary tells a real Enter from a lost one', () => {
    expect(driver.keyEventsFor('Enter')).toEqual([{ type: 'keyDown', keyCode: 'Enter' }, { type: 'char', keyCode: '\r' }, { type: 'keyUp', keyCode: 'Enter' }]);
    expect(driver.keyEventsFor('Space')).toEqual([{ type: 'keyDown', keyCode: 'Space' }, { type: 'char', keyCode: ' ' }, { type: 'keyUp', keyCode: 'Space' }]);
    // Negative control: the earlier driver sent the key name as the char text, which is not a carriage return.
    expect(driver.keyEventsFor('Enter')[1].keyCode).not.toBe('Enter');
    expect(() => driver.keyEventsFor('Escape')).toThrow(/KEY_UNKNOWN/);
    const entry = (type: string, extra: any = {}) => ({ type, key: null, charCode: null, target: 'BUTTON', trusted: true, ...extra });
    const real = [entry('keydown', { key: 'Enter' }), entry('keypress', { key: 'Enter', charCode: 13 }), entry('click'), entry('keyup', { key: 'Enter' })];
    expect(driver.summarizeKeyPress(real, 0, 'Enter')).toEqual({ key: 'Enter', keydown: true, keypress: true, keyup: true, clicks: 1, delivered: true, keydown_target: 'BUTTON' });
    // The suspected failure of rehearsal 7 (hypothesis H1): the char text was the string "Enter", so the keypress carried char code 69 ("E").
    const wrongChar = [entry('keydown', { key: 'Enter' }), entry('keypress', { key: 'E', charCode: 69 }), entry('keyup', { key: 'Enter' })];
    expect(driver.summarizeKeyPress(wrongChar, 0, 'Enter')).toMatchObject({ keydown: true, keypress: false, delivered: false, clicks: 0 });
    // Nothing recorded after the press (the key never reached the page, hypothesis H2), and records from earlier presses are skipped.
    expect(driver.summarizeKeyPress([], 0, 'Enter')).toMatchObject({ delivered: false });
    expect(driver.summarizeKeyPress(real, real.length, 'Enter')).toMatchObject({ delivered: false, clicks: 0 });
    expect(driver.summarizeKeyPress(null, 0, 'Enter')).toMatchObject({ delivered: false });
    // Space is activated on keyup, so keydown and keyup of the space key decide.
    const space = [entry('keydown', { key: ' ' }), entry('keypress', { key: ' ', charCode: 32 }), entry('keyup', { key: ' ' }), entry('click')];
    expect(driver.summarizeKeyPress(space, 0, 'Space')).toMatchObject({ delivered: true, clicks: 1 });
    expect(driver.summarizeKeyPress(space.slice(0, 1), 0, 'Space')).toMatchObject({ delivered: false });
    // The target says whom the page gave the key to; the same keys on the page body are "delivered" but not to the button (codex round 4).
    const onBody = [entry('keydown', { key: 'Enter', target: 'BODY' }), entry('keypress', { key: 'Enter', charCode: 13, target: 'BODY' }), entry('keyup', { key: 'Enter', target: 'BODY' })];
    expect(driver.summarizeKeyPress(onBody, 0, 'Enter')).toMatchObject({ delivered: true, keydown_target: 'BODY' });
    expect(driver.summarizeKeyPress([], 0, 'Enter').keydown_target).toBeNull();
    expect(driver.summarizeKeyPress(real, 0, 'Space').keydown_target).toBeNull();
  });

  test('key recorder: the page-side source records keydown, keypress, keyup and click once and is idempotent', () => {
    const listeners: Array<[string, (event: any) => void, boolean]> = [];
    const fakeWindow: any = { addEventListener: (type: string, listener: (event: any) => void, capture: boolean) => { listeners.push([type, listener, capture]); } };
    expect(vm.runInNewContext(driver.KEY_RECORDER_SOURCE, { window: fakeWindow })).toBe(true);
    expect(listeners.map((item) => item[0])).toEqual(['keydown', 'keypress', 'keyup', 'click']);
    expect(listeners.every((item) => item[2] === true)).toBe(true);
    const fire = (type: string, event: any) => listeners.filter((item) => item[0] === type).forEach((item) => item[1](event));
    fire('keydown', { key: 'Enter', target: { tagName: 'BUTTON' }, isTrusted: true });
    fire('keypress', { key: 'Enter', charCode: 13, target: { tagName: 'BUTTON' }, isTrusted: true });
    fire('click', { target: { tagName: 'BUTTON' }, isTrusted: false });
    expect(fakeWindow.__b2KeyRecords).toEqual([
      { type: 'keydown', key: 'Enter', charCode: null, target: 'BUTTON', trusted: true },
      { type: 'keypress', key: 'Enter', charCode: 13, target: 'BUTTON', trusted: true },
      { type: 'click', key: null, charCode: null, target: 'BUTTON', trusted: false },
    ]);
    // A second install on the same window adds no listener, so one press is never counted twice.
    expect(vm.runInNewContext(driver.KEY_RECORDER_SOURCE, { window: fakeWindow })).toBe(true);
    expect(listeners).toHaveLength(4);
    expect(driver.summarizeKeyPress(fakeWindow.__b2KeyRecords, 0, 'Enter')).toMatchObject({ delivered: true, clicks: 1 });
  });

  test('SAFE-02: the verdict reads the IPC answer of a9.turn.submit, not the page or the Turn row (rehearsal 7 facts)', () => {
    const code = 'A9_AUDIT_PERSISTENCE_FAILED';
    expect(driver.AUDIT_FAILURE_CODE).toBe(code);
    // The facts of rehearsal 7: file written, no tool_end, Turn row still active, no new request, the code only in the IPC answers.
    const rehearsal7 = (): any => ({ file_written: true, tool_ends: 0, turn_status: 'active', submit_calls: [{ ok: false, error: code }, { ok: false, error: code }],
      requests: { before: 0, after_turn: 1, after_next_submit: 1 }, provider_window: { requests: 1, tool_result_requests: 0 }, page_shows_code: false, outcome_json_has_code: false });
    expect(driver.evaluateAuditHardStop(rehearsal7())).toMatchObject({ status: 'PASS' });
    expect(driver.evaluateAuditHardStop(rehearsal7()).detail).toContain(`submit_error_code=${code}`);
    // Page text and outcome_json are observations: they change the detail, never the verdict.
    const shown = rehearsal7(); shown.page_shows_code = true; shown.outcome_json_has_code = true;
    expect(driver.evaluateAuditHardStop(shown).status).toBe('PASS');
    const failures: Array<[string, (f: any) => void]> = [
      ['the side effect did not happen', (f) => { f.file_written = false; }],
      ['a tool_end was persisted', (f) => { f.tool_ends = 1; }],
      ['the first submit succeeded', (f) => { f.submit_calls[0] = { ok: true, error: null }; }],
      ['the first submit failed with another code', (f) => { f.submit_calls[0] = { ok: false, error: 'A9_WORKSPACE_REQUIRED' }; }],
      ['the Turn completed', (f) => { f.turn_status = 'completed'; }],
      ['the next submit reached the Provider', (f) => { f.requests.after_next_submit = 2; f.provider_window = { requests: 2, tool_result_requests: 0 }; }],
      // codex round 4, P1, restated after round 5: a request that carries the tool result is a dispatch after the failed tool_end, whatever the request total.
      ['the first turn sent the tool result back and then stopped', (f) => { f.requests = { before: 0, after_turn: 2, after_next_submit: 2 }; f.provider_window = { requests: 2, tool_result_requests: 1 }; }],
      ['the first turn sent the tool result back and the second submit was never observed', (f) => { f.requests = { before: 0, after_turn: 2, after_next_submit: 2 }; f.provider_window = { requests: 2, tool_result_requests: 1 }; f.submit_calls = [f.submit_calls[0]]; }],
      ['the first turn dispatched nothing', (f) => { f.requests = { before: 0, after_turn: 0, after_next_submit: 0 }; f.provider_window = { requests: 0, tool_result_requests: 0 }; }],
    ];
    for (const [label, mutate] of failures) {
      const facts = rehearsal7(); mutate(facts);
      expect({ label, status: driver.evaluateAuditHardStop(facts).status }).toEqual({ label, status: 'FAIL' });
    }
    // The second answer is an observation only.
    const secondOk = rehearsal7(); secondOk.submit_calls[1] = { ok: true, error: null };
    expect(driver.evaluateAuditHardStop(secondOk).status).toBe('PASS');
    // codex round 5, R4: the Gateway retries a lost response, so the first turn may count several requests; none of them carries the tool result.
    for (const total of [2, 3, 6]) {
      const retried = rehearsal7(); retried.requests = { before: 0, after_turn: total, after_next_submit: total }; retried.provider_window = { requests: total, tool_result_requests: 0 };
      expect({ total, status: driver.evaluateAuditHardStop(retried).status }).toEqual({ total, status: 'PASS' });
    }
    // Anything not observed is UNKNOWN, never PASS and never FAIL.
    const unobserved: Array<[string, (f: any) => void]> = [
      ['no submit answer', (f) => { f.submit_calls = []; }],
      ['no answers list', (f) => { delete f.submit_calls; }],
      ['file state unknown', (f) => { delete f.file_written; }],
      ['tool_end count unknown', (f) => { f.tool_ends = null; }],
      ['request counter missing', (f) => { f.requests = { before: 0 }; }],
      ['baseline counter missing', (f) => { f.requests = { after_turn: 1, after_next_submit: 1 }; }],
      // codex round 4, P1: with no second a9.turn.submit the "no new request" check is empty.
      ['second submit not observed', (f) => { f.submit_calls = [f.submit_calls[0]]; }],
      ['Provider log not read', (f) => { delete f.provider_window; }],
      ['a log line without a tool_messages count', (f) => { f.provider_window = { requests: 1, tool_result_requests: null }; }],
      ['the log holds fewer lines than the counters', (f) => { f.requests = { before: 0, after_turn: 2, after_next_submit: 2 }; f.provider_window = { requests: 1, tool_result_requests: 0 }; }],
    ];
    for (const [label, mutate] of unobserved) {
      const facts = rehearsal7(); mutate(facts);
      expect({ label, status: driver.evaluateAuditHardStop(facts).status }).toEqual({ label, status: 'UNKNOWN' });
    }
    expect(driver.evaluateAuditHardStop(null).status).toBe('UNKNOWN');
    expect(driver.AUDIT_FIRST_TURN_REQUESTS).toBeUndefined();
    // The baseline is relative, and the criterion matches the scenario: the first request asks for the write, the request that carries its result is the forbidden dispatch.
    const later = rehearsal7(); later.requests = { before: 3, after_turn: 4, after_next_submit: 4 };
    expect(driver.evaluateAuditHardStop(later).status).toBe('PASS');
    const asked = (done: number) => fixtures.providerStep({ messages: [{ role: 'user', content: 'please run b2:audit-write' }, ...(done ? [{ role: 'tool', tool_call_id: 'b2-aw-1', content: 'ok' }] : [])] }, {});
    expect(JSON.stringify(asked(0))).toContain('"write"');
    expect(asked(1)).toEqual({ content: 'audit write scenario finished.' });
    expect(driver.evaluateAuditHardStop(rehearsal7()).detail).toContain('requests_with_tool_result=0');
  });

  test('S04 (KL-5): only UTF-8 and CRLF decide the verdict; CP936 and UTF-16LE are INFORMATIONAL (rehearsal 7 facts)', () => {
    expect(driver.ENCODING_GATING).toEqual(['utf8', 'crlf']);
    const outcome = (label: string, ok: boolean) => ({ label, ok, gating: ['utf8', 'crlf'].includes(label) });
    const rehearsal7 = () => [outcome('utf8', true), outcome('utf16le', false), outcome('cp936', false), outcome('crlf', true)];
    const verdict = driver.evaluateEncodingOutcomes(rehearsal7());
    expect(verdict.status).toBe('PASS');
    expect(verdict.text).toBe('utf8=true; utf16le=false (INFORMATIONAL, KL-5); cp936=false (INFORMATIONAL, KL-5); crlf=true');
    // A product that starts decoding the two informational encodings does not change the verdict either.
    expect(driver.evaluateEncodingOutcomes([outcome('utf8', true), outcome('utf16le', true), outcome('cp936', true), outcome('crlf', true)]).status).toBe('PASS');
    // The two decisive labels still fail the case.
    expect(driver.evaluateEncodingOutcomes([outcome('utf8', false), outcome('utf16le', true), outcome('cp936', true), outcome('crlf', true)]).status).toBe('FAIL');
    expect(driver.evaluateEncodingOutcomes([outcome('utf8', true), outcome('utf16le', true), outcome('cp936', true), outcome('crlf', false)]).status).toBe('FAIL');
    // A decisive label that was not observed is UNKNOWN; so is an empty or missing list.
    expect(driver.evaluateEncodingOutcomes([outcome('utf8', true), outcome('utf16le', false), outcome('cp936', false)])).toMatchObject({ status: 'UNKNOWN' });
    expect(driver.evaluateEncodingOutcomes([]).status).toBe('UNKNOWN');
    expect(driver.evaluateEncodingOutcomes(undefined).status).toBe('UNKNOWN');
  });

  test('S04 (KL-5): the contract text names PowerShell UTF-8 and CRLF, keeps 25 cases and 43 assertions, and carries KL-5', () => {
    const s04 = fixtures.CASES.find((item: any) => item.case_id === 'B2-S04-ENCODING-CROSSCHUNK');
    expect(s04.assertions).toHaveLength(1);
    const text = JSON.stringify(s04.assertions);
    expect(text).toContain('UTF-8 text split across chunks decodes losslessly under Windows PowerShell');
    expect(text).toContain('CRLF and a final line without newline are preserved');
    expect(text).toContain('informational only, KL-5');
    expect(text).not.toContain('UTF-8, CP936 and UTF-16LE');
    expect(fixtures.selfCheck()).toMatchObject({ ok: true, cases: 37, assertions: 67 });
    const kl5 = fixtures.KNOWN_LIMITS.filter((item: string) => item.startsWith('KL-5'));
    expect(kl5).toHaveLength(1);
    expect(kl5[0]).toContain('A9_OUTPUT_ENCODING_ERROR');
    expect(kl5[0]).toContain('INFORMATIONAL');
  });
});

// The guard journeys of p06 judge persisted facts. This block runs the driver's own fact writers against the real runtime in
// Node, so the expectations (error codes, blocked reasons, zero requests) are checked on the dev machine before any rehearsal.
// It is not Electron, Win10 or Win7 evidence.
describe('A9-33 batch-2 guard journeys against the real runtime', () => {
  function startCountingProvider(): Promise<{ baseUrl: string; count: () => number; close: () => Promise<void> }> {
    let seen = 0;
    return new Promise((resolve) => {
      const server = http.createServer((req, res) => {
        req.on('data', () => undefined);
        req.on('end', () => {
          seen += 1;
          res.writeHead(200, { 'Content-Type': 'text/event-stream' });
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        });
      });
      server.listen(0, '127.0.0.1', () => resolve({
        baseUrl: `http://127.0.0.1:${(server.address() as any).port}`, count: () => seen, close: () => new Promise<void>((done) => server.close(() => done())),
      }));
    });
  }

  test('wrong owner, revision drift, residue and unreadable mode settings each refuse a continue and send nothing', async () => {
    const root = temp('guards');
    const workspaceRoot = path.join(root, 'ws');
    const dataRoot = path.join(root, 'data');
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.mkdirSync(dataRoot, { recursive: true });
    const provider = await startCountingProvider();
    const makeRuntime = () => createA9AgentRuntime({
      workspaceRoot, dataRoot, ownerId: `b2-guards-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      openDatabase: (file: string, options?: { readonly?: boolean }) => new Database(file, options && options.readonly ? { readonly: true } : {}),
    });
    const taskId = 'b2-guard-task';
    const continueEvents = () => {
      const db = new Database(path.join(dataRoot, 'a9-state.db'), { readonly: true });
      try { return (db.prepare("SELECT count(*) AS n FROM a9_events WHERE event_type = 'task_continue_requested'").get() as any).n as number; } finally { db.close(); }
    };
    let runtime = makeRuntime();
    try {
      runtime.setMode('full_access');
      await runtime.configureProvider({ baseUrl: provider.baseUrl, model: 'fixture', skipProbe: true });
      const conversation = runtime.getSnapshot().activeConversationId;
      const writer = new Database(path.join(dataRoot, 'a9-state.db'));
      try { driver.insertInterruptedTask(writer, conversation, taskId, 'b2-guard-old-turn'); } finally { writer.close(); }
      const find = () => runtime.getSnapshot().recoveryTasks.find((item: any) => item.taskId === taskId);
      const recovery = find();
      expect(recovery).toMatchObject({ canContinue: true, conversationId: conversation, interruptedTurnId: 'b2-guard-old-turn' });
      const measured = async (identity: { conversationId: string; recoveryRevision: string }) => {
        const before = { requests: provider.count(), events: continueEvents() };
        const result = await runtime.continueTask({ conversationId: identity.conversationId, taskId, interruptedTurnId: recovery.interruptedTurnId, recoveryRevision: identity.recoveryRevision });
        return { result, requests: { before: before.requests, after: provider.count() }, events: { before: before.events, after: continueEvents() } };
      };
      const good = { conversationId: conversation, recoveryRevision: recovery.recoveryRevision };

      const wrong = await measured({ conversationId: 'b2-not-this-conversation', recoveryRevision: recovery.recoveryRevision });
      expect(driver.guardRefused(wrong.result, 'A9_CONTINUE_IDENTITY_MISMATCH', wrong.requests, wrong.events)).toBe(true);
      const drift = await measured({ conversationId: conversation, recoveryRevision: '0'.repeat(64) });
      expect(driver.guardRefused(drift.result, 'A9_CONTINUE_REVISION_MISMATCH', drift.requests, drift.events)).toBe(true);

      // Residue: the injected fact blocks the card and the call; removing it unblocks the same card.
      const residue = new Database(path.join(dataRoot, 'a9-state.db'));
      try { driver.insertResidueFact(residue, workspaceRoot, 'b2-injected-residue'); } finally { residue.close(); }
      expect(find()).toMatchObject({ canContinue: false, blockedReason: 'A9_MANAGED_PROCESS_CLEANUP_UNCONFIRMED' });
      const blocked = await measured(good);
      expect(driver.guardRefused(blocked.result, 'A9_MANAGED_PROCESS_CLEANUP_UNCONFIRMED', blocked.requests, blocked.events)).toBe(true);
      const cleanup = new Database(path.join(dataRoot, 'a9-state.db'));
      try { driver.deleteResidueFact(cleanup, 'b2-injected-residue'); } finally { cleanup.close(); }
      expect(find()).toMatchObject({ canContinue: true });
      expect(provider.count()).toBe(0);

      // Unreadable mode settings: a new runtime keeps the same real task blocked and sends nothing.
      await runtime.shutdown();
      const located = driver.findModeSettingsFile(dataRoot);
      expect(located.count).toBe(1);
      const original = fs.readFileSync(located.file);
      try {
        fs.writeFileSync(located.file, driver.CORRUPT_MODE_SETTINGS, 'utf8');
        runtime = makeRuntime();
        expect(find()).toMatchObject({ canContinue: false, blockedReason: 'A9_MODE_SELECTION_REQUIRED' });
        const mode = await measured(good);
        expect(driver.guardRefused(mode.result, 'A9_MODE_SELECTION_REQUIRED', mode.requests, mode.events)).toBe(true);
        expect(provider.count()).toBe(0);
      } finally { fs.writeFileSync(located.file, original); }
    } finally {
      try { await runtime.shutdown(); } catch (_error) { /* already shut down */ }
      await provider.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  test('stopping a continuation turn leaves the task retryable: interrupted rows and a new enabled card', async () => {
    const root = temp('stop');
    const workspaceRoot = path.join(root, 'ws');
    const dataRoot = path.join(root, 'data');
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.mkdirSync(dataRoot, { recursive: true });
    // A Provider that accepts the request and then never answers, so the turn is stopped while it waits.
    const sockets = new Set<any>();
    let arrive: () => void = () => undefined;
    const arrived = new Promise<void>((resolve) => { arrive = resolve; });
    const server = http.createServer((req, res) => {
      req.on('data', () => undefined);
      req.on('end', () => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write(': hold\n\n'); arrive(); });
    });
    server.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
    const runtime = createA9AgentRuntime({
      workspaceRoot, dataRoot, ownerId: `b2-stop-${process.pid}-${Date.now()}`,
      openDatabase: (file: string, options?: { readonly?: boolean }) => new Database(file, options && options.readonly ? { readonly: true } : {}),
    });
    try {
      runtime.setMode('full_access');
      await runtime.configureProvider({ baseUrl, model: 'fixture', skipProbe: true });
      const conversation = runtime.getSnapshot().activeConversationId;
      const writer = new Database(path.join(dataRoot, 'a9-state.db'));
      try { driver.insertInterruptedTask(writer, conversation, 'b2-stop-task', 'b2-stop-old-turn'); } finally { writer.close(); }
      const find = () => runtime.getSnapshot().recoveryTasks.find((item: any) => item.taskId === 'b2-stop-task');
      const before = find();
      const continuation = runtime.continueTask({ conversationId: conversation, taskId: 'b2-stop-task', interruptedTurnId: before.interruptedTurnId, recoveryRevision: before.recoveryRevision });
      await Promise.race([arrived, new Promise((_resolve, reject) => setTimeout(() => reject(new Error('the Provider request never arrived')), 20000))]);
      await runtime.stop();
      await continuation;
      const reader = new Database(path.join(dataRoot, 'a9-state.db'), { readonly: true });
      let turns: any[];
      try { turns = reader.prepare('SELECT turn_id, status FROM a9_turns WHERE task_id = ? ORDER BY rowid').all('b2-stop-task') as any[]; } finally { reader.close(); }
      const newest = turns[turns.length - 1];
      expect(newest.turn_id).not.toBe('b2-stop-old-turn');
      // The product fact the driver's CH-05 second assertion depends on: a stopped continuation is stored as interrupted.
      expect(newest.status).toBe('interrupted');
      expect(driver.retryableStopStatus(newest.status)).toBe(true);
      const after = find();
      expect(after).toMatchObject({ canContinue: true });
      expect(after.interruptedTurnId).not.toBe(before.interruptedTurnId);
      expect(after.recoveryRevision).not.toBe(before.recoveryRevision);
      // The driver's verdict function sees the same snapshot facts the driver reads after Stop.
      expect(driver.stopLeavesActionableCard({ interruptedTurnId: before.interruptedTurnId, recoveryRevision: before.recoveryRevision }, after)).toBe(true);
      expect(runtime.getSnapshot().recoveryTasks.find((item: any) => item.taskId === 'b2-stop-task')).toMatchObject({ taskId: 'b2-stop-task' });
    } finally {
      try { await runtime.shutdown({ stopManaged: true }); } catch (_error) { /* already stopped */ }
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});

// Rehearsal 6 (Win7, p04 and p05) showed five suite defects. Each test below runs the shipped driver or fixture code against the facts
// that the rehearsal evidence showed, and keeps a negative control that restores the old code and must fail.
describe('A9-33 batch-2 rehearsal 6 fixes', () => {
  const driverSource = fs.readFileSync(path.resolve(__dirname, 'a9-batch2-driver-entry.cjs'), 'utf8');
  const slice = (from: string, to: string) => {
    const start = driverSource.indexOf(from);
    const end = driverSource.indexOf(to, start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return driverSource.slice(start, end);
  };
  const step = (token: string, tools: any[] = [], state: any = {}) => fixtures.providerStep({ messages: [{ role: 'user', content: `please run ${token}` }, ...tools] }, state);
  const toolMessages = (count: number) => Array.from({ length: count }, () => ({ role: 'tool', content: 'ok' }));

  describe('S04: a prompt ends at the end event of its own Turn, and every prompt has its own call id', () => {
    const START = (eventId: number, turnId: string) => ({ eventId, turnId, eventType: 'turn_started' });
    const OUT = (eventId: number, turnId: string) => ({ eventId, turnId, eventType: 'tool_output' });
    const END = (eventId: number, turnId: string) => ({ eventId, turnId, eventType: 'turn_completed' });
    const runnerCode = () => slice('const isTerminalEvent = ', '  // The smoke kills this process tree');
    // The conversation as the product keeps it: the events query returns the newest 1000 events in ascending order, whatever the
    // conversation holds. The submit appends the first step (a Turn starts at once); every poll that does not end the prompt appends the next.
    async function run(code: string, before: any[], steps: any[][]) {
      const stored = before.slice();
      const seen: boolean[] = [];
      let submitted = false;
      let queryCount = 0;
      const box: any = {
        waitIdle: async () => ({}), conversationId: async () => 'conv-1',
        events: async () => { queryCount += 1; return { events: stored.slice(-1000) }; },
        submit: async () => { submitted = true; stored.push(...(steps[0] || [])); },
        observeUntil: async (done: any) => {
          for (let tick = 0; ; tick += 1) {
            const verdict = Boolean(await done(stored.slice(-1000)));
            seen.push(verdict);
            if (verdict) return { tick };
            if (tick + 1 >= steps.length) throw new Error('never ended');
            stored.push(...steps[tick + 1]);
          }
        },
      };
      vm.runInNewContext(`${code}\n;this.api = { runPrompt };`, box);
      const result = await box.api.runPrompt('b2:s04-utf16le');
      return { seen, submitted, result, queryCount };
    }
    const first = [START(1, 't1'), END(5, 't1')];

    test('the second prompt of a conversation is not ended by the end event of the first', async () => {
      const outcome = await run(runnerCode(), first, [[START(6, 't2')], [OUT(7, 't2')], [END(8, 't2')]]);
      expect(outcome.submitted).toBe(true);
      expect(outcome.seen).toEqual([false, false, true]);
      expect(outcome.result).toEqual({ tick: 2 });
    });

    test('a Turn that has ended before the first poll after the submit ends the prompt on that poll', async () => {
      const outcome = await run(runnerCode(), first, [[START(6, 't2'), OUT(7, 't2'), END(8, 't2')]]);
      expect(outcome.seen).toEqual([true]);
    });

    test('negative control: a baseline read after the submit never lets the prompt end', async () => {
      const code = runnerCode();
      const mutated = code.replace(/(const baseline = await eventBaseline\(\);\s*)(await submit\(token\);)/, '$2\n    $1');
      expect(mutated).not.toBe(code);
      // The mutated order reads the baseline after the Turn has started and ended, so the end event is never newer than the baseline.
      await expect(run(mutated, first, [[START(6, 't2'), OUT(7, 't2'), END(8, 't2')]])).rejects.toThrow('never ended');
    });

    test('an end event of another Turn that arrives after the submit does not end the prompt', async () => {
      const outcome = await run(runnerCode(), first, [[START(6, 't2')], [END(7, 't-late-older-turn')], [END(8, 't2')]]);
      expect(outcome.seen).toEqual([false, false, true]);
    });

    test('a conversation whose last Turn was cut off (a start event, no end event) names the new Turn by the new start event', async () => {
      // After a killed process the stored events can end with the start event of the cut-off Turn. Its id is the baseline, so only a start
      // event newer than the baseline is the new Turn.
      const cutOff = [...first, START(6, 't-cut-off')];
      const outcome = await run(runnerCode(), cutOff, [[START(7, 't2')], [END(8, 't2')]]);
      expect(outcome.seen).toEqual([false, true]);
    });

    test('a first prompt in an empty conversation ends at its own end event', async () => {
      const outcome = await run(runnerCode(), [], [[START(1, 't1')], [END(2, 't1')]]);
      expect(outcome.seen).toEqual([false, true]);
    });

    test('a conversation with more than 1000 events: the oldest end event leaves the window and the prompt still ends', async () => {
      // 1500 stored events with end events at 501 and 1400. The Turn adds 22 events, so the newest-1000 window moves from 501 to 523 and the
      // end event at 501 leaves it. A count of end events (2 before, 2 after) never rises.
      const filler = Array.from({ length: 1500 }, (_v, i) => OUT(i + 1, 'tx'));
      const long = filler.map((e) => (e.eventId === 501 || e.eventId === 1400 ? END(e.eventId, 'tx') : e));
      const outcome = await run(runnerCode(), long, [[START(1501, 't2')], Array.from({ length: 19 }, (_v, i) => OUT(1502 + i, 't2')), [END(1521, 't2')]]);
      expect(outcome.seen).toEqual([false, false, true]);
    });

    test('negative control: the earlier rule (count of end events in the window) never ends that prompt', async () => {
      const filler = Array.from({ length: 1500 }, (_v, i) => OUT(i + 1, 'tx'));
      const long = filler.map((e) => (e.eventId === 501 || e.eventId === 1400 ? END(e.eventId, 'tx') : e));
      const earlier = `const isTerminalEvent = (e) => e.eventType === 'turn_completed' || e.eventType === 'turn_failed';
        const terminalCount = (evts) => evts.filter(isTerminalEvent).length;
        async function runPrompt(token, timeoutMs) {
          await waitIdle(30000, 'idle');
          const endsBefore = terminalCount((await events(await conversationId(), 1000)).events);
          await submit(token);
          return observeUntil(async (evts) => terminalCount(evts) > endsBefore, timeoutMs || 120000, token);
        }`;
      await expect(run(earlier, long, [[START(1501, 't2')], Array.from({ length: 19 }, (_v, i) => OUT(1502 + i, 't2')), [END(1521, 't2')]])).rejects.toThrow('never ended');
    });

    test('when no poll has held the start event and the window no longer reaches back to the baseline, the first end event after it ends the prompt', async () => {
      // The Turn starts and floods 1100 events before the first poll: the start event is already out of the window.
      const before = Array.from({ length: 1000 }, (_v, i) => OUT(i + 1, 'tx'));
      const flood = Array.from({ length: 1100 }, (_v, i) => OUT(1002 + i, 't2'));
      const outcome = await run(runnerCode(), before, [[START(1001, 't2'), ...flood], [END(2102, 't2')]]);
      expect(outcome.seen).toEqual([false, true]);
    });

    test('the Turn named by an early poll is kept: a late end event of an older Turn does not end the prompt after the start event has left the window', async () => {
      const before = Array.from({ length: 1000 }, (_v, i) => OUT(i + 1, 'tx'));
      const flood = Array.from({ length: 1100 }, (_v, i) => (1002 + i === 1500 ? END(1500, 't-old') : OUT(1002 + i, 't2')));
      const outcome = await run(runnerCode(), before, [[START(1001, 't2')], flood, [END(2102, 't2')]]);
      expect(outcome.seen).toEqual([false, false, true]);
    });

    test('negative control: naming the Turn again at every poll takes the late end event of the older Turn', async () => {
      const code = runnerCode();
      const forgetful = code.replace('turnId = turnId || newTurnId(evts, baseline);', 'turnId = newTurnId(evts, baseline);');
      expect(forgetful).not.toBe(code);
      const before = Array.from({ length: 1000 }, (_v, i) => OUT(i + 1, 'tx'));
      const flood = Array.from({ length: 1100 }, (_v, i) => (1002 + i === 1500 ? END(1500, 't-old') : OUT(1002 + i, 't2')));
      const outcome = await run(forgetful, before, [[START(1001, 't2')], flood, [END(2102, 't2')]]);
      expect(outcome.seen).toEqual([false, true]);
    });

    test('the second prompt in the s01/s02 and s05 journeys is waited for with runPrompt, not with a count of end events', () => {
      expect(driverSource).not.toMatch(/\.length >= 2, 120000/);
      expect(driverSource).toContain("const second = await runPrompt('b2:s02');");
      expect(driverSource).toContain("const secret = await runPrompt('b2:s05-secret');");
    });

    test('each encoding prompt gets its own scripted call id', () => {
      const ids = ['utf8', 'utf16le', 'cp936', 'crlf'].map((label) => step(`b2:s04-${label}`, [], { shellKind: 'powershell' }).id);
      expect(new Set(ids).size).toBe(4);
      expect(ids).toEqual(['b2-s04-utf8', 'b2-s04-utf16le', 'b2-s04-cp936', 'b2-s04-crlf']);
      // The prompt after the tool result still answers with text only.
      expect(step('b2:s04-crlf', toolMessages(1), { shellKind: 'powershell' })).toEqual({ content: 'encoding command finished.' });
    });
  });

  describe('S03T: the audit scenario must not trip the product loop detector', () => {
    test('the three reads name three different files and the Turn can reach its end', () => {
      const { LoopDetector } = require('../../../core/src/loop-control');
      const calls = [0, 1, 2].map((done) => step('b2:audit-three', toolMessages(done)));
      expect(calls.map((call: any) => call.tool.name)).toEqual(['read', 'read', 'read']);
      const paths = calls.map((call: any) => call.tool.args.path);
      expect(new Set(paths).size).toBe(3);
      expect(paths).toEqual(fixtures.AUDIT_READ_FILES);
      expect(step('b2:audit-three', toolMessages(3))).toEqual({ content: 'audit scenario finished.' });
      const detector = new LoopDetector(3);
      expect(calls.map((call: any) => detector.observe(call.tool.name, call.tool.args))).toEqual([false, false, false]);
      // Negative control: the earlier script (the same path three times) is the case the product ends as stuck.
      const stuck = new LoopDetector(3);
      expect([0, 1, 2].map(() => stuck.observe('read', { path: 'b2-hold.txt' }))).toEqual([false, false, true]);
    });

    test('the driver creates every file that the scenario reads', () => {
      const body = slice('async function auditStop()', 'try {\n      const db = openDb(false);');
      expect(body).toContain('AUDIT_READ_FILES');
      expect(body).toMatch(/for \(const file of AUDIT_READ_FILES\) fs\.writeFileSync\(path\.join\(workspaceRoot, file\)/);
    });
  });

  describe('S05-A01: the command text of the secret scenario carries neither the secret nor its first characters', () => {
    const secret = () => fixtures.testOnlySecret();
    const secretHalves = () => { const value = secret(); const middle = Math.floor(value.length / 2); return [value.slice(0, middle), value.slice(middle)]; };

    test('PowerShell: the command text is clean and the quoted pieces join to the two halves', () => {
      const command = fixtures.shellCommand('powershell', { name: 'secret-split' });
      expect(driver.secretLeak(command, secret())).toEqual({ leaked: false, checked: true });
      // The same check on the stored form of the command: tool arguments are JSON, so quotes are escaped there.
      expect(driver.secretLeak(JSON.stringify({ command }), secret()).leaked).toBe(false);
      const writes = [...command.matchAll(/Write\((\([^)]*\))\)|WriteLine\((\([^)]*\))\)/g)].map((m) => (m[1] || m[2]));
      const joined = writes.map((expr) => [...expr.matchAll(/'([^']*)'/g)].map((m) => m[1]).join(''));
      expect(joined).toEqual(secretHalves());
    });

    test('cmd: the command text is clean and the carets disappear when the shell reads it', () => {
      const command = fixtures.shellCommand('cmd', { name: 'secret-split' });
      expect(driver.secretLeak(command, secret()).leaked).toBe(false);
      const parsed = /<nul set \/p =(\S+) & ping .* & echo (\S+)$/.exec(command);
      expect(parsed).not.toBeNull();
      expect([parsed![1].replace(/\^/g, ''), parsed![2].replace(/\^/g, '')]).toEqual(secretHalves());
    });

    test('no five characters of the secret stay together in the command text, and the rejoined output still is the secret', () => {
      const value = secret();
      for (const kind of ['powershell', 'cmd']) {
        const command = fixtures.shellCommand(kind, { name: 'secret-split' });
        for (let i = 0; i + 5 <= value.length; i += 1) expect(command).not.toContain(value.slice(i, i + 5));
      }
      expect(secretHalves().join('')).toBe(value);
    });

    test('negative control: the earlier command (the first half as one literal) is read as a leak', () => {
      const [head, tail] = secretHalves();
      const old = `[Console]::Out.Write('${head}'); Start-Sleep -Milliseconds 400; [Console]::Out.WriteLine('${tail}')`;
      expect(driver.secretLeak(old, secret()).leaked).toBe(true);
    });
  });

  describe('S05-A02: the process listing of the driver is not a process of the product', () => {
    const DRIVER_PID = 7492;
    const csv = (rows: string[]) => `Node,CreationDate,Name,ParentProcessId,ProcessId\r\n${rows.join('\r\n')}\r\n`;
    const rows = [
      'H,20261014084000.000000+000,electron.exe,500,7492',
      'H,20261014084001.000000+000,powershell.exe,7492,7600',
      'H,20261014084002.000000+000,WMIC.exe,7492,6292',
      'H,20261014084003.000000+000,WMIC.exe,7600,6300',
    ];
    function wmic(code: string) {
      const box: any = {
        childProcess: { spawnSync: () => ({ stdout: csv(rows), status: 0, error: null }) }, process: { pid: DRIVER_PID }, String, Number,
        descendantsOf: driver.descendantsOf,
      };
      vm.runInNewContext(`${code}\n;this.api = { wmicRows, myTree: () => descendantsOf(wmicRows(), process.pid) };`, box);
      return box.api;
    }
    const code = () => slice('let wmicFailures = 0;', '  // ---- UI actions through the real DOM');

    test('only the direct WMIC.exe child of the driver is left out of the rows and the tree', () => {
      const api = wmic(code());
      expect(api.wmicRows().map((row: any) => row.ProcessId)).toEqual(['7492', '7600', '6300']);
      // A WMIC.exe that the product itself started (parent is its PowerShell) stays visible.
      expect(api.myTree().map((item: any) => item.pid)).toEqual([7600, 6300]);
    });

    test('negative control: without the filter the listing child is part of every tree (the rehearsal 6 count 4, 6, 4)', () => {
      const old = code().replace(/return rows\.filter\([^\n]*\n/, 'return rows;\n');
      expect(old).not.toBe(code());
      expect(wmic(old).myTree().map((item: any) => item.pid)).toContain(6292);
    });

    // Rehearsal 11, p03: the explorer.exe of the disconnected session (created 2026-09-24) names the pid of a product process that was
    // given that number later, so the tree of the exit check held it and the exit failed with one survivor that was never a child.
    test('a stale ParentProcessId is left out of the driver tree and kept once as evidence of what was dropped', () => {
      const staleRows = [...rows, 'H,20260924215846.364600+000,explorer.exe,7600,3908', 'H,20260924215900.000000+000,ctfmon.exe,3908,4100'];
      const box: any = { childProcess: { spawnSync: () => ({ stdout: csv(staleRows), status: 0, error: null }) }, process: { pid: DRIVER_PID }, String, Number, descendantsOf: driver.descendantsOf };
      vm.runInNewContext(`${code()}\n;this.api = { myTree, stale: () => Array.from(staleParentLinks.values()) };`, box);
      expect(box.api.myTree().map((item: any) => item.pid)).toEqual([7600, 6300]);
      expect(box.api.myTree().map((item: any) => item.pid)).toEqual([7600, 6300]);
      expect(box.api.stale()).toEqual([{ pid: 3908, parent: 7600, name: 'explorer.exe', created: '20260924215846.364600+000' }]);
    });

    test('two instances that had the same pid are two links in the evidence', () => {
      let current = [...rows, 'H,20260924215846.364600+000,explorer.exe,7600,3908'];
      const box: any = { childProcess: { spawnSync: () => ({ stdout: csv(current), status: 0, error: null }) }, process: { pid: DRIVER_PID }, String, Number, descendantsOf: driver.descendantsOf };
      vm.runInNewContext(`${code()}\n;this.api = { myTree, stale: () => Array.from(staleParentLinks.values()) };`, box);
      box.api.myTree();
      current = [...rows, 'H,20260920000000.000000+000,explorer.exe,7600,3908'];
      box.api.myTree();
      expect(box.api.stale().map((item: any) => item.created)).toEqual(['20260924215846.364600+000', '20260920000000.000000+000']);
    });

    test('negative control: a tree that follows every ParentProcessId holds the stale explorer.exe and its child', () => {
      const staleRows = [...rows, 'H,20260924215846.364600+000,explorer.exe,7600,3908', 'H,20260924215900.000000+000,ctfmon.exe,3908,4100'];
      const old = code().replace('descendantsOf(wmicRows(), process.pid, stale)', 'descendantsOf(wmicRows().map((row) => ({ ...row, CreationDate: "" })), process.pid, stale)');
      const box: any = { childProcess: { spawnSync: () => ({ stdout: csv(staleRows), status: 0, error: null }) }, process: { pid: DRIVER_PID }, String, Number, descendantsOf: driver.descendantsOf };
      expect(old).not.toBe(code());
      vm.runInNewContext(`${old}\n;this.api = { myTree };`, box);
      expect(box.api.myTree().map((item: any) => item.pid)).toEqual([7600, 6300, 3908, 4100]);
    });

    test('both tree evidence files carry the links that were left out', () => {
      expect(driverSource).toContain("out('03-process-tree.json', { before: treeBefore, survivors, after_total: treeAfter.length, stale_parent_links: Array.from(staleParentLinks.values()) });");
      expect(driverSource).toContain("out('chain-exit-tree-before.json', { driver_pid: process.pid, tree, stale_parent_links: Array.from(staleParentLinks.values()),");
      // The cancel check reads its trees through the same function, so it is not exposed to a stale link either.
      expect(driverSource).toContain('const afterTree = myTree();');
      expect(driverSource).not.toMatch(/descendantsOf\(wmicRows\(\), process\.pid\)/);
    });
  });

  describe('S06: a conversation is switched from the sidebar, and a page that does not follow is a recorded fact', () => {
    // A page with two conversations. The sidebar row click is the page's own switch; the bridge call changes the main process only.
    function stage(options: { followsClick?: boolean; titles?: string[]; active?: string; duplicateRowOf?: string; rowSource?: string } = {}) {
      const titles = options.titles || ['b2:s02', 'b2:bg-fast-exit'];
      const initial = options.active || 'conv-b';
      const world: any = { active: initial, pageCurrent: initial, bridgeCalls: 0, clicks: 0 };
      const conversations = titles.map((title, index) => ({ sessionId: index === 0 ? 'conv-a' : 'conv-b', title, state: 'active' }));
      // A row as the renderer builds it: the label is "<title>，<status>，更新于 <time>" and the title is the text of the <strong> element.
      const button = (conversation: any) => ({
        getAttribute: (name: string) => (name === 'aria-label' ? `${conversation.title}，空闲，更新于 2026/10/14` : name === 'aria-current' ? String(world.pageCurrent === conversation.sessionId) : null),
        querySelector: (selector: string) => (selector === 'strong' ? { textContent: conversation.title } : null),
        get disabled() { return world.pageCurrent === conversation.sessionId; },
        click() { world.clicks += 1; world.active = conversation.sessionId; if (options.followsClick !== false) world.pageCurrent = conversation.sessionId; },
      });
      const buttons = conversations.map(button);
      if (options.duplicateRowOf) buttons.push(button(conversations.find((item) => item.sessionId === options.duplicateRowOf)));
      const win: any = { win7Agent: { a9: {
        snapshot: async () => ({ ok: true, snapshot: { activeConversationId: world.active, conversations } }),
        activateConversation: async (id: string) => { world.bridgeCalls += 1; world.active = id; return { ok: true }; },
      } } };
      const doc = { querySelectorAll: () => buttons };
      const exec = async (source: string) => vm.runInNewContext(source, { document: doc, window: win, Array, Boolean, String, JSON });
      let clock = 0;
      const FakeDate = { now: () => { clock += 1000; return clock; } };
      const sleep = async () => undefined;
      const code = [slice('async function waitFor(condition, timeoutMs, label)', '// ---- SQLite inspection'), slice('const snapshot = async', 'const events = async'),
        slice('const conversationId = async', 'async function newConversation'), options.rowSource || slice('const conversationRows = ', 'async function reloadRenderer')].join('\n');
      const box: any = { exec, sleep, Date: FakeDate, JSON, Boolean, Error, Promise, String, Array, RegExp };
      vm.runInNewContext(`${code}\n;this.api = { activateConversation, switchConversationInUi, conversationRows };`, box);
      return { api: box.api, world };
    }

    test('a unique title is opened with the row click and the page marks it current', async () => {
      const { api, world } = stage();
      expect(await api.activateConversation('conv-a')).toEqual({ method: 'ui', title: 'b2:s02' });
      expect(world).toMatchObject({ active: 'conv-a', pageCurrent: 'conv-a', clicks: 1, bridgeCalls: 0 });
    });

    test('the conversation that is already active needs no switch', async () => {
      const { api, world } = stage();
      expect(await api.activateConversation('conv-b')).toEqual({ method: 'already_active' });
      expect(world).toMatchObject({ clicks: 0, bridgeCalls: 0 });
    });

    test('a page that does not follow the click fails by name instead of passing on the snapshot alone', async () => {
      const { api } = stage({ followsClick: false });
      await expect(api.activateConversation('conv-a')).rejects.toThrow(/^TIMEOUT:page marks the conversation current: b2:s02/);
    });

    test('a title shared by two conversations falls back to the bridge call and says so', async () => {
      const { api, world } = stage({ titles: ['same', 'same'] });
      expect(await api.activateConversation('conv-a')).toEqual({ method: 'bridge' });
      expect(world).toMatchObject({ clicks: 0, bridgeCalls: 1 });
      await expect(stage({ titles: ['same', 'same'] }).api.switchConversationInUi('conv-a')).rejects.toThrow(/^A9_BATCH2_DRIVER_CONVERSATION_TITLE_NOT_UNIQUE:same:2/);
    });

    test('a title that is the start of another row label is opened by its own row (the label prefix cannot name a row)', async () => {
      // The first row reads "基础，附录，空闲，…" and the second "基础，空闲，…": both labels start with "基础，". The title "基础" belongs to the second row.
      const { api, world } = stage({ titles: ['基础，附录', '基础'], active: 'conv-a' });
      expect(await api.activateConversation('conv-b')).toEqual({ method: 'ui', title: '基础' });
      expect(world).toMatchObject({ active: 'conv-b', pageCurrent: 'conv-b', clicks: 1, bridgeCalls: 0 });
    });

    test('negative control: the earlier rule (label prefix) cannot open that row', async () => {
      // The row lookup of the commit before this one, kept here as text: the first row whose label starts with "<title>，".
      const earlier = `const conversationRows = () => exec(\`(() => Array.from(document.querySelectorAll('#conversation-list button')).map((b) => ({ label: b.getAttribute('aria-label') || '', current: b.getAttribute('aria-current') === 'true', disabled: b.disabled })))()\`);
        const conversationTitleOf = (snap, id) => { const item = (snap.conversations || []).find((c) => c.sessionId === id); return item ? (item.title || '新对话') : null; };
        async function switchConversationInUi(id) {
          const snap = await snapshot();
          if (snap.activeConversationId === id) return { method: 'already_active', title: conversationTitleOf(snap, id) };
          const title = conversationTitleOf(snap, id);
          const prefix = title + '，';
          const rowOf = (rows) => rows.find((row) => row.label.startsWith(prefix));
          await waitFor(async () => { const row = rowOf(await conversationRows()); return row && !row.disabled ? row : null; }, 30000, 'conversation row enabled: ' + title);
          const clicked = await exec(\`(() => { const b = Array.from(document.querySelectorAll('#conversation-list button')).find((x) => (x.getAttribute('aria-label') || '').startsWith(\${JSON.stringify(prefix)})); if (!b || b.disabled) return false; b.click(); return true; })()\`);
          if (!clicked) throw new Error('NOT_CLICKED');
          await waitFor(async () => (await conversationId()) === id, 20000, 'switched conversation');
          return { method: 'ui', title };
        }
        async function activateConversation(id) { return switchConversationInUi(id); }`;
      const { api } = stage({ titles: ['基础，附录', '基础'], active: 'conv-a', rowSource: earlier });
      await expect(api.activateConversation('conv-b')).rejects.toThrow(/^TIMEOUT:conversation row enabled: 基础/);
    });

    test('a page that shows two rows for one active title is a finding, not a click on the first row', async () => {
      const { api, world } = stage({ titles: ['b2:s02', 'b2:bg-fast-exit'], active: 'conv-b', duplicateRowOf: 'conv-a' });
      await expect(api.activateConversation('conv-a')).rejects.toThrow(/^A9_BATCH2_DRIVER_CONVERSATION_ROW_COUNT:b2:s02:2/);
      expect(world.clicks).toBe(0);
    });

    test('the restart journey opens the streamed conversation through the sidebar and records the rows and the method', () => {
      const body = slice('async function sessionRestart()', '// ---- Modes: continue (p06)');
      expect(body).toMatch(/const rowsBefore = await conversationRows\(\);\s*const switched = await activateConversation\(part\.conversationId\);/);
      expect(body).toContain('switch: switched');
      expect(body).toContain('sidebar_before');
      expect(body).toContain('sidebar_after');
      expect(driverSource).not.toMatch(/await exec\(`window\.win7Agent\.a9\.activateConversation\(\$\{JSON\.stringify\(id\)\}\)`\);\s*await waitFor\(async \(\) => \(await conversationId\(\)\) === id, 20000, 'activate conversation'\);\s*\}\s*async function reloadRenderer/);
    });
  });

  describe('S05 key: every driver process enters the API key again when the product process does not hold it', () => {
    const FIXTURE_URL = 'http://127.0.0.1:41999/v1';
    const PLACEHOLDER = 'TEST-ONLY-PLACEHOLDER-KEY-NOT-A-SECRET';
    // A page and a product process, driven by the driver's own statements. The page is a small DOM (elements by id); the product process
    // keeps the key in memory only: after a restart the snapshot shows a configured provider with apiKey.available=false and the page
    // still shows the probe text of the earlier probe. A click on the apply button works as in the renderer (applyProvider): the button is
    // disabled inside the click, the key is registered at once, the probe answers later, and only then the page lets go of the button.
    // Time is the number of driver calls: the apply ends `applyCalls` calls after the click.
    function stageProvider(options: { configured?: boolean; baseUrl?: string; keyAvailable?: boolean; secret?: string; applyRegistersKey?: boolean; rowSource?: string;
      restoredProbe?: string; probeAfterApply?: string; applyCalls?: number; formError?: string; stuckBusy?: boolean } = {}) {
      const secret = options.secret === undefined ? PLACEHOLDER : options.secret;
      const configured = options.configured !== false;
      const world: any = { calls: 0, applies: [] as any[], closes: 0, applyFinished: 0, finishedAtCall: null as number | null, pending: null as any,
        provider: configured ? { configured: true, baseUrl: options.baseUrl || FIXTURE_URL, model: 'batch2-scripted', apiKey: { remembered: false, source: options.keyAvailable ? 'memory' : 'none', available: options.keyAvailable === true } }
          : { configured: false } };
      const element = (extra: any = {}) => ({ value: '', checked: false, textContent: '', hidden: false, disabled: false, attributes: {} as any,
        getAttribute(name: string) { return name in this.attributes ? this.attributes[name] : null; },
        setAttribute(name: string, value: string) { this.attributes[name] = value; },
        removeAttribute(name: string) { delete this.attributes[name]; }, click() {}, ...extra });
      const apply: any = element({ click() {
        world.applies.push({ url: dom['a9-provider-url'].value, model: dom['a9-provider-model'].value, key: dom['a9-provider-key'].value, remember: dom['a9-provider-remember'].checked });
        if (options.formError) { dom['a9-provider-error'].textContent = options.formError; dom['a9-provider-error'].hidden = false; return; }
        apply.disabled = true; apply.setAttribute('aria-busy', 'true');
        const entered = secret !== '' && dom['a9-provider-key'].value === secret;
        // The runtime registers the key before it probes (a9-agent-runtime.js: memoryApiKey is set, then classifyProviderWithProbe).
        world.provider = { configured: true, baseUrl: dom['a9-provider-url'].value, model: 'batch2-scripted',
          apiKey: { remembered: false, source: entered ? 'memory' : 'none', available: entered && options.applyRegistersKey !== false } };
        world.pending = { doneAt: world.calls + (options.applyCalls === undefined ? 6 : options.applyCalls) };
      } });
      const dom: any = {
        'a9-provider-url': element(), 'a9-provider-model': element(), 'a9-provider-key': element(), 'a9-provider-remember': element(), 'a9-provider-apply': apply,
        'a9-provider-error': element({ hidden: true }),
        'a9-provider-probe-state': element({ textContent: options.restoredProbe || (configured ? 'tool_calling' : '未探测') }),
      };
      const drawerClose = element({ click() { world.closes += 1; } });
      const document = { getElementById: (id: string) => dom[id] || null, querySelector: (selector: string) => (selector.includes('data-close') ? drawerClose : null) };
      const advance = () => {
        world.calls += 1;
        if (world.pending && world.calls >= world.pending.doneAt && !options.stuckBusy) {
          world.pending = null;
          dom['a9-provider-probe-state'].textContent = options.probeAfterApply || 'tool_calling';
          dom['a9-provider-key'].value = '';
          apply.disabled = false; apply.removeAttribute('aria-busy');
          world.applyFinished += 1; world.finishedAtCall = world.calls;
        }
      };
      const exec = async (source: string) => {
        advance();
        if (source.includes('window.win7Agent.a9.snapshot()')) return { ok: true, snapshot: { provider: world.provider } };
        return vm.runInNewContext(source, { document });
      };
      let clock = 0;
      const box: any = { exec, sleep: async () => undefined, Date: { now: () => { clock += 1000; return clock; } }, JSON, Boolean, Error, Promise, String, fixtureUrl: FIXTURE_URL, secretLiteral: secret };
      const code = [slice('async function waitFor(condition, timeoutMs, label)', '// ---- SQLite inspection'), slice('const snapshot = async', 'const events = async'),
        options.rowSource || slice('const providerKeyFacts = ', 'async function bootstrap(options)')].join('\n');
      vm.runInNewContext(`${code}\n;this.api = { ensureProvider, providerKeyFacts };`, box);
      return { api: box.api, world, dom };
    }

    test('a configured provider whose key is not available gets the form again, with the URL and the key', async () => {
      const { api, world } = stageProvider({ keyAvailable: false });
      await api.ensureProvider({ requireKey: true });
      expect(world.applies).toEqual([{ url: FIXTURE_URL, model: 'batch2-scripted', key: PLACEHOLDER, remember: false }]);
      expect(world.provider.apiKey.available).toBe(true);
      expect(world.closes).toBe(1);
    });

    test('the driver returns only after the page has let go of the apply button (the restored probe text and the early key do not end the wait)', async () => {
      // After the click the page already shows the restored probe text "tool_calling" and the product already holds the key, but the
      // configuration and its probe are still running; the apply ends 6 calls after the click.
      const { api, world } = stageProvider({ keyAvailable: false, applyCalls: 6 });
      await api.ensureProvider({ requireKey: true });
      expect(world.applyFinished).toBe(1);
      expect(world.applies).toHaveLength(1);
      expect(world.calls).toBeGreaterThanOrEqual(world.finishedAtCall as number);
    });

    test('a new probe that fails after an earlier success is a failure by name, not a pass on the old text', async () => {
      const { api } = stageProvider({ keyAvailable: false, probeAfterApply: 'unavailable' });
      await expect(api.ensureProvider({ requireKey: true })).rejects.toThrow(/^TIMEOUT:provider apply finished:provider probe text: unavailable/);
    });

    test('a form error ends the wait with the error text', async () => {
      const { api, world } = stageProvider({ keyAvailable: false, formError: 'Base URL 与模型 ID 都必须填写。' });
      await expect(api.ensureProvider({ requireKey: true })).rejects.toThrow(/^TIMEOUT:provider apply finished:provider form error: Base URL/);
      expect(world.applies).toHaveLength(1);
    });

    test('a page that never lets go of the button fails by name', async () => {
      const { api } = stageProvider({ keyAvailable: false, stuckBusy: true });
      await expect(api.ensureProvider({ requireKey: true })).rejects.toThrow(/^TIMEOUT:provider apply finished/);
    });

    test('a provider whose key is available in this product process is left alone', async () => {
      const { api, world } = stageProvider({ keyAvailable: true });
      await api.ensureProvider({ requireKey: true });
      expect(world.applies).toHaveLength(0);
    });

    test('a provider of another address gets the form again even when its key is available', async () => {
      const { api, world } = stageProvider({ keyAvailable: true, baseUrl: 'http://127.0.0.1:1/v1' });
      await api.ensureProvider({ requireKey: true });
      expect(world.applies).toHaveLength(1);
    });

    test('a provider that is not configured gets the form and the driver waits for the first probe', async () => {
      const { api, world } = stageProvider({ configured: false });
      await api.ensureProvider({ requireKey: true });
      expect(world.applies).toHaveLength(1);
      expect(world.applyFinished).toBe(1);
    });

    test('a driver without the secret literal stops by name before it touches the page', async () => {
      const { api, world } = stageProvider({ secret: '' });
      await expect(api.ensureProvider({ requireKey: true })).rejects.toThrow('A9_BATCH2_DRIVER_SECRET_LITERAL_MISSING');
      expect(world.applies).toHaveLength(0);
    });

    test('a mode that does not judge the secret leaves a configured provider alone, whether or not its key is available', async () => {
      for (const keyAvailable of [false, true]) {
        const { api, world } = stageProvider({ keyAvailable });
        await api.ensureProvider();
        await api.ensureProvider({ requireKey: false });
        expect(world.applies).toHaveLength(0);
      }
    });

    test('a mode that does not judge the secret does not wait for the key after a fresh form', async () => {
      const { api, world } = stageProvider({ configured: false, applyRegistersKey: false });
      await api.ensureProvider();
      expect(world.applies).toHaveLength(1);
      expect(world.applyFinished).toBe(1);
    });

    test('only the S05 limits mode asks for the key', () => {
      expect(driverSource.match(/bootstrap\(\{ requireKey: true \}\)/g)).toHaveLength(1);
      expect(slice('async function streamLimits()', 'async function auditStop()')).toContain('await bootstrap({ requireKey: true });');
      expect(driverSource.match(/ensureProvider\(/g)).toHaveLength(2);
    });

    test('a form that does not leave the key available in the product fails by name instead of passing', async () => {
      const { api } = stageProvider({ keyAvailable: false, applyRegistersKey: false });
      await expect(api.ensureProvider({ requireKey: true })).rejects.toThrow(/^TIMEOUT:provider key available/);
    });

    test('negative control: without the click the form is never applied and the wait fails by name', async () => {
      const code = slice('const providerKeyFacts = ', 'async function bootstrap(options)');
      const noClick = code.replace("document.getElementById('a9-provider-apply').click();", "document.getElementById('a9-provider-apply');");
      expect(noClick).not.toBe(code);
      const { api, world } = stageProvider({ keyAvailable: false, rowSource: noClick });
      await expect(api.ensureProvider({ requireKey: true })).rejects.toThrow(/^TIMEOUT:provider key available/);
      expect(world.applies).toHaveLength(0);
    });

    test('negative control: the driver of the commit before this one returns while the apply is still running', async () => {
      // The wait of the commit before this one: the probe text and the key, nothing about the end of the apply.
      const earlier = `const providerKeyFacts = (snap) => { const provider = snap.provider || {}; const key = provider.apiKey || {};
          return { configured: provider.configured === true, base_url_is_fixture: provider.baseUrl === fixtureUrl, key_available: key.available === true, key_source: key.source || null, key_remembered: key.remembered === true }; };
        const providerReady = (snap) => { const facts = providerKeyFacts(snap); return facts.configured && facts.base_url_is_fixture && facts.key_available; };
        async function ensureProvider(options) {
          const requireKey = Boolean(options && options.requireKey);
          const current = await snapshot();
          const settled = requireKey ? providerReady(current) : Boolean(current.provider && current.provider.configured);
          if (settled && (await exec('document.getElementById("a9-provider-probe-state").textContent')) === 'tool_calling') return;
          await exec(\`(() => {
            document.getElementById('a9-provider-url').value = \${JSON.stringify(fixtureUrl)};
            document.getElementById('a9-provider-model').value = 'batch2-scripted';
            const key = document.getElementById('a9-provider-key'); if (key) key.value = \${JSON.stringify(secretLiteral)};
            const remember = document.getElementById('a9-provider-remember'); if (remember) remember.checked = false;
            document.getElementById('a9-provider-apply').click();
            return true;
          })()\`);
          await waitFor(async () => (await exec('document.getElementById("a9-provider-probe-state").textContent')) === 'tool_calling', 45000, 'provider probe');
          if (requireKey) await waitFor(async () => providerReady(await snapshot()), 20000, 'provider key available');
        }`;
      const { api, world } = stageProvider({ keyAvailable: false, applyCalls: 6, rowSource: earlier });
      await api.ensureProvider({ requireKey: true });
      expect(world.applyFinished).toBe(0);
      expect(world.pending).not.toBeNull();
    });

    test('negative control: the earlier skip rule (configured and probe passed) leaves the restarted process without the key', async () => {
      const earlier = `const providerKeyFacts = () => ({});
        async function ensureProvider() {
          const current = await snapshot();
          if (current.provider && current.provider.configured && (await exec('document.getElementById("a9-provider-probe-state").textContent')) === 'tool_calling') return;
          await exec('document.getElementById("a9-provider-apply")');
        }`;
      const { api, world } = stageProvider({ keyAvailable: false, rowSource: earlier });
      await api.ensureProvider({ requireKey: true });
      expect(world.applies).toHaveLength(0);
      expect(world.provider.apiKey.available).toBe(false);
    });

    test('the facts hold no secret value', () => {
      const { api } = stageProvider({ keyAvailable: true });
      const facts = api.providerKeyFacts({ provider: { configured: true, baseUrl: FIXTURE_URL, apiKey: { available: true, source: 'memory', remembered: false, note: PLACEHOLDER } } });
      expect(facts).toEqual({ configured: true, base_url_is_fixture: true, key_available: true, key_source: 'memory', key_remembered: false });
      expect(JSON.stringify(facts)).not.toContain(PLACEHOLDER);
    });

    describe('the S05 verdict', () => {
      const clean = { events: { leaked: false, checked: true }, dom: { leaked: false, checked: true }, snapshot: { leaked: false, checked: true } };
      test('a clean output with a registered key passes', () => {
        expect(driver.evaluateSecretCheck({ key_available: true, leaks: clean, truncated: true, produced: true }).status).toBe('PASS');
      });
      test('a clean output with a key the product never held is UNKNOWN, not PASS', () => {
        const verdict = driver.evaluateSecretCheck({ key_available: false, leaks: clean, truncated: true, produced: true });
        expect(verdict).toMatchObject({ status: 'UNKNOWN', decided: false });
      });
      test('a leak in the events, the page or the snapshot fails', () => {
        for (const name of ['events', 'dom', 'snapshot']) {
          const leaks = { ...clean, [name]: { leaked: true, checked: true } };
          expect(driver.evaluateSecretCheck({ key_available: true, leaks, truncated: true, produced: true }).status).toBe('FAIL');
        }
      });
      test('a missing truncation report or missing secret frames fails', () => {
        expect(driver.evaluateSecretCheck({ key_available: true, leaks: clean, truncated: false, produced: true }).status).toBe('FAIL');
        expect(driver.evaluateSecretCheck({ key_available: true, leaks: clean, truncated: true, produced: false }).status).toBe('FAIL');
      });
      test('a secret literal that was never configured is UNKNOWN', () => {
        const leaks = { ...clean, events: { leaked: false, checked: false } };
        expect(driver.evaluateSecretCheck({ key_available: true, leaks, truncated: true, produced: true }).status).toBe('UNKNOWN');
      });
      test('the S05 journey takes the key facts before the secret prompt and records them', () => {
        const body = slice('async function streamLimits()', 'async function auditStop()');
        expect(body.indexOf('providerKeyFacts(await snapshot())')).toBeGreaterThan(-1);
        expect(body.indexOf('providerKeyFacts(await snapshot())')).toBeLessThan(body.indexOf("runPrompt('b2:s05-secret')"));
        expect(body).toContain('key_before_prompt: keyBeforeSecret');
        expect(body).toContain('key_available_before_prompt=');
      });
    });
  });

  describe('S04 cuts: each first write ends inside the unit its label is about', () => {
    const bytesOf = (label: string) => { const fx = fixtures.encodingFixtures(); return ({ utf8: fx.utf8, utf16le: fx.utf16le, cp936: fx.cp936_zhongwen, crlf: fx.crlf } as any)[label] as Buffer; };
    const labels = ['utf8', 'utf16le', 'cp936', 'crlf'];

    test('the fixture check finds no problem and the self check carries it', () => {
      expect(fixtures.encodingCutProblems()).toEqual([]);
      expect(fixtures.selfCheck().problems).toEqual([]);
    });

    test.each(['utf8', 'utf16le', 'cp936'])('%s: the first chunk alone is not valid text (a strict decoder refuses it), the two chunks together are the fixture', (label) => {
      const cut = fixtures.ENCODING_CUTS[label];
      const whole = bytesOf(label);
      const encoding = ({ utf8: 'utf-8', utf16le: 'utf-16le', cp936: 'gbk' } as any)[label];
      expect(() => new (global as any).TextDecoder(encoding, { fatal: true }).decode(whole.subarray(0, cut))).toThrow();
      expect(Buffer.concat([whole.subarray(0, cut), whole.subarray(cut)]).equals(whole)).toBe(true);
      const decoder = new (global as any).TextDecoder(encoding, { fatal: true });
      const joined = decoder.decode(whole.subarray(0, cut), { stream: true }) + decoder.decode(whole.subarray(cut), { stream: true }) + decoder.decode();
      expect(joined).toBe(label === 'cp936' ? '中文' : fixtures.encodingFixtures().text);
    });

    test('crlf: the first chunk ends with CR and the second starts with LF', () => {
      const whole = bytesOf('crlf');
      const cut = fixtures.ENCODING_CUTS.crlf;
      expect(whole.subarray(0, cut).toString('utf8')).toBe('line one\r');
      expect(whole.subarray(cut).toString('utf8').startsWith('\nline two')).toBe(true);
    });

    test('the PowerShell command writes exactly those two chunks', () => {
      for (const label of labels) {
        const command: string = fixtures.encodingCommandPowerShell(label);
        const cut = fixtures.ENCODING_CUTS[label];
        const whole = bytesOf(label);
        const arrays = [...command.matchAll(/\[byte\[\]\]@\(([0-9,]*)\)/g)].map((m) => Buffer.from(m[1].split(',').map(Number)));
        expect(arrays).toHaveLength(2);
        expect(arrays[0].equals(whole.subarray(0, cut))).toBe(true);
        expect(arrays[1].equals(whole.subarray(cut))).toBe(true);
      }
    });

    test('the self check fails when a cut is moved out of its unit, and the cut table is restored afterwards', () => {
      const original = fixtures.ENCODING_CUTS.utf8;
      try {
        fixtures.ENCODING_CUTS.utf8 = 9;
        const check = fixtures.selfCheck();
        expect(check.ok).toBe(false);
        expect(check.problems).toContain('ENCODING_CUT_NOT_INSIDE_UNIT:utf8:9');
      } finally {
        fixtures.ENCODING_CUTS.utf8 = original;
      }
      expect(fixtures.selfCheck().ok).toBe(true);
    });

    test('negative control: the earlier cuts (half of the length) are flagged for utf8, utf16le and crlf', () => {
      const earlier: any = {};
      for (const label of labels) earlier[label] = Math.max(1, Math.floor(bytesOf(label).length / 2) - (label === 'crlf' ? 0 : 1));
      expect(earlier).toEqual({ utf8: 9, utf16le: 11, cp936: 1, crlf: 22 });
      expect(fixtures.encodingCutProblems(earlier).map((item: string) => item.split(':')[1]).sort()).toEqual(['crlf', 'utf16le', 'utf8']);
    });
  });
});

// Rehearsal 7 fix round 4: the driver's own pressKey code, cut out of the source and run against a fake window and a fake page recorder.
// It checks the order (recorder, focus, baseline, key events) and that a press which did not arrive is reported once, never repeated.
// It is not Electron, Win10 or Win7 evidence: whether the corrected char event activates the button on Win7 is UNKNOWN until the next Win7 rehearsal.
describe('A9-33 batch-2 key press in the UI-01 journey', () => {
  const driverSource = fs.readFileSync(path.resolve(__dirname, 'a9-batch2-driver-entry.cjs'), 'utf8');
  const slice = (from: string, to: string) => {
    const start = driverSource.indexOf(from);
    const end = driverSource.indexOf(to, start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return driverSource.slice(start, end);
  };
  function rig(behaviour: 'arrives' | 'lost' | 'no-keypress' | 'unfocused') {
    const log: string[] = [];
    const records: any[] = [];
    const sent: any[] = [];
    const rec = (type: string, extra: any = {}) => records.push({ type, key: null, charCode: null, target: 'BUTTON', trusted: true, ...extra });
    const win: any = {
      show: () => log.push('show'), focus: () => log.push('focus'),
      webContents: {
        focus: () => log.push('contents-focus'),
        sendInputEvent: (event: any) => {
          log.push(`send:${event.type}:${JSON.stringify(event.keyCode)}`);
          sent.push(event);
          if (behaviour === 'lost') return;
          const name = event.keyCode === 'Enter' || event.keyCode === '\r' ? 'Enter' : ' ';
          if (event.type === 'keyDown') rec('keydown', { key: name });
          if (event.type === 'char' && behaviour !== 'no-keypress') rec('keypress', { key: name, charCode: event.keyCode === '\r' ? 13 : String(event.keyCode).charCodeAt(0) });
          if (event.type === 'char' && event.keyCode === '\r' && behaviour === 'arrives') rec('click');
          if (event.type === 'keyUp') rec('keyup', { key: name });
        },
      },
    };
    const exec = async (source: string) => {
      if (source === driver.KEY_RECORDER_SOURCE) { log.push('install'); return true; }
      if (source === 'document.hasFocus()') { log.push('hasFocus'); return behaviour !== 'unfocused'; }
      if (source === 'window.__b2KeyRecords || []') { log.push(`records:${records.length}`); return records.slice(); }
      throw new Error(`unexpected exec ${source}`);
    };
    const code = [slice('async function waitFor(condition, timeoutMs, label)', '// ---- SQLite inspection'), slice('  const installKeyRecorder = ', '  const continueEventsFor = ')].join('\n');
    let clock = 0;
    const box: any = { exec, win, sleep: async () => { clock += 250; }, Date: { now: () => clock }, JSON, Boolean, Error, Promise, String, Array,
      KEY_RECORDER_SOURCE: driver.KEY_RECORDER_SOURCE, keyEventsFor: driver.keyEventsFor, summarizeKeyPress: driver.summarizeKeyPress };
    vm.runInNewContext(`${code}\n;this.api = { pressKey };`, box);
    return { api: box.api, log, sent, records };
  }

  test('an Enter that arrives: recorder first, focus checked, baseline taken before the keys, three key events with a carriage return as the char', async () => {
    const r = rig('arrives');
    const result = await r.api.pressKey('Enter');
    expect(result).toMatchObject({ key: 'Enter', keydown: true, keypress: true, keyup: true, clicks: 1, delivered: true, page_focused: true, from_index: 0 });
    expect(r.log.indexOf('install')).toBe(0);
    expect(r.log.indexOf('hasFocus')).toBeLessThan(r.log.indexOf('send:keyDown:"Enter"'));
    expect(r.log.filter((item) => item.startsWith('send:'))).toEqual(['send:keyDown:"Enter"', 'send:char:"\\r"', 'send:keyUp:"Enter"']);
    expect(r.log.indexOf('records:0')).toBeLessThan(r.log.indexOf('send:keyDown:"Enter"'));
  });

  test('a second press only counts the records made after its own baseline', async () => {
    const r = rig('arrives');
    await r.api.pressKey('Enter');
    const second = await r.api.pressKey('Space');
    expect(second).toMatchObject({ key: 'Space', delivered: true, from_index: 4 });
    expect(second.clicks).toBe(0);
  });

  test('a press that never reaches the page is reported once and not repeated', async () => {
    const r = rig('lost');
    const result = await r.api.pressKey('Enter');
    expect(result).toMatchObject({ delivered: false, keydown: false, keypress: false, clicks: 0 });
    expect(r.sent).toHaveLength(3);
  });

  test('a keydown and keyup without a keypress with char code 13 is not a delivered Enter', async () => {
    const r = rig('no-keypress');
    const result = await r.api.pressKey('Enter');
    expect(result).toMatchObject({ keydown: true, keyup: true, keypress: false, delivered: false });
    expect(r.sent).toHaveLength(3);
  });

  test('a page without focus is reported and the key is still sent once', async () => {
    const r = rig('unfocused');
    const result = await r.api.pressKey('Enter');
    expect(result.page_focused).toBe(false);
    expect(r.sent).toHaveLength(3);
  });

  test('negative control: a driver that sends the key name as the char text produces no carriage return', async () => {
    const r = rig('arrives');
    const sentBefore = driverSource.includes("type === 'char' ? KEY_CHARS[key] : key");
    expect(sentBefore).toBe(true);
    await r.api.pressKey('Enter');
    expect(r.sent.find((event: any) => event.type === 'char').keyCode).toBe('\r');
  });
});

// Rehearsal 7 fix rounds 5 and 6 (codex rounds 4 and 5): the journey closures of the driver, cut out of the source and run against stubs that stand in for
// the page, the IPC log, the Provider counters and the Provider log. They check the wiring that the pure evaluators cannot see: which press feeds which fact,
// where the IPC baseline is taken, which errors end the case, and which evaluator feeds which record. They are not Electron, Win10 or Win7 evidence.
describe('A9-33 batch-2 journey closures', () => {
  const driverSource = fs.readFileSync(path.resolve(__dirname, 'a9-batch2-driver-entry.cjs'), 'utf8');
  const slice = (from: string, to: string) => {
    const start = driverSource.indexOf(from);
    const end = driverSource.indexOf(to, start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return driverSource.slice(start, end);
  };
  const AUDIT_CODE = 'A9_AUDIT_PERSISTENCE_FAILED';
  const evaluators = {
    evaluateAuditHardStop: driver.evaluateAuditHardStop, evaluateTerminalAudit: driver.evaluateTerminalAudit, evaluateRestartCounts: driver.evaluateRestartCounts,
    evaluateOldTurnUnchanged: driver.evaluateOldTurnUnchanged, evaluateInterruptRecords: driver.evaluateInterruptRecords, evaluateUiJourney: driver.evaluateUiJourney,
    summarizeSubs: driver.summarizeSubs, evaluateEncodingOutcomes: driver.evaluateEncodingOutcomes, withGuard: driver.withGuard, statusOf: driver.statusOf, isCount: driver.isCount,
    isStatusText: driver.isStatusText, eventData: driver.eventData, framesFromEvents: driver.framesFromEvents, ENCODING_GATING: driver.ENCODING_GATING,
    Boolean, String, RegExp, Array, Error, Set, Promise,
  };

  describe('S04 closure (A3, B2): only the decisive labels end the case on an error, and a warning belongs to its own tool call', () => {
    function rig(plan: Record<string, 'ok' | 'throw' | 'wrong'>, shell: any = { kind: 'powershell' }) {
      const fx = fixtures.encodingFixtures();
      const outs: any[] = []; const records: any[][] = []; const prompts: string[] = [];
      const textFor: any = { utf8: fx.text, utf16le: fx.text, cp936: '中文', crlf: 'line one\r\nline two\r\nlast line without newline' };
      const runPrompt = async (prompt: string) => {
        prompts.push(prompt);
        const label = prompt.replace('b2:s04-', '');
        const mode = plan[label] || 'ok';
        if (mode === 'throw') throw new Error(`prompt ${label} failed`);
        const data: any = { toolCallId: `b2-s04-${label}`, stream: 'stdout', outputSeq: 1, text: mode === 'wrong' ? '' : textFor[label] };
        if (mode === 'wrong') { data.warning = 'A9_OUTPUT_ENCODING_ERROR'; data.truncated = true; }
        // Another tool call of the same prompt carries its own warning; it comes first so that the call under test is the last frame.
        const other = { eventType: 'tool_output', eventId: prompts.length * 10, turnId: 't', payload: { data: { toolCallId: 'b2-other-call', stream: 'stdout', outputSeq: 1, text: 'other', warning: 'OTHER_CALL_WARNING' } } };
        return { events: [other, { eventType: 'tool_output', eventId: prompts.length * 10 + 1, turnId: 't', payload: { data } }] };
      };
      const box: any = { bootstrap: async () => ({ shell }), newConversation: async () => undefined, runPrompt, sleep: async () => undefined,
        out: (name: string, payload: any) => outs.push({ name, payload }), record: (...args: any[]) => records.push(args), path, candidateRoot: '/candidate',
        require: () => ({ encodingFixtures: () => fx }), ...evaluators };
      vm.runInNewContext(`${slice('  async function streamEncodings() {', '  async function streamLimits() {')}\n;this.api = { streamEncodings };`, box);
      return { api: box.api, outs, records, prompts };
    }

    test('the four prompts run in order and the rehearsal 7 shape (UTF-16LE and CP936 fail with the product warning) passes', async () => {
      const r = rig({ utf16le: 'wrong', cp936: 'wrong' });
      await r.api.streamEncodings();
      expect(r.prompts).toEqual(['b2:s04-utf8', 'b2:s04-utf16le', 'b2:s04-cp936', 'b2:s04-crlf']);
      expect(r.records).toHaveLength(1);
      expect(r.records[0].slice(0, 3)).toEqual(['B2-S04-ENCODING-CROSSCHUNK', 1, 'PASS']);
      const payload = r.outs[0].payload;
      expect(payload.outcomes.map((item: any) => [item.label, item.gating, item.ok])).toEqual([['utf8', true, true], ['utf16le', false, false], ['cp936', false, false], ['crlf', true, true]]);
      expect(payload.outcomes[1].warnings).toEqual(['A9_OUTPUT_ENCODING_ERROR']);
      expect(payload.outcomes[2].warnings).toEqual(['A9_OUTPUT_ENCODING_ERROR']);
      expect(payload.outcomes[0].warnings).toEqual([]);
      expect(payload.outcomes[3].warnings).toEqual([]);
      expect(payload.known_limit).toContain('KL-5');
    });

    test('an informational prompt that throws is recorded and the decisive CRLF prompt still runs', async () => {
      const r = rig({ cp936: 'throw' });
      await r.api.streamEncodings();
      expect(r.prompts).toHaveLength(4);
      expect(r.records[0][2]).toBe('PASS');
      const cp936 = r.outs[0].payload.outcomes.find((item: any) => item.label === 'cp936');
      expect(cp936).toMatchObject({ ok: false, gating: false });
      expect(cp936.error).toContain('prompt cp936 failed');
    });

    test('a decisive prompt that throws ends the case with that error and records no verdict', async () => {
      for (const label of ['utf8', 'crlf']) {
        const r = rig({ [label]: 'throw' });
        await expect(r.api.streamEncodings()).rejects.toThrow(`prompt ${label} failed`);
        expect(r.records).toHaveLength(0);
        expect(r.outs).toHaveLength(0);
      }
    });

    test('a failed decisive label fails the case, and a shell other than PowerShell is UNKNOWN without a prompt', async () => {
      const bad = rig({ crlf: 'wrong' });
      await bad.api.streamEncodings();
      expect(bad.records[0][2]).toBe('FAIL');
      const cmd = rig({}, { kind: 'cmd' });
      await cmd.api.streamEncodings();
      expect(cmd.prompts).toEqual([]);
      expect(cmd.records[0][2]).toBe('UNKNOWN');
    });
  });

  describe('SAFE-02 closure (A2, R4): the IPC baseline is taken before the first submit, and the verdict reads the Provider log', () => {
    function rig(options: { requestsFirstTurn?: number; toolResult?: boolean; secondReachesIpc?: boolean; fileWritten?: boolean; toolEnds?: number; injectFails?: boolean; submitThrows?: boolean;
      logShape?: 'full' | 'short' | 'no-tool-messages' } = {}) {
      const opts = { requestsFirstTurn: 1, toolResult: false, secondReachesIpc: true, fileWritten: true, toolEnds: 0, injectFails: false, submitThrows: false, logShape: 'full', ...options };
      const ipcLog: any[] = [
        { action: 'a9.snapshot.get', ok: false, error: 'A9_WORKSPACE_REQUIRED' },
        { action: 'a9.turn.submit', ok: true, error: null },
      ];
      // Three requests of earlier phases are already in the Provider log, and they carried tool results: only the lines after the baseline belong to this case.
      const world = { requests: 3 };
      const execs: string[] = []; const outs: any[] = []; const records: any[][] = [];
      let opened = 0;
      const events = [{ turnId: 't1', eventType: 'turn_started' }, { turnId: 't1', eventType: 'tool_start' }, ...Array.from({ length: opts.toolEnds }, () => ({ turnId: 't1', eventType: 'tool_end' }))];
      const providerLines = () => {
        const lines: any[] = Array.from({ length: world.requests }, (_x, i) => (opts.logShape === 'no-tool-messages' && i >= 3 ? { index: i + 1 }
          : { index: i + 1, tool_messages: i < 3 || (opts.toolResult && i === 4) ? 1 : 0 }));
        return opts.logShape === 'short' ? lines.slice(0, -1) : lines;
      };
      const box: any = {
        bootstrap: async () => ({}), newConversation: async () => undefined, conversationId: async () => 'conv-1',
        openDb: () => { opened += 1; if (opts.injectFails && opened === 1) throw new Error('database is locked'); return { exec: (sql: string) => execs.push(sql), close: () => undefined }; },
        counters: async () => ({ requests: world.requests }), ipcLog, providerLines,
        submit: async () => { if (opts.submitThrows) throw new Error('submit failed'); world.requests += opts.requestsFirstTurn; ipcLog.push({ action: 'a9.turn.submit', ok: false, error: AUDIT_CODE }); },
        submitRaw: async () => { if (opts.secondReachesIpc) ipcLog.push({ action: 'a9.turn.submit', ok: false, error: AUDIT_CODE }); },
        waitFor: async (condition: () => Promise<any>) => condition(),
        snapshot: async () => { ipcLog.push({ action: 'a9.snapshot.get', ok: true, error: null }); return { controls: { canStop: false }, agentStatus: 'idle' }; }, sleep: async () => undefined,
        fs: { existsSync: () => opts.fileWritten }, path, workspaceRoot: '/workspace', events: async () => ({ events }), lastTurnOf: () => 't1',
        dbAll: () => [{ status: 'active', outcome_json: '{}' }], composerState: async () => ({ send_disabled: true }), domState: async () => ({ present: '', visible: 'page text', outcome: '' }),
        out: (name: string, payload: any) => outs.push({ name, payload }), record: (...args: any[]) => records.push(args), ...evaluators,
      };
      vm.runInNewContext(`${slice('  async function safeRules() {', '  // ---- Modes: UI (p08)')}\n;this.api = { safeRules };`, box);
      return { api: box.api, ipcLog, execs, outs, records };
    }

    test('the facts of rehearsal 7 (one request in the first turn, both submits answered with the code) pass; earlier submits in the log are not counted', async () => {
      const r = rig();
      await r.api.safeRules();
      expect(r.records[0].slice(0, 3)).toEqual(['B2-SAFE-02-AUDIT-HARD-STOP', 1, 'PASS']);
      expect(r.outs[0].payload.submit_calls).toEqual([{ ok: false, error: AUDIT_CODE }, { ok: false, error: AUDIT_CODE }]);
      expect(r.outs[0].payload.requests).toEqual({ before: 3, after_turn: 4, after_next_submit: 4 });
      expect(r.outs[0].payload.provider_window).toEqual({ requests: 1, tool_result_requests: 0 });
      expect(r.execs[0]).toContain('CREATE TRIGGER b2_audit_write');
      expect(r.execs[r.execs.length - 1]).toContain('DROP TRIGGER IF EXISTS b2_audit_write');
    });

    test('a tool result sent back to the Provider fails the case, a retried request does not, and a second submit that never reached the product is UNKNOWN', async () => {
      const sentBack = rig({ requestsFirstTurn: 2, toolResult: true });
      await sentBack.api.safeRules();
      expect(sentBack.records[0][2]).toBe('FAIL');
      expect(sentBack.outs[0].payload.provider_window).toEqual({ requests: 2, tool_result_requests: 1 });
      const retried = rig({ requestsFirstTurn: 2 });
      await retried.api.safeRules();
      expect(retried.records[0][2]).toBe('PASS');
      expect(retried.outs[0].payload.provider_window).toEqual({ requests: 2, tool_result_requests: 0 });
      const nothing = rig({ requestsFirstTurn: 0 });
      await nothing.api.safeRules();
      expect(nothing.records[0][2]).toBe('FAIL');
      const unseen = rig({ secondReachesIpc: false });
      await unseen.api.safeRules();
      expect(unseen.records[0][2]).toBe('UNKNOWN');
      expect(unseen.outs[0].payload.submit_calls).toHaveLength(1);
    });

    test('a Provider log that is shorter than the counters, or lines without a tool_messages count, leave the case UNKNOWN', async () => {
      const short = rig({ requestsFirstTurn: 2, logShape: 'short' });
      await short.api.safeRules();
      expect(short.records[0][2]).toBe('UNKNOWN');
      const bare = rig({ logShape: 'no-tool-messages' });
      await bare.api.safeRules();
      expect(bare.records[0][2]).toBe('UNKNOWN');
      expect(bare.outs[0].payload.provider_window).toEqual({ requests: 1, tool_result_requests: null });
    });

    test('a persisted tool_end or a file that was never written fails the case', async () => {
      const persisted = rig({ toolEnds: 1 });
      await persisted.api.safeRules();
      expect(persisted.records[0][2]).toBe('FAIL');
      const noFile = rig({ fileWritten: false });
      await noFile.api.safeRules();
      expect(noFile.records[0][2]).toBe('FAIL');
    });

    test('when the failure cannot be injected the case is UNKNOWN and nothing is submitted; the trigger is dropped even when a submit throws', async () => {
      const locked = rig({ injectFails: true });
      await locked.api.safeRules();
      expect(locked.records[0].slice(0, 3)).toEqual(['B2-SAFE-02-AUDIT-HARD-STOP', 1, 'UNKNOWN']);
      expect(locked.ipcLog).toHaveLength(2);
      const broken = rig({ submitThrows: true });
      await expect(broken.api.safeRules()).rejects.toThrow('submit failed');
      expect(broken.execs[broken.execs.length - 1]).toContain('DROP TRIGGER IF EXISTS b2_audit_write');
    });
  });

  describe('S03T closure (R1): the follow-up submit must reach the product and the counters must be read', () => {
    function rig(options: { starts?: number; completed?: boolean; requestsTurn?: number; nextAdds?: number; secondReachesIpc?: boolean; laterShell?: number; countersMissing?: boolean;
      injectFails?: boolean; submitThrows?: boolean } = {}) {
      const opts = { starts: 3, completed: false, requestsTurn: 4, nextAdds: 0, secondReachesIpc: true, laterShell: 0, countersMissing: false, injectFails: false, submitThrows: false, ...options };
      const ipcLog: any[] = [{ action: 'a9.conversation.create', ok: true, error: null }, { action: 'a9.turn.submit', ok: true, error: null }];
      const world = { requests: 17 };
      const execs: string[] = []; const outs: any[] = []; const records: any[][] = []; const written: string[] = [];
      let opened = 0; let eventCalls = 0;
      const turnEvents: any[] = [...Array.from({ length: opts.starts }, () => ({ turnId: 't1', eventType: 'tool_start', payload: { data: { toolName: 'read' } } })),
        ...(opts.completed ? [{ turnId: 't1', eventType: 'turn_completed' }] : [])];
      const box: any = {
        bootstrap: async () => ({}), newConversation: async () => undefined, conversationId: async () => 'conv-1',
        require: () => ({ AUDIT_READ_FILES: ['b2-audit-read-0.txt', 'b2-audit-read-1.txt', 'b2-audit-read-2.txt'] }), candidateRoot: '/candidate', workspaceRoot: '/workspace', path,
        fs: { writeFileSync: (file: string) => written.push(file) },
        openDb: () => { opened += 1; if (opts.injectFails && opened === 1) throw new Error('database is locked'); return { exec: (sql: string) => execs.push(sql), close: () => undefined }; },
        counters: async () => (opts.countersMissing ? {} : { requests: world.requests }), ipcLog,
        submit: async () => { if (opts.submitThrows) throw new Error('submit failed'); world.requests += opts.requestsTurn; ipcLog.push({ action: 'a9.turn.submit', ok: false, error: AUDIT_CODE }); },
        submitRaw: async () => { world.requests += opts.nextAdds; if (opts.secondReachesIpc) ipcLog.push({ action: 'a9.turn.submit', ok: false, error: AUDIT_CODE }); },
        waitFor: async (condition: () => Promise<any>) => condition(),
        snapshot: async () => { ipcLog.push({ action: 'a9.snapshot.get', ok: true, error: null }); return { controls: { canStop: false }, agentStatus: 'idle' }; }, sleep: async () => undefined,
        events: async () => { eventCalls += 1; return { events: eventCalls === 1 ? turnEvents : [...turnEvents, ...Array.from({ length: opts.laterShell }, () => ({ turnId: 't2', eventType: 'tool_start', payload: { data: { toolName: 'shell' } } }))] }; },
        lastTurnOf: () => 't1', composerState: async () => ({ send_disabled: true }), domState: async () => ({ outcome: '' }), turnStatus: () => 'active',
        out: (name: string, payload: any) => outs.push({ name, payload }), record: (...args: any[]) => records.push(args), ...evaluators,
      };
      vm.runInNewContext(`${slice('  async function auditStop() {', '  // ---- Modes: session and background (p05)')}\n;this.api = { auditStop };`, box);
      return { api: box.api, ipcLog, execs, outs, records, written };
    }

    test('the facts of rehearsal 7 (17 to 21 to 21 requests, three reads, two submits answered with the code) pass; both submits of this case are counted', async () => {
      const r = rig();
      await r.api.auditStop();
      expect(r.records[0].slice(0, 3)).toEqual(['B2-S03T-TERMINAL-AUDIT', 1, 'PASS']);
      expect(r.outs[0].payload.submit_calls).toEqual([{ ok: false, error: AUDIT_CODE }, { ok: false, error: AUDIT_CODE }]);
      expect(r.outs[0].payload.requests).toEqual({ before: 17, after_turn: 21, after_next_submit: 21 });
      expect(r.written).toHaveLength(3);
      expect(r.execs[0]).toContain('CREATE TRIGGER b2_audit_fail');
      expect(r.execs[r.execs.length - 1]).toContain('DROP TRIGGER IF EXISTS b2_audit_fail');
    });

    test('a follow-up that never reached a9.turn.submit, or counters that were not read, leave the case UNKNOWN', async () => {
      const unseen = rig({ secondReachesIpc: false });
      await unseen.api.auditStop();
      expect(unseen.records[0][2]).toBe('UNKNOWN');
      expect(unseen.outs[0].payload.submit_calls).toHaveLength(1);
      const blind = rig({ countersMissing: true });
      await blind.api.auditStop();
      expect(blind.records[0][2]).toBe('UNKNOWN');
    });

    test('a request after the follow-up, a completed Turn, a missing read or a later shell dispatch fails the case', async () => {
      for (const options of [{ nextAdds: 1 }, { completed: true }, { starts: 2 }, { laterShell: 1 }]) {
        const r = rig(options);
        await r.api.auditStop();
        expect({ options, status: r.records[0][2] }).toEqual({ options, status: 'FAIL' });
      }
    });

    test('when the failure cannot be injected the case is UNKNOWN and nothing is submitted; the trigger is dropped even when a submit throws', async () => {
      const locked = rig({ injectFails: true });
      await locked.api.auditStop();
      expect(locked.records[0].slice(0, 3)).toEqual(['B2-S03T-TERMINAL-AUDIT', 1, 'UNKNOWN']);
      expect(locked.ipcLog).toHaveLength(2);
      const broken = rig({ submitThrows: true });
      await expect(broken.api.auditStop()).rejects.toThrow('submit failed');
      expect(broken.execs[broken.execs.length - 1]).toContain('DROP TRIGGER IF EXISTS b2_audit_fail');
    });
  });

  describe('restart closures (R2): a counter or a Turn status that was not read is UNKNOWN', () => {
    const preFacts = (): any => ({ conversationId: 'conv-1', turnId: 'turn-0', taskId: 'task-1', counters: { requests: 5 }, toolEvents: 2 });
    const restartFacts = (): any => ({ afterBoot: { requests: 5 }, afterRefresh: { requests: 5 }, state1: { turn: 'active', tools: 2 }, state2: { turn: 'active', tools: 2 },
      recovery: { canContinue: true, recoveryRevision: 'rev-1' }, card: { button: '继续' }, pending: null });

    function continueRig(options: { facts?: (f: any) => void; continueEvents?: number; turnAfter?: string | null } = {}) {
      const facts = restartFacts(); if (options.facts) options.facts(facts);
      const outs: any[] = []; const records: any[][] = [];
      const count = options.continueEvents === undefined ? 1 : options.continueEvents;
      const box: any = {
        readJsonFile: () => preFacts(), recoverFacts: async () => facts, oldApprovalResult: async () => ({ ok: false, error: { code: 'A9_APPROVAL_STALE' } }),
        fs: { existsSync: () => true }, path, workspaceRoot: '/workspace', attemptDir: '/attempt', writeJson: () => undefined,
        counters: async () => ({ requests: 5 }), setFixture: async () => undefined, exec: async () => 'double-clicked', waitIdle: async () => ({}),
        events: async () => ({ events: Array.from({ length: count }, () => ({ eventType: 'task_continue_requested', turnId: 'turn-new', payload: { data: { taskId: 'task-1' } } })) }),
        turnStatus: () => (options.turnAfter === undefined ? 'active' : options.turnAfter),
        out: (name: string, payload: any) => outs.push({ name, payload }), record: (...args: any[]) => records.push(args), ...evaluators,
      };
      vm.runInNewContext(`${slice('  async function continueRestart() {', '  // CONT-03 second assertion, in-process part.')}\n;this.api = { continueRestart };`, box);
      return { api: box.api, outs, records };
    }
    const statuses = (records: any[][]) => records.map((item) => item[2]);

    test('CONT-01: healthy facts pass both assertions', async () => {
      const r = continueRig();
      await r.api.continueRestart();
      expect(r.records.map((item) => [item[0], item[1], item[2]])).toEqual([['B2-CONT-01-RESTART-ZERO-REQUEST', 1, 'PASS'], ['B2-CONT-01-RESTART-ZERO-REQUEST', 2, 'PASS']]);
      expect(r.outs[0].payload.zero_added).toBe(true);
    });

    test('CONT-01: a counter that was not read is UNKNOWN for the zero-request answer, and a duplicate dispatch still fails it', async () => {
      const blind = continueRig({ facts: (f) => { f.afterBoot = {}; } });
      await blind.api.continueRestart();
      expect(statuses(blind.records)).toEqual(['UNKNOWN', 'PASS']);
      expect(blind.records[0][3]).toContain('zero_added=not observed');
      expect(blind.outs[0].payload.zero_added).toBeNull();
      const blindAndTwice = continueRig({ facts: (f) => { f.afterRefresh = {}; }, continueEvents: 2 });
      await blindAndTwice.api.continueRestart();
      expect(statuses(blindAndTwice.records)[0]).toBe('FAIL');
      const added = continueRig({ facts: (f) => { f.afterBoot = { requests: 6 }; } });
      await added.api.continueRestart();
      expect(statuses(added.records)[0]).toBe('FAIL');
      const toolAdded = continueRig({ facts: (f) => { f.state2.tools = 3; } });
      await toolAdded.api.continueRestart();
      expect(statuses(toolAdded.records)[0]).toBe('FAIL');
    });

    test('CONT-01: an old Turn status that was not read before or after is UNKNOWN, and a changed status fails', async () => {
      const noAfter = continueRig({ turnAfter: null });
      await noAfter.api.continueRestart();
      expect(statuses(noAfter.records)).toEqual(['PASS', 'UNKNOWN']);
      const noBefore = continueRig({ facts: (f) => { f.state2.turn = null; } });
      await noBefore.api.continueRestart();
      expect(statuses(noBefore.records)[1]).toBe('UNKNOWN');
      const changed = continueRig({ turnAfter: 'completed' });
      await changed.api.continueRestart();
      expect(statuses(changed.records)[1]).toBe('FAIL');
    });

    function interruptRig(facts: any, pre: any = preFacts()) {
      const records: any[][] = [];
      const box: any = { record: (...args: any[]) => records.push(args), ...evaluators };
      vm.runInNewContext(`${slice('  function recordInterruptChecks(pre, facts) {', '  async function chainRecover() {')}\n;this.api = { recordInterruptChecks };`, box);
      box.api.recordInterruptChecks(pre, facts);
      return records;
    }

    test('CH-04: the two answers come from the interrupted-state check and the zero-request check, in that order', () => {
      const healthy = interruptRig(restartFacts());
      expect(healthy.map((item) => [item[0], item[1], item[2]])).toEqual([['B2-CH-04-INTERRUPT-RESTART', 1, 'PASS'], ['B2-CH-04-INTERRUPT-RESTART', 2, 'PASS']]);
      const noCounters = restartFacts(); noCounters.afterBoot = {}; noCounters.afterRefresh = {};
      expect(interruptRig(noCounters).map((item) => item[2])).toEqual(['PASS', 'UNKNOWN']);
      const noTurns = restartFacts(); noTurns.state1.turn = null; noTurns.state2.turn = null;
      expect(interruptRig(noTurns).map((item) => item[2])).toEqual(['UNKNOWN', 'PASS']);
      const completed = restartFacts(); completed.state1.turn = 'completed'; completed.state2.turn = 'completed';
      expect(interruptRig(completed).map((item) => item[2])).toEqual(['FAIL', 'PASS']);
      const cannot = restartFacts(); cannot.recovery.canContinue = false; cannot.state1.turn = null; cannot.state2.turn = null;
      expect(interruptRig(cannot).map((item) => item[2])).toEqual(['FAIL', 'PASS']);
    });
  });

  describe('UI-01 closure (A1, C1): every fact comes from its own key press, and the focus call is really made', () => {
    function rig(options: { firstEnterWorks?: boolean; focusLands?: boolean; firstTarget?: string; pressThrowsAt?: number } = {}) {
      const opts = { firstEnterWorks: true, focusLands: true, firstTarget: 'BUTTON', pressThrowsAt: 0, ...options };
      const presses: string[] = []; const outs: any[] = []; const records: any[][] = [];
      const world = { busy: false, recoveryCalls: 0, stage: 'start' };
      const card = () => ({ text: '继续中断任务', button: world.busy ? '正在继续' : '继续', disabled: world.busy });
      const eventCount = () => (presses.length >= 4 ? 2 : presses.length >= 1 && (opts.firstEnterWorks || presses.length >= 2) ? 1 : 0);
      // A fake page: the driver's own focus script runs against it, so a script that no longer calls focus() leaves the button unfocused.
      const button: any = { focus: () => { if (opts.focusLands) doc.activeElement = button; } };
      const doc: any = { activeElement: null, querySelector: () => button, getElementById: () => ({ click: () => { world.busy = false; } }) };
      const box: any = {
        readJsonFile: () => ({ conversationId: 'conv-1', taskId: 'task-1' }), bootstrap: async () => ({}), activateConversation: async () => undefined,
        waitFor: async (condition: () => Promise<any>, _ms: number, label: string) => { const value = await condition(); if (!value) throw new Error(`TIMEOUT:${label}`); return value; },
        domState: async () => ({ cards: 1 }), findRecovery: async () => { world.recoveryCalls += 1; return { interruptedTurnId: `turn-${world.recoveryCalls}`, recoveryRevision: `rev-${world.recoveryCalls}` }; },
        cardInfo: async () => card(), win: { setContentSize: () => undefined }, sleep: async () => undefined, scrollProbe: async () => ({ top: 0, height: 1000, client: 400 }),
        setFixture: async () => undefined, CARD_BUTTON_BUSY: '正在继续',
        exec: async (code: string) => vm.runInNewContext(code, { document: doc }),
        pressKey: async (key: string) => {
          presses.push(key);
          const n = presses.length;
          if (opts.pressThrowsAt === n) throw new Error(`press ${n} failed`);
          if (n === 1 && opts.firstEnterWorks) world.busy = true;
          return { key, marker: `press-${n}-${key}`, keydown: true, keypress: key === 'Enter', keyup: true, clicks: 0, delivered: true, keydown_target: n === 1 ? opts.firstTarget : 'BODY', page_focused: true };
        },
        focusProbe: async () => ({ inCard: true, tag: 'BUTTON' }), continueEventsFor: async () => Array.from({ length: eventCount() }, (_x, i) => ({ turnId: `turn-continue-${i}` })),
        screenshot: async () => undefined, keyRecords: async () => [], waitIdle: async () => ({}), newConversation: async () => undefined, continueIpcCalls: () => 2, turnStatus: () => 'completed',
        out: (name: string, payload: any) => outs.push({ name, payload }), record: (...args: any[]) => records.push(args), ...evaluators,
      };
      vm.runInNewContext(`${slice('  async function uiContinue() {', '  async function uiLayouts() {')}\n;this.api = { uiContinue };`, box);
      return { api: box.api, presses, outs, records };
    }

    test('the first Enter feeds enter_delivery, the next two presses feed the extra keys, the Space retry feeds space_delivery, and a working journey passes', async () => {
      const r = rig();
      await r.api.uiContinue();
      expect(r.presses).toEqual(['Enter', 'Enter', 'Space', 'Space']);
      const facts = r.outs[0].payload.facts;
      expect(facts.enter.enter_delivery.marker).toBe('press-1-Enter');
      expect(facts.enter.extra_enter.marker).toBe('press-2-Enter');
      expect(facts.enter.extra_space.marker).toBe('press-3-Space');
      expect(facts.space_delivery.marker).toBe('press-4-Space');
      expect(facts.enter.button_focused).toBe(true);
      expect(facts.enter).toMatchObject({ busy_label: true, button_disabled: true, continue_events_while_busy: 1, continue_events_after_extra_keys: 1 });
      expect(r.records[0].slice(0, 3)).toEqual(['B2-UI-01-CONTINUE-INTERACTION', 1, 'PASS']);
    });

    test('the driver script really focuses the button: when the focus call does not land, or an Enter went to another element, both Enter assertions are UNKNOWN', async () => {
      const unfocused = rig({ focusLands: false });
      await unfocused.api.uiContinue();
      expect(unfocused.outs[0].payload.facts.enter.button_focused).toBe(false);
      expect(unfocused.records[0][2]).toBe('UNKNOWN');
      const body = rig({ firstTarget: 'BODY' });
      await body.api.uiContinue();
      expect(body.records[0][2]).toBe('UNKNOWN');
    });

    test('an Enter that reached the button without any feedback is a FAIL, and a press that throws is noted and leaves the case UNKNOWN', async () => {
      const silent = rig({ firstEnterWorks: false });
      await silent.api.uiContinue();
      const subs = silent.outs[0].payload.subs;
      expect(subs.find((item: any) => item.name === 'loading_feedback').status).toBe('FAIL');
      expect(silent.records[0][2]).toBe('FAIL');
      const thrown = rig({ pressThrowsAt: 1 });
      await thrown.api.uiContinue();
      expect(thrown.outs[0].payload.notes.errors[0]).toContain('enter_journey: press 1 failed');
      expect(thrown.outs[0].payload.facts.enter).toBeNull();
      expect(thrown.records[0][2]).toBe('UNKNOWN');
    });
  });
});

describe('A9-33 batch-2 evaluators of fix round 6', () => {
  test('S03T: the verdict needs integer counters and a follow-up that reached a9.turn.submit; the request total is not fixed', () => {
    const code = 'A9_AUDIT_PERSISTENCE_FAILED';
    const rehearsal7 = (): any => ({ tool_starts: 3, turn_completed: false, requests: { before: 17, after_turn: 21, after_next_submit: 21 }, later_shell_dispatches: 0,
      submit_calls: [{ ok: false, error: code }, { ok: false, error: code }] });
    expect(driver.evaluateTerminalAudit(rehearsal7()).status).toBe('PASS');
    // A lost response is retried by the Gateway: more requests in the first turn are not a failure.
    const retried = rehearsal7(); retried.requests = { before: 17, after_turn: 24, after_next_submit: 24 };
    expect(driver.evaluateTerminalAudit(retried).status).toBe('PASS');
    const failures: Array<[string, (f: any) => void]> = [
      ['not three reads', (f) => { f.tool_starts = 2; }],
      ['the Turn completed', (f) => { f.turn_completed = true; }],
      ['a request after the follow-up', (f) => { f.requests.after_next_submit = 22; }],
      ['a later shell dispatch', (f) => { f.later_shell_dispatches = 1; }],
    ];
    for (const [label, mutate] of failures) {
      const facts = rehearsal7(); mutate(facts);
      expect({ label, status: driver.evaluateTerminalAudit(facts).status }).toEqual({ label, status: 'FAIL' });
    }
    const unobserved: Array<[string, (f: any) => void]> = [
      ['follow-up never reached the product', (f) => { f.submit_calls = [f.submit_calls[0]]; }],
      ['no submit list', (f) => { delete f.submit_calls; }],
      ['counters empty', (f) => { f.requests = {}; }],
      ['one counter missing', (f) => { delete f.requests.after_turn; }],
      ['counter is not an integer', (f) => { f.requests.before = '17'; }],
      ['tool starts missing', (f) => { delete f.tool_starts; }],
      ['completion flag missing', (f) => { delete f.turn_completed; }],
      ['later shell count missing', (f) => { delete f.later_shell_dispatches; }],
    ];
    for (const [label, mutate] of unobserved) {
      const facts = rehearsal7(); mutate(facts);
      expect({ label, status: driver.evaluateTerminalAudit(facts).status }).toEqual({ label, status: 'UNKNOWN' });
    }
    // undefined === undefined is not "no new request".
    expect(driver.evaluateTerminalAudit({ tool_starts: 3, turn_completed: false, requests: { before: undefined, after_turn: undefined, after_next_submit: undefined }, later_shell_dispatches: 0,
      submit_calls: [{}, {}] }).status).toBe('UNKNOWN');
    expect(driver.evaluateTerminalAudit(null).status).toBe('UNKNOWN');
  });

  test('restart: missing counters and missing Turn statuses are null (UNKNOWN), never equal', () => {
    const pre = { counters: { requests: 5 }, toolEvents: 2 };
    const facts = () => ({ afterBoot: { requests: 5 }, afterRefresh: { requests: 5 }, state1: { turn: 'active', tools: 2 }, state2: { turn: 'active', tools: 2 } });
    expect(driver.evaluateRestartCounts(pre, facts())).toBe(true);
    const added: any = facts(); added.afterRefresh.requests = 6;
    expect(driver.evaluateRestartCounts(pre, added)).toBe(false);
    const tools: any = facts(); tools.state1.tools = 3;
    expect(driver.evaluateRestartCounts(pre, tools)).toBe(false);
    for (const hide of [(f: any) => { f.afterBoot = {}; }, (f: any) => { f.afterRefresh = null; }, (f: any) => { delete f.state1.tools; }, (f: any) => { f.state2 = undefined; }, (f: any) => { f.afterBoot.requests = -1; }]) {
      const hidden: any = facts(); hide(hidden);
      expect(driver.evaluateRestartCounts(pre, hidden)).toBeNull();
    }
    // Both sides missing is still not "equal".
    expect(driver.evaluateRestartCounts({}, { afterBoot: {}, afterRefresh: {}, state1: {}, state2: {} })).toBeNull();
    expect(driver.evaluateRestartCounts(null, null)).toBeNull();
    expect(driver.evaluateOldTurnUnchanged('active', 'active')).toBe(true);
    expect(driver.evaluateOldTurnUnchanged('active', 'completed')).toBe(false);
    for (const [before, after] of [[null, null], [undefined, undefined], ['active', null], ['', ''], [3, 3]] as any[]) {
      expect(driver.evaluateOldTurnUnchanged(before, after)).toBeNull();
    }
  });

  test('UI-01 (codex round 5, R3): two continue events are a FAIL whatever the extra keys or the first Enter did; one event still needs all the key evidence', () => {
    const card = { text: '继续中断任务', button: '继续', disabled: false };
    const full = (): any => ({
      card0: card,
      enter: { button_focused: true, busy_label: true, button_disabled: true, focus_in_card: true, scroll: { testable: true, before: 0, after: 0 }, continue_events_while_busy: 1, continue_events_after_extra_keys: 1,
        enter_delivery: { key: 'Enter', keydown: true, keypress: true, keyup: true, clicks: 1, delivered: true, keydown_target: 'BUTTON', page_focused: true },
        extra_enter: { key: 'Enter', keydown: true, keypress: false, keyup: true, clicks: 0, delivered: false, keydown_target: 'BODY' },
        extra_space: { key: 'Space', keydown: true, keypress: false, keyup: true, clicks: 0, delivered: true, keydown_target: 'BODY' } },
      stopped: { card, focus_in_card: true, interrupted_turn_changed: true, revision_changed: true },
      view_return: { card },
      space: { continue_events_total: 2, ipc_continue_calls_total: 2, second_turn_status: 'completed' },
    });
    const sub = (facts: any) => driver.evaluateUiJourney(facts).find((item: any) => item.name === 'one_dispatch_while_busy');
    expect(sub(full()).status).toBe('PASS');
    const lost = (f: any) => { f.enter.extra_enter = { ...f.enter.extra_enter, keydown: false }; f.enter.extra_space = { ...f.enter.extra_space, keydown: false }; };
    // The reviewed case: two events before any extra key was sent, and the extra keys never reached the page.
    const duplicateBeforeExtras = full(); duplicateBeforeExtras.enter.continue_events_while_busy = 2; duplicateBeforeExtras.enter.continue_events_after_extra_keys = 2; lost(duplicateBeforeExtras);
    expect(sub(duplicateBeforeExtras).status).toBe('FAIL');
    const duplicateAfterExtras = full(); duplicateAfterExtras.enter.continue_events_after_extra_keys = 2; lost(duplicateAfterExtras);
    expect(sub(duplicateAfterExtras).status).toBe('FAIL');
    const duplicateWithBodyEnter = full(); duplicateWithBodyEnter.enter.continue_events_while_busy = 2; duplicateWithBodyEnter.enter.enter_delivery.keydown_target = 'BODY';
    expect(sub(duplicateWithBodyEnter).status).toBe('FAIL');
    // One event, key evidence missing: still UNKNOWN. Counts missing: UNKNOWN, not FAIL.
    const oneButLost = full(); lost(oneButLost);
    expect(sub(oneButLost).status).toBe('UNKNOWN');
    const noCounts = full(); delete noCounts.enter.continue_events_while_busy;
    expect(sub(noCounts).status).toBe('UNKNOWN');
    // Zero events with every key delivered is the rehearsal 7 shape (nothing happened) and stays a FAIL.
    const nothing = full(); nothing.enter.continue_events_while_busy = 0; nothing.enter.continue_events_after_extra_keys = 0;
    expect(sub(nothing).status).toBe('FAIL');
    expect(driver.evaluateUiJourney({ card0: card, enter: null, stopped: null, view_return: null, space: null }).find((item: any) => item.name === 'one_dispatch_while_busy').status).toBe('UNKNOWN');
  });
});

// A9-39: synthetic observations test the actual packaged evaluators; they are not Win7 product evidence.
describe('A9-39 phase 2 fixed secrets contract', () => {
  const ordinaryProjectionSamples: any[] = fixtures.SECRET_SAMPLES['B2-A37-01'];
  const projectionActual = new Map<string, string>();
  const decodeSample = (sample: any) => new util.TextDecoder(sample.encoding === 'gbk' ? 'gbk' : sample.encoding === 'utf16le' ? 'utf-16le' : 'utf-8', { fatal: true })
    .decode(fixtures.secretInputBytes(fixtures.secretExample(sample.example), sample.encoding));
  function ordinaryProjection(caseId: string, sample: any) {
    const expected = driver.phase2ExampleProjection(sample);
    if (caseId === 'B2-A37-01') return { input: `b2:fixed-${sample.id} ${fixtures.secretExample(sample.example)}`, expected: `b2:fixed-${sample.id} ${expected}` };
    const final = fixtures.phase2ProviderStep({ messages: [{ role: 'user', content: `b2:fixed-${sample.id}` }, { role: 'tool', content: 'changed' }] },
      { phase2Case: caseId, phase2Sample: sample.id, shellKind: 'cmd' });
    return { input: final.content, expected };
  }
  function authCommand(caseId: string, sample: any, shellKind: string) {
    const auth = fixtures.phase2AuthInput(sample); const lines = auth.expected.split('\n');
    return { input: fixtures.phase2ProviderStep({ messages: [{ role: 'user', content: auth.input }] },
      { phase2Case: caseId, phase2Sample: sample.id, shellKind }).tool.args.command,
    expected: shellKind === 'powershell' ? `Write-Output 'A939-COMMAND'; # ${lines[0]}\n# ${lines[1]}` : `echo A939-COMMAND & rem ${lines[0]}\nrem ${lines[1]}` };
  }
  const observed = (input: string) => {
    if (!projectionActual.has(input)) throw new Error('ADR_0253_UNOBSERVED_PROJECTION');
    return projectionActual.get(input);
  };
  const projections = (input: string, expected: string) => ['snapshot', 'events', 'sqlite'].map((surface) => ({ surface, expected, actual: observed(input) }));
  beforeAll(async () => {
    const root = temp('projection-runtime'); const workspaceRoot = path.join(root, 'ws');
    fs.mkdirSync(workspaceRoot); let input = '';
    // Public gitStatus() runs the candidate's real redactForProjection/redactSecrets chain.
    // Only the adapter's text input is controlled; SQLite and every redactor are the real implementation.
    // No private-function extraction, Electron, Shell, Git process or network request is involved.
    const runtime = createA9AgentRuntime({ workspaceRoot, dataRoot: path.join(root, 'data'),
      openDatabase: (file: string, options?: { readonly?: boolean }) => new Database(file, options && options.readonly ? { readonly: true } : {}),
      modules: { core: require('../../../core/dist'), gateway: require('../../../gateway/dist'), state: require('../../../state/dist'),
        workspace: require('../../../workspace/dist'), runner: require('../../../runner/dist'),
        gitAdapter: { projectTrustedGit: async () => ({ text: input }) } } });
    try {
      expect(runtime.status).toBe('ready');
      const inputs = new Set<string>();
      for (const sample of ordinaryProjectionSamples) inputs.add(decodeSample(sample));
      for (const caseId of ['B2-A37-01', 'B2-A38-06']) for (const sample of fixtures.SECRET_SAMPLES[caseId]) inputs.add(ordinaryProjection(caseId, sample).input);
      for (const caseId of ['B2-A38-04', 'B2-A38-08']) for (const sample of fixtures.SECRET_SAMPLES[caseId]) {
        const auth = fixtures.phase2AuthInput(sample); inputs.add(auth.input); inputs.add(auth.input.split('\n')[0]);
        for (const kind of ['cmd', 'powershell']) inputs.add(authCommand(caseId, sample, kind).input);
      }
      for (input of inputs) {
        const result = await runtime.gitStatus(); expect(result.ok).toBe(true);
        expect(typeof result.projection.text).toBe('string'); projectionActual.set(input, result.projection.text);
      }
    } finally { await runtime.shutdown(); fs.rmSync(root, { recursive: true, force: true }); }
  });
  test('ADR-0253: projection coverage is exactly header/source/url in all three encodings', () => {
    expect(ordinaryProjectionSamples.map((s: any) => `${s.example}/${s.encoding}`)).toEqual([
      'header/utf8', 'header/utf16le', 'header/gbk', 'source/utf8', 'source/utf16le', 'source/gbk', 'url/utf8', 'url/utf16le', 'url/gbk',
    ]);
  });
  test.each(ordinaryProjectionSamples)('ADR-0253: candidate output matches driver expectation for $example/$encoding', (sample: any) => {
    const prefix = sample.encoding === 'gbk' ? '中文\n' : '';
    expect(decodeSample(sample)).toBe(prefix + fixtures.secretExample(sample.example));
    expect(observed(decodeSample(sample))).toBe(prefix + driver.phase2ExampleProjection(sample));
    const p = ordinaryProjection('B2-A37-01', sample); expect(observed(p.input)).toBe(p.expected);
  });
  test.each(fixtures.SECRET_SAMPLES['B2-A38-06'] as any[])('ADR-0253: file-only final projection matches $example', (sample: any) => {
    const p = ordinaryProjection('B2-A38-06', sample); expect(observed(p.input)).toBe(p.expected);
  });
  test.each(['B2-A38-04', 'B2-A38-08'].flatMap((caseId) => fixtures.SECRET_SAMPLES[caseId].map((sample: any) => ({ caseId, ...sample }))))(
    'ADR-0253: candidate auth projections match $caseId/$id', (sample: any) => {
      const auth = fixtures.phase2AuthInput(sample);
      expect(observed(auth.input)).toBe(auth.expected);
      expect(observed(auth.input.split('\n')[0])).toBe(auth.expected.split('\n')[0]);
      for (const kind of ['cmd', 'powershell']) { const p = authCommand(sample.caseId, sample, kind); expect(observed(p.input)).toBe(p.expected); }
    });
  test('ADR-0260/ADR-0261/ADR-0262: WIN7-55 current labels include the A9-36 request and validation document', () => {
    expect(fixtures.CONTRACT).toMatchObject({ candidate: 'WIN7-55', candidate_tentative: true });
    const lock = JSON.parse(fs.readFileSync(path.join(releaseDir, 'a9-batch2-input-lock.json'), 'utf8'));
    expect(lock.provenance.candidate).toBe('WIN7-55'); expect(lock.gates.win7).toBe('NOT_PERFORMED_WIN7_55');
    const producer = fs.readFileSync(path.resolve(releaseDir, '../../scripts/release/build-a9-product-v3.mjs'), 'utf8');
    expect(producer).toContain("task: 'A9-39', candidate: 'WIN7-55', candidateTentative: true, batch2: true");
    const request = fs.readFileSync(path.join(releaseDir, 'a9-alpha2-supplement-request.cjs'), 'utf8');
    expect(request).toContain("a.candidate !== 'WIN7-55'");
    for (const name of ['README.md', 'A9_BATCH2_WIN7_VALIDATION.md', 'RUN_A9_BATCH2_INTEGRITY.cmd', 'A9_ALPHA2_SUPPLEMENT_VALIDATION.md']) {
      const text = fs.readFileSync(path.join(releaseDir, name), 'utf8');
      expect(text).toContain('WIN7-55'); expect(text).not.toMatch(/WIN7[-_](?:46|47|48|49|50|51)/);
    }
    expect(fs.readFileSync(path.join(releaseDir, 'A9_ALPHA2_SUPPLEMENT_VALIDATION.md'), 'utf8')).toContain('WIN7-42');
  });
  const H = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
  const digest = (s: string) => ({ size: Buffer.byteLength(s), sha256: H(s) });
  const scan = () => ({ surfaces: ['snapshot', 'events', 'sqlite', 'recovery', 'product-files'].map((name) => ({ name, ...digest(name), hits: 0 })),
    positive_controls: [{ ...digest('encoded control'), hits: 1 }, { ...digest('UTF16 control'), hits: 1 }] });
  const restart = () => ({ previous_pid: 100, pid: 101, previous_sid: TARGET.account_sid, sid: TARGET.account_sid,
    previous_exit_code: 0, previous_ended_at: '2026-10-17T00:00:00Z', previous_tree_absent: true, started_ms: Date.parse('2026-10-17T00:00:01Z') });
  function positive(caseId: string) {
    return { schema_version: 1, case_id: caseId, started_ms: Date.parse('2026-10-17T00:00:01Z'), candidate: fixtures.CONTRACT.candidate, bindings: { source_commit: H('source').slice(0, 40), package_sha256: H('ZIP'), kit_sha256: H('Kit'), manifest_sha256: H('manifest') },
      run_id: RUN_ID, pid: 101, sid: TARGET.account_sid, target: { ...TARGET },
      rows: fixtures.SECRET_SAMPLES[caseId].map((sample: any) => ({ id: sample.id, input: digest('input'), runner_dispatches: 0, tool_starts: 0,
        marker_before: digest('unchanged'), marker_after: digest('unchanged'), error: 'A9_CHECKPOINT_SECRET_BLOCKED', ipc_submit: true, scan: scan(),
        ...(caseId === 'B2-A37-01' || caseId === 'B2-A38-06' ? { b0: digest('original'), b1: digest('changed'), b2: digest('original'), turn_id: 'turn-1',
          runner_dispatches: 1, tool_starts: 1, shell_ends: 1, shell_exit: 0, diff_ok: true, diff_paths: ['sample.txt'], checkpoint_turn: 'turn-1',
          undo_ok: true, undo_errors: 0, restored: ['sample.txt'], recovery_hashes: [H('original')],
          projections: projections(ordinaryProjection(caseId, sample).input, ordinaryProjection(caseId, sample).expected) } : {}),
        ...(caseId === 'B2-A37-03' ? { ...restart(), config_error: 'A9_CHECKPOINT_SECRET_BLOCKED', undo_ok: false, undo_errors: 1, undo_restored: 0, full_restore_reported: false,
          modified_sha256: H('modified'), after_sha256: H('modified'), new_unsafe_artifacts: [], recovery_files_before: 2, checkpoint_index_sha256: H('index'), key_source: 'dpapi' } : {}),
        ...(caseId === 'B2-A37-04' ? { load_status: sample.expected, provider_requests: 1, instruction_body_hits: 0, provider_body_sha256: H('request body') } : {}),
        ...(caseId === 'B2-A38-02' ? { config_steps: 2, config_sequence_sha256: H('clear/username/password') } : {}),
        ...(caseId === 'B2-A38-03' ? { error: 'A9_ENV_OVERLAY_REJECTED', setting_ok: false, stage: sample.stage, saved_before_registration: true,
          diagnostic: 'A9_ENV_OVERLAY_REJECTED', runner_overlay_hits: 0, automatic_overlay_hits: 0 } : {}),
        ...(caseId === 'B2-A38-04' || caseId === 'B2-A38-08' ? { projections: projections(fixtures.phase2AuthInput(sample).input, fixtures.phase2AuthInput(sample).expected),
          surfaces_complete: true, runner_dispatches: 1, tool_starts: 1, shell_exit: 0, projection_kinds: ['prompt', 'title', 'command', 'final'].map((kind) => {
            const auth = fixtures.phase2AuthInput(sample); const command = authCommand(caseId, sample, 'cmd');
            const input = kind === 'command' ? command.input : kind === 'title' ? auth.input.split('\n')[0] : auth.input;
            return { kind, expected: kind === 'command' ? command.expected : kind === 'title' ? auth.expected.split('\n')[0] : auth.expected, actual: observed(input) };
          }) } : {}),
        ...(caseId === 'B2-A38-05' ? { ...restart(), first_chunk_at: 1, preview_at: 2, second_chunk_at: 3, terminal_at: 4, preview_reads: 1,
          preview: digest('live preview'), preview_hits: 0, final_hits: 0, restart_hits: 0, restart_sha256: H('restart'),
          preview_kind: sample.surface === 'model' ? 'liveModelPreview' : 'shell_snapshot', runner_dispatches: sample.surface === 'shell' ? 1 : 0, shell_exit: 0 } : {}),
        ...(caseId === 'B2-A38-07' ? { ...restart(), saved_ok: true, encryption_available: true, key_source: 'dpapi', ciphertext: digest('encrypted bytes'),
          ciphertext_plaintext_hits: 0, proxy_password_available: true } : {}),
      })) };
  }
  const bad: Record<string, (f: any) => void> = {
    'B2-A37-01': (f) => { f.rows[0].b2 = digest('wrong restore'); },
    'B2-A37-02': (f) => { f.rows[0].runner_dispatches = 1; },
    'B2-A37-03': (f) => { f.rows[1].undo_ok = true; f.rows[1].full_restore_reported = true; },
    'B2-A37-04': (f) => { f.rows[2].load_status = 'secret_blocked'; },
    'B2-A38-01': (f) => { f.rows[0].runner_dispatches = 1; },
    'B2-A38-02': (f) => { f.rows[0].error = 'accepted old pair'; },
    'B2-A38-03': (f) => { f.rows[0].setting_ok = true; f.rows[0].runner_overlay_hits = 1; },
    'B2-A38-04': (f) => { f.rows[0].projections[0].actual = 'Authorization: ***redacted*** TOKEN'; },
    'B2-A38-05': (f) => { f.rows[0].preview_hits = 1; },
    'B2-A38-06': (f) => { f.rows[0].runner_dispatches = 0; },
    'B2-A38-07': (f) => { f.rows[1].previous_pid = f.rows[1].pid; },
    'B2-A38-08': (f) => { f.rows[0].projections[0].actual = 'Authorization: ***redacted***'; },
  };
  test.each(fixtures.SECRET_CASE_IDS as string[])('%s evaluator accepts complete synthetic observations', (caseId) => {
    expect(driver.evaluatePhase2Case(caseId, positive(caseId))).toMatchObject({ status: 'PASS', assertions: ['PASS', 'PASS'] });
  });
  test.each(fixtures.SECRET_CASE_IDS as string[])('%s evaluator counterexample is FAIL', (caseId) => {
    const facts = positive(caseId); bad[caseId](facts);
    expect(driver.evaluatePhase2Case(caseId, facts).status).toBe('FAIL');
  });
  test.each(fixtures.SECRET_CASE_IDS as string[])('%s refuses missing, duplicate and unknown sample observations', (caseId) => {
    const facts = positive(caseId);
    for (const rows of [[], facts.rows.slice(1), facts.rows.concat(facts.rows[0]), facts.rows.map((r: any, i: number) => i ? r : { ...r, id: 'unknown' })]) {
      expect(driver.evaluatePhase2Case(caseId, { ...facts, rows }).status).toBe('FAIL');
    }
    for (const patch of [{ candidate: 'WIN7-45' }, { bindings: {} }, { sid: null }, { pid: null }]) expect(driver.evaluatePhase2Case(caseId, { ...facts, ...patch }).status).toBe('FAIL');
  });
  test.each(['B2-A37-02', 'B2-A38-01', 'B2-A38-02', 'B2-A38-03', 'B2-A38-07'])('%s refuses unknown dispatch counts and changed external markers', (caseId) => {
    for (const count of [null, undefined, -1, '0', 1]) {
      const facts = positive(caseId); facts.rows[facts.rows.length - 1].runner_dispatches = count;
      expect(driver.evaluatePhase2Case(caseId, facts).status).toBe('FAIL');
    }
    const facts = positive(caseId); facts.rows[facts.rows.length - 1].marker_after = digest('changed');
    expect(driver.evaluatePhase2Case(caseId, facts).status).toBe('FAIL');
  });
  test.each(fixtures.SECRET_CASE_IDS as string[])('%s enforces zero dispatch or the required real Shell dispatch, rather than inferring it', (caseId) => {
    const facts = positive(caseId);
    const mustRun = ['B2-A37-01', 'B2-A38-04', 'B2-A38-06', 'B2-A38-08'].includes(caseId);
    const index = caseId === 'B2-A38-07' ? 1 : 0;
    facts.rows[index].runner_dispatches = mustRun ? 0 : 1;
    expect(driver.evaluatePhase2Case(caseId, facts).status).toBe('FAIL');
    if (caseId === 'B2-A38-05') {
      const shell = positive(caseId); const i = fixtures.SECRET_SAMPLES[caseId].findIndex((s: any) => s.surface === 'shell');
      shell.rows[i].runner_dispatches = 0;
      expect(driver.evaluatePhase2Case(caseId, shell).status).toBe('FAIL');
    }
  });
  test.each(fixtures.SECRET_CASE_IDS as string[])('%s requires a typed envelope and matching case identity', (caseId) => {
    for (const field of ['schema_version', 'case_id', 'started_ms', 'candidate', 'run_id', 'pid', 'sid', 'bindings.source_commit',
      'bindings.package_sha256', 'bindings.manifest_sha256', 'bindings.kit_sha256', 'target.account_sid']) {
      for (const value of [undefined, null, {}, [], 'wrong-type', NaN, Infinity]) {
        const facts: any = positive(caseId); const keys = field.split('.'); let parent = facts;
        for (const key of keys.slice(0, -1)) parent = parent[key];
        if (value === undefined) delete parent[keys[keys.length - 1]]; else parent[keys[keys.length - 1]] = value;
        expect({ field, value: String(value), status: driver.evaluatePhase2Case(caseId, facts).status })
          .toEqual({ field, value: String(value), status: 'FAIL' });
      }
    }
    const mismatch: any = positive(caseId); mismatch.case_id = fixtures.SECRET_CASE_IDS.find((id: string) => id !== caseId);
    expect(driver.evaluatePhase2Case(caseId, mismatch).status).toBe('FAIL');
    for (const rows of [null, undefined, {}, [null]]) expect(driver.evaluatePhase2Case(caseId, { ...positive(caseId), rows }).status).toBe('FAIL');
    expect(driver.evaluatePhase2Case(caseId, null).status).toBe('FAIL');
  });
  // Exact false-PASS probes from missing-fields-extra.json and restart-identity-probe.json.
  const reviewProbes: Array<[string, string, (f: any) => void]> = [
    ['B2-A37-03', 'missing new_unsafe_artifacts', (f) => f.rows.forEach((r: any) => { delete r.new_unsafe_artifacts; })],
    ['B2-A38-05', 'first_chunk_at null', (f) => { f.rows[0].first_chunk_at = null; }],
    ['B2-A38-07', 'missing restart PID', (f) => { delete f.rows[1].pid; }],
    ['B2-A38-07', 'missing both restart SIDs', (f) => { delete f.rows[1].sid; delete f.rows[1].previous_sid; }],
    ['B2-A37-01', 'missing input digest', (f) => f.rows.forEach((r: any) => { delete r.input; })],
    ['B2-A38-07', 'same envelope PID, missing row PID, wrong user SIDs', (f) => {
      f.rows[1].previous_pid = f.pid; delete f.rows[1].pid; f.rows[1].sid = f.rows[1].previous_sid = 'S-1-5-21-999';
    }],
  ];
  test.each(reviewProbes)('review regression %s: %s', (caseId, _label, mutate) => {
    const facts = positive(caseId); mutate(facts);
    expect(driver.evaluatePhase2Case(caseId, facts).status).toBe('FAIL');
  });
  // Independent required-field inventory: delete or corrupt each required path, including nested evidence.
  const required: Record<string, string[]> = {
    'B2-A37-01': ['input', 'b0', 'b1', 'b2', 'turn_id', 'checkpoint_turn', 'runner_dispatches', 'tool_starts', 'shell_ends', 'shell_exit', 'diff_ok', 'diff_paths', 'undo_ok', 'undo_errors', 'restored', 'recovery_hashes', 'projections', 'scan'],
    'B2-A37-02': ['input', 'error', 'runner_dispatches', 'tool_starts', 'marker_before', 'marker_after', 'ipc_submit', 'scan'],
    'B2-A37-03': ['input', 'error', 'runner_dispatches', 'tool_starts', 'marker_before', 'marker_after', 'undo_ok', 'undo_errors', 'undo_restored', 'modified_sha256', 'after_sha256', 'full_restore_reported', 'new_unsafe_artifacts', 'recovery_files_before', 'checkpoint_index_sha256'],
    'B2-A37-04': ['input', 'load_status', 'provider_requests', 'instruction_body_hits', 'provider_body_sha256', 'runner_dispatches'],
    'B2-A38-01': ['input', 'error', 'runner_dispatches', 'tool_starts', 'marker_before', 'marker_after', 'ipc_submit', 'scan'],
    'B2-A38-02': ['input', 'error', 'runner_dispatches', 'tool_starts', 'marker_before', 'marker_after', 'ipc_submit', 'scan', 'config_steps', 'config_sequence_sha256'],
    'B2-A38-03': ['input', 'error', 'runner_dispatches', 'tool_starts', 'marker_before', 'marker_after', 'setting_ok', 'stage', 'runner_overlay_hits', 'automatic_overlay_hits', 'scan'],
    'B2-A38-04': ['input', 'runner_dispatches', 'tool_starts', 'shell_exit', 'projections', 'projection_kinds', 'surfaces_complete', 'scan'],
    'B2-A38-05': ['input', 'runner_dispatches', 'first_chunk_at', 'preview_at', 'second_chunk_at', 'terminal_at', 'preview_reads', 'preview', 'preview_hits', 'final_hits', 'preview_kind', 'restart_hits', 'restart_sha256', 'scan'],
    'B2-A38-06': ['input', 'b0', 'b1', 'b2', 'turn_id', 'checkpoint_turn', 'runner_dispatches', 'tool_starts', 'shell_ends', 'shell_exit', 'diff_ok', 'diff_paths', 'undo_ok', 'undo_errors', 'restored', 'recovery_hashes', 'projections', 'scan'],
    'B2-A38-07': ['input', 'runner_dispatches', 'saved_ok', 'encryption_available', 'key_source', 'ciphertext', 'ciphertext_plaintext_hits'],
    'B2-A38-08': ['input', 'runner_dispatches', 'tool_starts', 'shell_exit', 'projections', 'surfaces_complete', 'scan'],
  };
  const restartPaths = ['pid', 'sid', 'previous_pid', 'previous_sid', 'previous_exit_code', 'previous_ended_at', 'previous_tree_absent', 'started_ms'];
  const blockedPaths = ['input', 'error', 'runner_dispatches', 'tool_starts', 'marker_before', 'marker_after', 'ipc_submit', 'scan'];
  test.each(fixtures.SECRET_CASE_IDS as string[])('%s required fields reject absence and wrong types before comparison', (caseId) => {
    const good: any = positive(caseId);
    const expand = (value: any, prefix: string): string[] => {
      if (value && typeof value === 'object') return [prefix, ...Object.keys(value).flatMap((key) => expand(value[key], `${prefix}.${key}`))];
      return [prefix];
    };
    good.rows.forEach((row: any, index: number) => {
      let paths = required[caseId];
      if (caseId === 'B2-A38-07' && index === 1) paths = [...blockedPaths, 'key_source', 'proxy_password_available'];
      if (caseId === 'B2-A37-03') paths = [...paths, ...(index === 0 ? ['config_error'] : ['key_source', ...restartPaths])];
      if (caseId === 'B2-A38-05' || (caseId === 'B2-A38-07' && index === 1)) paths = [...paths, ...restartPaths];
      if (caseId === 'B2-A38-05' && fixtures.SECRET_SAMPLES[caseId][index].surface === 'shell') paths = [...paths, 'shell_exit'];
      if (caseId === 'B2-A38-03' && row.stage === 'revalidate') paths = [...paths, 'saved_before_registration', 'diagnostic'];
      // Only fields used by this row's contract are mandatory; unused supplemental metadata is not inferred.
      for (const field of ['id', ...paths].flatMap((key) => expand(row[key], key))) {
        for (const replacement of [undefined, null, {}, [], 'wrong-type', NaN, Infinity]) {
          const original = field.split('.').reduce((v: any, key: string) => v[key], row);
          if (Array.isArray(original) && original.length === 0 && Array.isArray(replacement) && replacement.length === 0) continue;
          const facts: any = positive(caseId); const keys = field.split('.'); let parent = facts.rows[index];
          for (const key of keys.slice(0, -1)) parent = parent[key];
          if (replacement === undefined) delete parent[keys[keys.length - 1]]; else parent[keys[keys.length - 1]] = replacement;
          expect({ caseId, index, field, replacement: String(replacement), status: driver.evaluatePhase2Case(caseId, facts).status })
            .toEqual({ caseId, index, field, replacement: String(replacement), status: 'FAIL' });
        }
      }
    });
  });
  test.each(['B2-A37-03', 'B2-A38-05', 'B2-A38-07'])('%s binds restart PID and SID to the current envelope', (caseId) => {
    const index = caseId === 'B2-A38-05' ? 0 : 1;
    for (const patch of [{ pid: 999 }, { sid: 'S-1-5-21-999', previous_sid: 'S-1-5-21-999' }, { started_ms: null }, { previous_pid: '100' }]) {
      const facts: any = positive(caseId); Object.assign(facts.rows[index], patch);
      expect(driver.evaluatePhase2Case(caseId, facts).status).toBe('FAIL');
    }
  });
  // These are the exact two valid frames in observer-v3-repro.json, kept in the test rather than depending on outputs/.
  const reviewFrames = [
    { schemaVersion: 3, type: 'output_chunk', profileId: 'a9-trusted-shell-current-user-v2', requestId: 'probe', seq: 1, stream: 'stdout', streamOffset: 0, byteLength: 22, dataBase64: 'WVRsbWFYaDBkWEpsT2tFNUxUTTVMWA==' },
    { schemaVersion: 3, type: 'output_chunk', profileId: 'a9-trusted-shell-current-user-v2', requestId: 'probe', seq: 2, stream: 'stdout', streamOffset: 22, byteLength: 22, dataBase64: 'Qnl3Nmw0ZVMxK2ZuNC9Qejk0ZVhvPQ==' },
  ];
  function observerProbe() {
    const code = fs.readFileSync(path.join(__dirname, 'a9-batch2-driver-entry.cjs'), 'utf8');
    const start = code.indexOf('  function installPhase2Observer()'); const end = code.indexOf('  // ---- Dispatcher', start);
    const child = { pid: 200, stdout: new EventEmitter(), stdin: { write: jest.fn((_chunk: string) => true) } };
    const watch = { head: Buffer.from(reviewFrames[0].dataBase64, 'base64').toString(), tail: Buffer.from(reviewFrames[1].dataBase64, 'base64').toString(), first: null, second: null };
    let now = 100;
    const context: any = { childProcess: { spawn: () => child, spawnSync: () => ({ status: 0 }) }, p2Dispatches: [], p2Automatic: [], p2Watch: watch,
      createPhase2OutputObserver: driver.createPhase2OutputObserver, sha256: H, Date: { now: () => now }, Buffer };
    const originalWrite = child.stdin.write;
    vm.runInNewContext(code.slice(start, end) + '\ninstallPhase2Observer();', context);
    context.childProcess.spawn('C:\\runtime\\helper.exe');
    const request = JSON.stringify({ schemaVersion: 3, profileId: reviewFrames[0].profileId, requestId: 'probe' }) + '\n';
    child.stdin.write(request.slice(0, 12)); child.stdin.write(request.slice(12));
    return { watch, child, originalWrite, send: (text: string, at = 100) => { now = at; child.stdout.emit('data', Buffer.from(text)); } };
  }
  test('review observer v3 repro decodes matching output_chunk frames across data event boundaries', () => {
    const probe = observerProbe();
    reviewFrames.forEach((frame, index) => { const line = JSON.stringify(frame) + '\r\n'; probe.send(line.slice(0, 29), 100 + index * 100); probe.send(line.slice(29), 100 + index * 100); });
    expect(probe.watch).toMatchObject({ first: expect.any(Number), second: expect.any(Number) });
    expect(probe.watch.first).toBeLessThan(probe.watch.second as any);
    expect(probe.originalWrite).toHaveBeenCalledTimes(2);
  });
  test('review observer never times plaintext in non-output fields or another request', () => {
    const probe = observerProbe();
    probe.send(JSON.stringify({ schemaVersion: 3, type: 'execution_result', requestId: 'probe', detail: probe.watch.head + probe.watch.tail }) + '\n');
    probe.send(reviewFrames.map((frame) => JSON.stringify({ ...frame, requestId: 'foreign', detail: probe.watch.head + probe.watch.tail })).join('\n') + '\n');
    expect(probe.watch).toMatchObject({ first: null, second: null });
  });
  test('observer assembles stream offsets, never bridges gaps or stdout/stderr', () => {
    const probe = observerProbe();
    probe.send(JSON.stringify(reviewFrames[1]) + '\n'); expect(probe.watch.first).toBeNull(); expect(probe.watch.second).toBeNull();
    probe.send(JSON.stringify(reviewFrames[0]) + '\n', 200);
    expect(probe.watch).toMatchObject({ first: expect.any(Number), second: expect.any(Number) });
    const split = observerProbe();
    split.send(JSON.stringify({ ...reviewFrames[1], stream: 'stderr', streamOffset: 0 }) + '\n');
    split.send(JSON.stringify(reviewFrames[0]) + '\n', 200);
    expect(split.watch.first).not.toBeNull(); expect(split.watch.second).toBeNull();
  });
  test('observer joins payload fragments by byte offsets across merged JSON lines', () => {
    const probe = observerProbe(); const bytes = Buffer.concat(reviewFrames.map((f) => Buffer.from(f.dataBase64, 'base64')));
    const parts = [bytes.subarray(0, 11), bytes.subarray(11, 33), bytes.subarray(33)]; let offset = 0;
    const frames = parts.map((part, i) => { const frame = { ...reviewFrames[0], seq: i + 1, streamOffset: offset, byteLength: part.length, dataBase64: part.toString('base64') }; offset += part.length; return frame; });
    probe.send(frames.slice(0, 2).map((f) => JSON.stringify(f)).join('\n') + '\n', 100);
    expect(probe.watch.first).not.toBeNull(); expect(probe.watch.second).toBeNull();
    probe.send(JSON.stringify(frames[2]) + '\n', 200);
    expect(probe.watch.second).toBe(200);
  });
  test.each([{ byteLength: '22' }, { dataBase64: 'not base64' }, { streamOffset: null }])('observer rejects malformed matching chunks %j', (patch) => {
    const probe = observerProbe(); probe.send(JSON.stringify({ ...reviewFrames[0], ...patch }) + '\n');
    probe.send(reviewFrames.map((f) => JSON.stringify(f)).join('\n') + '\n', 200);
    expect(probe.watch).toMatchObject({ first: null, second: null, protocol_error: true });
  });
  test('A38-06 includes an independent bare base64 pair file sample', () => {
    const samples = fixtures.SECRET_SAMPLES['B2-A38-06'];
    expect(samples.map((s: any) => s.example)).toEqual(['unregistered', 'documentation', 'unregistered-base64']);
    expect(fixtures.secretExample('unregistered-base64')).toBe(Buffer.from('other:other-pass').toString('base64'));
  });
  test.each(['unregistered', 'documentation', 'unregistered-base64'])('A38-06 file-only input %s never enters submitTurn', (example) => {
    const samples = fixtures.SECRET_SAMPLES['B2-A38-06'];
    const code = fs.readFileSync(path.join(__dirname, 'a9-batch2-driver-entry.cjs'), 'utf8');
    const start = code.indexOf('  async function p2RestoreSample('); const end = code.indexOf('  async function phase2Ordinary(', start);
    const body = code.slice(start, end);
    const sample = samples.find((s: any) => s.example === example); const secret = fixtures.secretExample(sample.example);
    const context: any = { p2: fixtures, p2Case: 'B2-A38-06', workspaceRoot: 'controlled-workspace', path,
      fs: { writeFileSync: jest.fn() }, p2File: () => digest('file'), p2Turn: jest.fn(async () => ({ turnId: 'turn-1' })),
      p2Call: async () => ({}), p2Files: () => [], p2Surfaces: async () => ({}), p2Projections: () => [], p2Array: (v: any) => Array.isArray(v) ? v : [],
      p2Bytes: (b: Buffer) => ({ size: b.length, sha256: H(b.toString()) }), p2Scan: async () => scan(), p2Materials: (v: any) => v,
      p2Observe: (r: any) => r, phase2Restore: () => true, phase2Scan: () => true, phase2Exact: () => true, phase2ExampleProjection: driver.phase2ExampleProjection, Buffer };
    vm.runInNewContext(body + '\nglobalThis.restore = p2RestoreSample;', context);
    return context.restore(sample).then(() => {
      expect(context.p2Turn).toHaveBeenCalledWith(`b2:fixed-${sample.id}`);
      expect(context.fs.writeFileSync.mock.calls[0][1].toString()).toBe(secret);
      const final = fixtures.phase2ProviderStep({ messages: [{ role: 'user', content: `b2:fixed-${sample.id}` }, { role: 'tool', content: 'changed' }] },
        { phase2Case: 'B2-A38-06', phase2Sample: sample.id, shellKind: 'cmd' });
      expect(final.content).toBe(example === 'unregistered-base64' ? `Authorization: Basic ${secret}` : secret);
    });
  });
  test('original 25 cases and all 43 assertions retain their exact serialized contract', () => {
    const old = fixtures.CASES.filter((c: any) => !fixtures.SECRET_CASE_IDS.includes(c.case_id));
    expect(old).toHaveLength(25); expect(old.reduce((sum: number, c: any) => sum + c.assertions.length, 0)).toBe(43);
    expect(H(JSON.stringify(old))).toBe('d4dea48b16626267f2310faabb5dd78b6db6018697417da1775116998649ade2');
  });
  test('fixed variants really exercise padding, URL-safe forms, Latin-1 and three file decoders', () => {
    const c = fixtures.secretCredentials(); const text = c.username + ':' + c.password;
    for (const material of ['utf8', 'latin1']) {
      const b64 = fixtures.secretForm(text, 'base64', material);
      expect(b64).toMatch(/=+$/); expect(fixtures.secretForm(text, 'base64-unpadded', material)).not.toContain('=');
      expect(fixtures.secretForm(text, 'base64url', material)).not.toMatch(/[+/]/);
    }
    expect(fixtures.secretForm(text, 'base64', 'utf8')).not.toBe(fixtures.secretForm(text, 'base64', 'latin1'));
    const gbk = fixtures.secretInputBytes(text, 'gbk'); expect(new util.TextDecoder('gbk', { fatal: true }).decode(gbk)).toBe('中文\n' + text);
    expect(() => new util.TextDecoder('utf-8', { fatal: true }).decode(gbk)).toThrow();
    for (const encoding of ['utf8', 'utf16le']) expect(new util.TextDecoder(encoding === 'utf8' ? 'utf-8' : 'utf-16le', { fatal: true }).decode(fixtures.secretInputBytes(text, encoding))).toBe(text);
  });
  test('new phase plans use only fixed samples and keep each restart immediately after its exited predecessor', () => {
    const plan = smoke.DRIVER_PLANS['p07-safe']; expect(plan[0]).toBe('safe_rules');
    expect(new Set(Object.values(smoke.PHASE2_MODES).map((s: any) => s.caseId))).toEqual(new Set(fixtures.SECRET_CASE_IDS));
    for (const [mode, spec] of Object.entries(smoke.PHASE2_MODES) as any) {
      if (spec.previous) expect(plan.indexOf(mode)).toBe(plan.indexOf(spec.previous) + 1);
      expect(spec).not.toHaveProperty('command'); expect(spec).not.toHaveProperty('script');
    }
    expect(() => fixtures.phase2ProviderStep({ messages: [] }, { phase2Case: 'B2-A37-02', phase2Sample: 'arbitrary command' })).toThrow('A9_39_PROVIDER_SAMPLE_UNKNOWN');
    expect(fixtures.SECRET_SAMPLES['B2-A37-04'].map((s: any) => s.expected)).toEqual(['secret_blocked', 'secret_blocked', 'decode_error', 'decode_error']);
  });
  test('stream evaluators require both surfaces and an actual pre-second-chunk preview', () => {
    for (const patch of [{ preview_at: 3 }, { second_chunk_at: null }, { preview_kind: 'inferred response' }, { preview_reads: 0 }, { restart_hits: 1 }]) {
      const facts = positive('B2-A38-05'); Object.assign(facts.rows[0], patch);
      expect(driver.evaluatePhase2Case('B2-A38-05', facts).status).toBe('FAIL');
    }
  });
});

describe('A9-39 phase 2 collection boundaries', () => {
  test('post-exit observations refuse an unknown stamp, wrong SID, failed listing and live instance', async () => {
    const sid = TARGET.account_sid; const stamp = '20261017000000.000000+000';
    const pre = { sid, wmic_failures: 0, tree: [{ pid: 999, created: stamp }] };
    const answer = (alive: boolean, fail = false) => (name: string) => ({ status: fail ? 1 : 0, error: fail ? 'unavailable' : null, stderr: '',
      stdout: name === 'wmic_processes' ? 'Node,ProcessId,ParentProcessId,Name,ExecutablePath,SessionId,CreationDate\n'
        + (alive ? `PC,999,1,electron.exe,C:\\electron.exe,5,${stamp}\n` : `PC,2,1,other.exe,C:\\other.exe,5,${stamp}\n`) : 'CommandLine=x\nProcessId=2\n' });
    expect((await smoke.phase2PostExit(pre, sid, answer(false), async () => {})).observed).toBe(true);
    expect((await smoke.phase2PostExit({ ...pre, tree: [{ pid: 999, created: '' }] }, sid, answer(false))).observed).toBe(false);
    expect((await smoke.phase2PostExit(pre, 'wrong SID', answer(false))).observed).toBe(false);
    expect((await smoke.phase2PostExit(pre, sid, answer(false, true))).observed).toBe(false);
    expect((await smoke.phase2PostExit(pre, sid, answer(true), async () => {})).reason).toBe('PROCESS_RESIDUE');
  });
  test('the run scanner covers new encoded credentials in SQLite bytes and UTF-16LE and keeps only the exact pre-registration input exception', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a939-scan-'));
    const c = fixtures.secretCredentials(); const value = fixtures.secretForm(c.username + ':' + c.password, 'base64', 'latin1');
    fs.writeFileSync(path.join(root, 'state.sqlite'), value, 'utf8');
    fs.writeFileSync(path.join(root, 'projection.json'), fixtures.secretForm(c.username + ':' + c.password, 'base64url'), 'utf16le');
    const input = path.join(root, 'secrets/a37-03/workspace/.agent_recovery/input'); fs.mkdirSync(path.dirname(input), { recursive: true });
    fs.writeFileSync(input, ['FUTURE', 'A939-RECOVERY-VALUE'].join('-'));
    const result = smoke.scanRun(root, fixtures.testOnlySecret());
    expect(result.phase2_controls_detected).toBe(true); expect(result.controlled_inputs).toHaveLength(1);
    expect(result.findings.map((r: any) => r.file).sort()).toEqual(['projection.json', 'state.sqlite']);
    fs.writeFileSync(input, ['FUTURE', 'A939-RECOVERY-VALUE'].join('-') + ' extra');
    const changed = smoke.scanRun(root, fixtures.testOnlySecret()); expect(changed.controlled_inputs).toHaveLength(0); expect(changed.findings).toHaveLength(3);
  });
  test('the real loopback fixture gates model chunk two and accepts only a fixed sample ID', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a939-http-')); const fixture = new smoke.ProviderFixture(path.join(root, 'requests.jsonl'));
    const port = await fixture.listen();
    const send = (pathname: string, body?: any) => new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port, path: pathname, method: body ? 'POST' : 'GET' }, (res) => {
        let text = ''; res.on('data', (chunk) => { text += chunk; }); res.on('end', () => resolve({ status: res.statusCode || 0, body: text }));
      }); req.on('error', reject); if (body) req.write(JSON.stringify(body)); req.end();
    });
    try {
      const invalid = await send('/__b2/state', { phase2Case: 'B2-A38-05', phase2Sample: 'free script', command: 'must never dispatch' });
      expect(invalid.status).toBe(400); expect(fixture.requestCount).toBe(0);
      const sample = fixtures.SECRET_SAMPLES['B2-A38-05'].find((s: any) => s.surface === 'model');
      expect((await send('/__b2/state', { phase2Case: 'B2-A38-05', phase2Sample: sample.id })).status).toBe(200);
      let firstResolve: () => void = () => {}; const first = new Promise<void>((resolve) => { firstResolve = resolve; });
      const response = new Promise<string>((resolve, reject) => {
        const req = http.request({ hostname: '127.0.0.1', port, path: '/v1/chat/completions', method: 'POST' }, (res) => {
          let text = ''; res.on('data', (chunk) => { text += chunk; firstResolve(); }); res.on('end', () => resolve(text));
        }); req.on('error', reject); req.end(JSON.stringify({ messages: [{ role: 'user', content: 'fixed streaming input' }] }));
      });
      await first; const before = JSON.parse((await send('/__b2/counters')).body);
      expect(before.phase2_stream).toMatchObject({ id: sample.id, second_chunk_at: null });
      expect((await send('/__b2/state', { phase2Release: sample.id })).status).toBe(200);
      expect(await response).toContain('[DONE]');
      const after = JSON.parse((await send('/__b2/counters')).body); expect(after.phase2_stream.second_chunk_at).toBeGreaterThanOrEqual(after.phase2_stream.first_chunk_at);
      expect((await send('/__b2/state', { phase2Release: sample.id })).status).toBe(400);
      const fixed = fixtures.phase2ProviderStep({ messages: [{ role: 'user', content: 'arbitrary user command' }] }, { phase2Case: 'B2-A37-02', phase2Sample: 's001', shellKind: 'cmd' });
      expect(fixed.tool.args.command).toBe('>dispatch-marker.txt echo DISPATCHED'); expect(fixed.tool.args.command).not.toContain('arbitrary');
    } finally { await fixture.close(); }
  });
});


test('A9-39 ordinary packaged modes derive identity from the candidate fixtures without the new-mode override', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a939-identity-')); fs.mkdirSync(path.join(root, 'validation'));
  fs.copyFileSync(path.join(releaseDir, 'a9-batch2-fixtures.cjs'), path.join(root, 'validation/a9-batch2-fixtures.cjs'));
  const candidate = process.env.A9_BATCH2_CANDIDATE_ROOT; const override = process.env.A9_BATCH2_FIXTURES;
  try { process.env.A9_BATCH2_CANDIDATE_ROOT = root; delete process.env.A9_BATCH2_FIXTURES;
    expect(driver.phase2Fixtures().CONTRACT.candidate).toBe(fixtures.CONTRACT.candidate);
  } finally {
    if (candidate === undefined) delete process.env.A9_BATCH2_CANDIDATE_ROOT; else process.env.A9_BATCH2_CANDIDATE_ROOT = candidate;
    if (override === undefined) delete process.env.A9_BATCH2_FIXTURES; else process.env.A9_BATCH2_FIXTURES = override;
  }
});

describe('ADR-0264 scoped cleanup authority', () => {
  const sid = 'S-1-5-21-1708701742-428676696-1831205153-1001';
  const stamp = (n = 0) => `202610230900${String(n).padStart(2, '0')}.123400+480`;
  const command = fixtures.shellCommand('cmd', { name: 'released-hold' });
  const args = `/d /s /c ${command}`;
  const image = 'C:\\Windows\\System32\\cmd.exe';
  const dirs: string[] = [];
  function row(pid: number, parent: number, exe: string, second = 0): any {
    return { ProcessId: String(pid), ParentProcessId: String(parent), Name: path.win32.basename(exe), ExecutablePath: exe,
      SessionId: '2', CreationDate: stamp(second) };
  }
  function harness(extras: any[] = [], patch: any = {}) {
    const attemptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-cleanup-TEST_ONLY-')); dirs.push(attemptDir);
    const root = patch.formal ? 'C:\\A9-W46\\run\\f01e\\run' : 'C:\\A9-DEV\\scoped-run';
    const candidate = patch.formal ? 'C:\\A9-W46\\run\\f01e\\deploy\\candidate' : 'C:\\A9-DEV\\candidate';
    const runtime = { electronPath: `${root}\\driver-electron\\electron.exe` };
    let rows = [row(90, 80, 'C:\\Windows\\System32\\services.exe'), row(100, 90, runtime.electronPath), ...extras];
    const commands = new Map<string, string>(rows.map((r: any) => [r.ProcessId, '']));
    const killed: number[] = []; let listingFailed = false;
    const ctx: any = { runId: 'test-run', phase: 'p05-session-bg', candidateRoot: candidate, runRoot: root, attemptDir,
      request: { target: { account_sid: sid, machine_name: 'DCCS-CHAIZL-PC', session_id: 2 } } };
    if (patch.formal) {
      ctx.request.expires_at = '2026-10-28T00:00:00.000Z';
      ctx.request.evidence_root = root;
      ctx.request.bindings = { source_commit: '9b385246a6fff911162e8effaf15a12de76903a8' };
    }
    if (patch.target) Object.assign(ctx.request.target, patch.target);
    const exec = (name: string) => {
      if (name === 'wmic_processes' && patch.onList) rows = patch.onList(rows);
      if (listingFailed) return { status: 1, stdout: '', error: 'TEST_ONLY' };
      if (name === 'wmic_processes') {
        const keys = ['CreationDate', 'ExecutablePath', 'Name', 'ParentProcessId', 'ProcessId', 'SessionId'];
        return { status: 0, stdout: `Node,${keys.join(',')}\r\n${rows.map((r: any) => `TEST_ONLY,${keys.map((k) => r[k]).join(',')}`).join('\r\n')}\r\n` };
      }
      return { status: 0, stdout: rows.map((r: any) => `CommandLine=${commands.get(r.ProcessId) || ''}\r\nProcessId=${r.ProcessId}\r\n\r\n`).join('') };
    };
    const facts = (r: any) => ({ ...smoke.cleanupIdentity({ ...r, ImagePath: r.ExecutablePath, ImageSource: 'executable_path' }), sid });
    const owner = (pid: number, expected?: any) => {
      const current = rows.find((r: any) => Number(r.ProcessId) === pid);
      if (!current) return { status: 'ALREADY_ENDED' };
      const identity = facts(current);
      if (expected) { if (!smoke.sameCleanupIdentity(expected, identity)) throw new Error('TEST_ONLY_IDENTITY_CHANGED'); killed.push(pid); rows = rows.filter((r: any) => Number(r.ProcessId) !== pid); if (patch.afterTerminate) rows = patch.afterTerminate(pid, rows); return { status: 'TERMINATED', identity }; }
      return { status: 'FACTS', identity };
    };
    const fixedCommand = fixtures.shellCommand(patch.kind || 'cmd', { name: patch.fixture || 'released-hold' });
    const fixedArgs = patch.kind === 'powershell' ? 'TEST_ONLY_FIXED_POWERSHELL_ARGS' : args;
    if (patch.phase) ctx.phase = patch.phase;
    const scope = smoke.createCleanupScope(ctx, runtime, patch.mode || 'release_exit', { exec, owner, pause: () => undefined, hostname: () => 'DCCS-CHAIZL-PC', invocation: () => ({ command: fixedCommand, args: fixedArgs }) });
    const binding = () => ({ schema_version: 1, run_id: ctx.runId, phase: ctx.phase, mode: patch.mode || 'release_exit', driver_pid: 100,
      fixture: patch.fixture || 'released-hold', shell_kind: patch.kind || 'cmd', command_sha256: crypto.createHash('sha256').update(fixedCommand).digest('hex'),
      call_id: patch.fixture === 'long-running' ? 'b2-unk-1' : 'b2-rel-1', tool_name: patch.fixture === 'long-running' ? 'shell' : 'start_process', turn_id: 'turn-TEST_ONLY', handle: patch.fixture === 'long-running' ? null : { handleId: 'handle-TEST_ONLY', pid: 300 }, root_pid: 300,
      instances: rows.filter((r: any) => [300, 301].includes(Number(r.ProcessId))).map(facts) });
    const writeBinding = (b = binding()) => fs.writeFileSync(path.join(attemptDir, `${patch.mode || 'release_exit'}-cleanup-binding.json`), JSON.stringify(b));
    return { ctx, scope, runtime, owner, exec, commands, killed, binding, writeBinding, facts, fixedArgs,
      rows: () => rows, setRows: (r: any[]) => { rows = r; }, failListing: () => { listingFailed = true; } };
  }
  afterAll(() => { for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true }); });
  test('terminates bound root instances individually, leaves directly identified environment processes alive', () => {
    const h = harness([row(200, 100, 'C:\\A9-DEV\\candidate\\spike02_helper.exe', 1), row(400, 100, 'C:\\Program Files (x86)\\SogouInput\\16.7.0.4673\\SGTool.exe', 1)]);
    h.scope.bind(100); h.scope.terminate(100, true); expect(h.killed).toEqual([200, 100]); expect(h.rows().map((r: any) => r.ProcessId)).toEqual(['90', '400']);
  });
  test.each([
    ['unknown outside descendant', row(400, 100, 'C:\\Windows\\System32\\calc.exe', 1), 'TARGET_NOT_AUTHORIZED'],
    ['unbound system shell', row(300, 100, image, 1), 'TARGET_NOT_AUTHORIZED'],
    ['job closure would reclaim an environment process', row(400, 200, 'C:\\Program Files (x86)\\SogouInput\\16.7.0.4673\\SGTool.exe', 2), 'JOB_SCOPE_UNKNOWN'],
  ])('%s rejects the whole termination before any attempt', (_label, extra, error) => {
    const h = harness([row(200, 100, 'C:\\A9-DEV\\candidate\\spike02_helper.exe', 1), extra]);
    h.scope.bind(100); expect(() => h.scope.terminate(100, true)).toThrow(error); expect(h.killed).toEqual([]);
  });
  test.each([{ account_sid: 'wrong' }, { session_id: 3 }, { session_id: '2' }, { machine_name: 'other' }])('wrong target refuses admission %j', (target) => {
    const h = harness([], { target }); expect(() => h.scope.bind(100)).toThrow('AUTHORITY_MISMATCH'); expect(h.killed).toEqual([]);
  });
  test('query failure does not prove absence or authorize cleanup', () => { const h = harness(); h.scope.bind(100); h.failListing(); expect(() => h.scope.terminate(100, true)).toThrow('LISTING_UNKNOWN'); expect(h.killed).toEqual([]); });
  test.each(['20260230090000.000000+480', '20261023090000.000000+480\n', '', 'unknown'])('invalid creation identity is refused: %j', (created) => {
    const h = harness(); h.rows().find((r: any) => r.ProcessId === '100').CreationDate = created; expect(() => h.scope.bind(100)).toThrow(/DRIVER_NOT_BOUND|LISTING_UNKNOWN/); expect(h.killed).toEqual([]);
  });
  test.each(['C:\\A9-DEV\\x\\..\\driver-electron\\electron.exe', 'C:\\A9-DEV\\x\\electron.exe:stream', '\\\\?\\C:\\A9-DEV\\x\\electron.exe'])('non-canonical direct image is refused: %s', (exe) => {
    expect(smoke.cleanupIdentity({ ...row(100, 90, exe), ImagePath: exe, ImageSource: 'executable_path' })).toBeNull();
  });
  function released() {
    const h = harness([row(200, 100, 'C:\\A9-DEV\\candidate\\spike02_helper.exe', 1), row(300, 200, image, 2), row(301, 300, 'C:\\Windows\\System32\\PING.EXE', 3)]);
    h.commands.set('300', `${image} ${args}`); h.commands.set('301', 'ping -n 2 127.0.0.1'); h.scope.bind(100); h.writeBinding(); return h;
  }
  test('release binding is checked before dialog, then the exact released root and child can be removed after driver exit', () => {
    const h = released(); h.scope.observeBinding(); h.setRows(h.rows().filter((r: any) => !['100', '200'].includes(r.ProcessId)));
    h.scope.terminate(300, false); h.scope.terminate(301, false); expect(h.killed).toEqual([300, 301]);
  });
  test.each(['run_id', 'phase', 'mode', 'call_id', 'command_sha256', 'turn_id'])('wrong or missing %s cannot authorize system processes', (field) => {
    const h = released(); const b: any = h.binding(); b[field] = field === 'turn_id' ? '' : 'wrong'; h.writeBinding(b);
    expect(() => h.scope.observeBinding()).toThrow('BINDING_MISMATCH'); expect(h.killed).toEqual([]);
  });
  test('a system path alone and a forged command digest do not prove the actual command', () => {
    const h = released(); h.commands.set('300', `${image} /d /s /c echo unrelated`); expect(() => h.scope.observeBinding()).toThrow('BOUND_PROCESS_MISMATCH'); expect(h.killed).toEqual([]);
  });
  test('the command handle must bind the actual command root', () => { const h = released(); const b = h.binding(); b.handle!.pid = 301; h.writeBinding(b); expect(() => h.scope.observeBinding()).toThrow('BINDING_MISMATCH'); expect(h.killed).toEqual([]); });
  test('a changed binding cannot replace a previously observed instance', () => { const h = released(); h.scope.observeBinding(); const b = h.binding(); b.turn_id = 'replacement'; h.writeBinding(b); expect(() => h.scope.terminate(300, false)).toThrow('BINDING_CHANGED'); expect(h.killed).toEqual([]); });
  test('PID reuse remains refused even with an unchanged earlier binding', () => { const h = released(); h.scope.observeBinding(); h.rows().find((r: any) => r.ProcessId === '300').CreationDate = stamp(9); expect(() => h.scope.terminate(300, false)).toThrow('PARENT_IDENTITY_CHANGED'); expect(h.killed).toEqual([]); });
  test('new PING is bound below the still-identical fixed command; another shell descendant is refused', () => {
    const h = released(); h.scope.observeBinding(); h.setRows([...h.rows().filter((r: any) => r.ProcessId !== '301'), row(302, 300, 'C:\\Windows\\System32\\PING.EXE', 4)]); h.commands.set('302', 'ping -n 2 127.0.0.1');
    h.scope.terminate(302, false); expect(h.killed).toEqual([302]);
    h.setRows([...h.rows(), row(303, 300, image, 5)]); h.commands.set('303', `${image} /c echo other`);
    expect(() => h.scope.terminate(300, false)).toThrow('PING_NOT_BOUND'); expect(h.killed).toEqual([302]);
  });
  test.each([0, 1])('orphan PING first observed %i samples after CMD termination is bound and removed', (delay) => {
    let parentGone = false; let samples = 0;
    const h = harness([row(200, 100, 'C:\\A9-DEV\\candidate\\spike02_helper.exe', 1), row(300, 200, image, 2)], {
      afterTerminate: (pid: number, rows: any[]) => { if (pid === 300) parentGone = true; return rows; },
      onList: (rows: any[]) => parentGone && samples++ === delay ? [...rows, row(302, 300, 'C:\\Windows\\System32\\PING.EXE', 4)] : rows,
    });
    h.commands.set('300', `${image} ${args}`); h.commands.set('302', 'ping -n 2 127.0.0.1'); h.scope.bind(100); h.writeBinding(); h.scope.observeBinding();
    h.scope.terminate(300, false); expect(h.killed).toEqual([300, 302]);
  });
  test('unknown orphan after command exit blocks instead of becoming a clean round', () => {
    const h = harness([row(200, 100, 'C:\\A9-DEV\\candidate\\spike02_helper.exe', 1), row(300, 200, image, 2)], {
      afterTerminate: (pid: number, rows: any[]) => pid === 300 ? [...rows, row(399, 300, 'C:\\Windows\\System32\\calc.exe', 4)] : rows,
    });
    h.commands.set('300', `${image} ${args}`); h.scope.bind(100); h.writeBinding(); h.scope.observeBinding();
    expect(() => h.scope.terminate(300, false)).toThrow('PING_NOT_BOUND'); expect(h.killed).toEqual([300]);
  });
  test('helper is never closed with a newly observed unknown job descendant', () => {
    const h = harness([row(200, 100, 'C:\\A9-DEV\\candidate\\spike02_helper.exe', 1), row(300, 200, image, 2)], {
      afterTerminate: (pid: number, rows: any[]) => pid === 300 ? [...rows, row(399, 200, 'C:\\Windows\\System32\\calc.exe', 4)] : rows,
    });
    h.commands.set('300', `${image} ${args}`); h.scope.bind(100); h.writeBinding(); h.scope.observeBinding();
    expect(() => h.scope.terminate(100, true)).toThrow('JOB_NOT_EMPTY'); expect(h.killed).toEqual([300]);
  });
  test('WMI worker uses two fresh reads, full expected identity and only single-instance Terminate', () => {
    const h = harness(); const identity = h.facts(h.rows().find((r: any) => r.ProcessId === '100')); const spawn = jest.fn((_file, argv) => {
      const script = Buffer.from(argv[argv.length - 1], 'base64').toString('utf16le');
      expect((script.match(/Get-WmiObject Win32_Process/g) || []).length).toBe(2); expect(script).toContain('GetOwnerSid'); expect(script).toContain('$p.Terminate()'); expect(script).not.toContain('taskkill');
      return { status: 0, stdout: `TERMINATED|100|90|2|electron.exe|${identity.image}|${identity.created}|${sid}\r\n` };
    });
    expect(smoke.cleanupWmi(100, identity, spawn).status).toBe('TERMINATED'); expect(spawn).toHaveBeenCalledTimes(1);
    expect(() => smoke.cleanupWmi(true, identity, spawn)).toThrow('PID_INVALID');
    expect(() => smoke.cleanupWmi(100, identity, () => ({ status: 0, stdout: '' }))).toThrow('WMI_UNKNOWN');
    expect(() => smoke.cleanupWmi(100, identity, () => ({ status: 1, stdout: '' }))).toThrow('WMI_FAILED');
  });
  function crashCase(extra: any = {}, children: any[] = []) {
    const ps = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
    const h = harness([row(200, 100, 'C:\\A9-DEV\\candidate\\resources\\native\\runner\\spike02_helper.exe', 1), row(300, 200, ps, 2), ...children], {
      mode: 'continue_unknown_interrupt', phase: 'p06-continue', fixture: 'long-running', kind: 'powershell',
      afterTerminate: (pid: number, rows: any[]) => pid === 100 ? rows.filter((r: any) => !['200', '300'].includes(r.ProcessId)) : rows, ...extra,
    });
    h.commands.set('300', `${ps} ${h.fixedArgs}`); h.scope.bind(100); h.writeBinding(); h.scope.observeBinding(); return h;
  }
  test('crash interruption ends GUI first and only observes the bound PowerShell/job; product cannot persist tool_end first', () => {
    let persistedToolEnd = false;
    const h = crashCase({ afterTerminate: (pid: number, rows: any[]) => {
      if (pid === 300 && rows.some((r: any) => r.ProcessId === '100')) persistedToolEnd = true;
      return pid === 100 ? rows.filter((r: any) => !['200', '300'].includes(r.ProcessId)) : rows;
    } });
    h.scope.terminate(100, true, 'marker'); expect(h.killed).toEqual([100]); expect(persistedToolEnd).toBe(false);
    const events = fs.readFileSync(path.join(h.ctx.attemptDir, 'continue_unknown_interrupt-cleanup-events.jsonl'), 'utf8');
    expect(events).toContain('CRASH_INDIRECT_JOB_AUTHORIZED'); expect(events).toContain('CRASH_JOB_NATURAL_EXIT');
  });
  test('unobserved job exit stops after the GUI; no fallback terminates the system fixture or helper', () => {
    const h = crashCase({ afterTerminate: (_pid: number, rows: any[]) => rows });
    expect(() => h.scope.terminate(100, true, 'marker')).toThrow('CRASH_JOB_EXIT_UNKNOWN'); expect(h.killed).toEqual([100]);
  });
  test('unexpected descendant in the prospective job refuses before the first termination', () => {
    const h = crashCase({}, [row(400, 200, 'C:\\Program Files (x86)\\SogouInput\\16.7.0.4673\\SGTool.exe', 3)]);
    expect(() => h.scope.terminate(100, true, 'marker')).toThrow(/JOB_SCOPE_UNKNOWN|CRASH_JOB_NOT_CLOSED/); expect(h.killed).toEqual([]);
  });
  test('an extra child after the GUI exit is UNKNOWN, never an implicitly authorized job member', () => {
    const h = crashCase({ afterTerminate: (pid: number, rows: any[]) => pid === 100 ? [...rows, row(400, 300, 'C:\\Windows\\System32\\PING.EXE', 4)] : rows });
    expect(() => h.scope.terminate(100, true, 'marker')).toThrow('CRASH_NEW_JOB_MEMBER'); expect(h.killed).toEqual([100]);
  });
  test('PID reuse after GUI interruption fails instead of terminating the replacement', () => {
    const h = crashCase({ afterTerminate: (pid: number, rows: any[]) => pid === 100 ? rows.map((r: any) => r.ProcessId === '300' ? { ...r, CreationDate: stamp(5) } : r) : rows });
    expect(() => h.scope.terminate(100, true, 'marker')).toThrow('CRASH_IDENTITY_CHANGED'); expect(h.killed).toEqual([100]);
  });
  test('dynamic CMD crash interruption stays closed even when a fixed command is otherwise bound', () => {
    const h = harness([row(200, 100, 'C:\\A9-DEV\\candidate\\resources\\native\\runner\\spike02_helper.exe', 1), row(300, 200, image, 2)],
      { mode: 'continue_unknown_interrupt', phase: 'p06-continue', fixture: 'long-running', kind: 'cmd' });
    h.commands.set('300', `${image} ${h.fixedArgs}`); h.scope.bind(100); h.writeBinding(); h.scope.observeBinding();
    expect(() => h.scope.terminate(100, true, 'marker')).toThrow('CRASH_PROFILE_NOT_CLOSED'); expect(h.killed).toEqual([]);
  });
  test('cleanup WMI cannot start an unbound system PowerShell worker', () => {
    expect(() => smoke.cleanupWmi(100, undefined, childProcess.spawnSync, undefined)).toThrow('WORKER_NOT_BOUND');
    const source = fs.readFileSync(path.join(releaseDir, 'a9-batch2-smoke.cjs'), 'utf8');
    expect(source).toContain("copyRuntimeFile(systemPowerShell, cleanupPowerShell)");
    expect(source).toContain("runtime.cleanupPowerShell = prepareCleanupWorker(runtime)");
    expect(source).toContain('A9_BATCH2_CLEANUP_POWERSHELL: runtime.cleanupPowerShell');
  });
  test('launch refusal is bounded, preserves unknown cleanup and never calls a raw kill fallback', async () => {
    jest.useFakeTimers(); const raw = jest.spyOn(process, 'kill');
    const child: any = new EventEmitter(); child.pid = 111; child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.unref = jest.fn(); child.stdout.unref = jest.fn(); child.stderr.unref = jest.fn();
    try {
      const waiting = smoke.launchDriver({ electronPath: 'TEST_ONLY', appRoot: 'TEST_ONLY' }, {}, { timeoutMs: 1000 }, () => child);
      jest.advanceTimersByTime(1000); expect(await waiting).toMatchObject({ code: null, killed_by: 'timeout', cleanup_error: 'A9_BATCH2_CLEANUP_SCOPE_REQUIRED' });
      expect(raw).not.toHaveBeenCalled(); expect(child.unref).toHaveBeenCalled();
    } finally { raw.mockRestore(); jest.useRealTimers(); }
  });
  test.each(['release_exit', 'continue_unknown_interrupt'])('formal root admits %s and terminates only the bound fixture instances', (mode) => {
    const h = harness([row(200, 100, 'C:\\A9-W46\\run\\f01e\\deploy\\candidate\\spike02_helper.exe', 1), row(300, 200, image, 2)], { formal: true, mode });
    h.commands.set('300', `${image} ${h.fixedArgs}`); h.scope.bind(100); h.writeBinding(); h.scope.observeBinding();
    h.scope.terminate(300, false); expect(h.killed).toEqual([300]);
  });
  test.each(['release_exit', 'continue_unknown_interrupt'])('formal root %s refuses an unbound system shell even when the driver is bound', (mode) => {
    const h = harness([row(200, 100, 'C:\\A9-W46\\run\\f01e\\deploy\\candidate\\spike02_helper.exe', 1), row(300, 100, image, 1)], { formal: true, mode });
    h.commands.set('300', `${image} /d /s /c echo unrelated`); h.scope.bind(100); h.writeBinding();
    expect(() => h.scope.observeBinding()).toThrow('BOUND_PROCESS_MISMATCH'); expect(h.killed).toEqual([]);
  });
});
