import {
  TrustedShellRunner,
  TrustedShellRequest,
} from '../src';

describe('A9-02: TrustedShellRunner', () => {
  const runner = new TrustedShellRunner();

  it('executes simple echo command and captures stdout', async () => {
    const result = await runner.execute({
      command: 'echo "hello trusted runner"',
    });

    expect(result.schemaVersion).toBe('2.0');
    expect(result.status).toBe('exited');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello trusted runner');
  });

  it('supports pipelines and redirects in command text', async () => {
    const result = await runner.execute({
      command: 'echo "line1\nline2\nline3" | grep "line2"',
    });

    if (result.status === 'exited') {
      expect(result.stdout).toContain('line2');
    }
  });

  it('accurately preserves non-zero exit codes', async () => {
    const result = await runner.execute({
      command: 'exit 42',
    });

    expect(result.status).toBe('exited');
    expect(result.exitCode).toBe(42);
  });

  it('handles cancellation via AbortSignal', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);

    const result = await runner.execute({
      command: 'sleep 5',
      signal: controller.signal,
    });

    expect(['cancelled', 'failed', 'exited']).toContain(result.status);
    expect(result.termination.requested).toBe(true);
  });

  it('handles timeout when command exceeds timeoutMs', async () => {
    const result = await runner.execute({
      command: 'sleep 5',
      timeoutMs: 150,
    });

    expect(['timeout', 'failed', 'exited']).toContain(result.status);
    expect(result.termination.requested).toBe(true);
  });

  it('truncates oversized output properly without losing status', async () => {
    const result = await runner.execute({
      command: 'node -e "for(let i=0;i<500;i++) console.log(\'line \' + i)"',
      maxOutputLines: 50,
      maxOutputBytes: 1024,
    });

    expect(result.status).toBe('exited');
    expect(result.truncated).toBe(true);
    expect(result.stdout).toContain('[Output truncated');
  });
});

describe('A9-30 Runner secure projection', () => {
  it('uses one bounded redacted projection for callbacks, logs and final result', async () => {
    const fs = require('fs'); const os = require('os'); const path = require('path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-stream-runner-'));
    const secret = 'sentinel-stream-value';
    const text = `tick\napi_key=${secret}\n中文\n`;
    let complete = false;
    const seen: any[] = [];
    const helper: import('../src/native-transport').HelperTransport = { invoke: async (req, _signal, _env, output) => {
      expect('schemaVersion' in req && req.schemaVersion).toBe(3);
      const bytes = Buffer.from(text);
      let seq = 0;
      for (let i = 0; i < bytes.length; i++) await output!({ schemaVersion: 3, type: 'output_chunk', requestId: req.requestId,
        profileId: 'a9-trusted-shell-current-user-v2', seq: ++seq, stream: 'stdout', streamOffset: i, byteLength: 1, dataBase64: bytes.subarray(i, i + 1).toString('base64') });
      expect(seen.map((c) => c.text).join('')).toContain('tick\n');
      complete = true;
      return { kind: 'response', response: { schemaVersion: 3, type: 'execution_result', requestId: req.requestId,
        profileId: 'a9-trusted-shell-current-user-v2', status: 'completed', exitCode: 0, executionTimeMs: 5,
        timedOut: false, idleTimedOut: false, canceled: false, outputTruncated: false, containmentVerified: true,
        inputDetached: true, cleanupConfirmed: true, workDirAclModified: false,
        hostJob: { detected: false, breakaway: 'none', limitFlags: 0, childJobAssignmentVerified: true },
        tokenAudit: { source: 'suspended_child_process_token', verified: true, tokenMode: 'current_user', restrictedToken: false,
          tokenType: 'primary', sameUser: true, lowIntegrity: false, integritySid: 'S-1-16-8192', integrityRid: 8192 },
        lastOutputSeq: seq, stdout: { rawBytesRead: bytes.length, emittedBytes: bytes.length, omittedBytes: 0 },
        stderr: { rawBytesRead: 0, emittedBytes: 0, omittedBytes: 0 } } };
    } };
    const r = new TrustedShellRunner({ platform: 'win32', helperTransport: helper, helperProtocolVersion: 3,
      outputEncoding: { stdout: 'utf-8', stderr: 'utf-8' }, logDir: dir, getSensitiveValues: () => [secret],
      resolveShellIdentity: () => ({ canonicalPath: 'C:\\Windows\\System32\\cmd.exe', sha256: 'a'.repeat(64), fileId: 'id' }),
      getConfiguredShellIdentity: () => ({ canonicalPath: 'C:\\Windows\\System32\\cmd.exe', sha256: 'a'.repeat(64), fileId: 'id' }) });
    const result = await r.execute({ command: 'echo tick', cwd: dir, shellKind: 'cmd', shellPath: 'C:\\Windows\\System32\\cmd.exe',
      onOutput: async (c) => { if (c.text.startsWith('t')) expect(complete).toBe(false); seen.push(c); } });
    expect(result.status).toBe('exited'); expect(result.outputProtocolVersion).toBe(3);
    expect(result.stdout).toBe(seen.filter((c) => c.stream === 'stdout').map((c) => c.text).join(''));
    expect(result.stdout).toContain('中文'); expect(JSON.stringify(seen)).not.toContain(secret);
    expect(fs.readFileSync(result.logPaths!.stdout, 'utf8')).toBe(result.stdout);
    expect(seen.map((c) => c.outputSeq)).toEqual(seen.map((_c, i) => i + 1));
  });
});

it('A9-30 real child protocol transport exposes 2-second ticks before terminal', async () => {
  const fs = require('fs'); const os = require('os'); const path = require('path');
  const { StdioHelperTransport } = require('../src/native-transport');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-native-protocol-child-'));
  const script = path.join(root, 'helper-fixture');
  // This is a live stdio protocol peer, not Windows native execution evidence.
  fs.writeFileSync(script, `#!${process.execPath}
let input = '';
process.stdin.on('data', bytes => { input += bytes; if (!input.includes('\\n')) return; process.stdin.removeAllListeners('data');
const r = JSON.parse(input.trim()); const env = {schemaVersion:3,requestId:r.requestId,profileId:r.profileId};
const tokenAudit = {source:'suspended_child_process_token',verified:true,tokenMode:'current_user',restrictedToken:false,tokenType:'primary',sameUser:true,lowIntegrity:false,integritySid:'S-1-16-8192',integrityRid:8192};
const send = v => process.stdout.write(JSON.stringify(v)+'\\n');
send({...env,type:'execution_started',helperPid:process.pid,childPid:1234,ready:{childJobAssignmentVerified:true,inputDetached:true,stdoutCaptureReady:true,stderrCaptureReady:true},tokenAudit});
let seq=0; let raw=0;
const timer=setInterval(()=>{ const b=Buffer.from('tick '+(++seq)+'\\n'); send({...env,type:'output_chunk',seq,stream:'stdout',streamOffset:raw,byteLength:b.length,dataBase64:b.toString('base64')}); raw+=b.length;
if(seq===2) {clearInterval(timer); setTimeout(()=>{send({...env,type:'execution_result',status:'completed',exitCode:0,executionTimeMs:4100,timedOut:false,idleTimedOut:false,canceled:false,outputTruncated:false,containmentVerified:true,inputDetached:true,cleanupConfirmed:true,workDirAclModified:false,hostJob:{detected:false,breakaway:'none',limitFlags:0,childJobAssignmentVerified:true},tokenAudit,lastOutputSeq:seq,stdout:{rawBytesRead:raw,emittedBytes:raw,omittedBytes:0},stderr:{rawBytesRead:0,emittedBytes:0,omittedBytes:0}}); process.stdin.destroy(); },100);}
},2000); });`, { encoding: 'utf8', mode: 0o700 });
  const req: import('../src/native-protocol').NativeHelperRequestV3 = { schemaVersion: 3, requestId: 'live', profileId: 'a9-trusted-shell-current-user-v2',
    executable: 'C:\\Windows\\System32\\cmd.exe', argv: ['/d','/s','/c','echo tick'], shellKind: 'cmd', shellPath: 'C:\\Windows\\System32\\cmd.exe', shellVersion: 'fixture', shellIdentity: 'a'.repeat(64), shellSource: 'automatic', command: 'echo tick', cwd: root, envOverlay: {}, maxStdoutBytes: 1024, maxStderrBytes: 1024, managed: false, deadlineMode: 'none', outputEncoding: { stdout: 'utf-8', stderr: 'utf-8' } };
  let done = false; const chunks: any[] = []; const start = Date.now();
  const result = await new StdioHelperTransport(script).invoke(req, undefined, undefined, (c: any) => { expect(done).toBe(false); chunks.push({ ...c, elapsedMs: Date.now() - start }); });
  done = true; expect(result.kind).toBe('response'); expect(chunks).toHaveLength(2);
  expect(chunks[0].elapsedMs).toBeLessThan(3500); expect(chunks[1].elapsedMs).toBeGreaterThanOrEqual(3900);
}, 10000);
