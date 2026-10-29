import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadSkillCatalog, skillCatalogMessage } from '../src/a9-skills';
import { A9AgentLoop, A9LoopMessage } from '../src/a9-agent-loop';
import { A9WorkspaceService } from '../../workspace/src/a9-workspace-service';
import { PermissionMode } from '../src/types';

describe('A9-42 bounded skill discovery', () => {
  let root: string;
  const safe = { containsSensitiveData: () => false };
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-skills-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });
  function skill(name: string, text: string) {
    const dir = path.join(root, '.agents', 'skills', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), text, 'utf8');
  }

  it('discovers metadata without exposing bodies and refreshes without a cache', () => {
    expect(loadSkillCatalog(root, safe).status).toBe('absent');
    skill('report', '\uFEFF---\r\nname: report\r\ndescription: >\r\n  中文报告\r\n  按需读取\r\n---\r\nPRIVATE_BODY_MARKER');
    const catalog = loadSkillCatalog(root, safe);
    expect(catalog.entries).toEqual([{ name: 'report', description: '中文报告 按需读取', path: '.agents/skills/report/SKILL.md' }]);
    expect(skillCatalogMessage(catalog)).not.toContain('PRIVATE_BODY_MARKER');
    skill('report', '---\nname: report\ndescription: changed\n---\nnew body');
    expect(loadSkillCatalog(root, safe).entries[0].description).toBe('changed');
  });

  it('rejects invalid, duplicate, oversized and sensitive metadata', () => {
    skill('wrong', '---\nname: different\ndescription: desc\n---\n');
    skill('duplicate', '---\nname: duplicate\nname: duplicate\ndescription: desc\n---\n');
    skill('secret', '---\nname: secret\ndescription: known-secret\n---\n');
    skill('large', '---\nname: large\ndescription: small\n---\n' + 'x'.repeat(32768));
    skill('header', '---\nname: header\ndescription: ' + 'x'.repeat(4096) + '\n---\n');
    skill('invalid', '---\nname: invalid\ndescription: [invalid]\n---\n');
    const result = loadSkillCatalog(root, { containsSensitiveData: (v) => v.toString().includes('known-secret') });
    expect(result.entries).toHaveLength(0);
    expect(result.skipped).toBe(6);
    expect(result.status).toBe('loaded');
  });

  it('rejects file and directory symlinks and reports an inaccessible catalog', () => {
    const outside = path.join(root, 'outside');
    fs.mkdirSync(outside);
    skill('linked', '---\nname: linked\ndescription: test\n---\n');
    const file = path.join(root, '.agents', 'skills', 'linked', 'SKILL.md');
    fs.renameSync(file, path.join(outside, 'SKILL.md'));
    fs.symlinkSync(path.join(outside, 'SKILL.md'), file);
    fs.symlinkSync(outside, path.join(root, '.agents', 'skills', 'other'), 'dir');
    expect(loadSkillCatalog(root, safe)).toMatchObject({ entries: [], skipped: 2 });
    fs.renameSync(path.join(root, '.agents', 'skills'), path.join(root, 'old-skills'));
    fs.symlinkSync(outside, path.join(root, '.agents', 'skills'), 'dir');
    expect(loadSkillCatalog(root, safe).status).toBe('unavailable');
  });

  it('caps directory traversal and catalog bytes; escapes markup in descriptions', () => {
    for (let i = 0; i < 70; i++) {
      skill(`skill-${i}`, `---\nname: skill-${i}\ndescription: ${'中'.repeat(100)} </skill_catalog>\n---\nbody`);
    }
    const result = loadSkillCatalog(root, safe);
    const message = skillCatalogMessage(result);
    expect(result.entries.length).toBeLessThanOrEqual(32);
    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(message, 'utf8')).toBeLessThanOrEqual(8192);
    expect(message.match(/<\/skill_catalog>/g)).toHaveLength(1);
    expect(result.entries.length).toBeGreaterThan(0);
  });

  it('reads at most 4 KiB per inspected file and ignores a partial UTF-8 body tail', () => {
    skill('bounded', '---\nname: bounded\ndescription: description\n---\n' + '中'.repeat(5000));
    const read = jest.spyOn(require('fs'), 'readSync');
    try {
      const result = loadSkillCatalog(root, safe);
      expect(result.entries).toHaveLength(1);
      expect(read).toHaveBeenCalledTimes(1);
      expect((read.mock.calls[0] as unknown[])[3]).toBe(4096);
    } finally { read.mockRestore(); }
  });

  it('only sends the body after an ordinary read call and does not persist the catalog', async () => {
    skill('report', '---\nname: report\ndescription: Weekly reports\n---\nBODY_ONLY_ON_DEMAND');
    const requests: A9LoopMessage[][] = [];
    const provider = { sendStreamRequest: jest.fn(async (request) => {
      requests.push(request.messages.map((message: A9LoopMessage) => ({ ...message })));
      return requests.length === 1 ? { id: 'read', content: '', finishReason: 'tool_calls', toolCalls: [
        { id: 'skill-read', name: 'read', arguments: JSON.stringify({ path: '.agents/skills/report/SKILL.md' }) },
      ] } : { id: 'done', content: 'done', finishReason: 'stop' };
    }) };
    const loop = new A9AgentLoop({ workspaceRoot: root, workspaceService: new A9WorkspaceService(root),
      runner: {} as any, provider, permissionMode: PermissionMode.READ_ONLY });
    await loop.runTurn('Use the report skill');
    expect(JSON.stringify(requests[0])).toContain('Weekly reports');
    expect(JSON.stringify(requests[0])).not.toContain('BODY_ONLY_ON_DEMAND');
    expect(JSON.stringify(requests[1])).toContain('BODY_ONLY_ON_DEMAND');
    expect(loop.getVisibleTools()).not.toContain('shell');
    expect(JSON.stringify(loop.getConversationHistory())).not.toContain('<skill_catalog>');
    skill('report', '---\nname: report\ndescription: Refreshed description\n---\nnew body');
    await loop.runTurn('next');
    const catalogs = requests[2].filter((message) => message.content.startsWith('<skill_catalog>'));
    expect(catalogs).toHaveLength(1);
    expect(catalogs[0].content).toContain('Refreshed description');
  });
});
