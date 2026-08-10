'use strict';

const assert = require('assert');
const { CASE_IDS, SUITE, canonicalJson, parseArgs } = require('../runner-win7-harness');

assert.deepStrictEqual(CASE_IDS, ['L01', 'L02', 'L03', 'L04', 'L05', 'L06', 'L07', 'L08', 'L09', 'L10']);
assert.strictEqual(SUITE, 'NATIVE_RUNNER_L01_L10');
assert.strictEqual(canonicalJson({ z: 1, a: { d: 2, c: 1 } }), '{"a":{"c":1,"d":2},"z":1}\n');
const parsed = parseArgs([
  '--acceptance-id', 'D013-RUNNER-20260811-010000', '--lease', 'lease.json', '--signature', 'lease.sig',
  '--public-key', 'public.pem', '--package-manifest', 'manifest.json', '--package-manifest-sha256', 'a'.repeat(64),
  '--source-commit', 'b'.repeat(40), '--out', 'result.json',
]);
assert.strictEqual(parsed.acceptanceId, 'D013-RUNNER-20260811-010000');
assert.throws(() => parseArgs([]), /required/);
process.stdout.write('runner-harness-tests: ALL PASS\n');
