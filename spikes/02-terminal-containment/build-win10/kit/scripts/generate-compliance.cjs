'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const kitRoot = path.resolve(__dirname, '..');
const toolingRoot = path.join(kitRoot, 'tooling');
const complianceRoot = path.join(kitRoot, 'compliance');
const licenseRoot = path.join(complianceRoot, 'licenses', 'npm');
const lockPath = path.join(toolingRoot, 'package-lock.json');
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const packages = lock.packages || {};

fs.mkdirSync(licenseRoot, { recursive: true });

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function referenceFor(packagePath, meta) {
  return `npm:${packagePath || 'root'}@${meta.version || '0.0.0'}`;
}

function resolveDependency(fromPath, dependency) {
  let cursor = fromPath;
  while (true) {
    const candidate = path.posix.join(cursor, 'node_modules', dependency);
    if (packages[candidate]) return candidate;
    if (!cursor) break;
    const marker = cursor.lastIndexOf('/node_modules/');
    cursor = marker >= 0 ? cursor.slice(0, marker) : '';
  }
  return null;
}

const components = [];
const dependencyGraph = [];
const licenses = [];

for (const [packagePath, meta] of Object.entries(packages).sort(([a], [b]) => a.localeCompare(b))) {
  if (!packagePath) continue;
  const installPath = path.join(toolingRoot, ...packagePath.split('/'));
  const packageJsonPath = path.join(installPath, 'package.json');
  const packageJson = fs.existsSync(packageJsonPath) ? JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) : {};
  const name = packageJson.name || packagePath.split('/').slice(-1)[0];
  const version = meta.version || packageJson.version || 'UNKNOWN';
  const ref = referenceFor(packagePath, { version });
  const component = {
    type: 'library',
    'bom-ref': ref,
    name,
    version,
    scope: 'required',
    properties: [{ name: 'installed_path', value: packagePath }]
  };
  if (typeof packageJson.license === 'string') component.licenses = [{ license: { id: packageJson.license } }];
  if (typeof meta.integrity === 'string' && meta.integrity.startsWith('sha512-')) {
    component.hashes = [{ alg: 'SHA-512', content: Buffer.from(meta.integrity.slice(7), 'base64').toString('hex') }];
  }
  if (meta.resolved && !String(meta.resolved).startsWith('file:')) {
    component.externalReferences = [{ type: 'distribution', url: meta.resolved }];
  }
  components.push(component);

  const outputDir = path.join(licenseRoot, packagePath.replaceAll('/', '__') + '@' + version);
  const copied = [];
  if (fs.existsSync(installPath)) {
    for (const file of fs.readdirSync(installPath).sort()) {
      if (/^(licen[cs]e|copying|notice)(\..*)?$/i.test(file)) {
        fs.mkdirSync(outputDir, { recursive: true });
        fs.copyFileSync(path.join(installPath, file), path.join(outputDir, file));
        copied.push(path.relative(complianceRoot, path.join(outputDir, file)).replaceAll(path.sep, '/'));
      }
    }
  }
  licenses.push({ name, version, package_path: packagePath, declared_license: packageJson.license || 'UNKNOWN', archived_files: copied, status: copied.length ? 'ARCHIVED' : 'DECLARATION_ONLY' });

  const dependsOn = [];
  for (const dependency of Object.keys(meta.dependencies || {}).sort()) {
    const resolved = resolveDependency(packagePath, dependency);
    if (resolved) dependsOn.push(referenceFor(resolved, packages[resolved]));
  }
  dependencyGraph.push({ ref, dependsOn });
}

const rootRef = 'application:win10-native-build-tooling@1.0.0';
dependencyGraph.unshift({ ref: rootRef, dependsOn: Object.keys(packages).filter(key => /^node_modules\/[^/]+$|^node_modules\/@[^/]+\/[^/]+$/.test(key)).map(key => referenceFor(key, packages[key])).sort() });

const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  serialNumber: 'urn:uuid:5bbd9e81-0244-4dc4-8855-79c550730e26',
  version: 1,
  metadata: {
    timestamp: '2026-08-06T00:00:00Z',
    component: { type: 'application', 'bom-ref': rootRef, name: 'win10-native-build-tooling', version: '1.0.0' },
    properties: [
      { name: 'package_lock_sha256', value: sha256(lockPath) },
      { name: 'delivery_scope', value: 'build-host tooling only; not Win7 runtime SBOM' }
    ]
  },
  components,
  dependencies: dependencyGraph
};

fs.mkdirSync(complianceRoot, { recursive: true });
fs.writeFileSync(path.join(complianceRoot, 'npm-sbom.cdx.json'), JSON.stringify(sbom, null, 2) + '\n');
fs.writeFileSync(path.join(complianceRoot, 'npm-licenses.json'), JSON.stringify({ schema_version: 1, generated_at: '2026-08-06T00:00:00Z', package_count: licenses.length, packages: licenses }, null, 2) + '\n');
process.stdout.write(JSON.stringify({ components: components.length, licenses: licenses.length }) + '\n');
