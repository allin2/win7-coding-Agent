import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/** Copy the separately locked, optional JS closure without linking build-host dependencies. */
export function copyOfficeLiteRuntime(root, appRoot, copyDirectory) {
  const source = path.join(root, 'src/shell/office-lite');
  if (!fs.existsSync(path.join(source, 'package.json'))) return [];
  const lockBytes = fs.readFileSync(path.join(source, 'package-lock.json'));
  const evidenceBytes = fs.readFileSync(path.join(source, 'DEPENDENCIES.json'));
  const lock = JSON.parse(lockBytes);
  const evidence = JSON.parse(evidenceBytes);
  const digest = value => crypto.createHash('sha256').update(value).digest('hex');
  if (digest(lockBytes) !== evidence.lockSha256) throw new Error('OFFICE_LOCK_MISMATCH');
  const destination = path.join(appRoot, 'office-lite');
  fs.mkdirSync(destination, { recursive: true });
  for (const name of ['package.json', 'package-lock.json', 'DEPENDENCIES.json']) {
    fs.copyFileSync(path.join(source, name), path.join(destination, name));
  }
  const result = [];
  const copied = new Map(), omitted = new Map();
  if (evidence.packages.length !== Object.keys(lock.packages).length - 1) throw new Error('OFFICE_DEPENDENCY_EVIDENCE_MISSING');
  for (const [relative, entry] of Object.entries(lock.packages)) {
    if (!relative) continue;
    if (!/^node_modules\//.test(relative) || relative.split('/').includes('..')) throw new Error('OFFICE_DEPENDENCY_PATH_INVALID');
    const directory = path.join(source, relative);
    const bytes = fs.readFileSync(path.join(directory, 'package.json'));
    const manifest = JSON.parse(bytes);
    if (manifest.version !== entry.version) throw new Error('OFFICE_DEPENDENCY_VERSION_MISMATCH');
    const expected = evidence.packages.find(item => item.path === relative && item.version === entry.version && item.integrity === entry.integrity);
    if (!expected) throw new Error('OFFICE_DEPENDENCY_EVIDENCE_MISSING');
    if (!manifest.license || !expected.license || manifest.license !== expected.license) throw new Error('OFFICE_DEPENDENCY_LICENSE_MISSING');
    if (relative === 'node_modules/docx' && (manifest.version !== '8.0.0' || manifest.main !== 'build/index.js')) throw new Error('OFFICE_DOCX_EXCLUSION_UNCONFIRMED');
    const actualFiles = [];
    function verify(directoryPath, prefix = '') {
      for (const file of fs.readdirSync(directoryPath, { withFileTypes: true })) {
        const name = path.posix.join(prefix, file.name);
        if (file.isSymbolicLink()) throw new Error('OFFICE_DEPENDENCY_SYMLINK');
        if (file.isDirectory()) verify(path.join(directoryPath, file.name), name);
        else if (file.isFile()) {
          const bound = expected.files.find(item => item.path === name);
          if (!bound || digest(fs.readFileSync(path.join(directoryPath, file.name))) !== bound.sha256) throw new Error('OFFICE_DEPENDENCY_HASH_MISMATCH');
          actualFiles.push(name);
        } else throw new Error('OFFICE_DEPENDENCY_SPECIAL_FILE');
      }
    }
    verify(directory);
    if (actualFiles.length !== expected.files.length) throw new Error('OFFICE_DEPENDENCY_FILE_MISSING');
    for (const file of expected.files) {
      const identity = { path: `${relative}/${file.path}`, sha256: file.sha256 };
      const exclude = relative === 'node_modules/docx' &&
        (/^src\/.+\.ts$/.test(file.path) || /^build\/.+\.d\.ts$/.test(file.path));
      if (exclude) omitted.set(identity.path, { ...identity, reason: 'docx 8.0.0 TypeScript source or declaration; runtime entry is build/index.js' });
      else {
        const target = path.join(destination, relative, file.path);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(directory, file.path), target);
        if (digest(fs.readFileSync(target)) !== file.sha256) throw new Error('OFFICE_DEPENDENCY_COPY_MISMATCH');
        const previous = copied.get(identity.path);
        if (previous && previous.sha256 !== identity.sha256) throw new Error('OFFICE_DEPENDENCY_EVIDENCE_CONFLICT');
        copied.set(identity.path, identity);
      }
    }
    result.push({ name: `office-lite/${relative.slice(13)}`, version: manifest.version,
      optionalModule: 'office-lite', license: manifest.license || 'UNKNOWN', package_json_sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
  }
  fs.writeFileSync(path.join(destination, 'DELIVERY_MANIFEST.json'), JSON.stringify({
    schemaVersion: 1, lockSha256: digest(lockBytes), dependenciesSha256: digest(evidenceBytes),
    copied: [...copied.values()], omitted: [...omitted.values()],
  }, null, 2) + '\n');
  return result;
}
