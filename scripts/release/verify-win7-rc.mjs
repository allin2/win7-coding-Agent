#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyReleaseZip } from './release-contract.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');

try {
  const [zipPath, sidecarPath] = process.argv.slice(2);
  if (!zipPath || !sidecarPath || process.argv.length !== 4) {
    throw new Error('USAGE:verify-win7-rc.mjs <zip> <zip.sha256>');
  }
  const result = verifyReleaseZip(
    path.resolve(zipPath),
    path.resolve(sidecarPath),
    path.join(repositoryRoot, 'release', 'win7-rc', 'rc-input-lock.json'),
  );
  process.stdout.write(`${JSON.stringify({
    schema_version: 1,
    status: 'PASS',
    zip_sha256: result.zip_sha256,
    file_count: result.file_count,
    native_file_count: result.native_file_count,
    source_commit: result.source_commit,
    gates: result.gates,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`RC_VERIFY_FAILED:${error && error.message ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
