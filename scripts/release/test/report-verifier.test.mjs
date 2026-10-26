import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const reference = require('../../../release/win7-product-v3/a9-win7-42-report.cjs');
const { createReportVerifier, VERSION } = require('../validation/report-verifier.cjs');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const clone = (value) => JSON.parse(JSON.stringify(value));
const directory = mkdtempSync(join(tmpdir(), 'report-verifier-中文 空格-'));
const toolBytes = readFileSync(new URL('../validation/report-verifier.cjs', import.meta.url));
writeFileSync(join(directory, 'verifier.cjs'), toolBytes);
writeFileSync(join(directory, 'evidence.txt'), 'synthetic offline evidence', 'utf8');
const evidence = readFileSync(join(directory, 'evidence.txt'));
const identity = { candidate_label: 'WIN7-42', candidate_id: 'synthetic-only', source_commit: 'a'.repeat(40),
  package_sha256: 'b'.repeat(64), candidate_manifest_sha256: 'c'.repeat(64) };
const configuration = { schema_version: 1, candidate_label: 'WIN7-42', kit_id: reference.KIT_ID,
  report_kind: reference.REPORT_KIND, case_ids: [...reference.EXPECTED_CASES],
  result_on_complete: 'SYNTHETIC_TEST_ONLY', tools: [{ path: 'verifier.cjs', version: VERSION, sha256: hash(toolBytes) }] };
const kit = { schema_version: 1, kit_id: reference.KIT_ID, candidate_label: 'WIN7-42',
  scope: { result_on_complete: configuration.result_on_complete },
  required_cases: configuration.case_ids.map((case_id) => ({ case_id, assertions: [{ assertion_id: 'check-1' }] })) };
const report = { schema_version: 1, report_kind: reference.REPORT_KIND, candidate: identity, status: 'PASS',
  results: kit.required_cases.map(({ case_id }) => ({ case_id, status: 'PASS', executions: [{ candidate: identity,
    run_id: 'offline-0001', environment: { os: 'Windows 7 SP1 build 7601', architecture: 'x64',
      user: 'ordinary-user', elevation: 'not-elevated', electron: '22.3.27', electron_abi: 110 },
    assertions: [{ assertion_id: 'check-1', status: 'PASS' }],
    evidence: [{ path: 'evidence.txt', sha256: hash(evidence), bytes: evidence.length }] }] })) };
const verifier = createReportVerifier(configuration, directory);
const verify = (input, inputKit = kit) => verifier.verifyReport(input, inputKit, identity, directory, fs);
const oldVerify = (input, inputKit = kit) => reference.verifyReport(input, inputKit, identity, directory, fs);

test.after(() => rmSync(directory, { recursive: true, force: true }));
test('pilot preserves W42 complete, pending and failed report summaries', () => {
  assert.deepEqual(verify(report), oldVerify(report));
  assert.deepEqual(verifier.verifyReport(report, kit, identity, directory), oldVerify(report));
  for (const status of ['FAIL', 'NOT_PERFORMED', 'EVIDENCE_PENDING']) {
    const input = clone(report);
    input.results[0].status = status;
    input.results[0].executions = [];
    input.status = status === 'FAIL' ? 'FAIL' : 'EVIDENCE_PENDING';
    assert.deepEqual(verify(input), oldVerify(input));
  }
});

const mutations = {
  'missing case': (input) => input.results.pop(),
  'duplicate case': (input) => { input.results[1].case_id = input.results[0].case_id; },
  'wrong candidate': (input) => { input.candidate.package_sha256 = 'd'.repeat(64); },
  'wrong report kind': (input) => { input.report_kind = 'OTHER'; },
  'unknown schema': (input) => { input.schema_version = 2; },
  'unknown case status': (input) => { input.results[0].status = 'UNKNOWN'; },
  'false overall PASS': (input) => { input.results[0].status = 'NOT_PERFORMED'; },
  'PASS without execution': (input) => { input.results[0].executions = []; },
  'wrong execution identity': (input) => { input.results[0].executions[0].candidate.source_commit = 'd'.repeat(40); },
  'bad run id': (input) => { input.results[0].executions[0].run_id = '../escape'; },
  'admin environment': (input) => { input.results[0].executions[0].environment.user = 'administrator'; },
  'wrong OS': (input) => { input.results[0].executions[0].environment.os = 'Windows 10'; },
  'missing assertion': (input) => { input.results[0].executions[0].assertions = []; },
  'duplicate assertion': (input) => { input.results[0].executions[0].assertions.push({ assertion_id: 'check-1', status: 'PASS' }); },
  'failed assertion': (input) => { input.results[0].executions[0].assertions[0].status = 'FAIL'; },
  'missing attachment': (input) => { input.results[0].executions[0].evidence[0].path = 'missing.txt'; },
  'wrong hash': (input) => { input.results[0].executions[0].evidence[0].sha256 = '0'.repeat(64); },
  'wrong size': (input) => { input.results[0].executions[0].evidence[0].bytes += 1; },
  'path escape': (input) => { input.results[0].executions[0].evidence[0].path = '../outside.txt'; },
  'secret field': (input) => { input.password = 'synthetic'; },
  'secret value': (input) => { input.note = 'Bearer synthetic-secret-test'; },
};
for (const [name, mutate] of Object.entries(mutations)) {
  test(`W42 equivalence rejects ${name}`, () => {
    const input = clone(report); mutate(input);
    assert.throws(() => oldVerify(input));
    assert.throws(() => verify(input));
  });
}
test('wrong kit and missing required kit cases rejected by both validators', () => {
  for (const change of [(input) => { input.kit_id = 'OTHER'; }, (input) => input.required_cases.pop()]) {
    const input = clone(kit); change(input);
    assert.throws(() => oldVerify(report, input));
    assert.throws(() => verify(report, input));
  }
});
test('configuration, tool hash and completion are immutable admission requirements', () => {
  for (const change of [(input) => { input.schema_version = 2; },
    (input) => { input.disable_identity = true; }, (input) => input.case_ids.push(input.case_ids[0]),
    (input) => { input.tools = []; }, (input) => { input.tools[0].sha256 = '0'.repeat(64); },
    (input) => input.tools.push(input.tools[0])]) {
    const input = clone(configuration); change(input);
    assert.throws(() => createReportVerifier(input, directory));
  }
  const mutable = clone(configuration);
  const admitted = createReportVerifier(mutable, directory);
  mutable.case_ids.length = 0;
  assert.deepEqual(admitted.verifyReport(report, kit, identity, directory, fs), verify(report));
  const changed = clone(kit); changed.scope.result_on_complete = 'OTHER';
  assert.throws(() => verify(report, changed), /REPORT_COMPLETION_MISMATCH/);
});
test('candidate parameters are reusable without changing Win7 environment gates', () => {
  const config = clone(configuration); config.candidate_label = 'OFFLINE-NEXT'; config.kit_id = 'NEXT-KIT';
  config.report_kind = 'NEXT-REPORT'; config.case_ids = ['NEXT-01'];
  const inputKit = clone(kit); inputKit.candidate_label = config.candidate_label; inputKit.kit_id = config.kit_id;
  inputKit.required_cases = [{ case_id: 'NEXT-01', assertions: [{ assertion_id: 'check-1' }] }];
  const input = clone(report); input.report_kind = config.report_kind; input.candidate.candidate_label = config.candidate_label;
  input.results.length = 1; input.results[0].case_id = 'NEXT-01';
  input.results[0].executions[0].candidate.candidate_label = config.candidate_label;
  const next = createReportVerifier(config, directory);
  assert.equal(next.verifyReport(input, inputKit, input.candidate, directory, fs).status, 'PASS');
  input.results[0].executions[0].environment.elevation = 'elevated';
  assert.throws(() => next.verifyReport(input, inputKit, input.candidate, directory, fs));
});
test('physical evidence path cannot escape via symlink or junction', () => {
  const outside = mkdtempSync(join(tmpdir(), 'report-outside-'));
  try {
    writeFileSync(join(outside, 'file.txt'), evidence);
    symlinkSync(outside, join(directory, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    const input = clone(report); input.results[0].executions[0].evidence[0].path = 'linked/file.txt';
    assert.throws(() => verify(input), /REPORT_EVIDENCE_REALPATH_ESCAPE/);
  } finally { rmSync(outside, { recursive: true, force: true }); }
});
