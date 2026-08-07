'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const kitRoot = path.resolve(__dirname, '..');
const result = spawnSync('npm', ['audit', '--package-lock-only', '--json', '--registry=https://registry.npmjs.org'], {
  cwd: path.join(kitRoot, 'tooling'),
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024
});

if (!result.stdout || !result.stdout.trim().startsWith('{')) {
  process.stderr.write(result.stderr || 'npm audit did not return JSON\n');
  process.exit(2);
}

const report = JSON.parse(result.stdout);
report._project_capture = {
  captured_at: new Date().toISOString(),
  registry: 'https://registry.npmjs.org',
  scope: 'Win10 build-host npm tooling only',
  npm_exit_code: result.status
};
fs.mkdirSync(path.join(kitRoot, 'compliance'), { recursive: true });
fs.writeFileSync(path.join(kitRoot, 'compliance', 'npm-audit.json'), JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify(report.metadata && report.metadata.vulnerabilities || {}) + '\n');
