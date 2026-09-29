import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { A9AgentLoop, A9LoopMessage, A9ModelPort } from '../src';
import { buildEnvironmentFacts } from '../src/a9-environment-facts';
import { loadProjectInstructions } from '../src/a9-project-instructions';

const facts = (shell: { kind: string; version: string; explicit: boolean }, platform = 'win32', release = '6.1.7601') =>
  buildEnvironmentFacts({ platform, release, arch: 'x64', shell,
    pathDirs: ['/tools'], exists: (candidate) => candidate.endsWith('git.exe') });

describe('A9-26 environment facts', () => {
  it('R4-01 only observed values and applicable Win7 cautions appear within 1.5 KiB', () => {
    const value = facts({ kind: 'powershell', version: '2.0', explicit: false });
    expect(value).toContain('Windows 7 SP1（NT 6.1）');
    expect(value).toContain('git=PATH 中存在');
    expect(value).toContain('node=PATH 中未发现');
    expect(value).toContain('260');
    expect(Buffer.byteLength(value, 'utf8')).toBeLessThanOrEqual(1536);
    const unknown = buildEnvironmentFacts({ pathDirs: [], exists: () => { throw new Error('must not inspect'); } });
    expect(unknown).toContain('系统：未知');
    expect(unknown).toContain('git=未知');
    expect(unknown).not.toContain('Windows 7');
  });

  it('R4-02 PowerShell 2.0, PowerShell 5.1 and CMD receive different cautions', () => {
    const ps2 = facts({ kind: 'powershell', version: '2.0', explicit: false });
    const ps5 = facts({ kind: 'powershell', version: '5.1', explicit: false });
    const cmd = facts({ kind: 'cmd', version: '6.1', explicit: true });
    expect(ps2).toContain('Invoke-WebRequest');
    expect(ps2).toContain('ConvertFrom-Json');
    expect(ps2).toContain('Get-FileHash');
    expect(ps5).not.toContain('Invoke-WebRequest');
    expect(cmd).toContain('CMD 语法');
    expect(cmd).not.toContain('Invoke-WebRequest');
  });

  it('R4-03 macOS fact block and default System Prompt never invent Win7', async () => {
    const value = buildEnvironmentFacts({ platform: os.platform(), release: os.release(), arch: os.arch(),
      shell: { kind: 'zsh', version: '未知', explicit: true }, pathDirs: [], exists: () => false });
    expect(value).not.toContain('Windows 7');
    const provider: A9ModelPort = { sendStreamRequest: jest.fn().mockResolvedValue({ id: 'done', content: 'done', finishReason: 'stop' }) };
    const loop = new A9AgentLoop({ workspaceRoot: '/mock', provider, workspaceService: {} as any, runner: {} as any,
      targetOs: `${os.platform()} ${os.release()} ${os.arch()}`, environmentFacts: value });
    await loop.runTurn('hello');
    const messages = (provider.sendStreamRequest as jest.Mock).mock.calls[0][0].messages as A9LoopMessage[];
    expect(messages[0].content).not.toContain('Windows 7');
    expect(messages[1].content).not.toContain('Windows 7');
  });

  it('R4-04 fact collection invokes no subprocess', () => {
    const subprocess = require('child_process') as typeof import('child_process');
    const exec = jest.spyOn(subprocess, 'execFileSync');
    try {
      facts({ kind: 'cmd', version: '6.1', explicit: false });
      expect(exec).not.toHaveBeenCalled();
    } finally { exec.mockRestore(); }
  });

  it('R2-01 R3-04 R4-01 integrated ordering is System → facts → instructions → history → current for three turns', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-r234-'));
    try {
      fs.writeFileSync(path.join(root, 'AGENTS.md'), 'project rule', 'utf8');
      const requests: A9LoopMessage[][] = [];
      const provider: A9ModelPort = { sendStreamRequest: jest.fn().mockImplementation(async (request) => {
        requests.push(request.messages.map((message: A9LoopMessage) => ({ ...message })));
        return { id: 'done', content: 'done', finishReason: 'stop' };
      }) };
      const loop = new A9AgentLoop({ workspaceRoot: root, provider, workspaceService: {} as any, runner: {} as any,
        targetOs: 'darwin test arm64', environmentFacts: 'Actual darwin facts', contextBudgetChars: 96_000,
        loadProjectInstructions: () => loadProjectInstructions(root, { containsSensitiveData: () => false }) });
      loop.restoreConversationHistory([
        { role: 'user', content: 'historical user' }, { role: 'assistant', content: 'historical answer' },
      ]);
      for (const prompt of ['current one', 'current two', 'current three']) await loop.runTurn(prompt);
      expect(requests).toHaveLength(3);
      for (let index = 0; index < requests.length; index += 1) {
        const messages = requests[index];
        expect(messages.slice(0, 3).map((message) => message.role)).toEqual(['system', 'system', 'system']);
        expect(messages[0].content).toContain('a9-system-prompt-v3');
        expect(messages[1].content).toContain('<environment_facts>');
        expect(messages[2].content).toContain('<project_instructions');
        expect(messages[3].content).toBe('historical user');
        expect(messages[messages.length - 1].content).toBe(['current one', 'current two', 'current three'][index]);
        expect(messages.filter((message) => message.content.startsWith('<environment_facts>'))).toHaveLength(1);
        expect(messages.filter((message) => message.content.startsWith('<project_instructions'))).toHaveLength(1);
      }
      const exported = JSON.stringify(loop.getConversationHistory());
      expect(exported).not.toContain('Actual darwin facts');
      expect(exported).not.toContain('project rule');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
