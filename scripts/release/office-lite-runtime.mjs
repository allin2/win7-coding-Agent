import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/** Copy the separately locked, optional JS closure without linking build-host dependencies. */
export function copyOfficeLiteRuntime(root, appRoot, copyDirectory) {
  const source = path.join(root, 'src/shell/office-lite');
  if (!fs.existsSync(path.join(source, 'package.json'))) return [];
  const lock = JSON.parse(fs.readFileSync(path.join(source, 'package-lock.json'), 'utf8'));
  const evidence = JSON.parse(fs.readFileSync(path.join(source, 'DEPENDENCIES.json'), 'utf8'));
  const digest = value => crypto.createHash('sha256').update(value).digest('hex');
  if (digest(fs.readFileSync(path.join(source, 'package-lock.json'))) !== evidence.lockSha256) throw new Error('OFFICE_LOCK_MISMATCH');
  const destination = path.join(appRoot, 'office-lite');
  fs.mkdirSync(destination, { recursive: true });
  for (const name of ['package.json', 'package-lock.json', 'DEPENDENCIES.json']) {
    fs.copyFileSync(path.join(source, name), path.join(destination, name));
  }
  const result = [];
  for (const [relative, entry] of Object.entries(lock.packages)) {
    if (!relative) continue;
    if (!/^node_modules\//.test(relative) || relative.split('/').includes('..')) throw new Error('OFFICE_DEPENDENCY_PATH_INVALID');
    const directory = path.join(source, relative);
    const bytes = fs.readFileSync(path.join(directory, 'package.json'));
    const manifest = JSON.parse(bytes);
    if (manifest.version !== entry.version) throw new Error('OFFICE_DEPENDENCY_VERSION_MISMATCH');
    const expected = evidence.packages.find(item => item.path === relative && item.version === entry.version && item.integrity === entry.integrity);
    if (!expected) throw new Error('OFFICE_DEPENDENCY_EVIDENCE_MISSING');
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
    copyDirectory(directory, path.join(destination, relative));
    result.push({ name: `office-lite/${relative.slice(13)}`, version: manifest.version,
      optionalModule: 'office-lite', license: manifest.license || 'UNKNOWN', package_json_sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
  }
  return result;
}
