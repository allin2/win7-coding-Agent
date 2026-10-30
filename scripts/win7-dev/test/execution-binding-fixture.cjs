'use strict';

const authority = require('../../release/validation/win7-alpha3/authority.cjs');
const RUN_ID = '3f1c2a52-6b0e-4c1e-9f5e-0d7b8a1c2e44';
const sha = value => authority.sha256(Buffer.from(value, 'utf8'));

function bytes(evidenceClass = 'DEV_CHANNEL') {
  return Buffer.from(`${JSON.stringify({
    schema_version: 1,
    kind: 'WIN7_56_EXECUTION_BINDING',
    evidence_class: evidenceClass,
    run_id: RUN_ID,
    formal_input_lock_sha256: sha('lock'),
    approval_registry: { commit: sha('registry-commit').slice(0, 40), sha256: sha('registry') },
    candidate: {
      source_commit: sha('source').slice(0, 40),
      package_sha256: sha('package'),
      manifest_sha256: sha('manifest'),
      kit_sha256: sha('kit'),
      helper_sha256: sha('helper'),
    },
    target: { machine_name: 'TEST-ONLY-HOST', account_sid: 'S-1-5-21-1-2-3-1001' },
  }, null, 2)}\n`, 'utf8');
}

module.exports = {
  RUN_ID,
  sha,
  bytes,
  source_commit: sha('source').slice(0, 40),
  package_sha256: sha('package'),
  manifest_sha256: sha('manifest'),
  helper_sha256: sha('helper'),
};

// A committed synthetic repository for source-provenance tests; product src stays fixed.
function committedSource(entry) {
  const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a943-committed-source-'));
  require('../a9-42-office-journey.cjs').copyDriverClosure(root, entry);
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src/main.ts'), 'export const fixed = true;\n');
  const git = args => cp.execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
  git(['init', '--quiet']); git(['add', '--', 'src', 'scripts']);
  git(['-c','user.name=A9 Fixture','-c','user.email=a9-fixture@example.invalid','-c','commit.gpgsign=false',
    'commit','--quiet','-m','synthetic closure fixture']);
  const commit = git(['rev-parse','HEAD']).trim();
  return { root, commit, git, bytes(evidenceClass = 'DEV_CHANNEL') {
    const value = JSON.parse(bytes(evidenceClass)); value.candidate.source_commit = commit;
    return Buffer.from(JSON.stringify(value) + '\n');
  } };
}
module.exports.committedSource = committedSource;
