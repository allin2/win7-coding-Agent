import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSshArgs, parseCertutilHash, parseResidues, probeWin7 } from '../probe-win7.mjs';

const options = {
  targetIp: '192.168.1.11', user: 'dccs-chaizl', privateKey: '/outside/key', knownHosts: '/outside/known',
  acceptanceId: 'A4-20260810-000001', phase: 'preflight', artifactMap: {},
};

test('SSH argv is strict and never uses a local shell', () => {
  const args = buildSshArgs(options, ['hostname']);
  assert.ok(args.includes('StrictHostKeyChecking=yes'));
  assert.ok(args.includes('BatchMode=yes'));
  assert.equal(args.at(-1), 'hostname');
});

test('certutil parser accepts spaced SHA-256 and rejects prose', () => {
  assert.equal(parseCertutilHash('SHA256 hash:\r\nAA AA AA AA AA AA AA AA AA AA AA AA AA AA AA AA AA AA AA AA AA AA AA AA AA AA AA AA AA AA AA AA\r\nCertUtil: ok'), 'a'.repeat(64));
  assert.throws(() => parseCertutilHash('CertUtil failed'));
});

test('residue parser is acceptance-scoped', () => {
  const output = 'HOST,node.exe,node normal,100\nHOST,spike02_helper.exe,A4-20260810-000001,101\n';
  assert.equal(parseResidues(output, options.acceptanceId).length, 1);
});

test('A5 residue parser also treats T05 ping as a formal residue', () => {
  const output = 'HOST,ping.exe,ping.exe -n 60 127.0.0.1,202\n';
  assert.equal(parseResidues(output, 'A5-20260810-000001').length, 1);
  assert.equal(parseResidues(output, 'A4-20260810-000001').length, 0);
});

test('read-only probe builds coordinator snapshot with fake SSH transport', () => {
  const outputs = new Map([
    ['cmd.exe', 'Microsoft Windows [Version 6.1.7601]'],
    ['hostname', 'WIN7-A5\r\n'],
    ['wmic.exe:os', 'BuildNumber=7601\r\nOSArchitecture=64-bit'],
    ['sc', 'STATE              : 4  RUNNING'],
    ['wmic.exe:process', 'Node,CommandLine,Name,ProcessId\r\n'],
  ]);
  const runner = (_command, args) => {
    const remote = args.slice(args.indexOf(`${options.user}@${options.targetIp}`) + 1);
    const key = remote[0] === 'wmic.exe' ? `wmic.exe:${remote[1]}` : remote[0];
    return { status: 0, stdout: outputs.get(key) || '', stderr: '' };
  };
  const snapshot = probeWin7(options, runner);
  assert.equal(snapshot.service.state, 'RUNNING');
  assert.equal(snapshot.target.hostname, 'WIN7-A5');
  assert.deepEqual(snapshot.residues, []);
});
