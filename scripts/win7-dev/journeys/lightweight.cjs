'use strict';
// Extra A9-43 scenarios use the real product loop over loopback HTTP, never a Runtime substitute.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const need = (ok, code) => { if (!ok) throw Error(code); };
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const SKILL = '.agents/skills/a943-sample/SKILL.md';
const PRIVATE = 'A943_BODY_ONLY_LOADED_BY_READ';
const NOTE = '定位.txt';
const LONG = '长行.txt';
const PNG = '图片.png';
const JPEG = '图片.jpg';
const TITLE = '版本整合验证：中文长标题、焦点恢复与滚动可达性检查';
function seed(root, nativeImage) {
  const write = (name, value) => { const file = path.join(root, ...name.split('/')); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value, { flag: 'wx' }); };
  write(SKILL, '---\nname: a943-sample\ndescription: 本版本工具旅程样本\n---\n' + PRIVATE + '\n');
  write(NOTE, '第一行\n原锚点\n第三行\n');
  write(LONG, ('X'.repeat(1000) + '\n').repeat(4));
  write('.agents/skills/invalid/SKILL.md', '---\nname: mismatched\ndescription: A943_INVALID_METADATA\n---\n');
  const image = nativeImage.createFromBitmap(Buffer.alloc(1600 * 900 * 4, 255), { width: 1600, height: 900 });
  write(PNG, image.toPNG()); write(JPEG, image.toJPEG(80));
}
function step(state, parsed) {
  const users = parsed.messages.filter(m => m.role === 'user'); const prompt = users.length ? users[users.length - 1].content : '';
  if (typeof prompt !== 'string' || !prompt.startsWith('a943:tools:')) return null;
  const names = parsed.tools.map(t => t.function && t.function.name);
  const extension = state.lightweight || (state.lightweight = { index: 0, next: 0, pending: null, results: [] });
  const kind = prompt.slice('a943:tools:'.length);
  need(['off','on','released'].includes(kind), 'TOOLS_PROMPT');
  const calls = {
    off: [['read', { path: SKILL }], ['read', { path: NOTE }], ['edit', { path: NOTE, oldText: '原锚点', newText: '新锚点' }],
      ['edit', { path: NOTE, oldText: '没有这个锚点', newText: '不得写入' }], ['read', { path: LONG, maxLines: 1 }],
      ['read', { path: '坏:路径.txt' }]],
    on: [['read_image', { path: PNG }], ['read_image', { path: JPEG }]], released: [],
  };
  if (extension.kind !== kind) {
    need(extension.pending === null && (extension.kind === undefined || extension.done), 'TOOLS_SEQUENCE');
    extension.kind = kind; extension.next = 0; extension.done = false;
    need(kind === 'on' ? names.includes('read_image') : !names.includes('read_image'), 'IMAGE_CAPABILITY_GATE');
    const env = parsed.messages.find(m => m.role === 'system' && typeof m.content === 'string' && m.content.startsWith('<environment_facts>'));
    need(env && env.content.includes(os.release()) && env.content.includes(process.versions.node)
      && Buffer.byteLength(env.content) < 1800, 'ENVIRONMENT_FACTS');
    const catalog = parsed.messages.find(m => m.role === 'system' && typeof m.content === 'string' && m.content.startsWith('<skill_catalog>'));
    need(catalog && catalog.content.includes(SKILL) && !catalog.content.includes(PRIVATE) && !catalog.content.includes('A943_INVALID_METADATA'), 'SKILL_CATALOG');
    if (kind === 'off') need(!JSON.stringify(parsed.messages).includes(PRIVATE), 'SKILL_BODY_EAGERLY_LEAKED');
  }
  if (extension.pending) {
    const pending = extension.pending;
    const matches = parsed.messages.filter(m => m.role === 'tool' && m.tool_call_id === pending.id);
    need(matches.length === 1, 'TOOLS_RESULT_BINDING');
    const result = JSON.parse(matches[0].content);
    const [name, args] = calls[kind][extension.next - 1];
    if (kind === 'off') {
      if (args.path === SKILL) need(JSON.stringify(result).includes(PRIVATE), 'SKILL_READ_BODY');
      if (name === 'edit' && args.oldText === '原锚点') {
        const f = result.feedback; need(f && f.changed === true && f.firstChangedLine === 2
          && f.patchApplicable === false && f.beforeSha256 !== f.afterSha256 && f.unifiedDiff.includes('新锚点'), 'EDIT_FEEDBACK');
      }
      if (name === 'edit' && args.oldText !== '原锚点' || args.path === '坏:路径.txt') need(Boolean(result.error), 'TOOLS_EXPECTED_REFUSAL');
      if (args.path === LONG) need(result.truncated === true && result.content.length < 10000, 'READ_TRUNCATION');
    } else {
      need(!result.error && result.outputWidth === 1280, 'IMAGE_NATIVE_RESULT');
      const parts = parsed.messages.flatMap(m => Array.isArray(m.content) ? m.content : []);
      need(parts.some(p => p.type === 'image_url' && p.image_url.url.startsWith('data:image/png;base64,')), 'IMAGE_PROVIDER_PART');
      const imageParts = parts.filter(p => p.type === 'image_url'); need(imageParts.length <= 2, 'IMAGE_REQUEST_LIMIT');
    }
    extension.results.push({ kind, name, path: args.path, checked: true }); extension.pending = null;
  }
  if (kind === 'released') {
    need(!JSON.stringify(parsed.messages).includes('data:image'), 'IMAGE_LATE_REQUEST_LEAK');
  }
  const next = calls[kind][extension.next++];
  if (!next) { extension.done = true; return { content: '本机序列夹具：工具边界已核对。' }; }
  const id = 'a943-tools-' + (++extension.index); extension.pending = { id };
  return { tool_calls: [{ index: 0, id, type: 'function', function: { name: next[0], arguments: JSON.stringify(next[1]) } }] };
}
async function workbench({ win, evaluate, click, wait, snapshot }) {
  const initial = await snapshot();
  const renamed = await evaluate(`window.win7Agent.a9.renameConversation(${JSON.stringify(initial.activeConversationId)},${JSON.stringify(TITLE)})`);
  need(renamed && renamed.ok, 'LONG_TITLE_RENAME');
  await evaluate('window.win7AgentA9Workbench.refreshSnapshot()');
  await wait(() => evaluate(`Array.from(document.querySelectorAll('#conversation-list button')).some(b=>b.title.includes(${JSON.stringify(TITLE)}))`), 5000, 'LONG_TITLE_VISIBLE');
  // Electron 22 on Win7 treats an empty minimum as no override.
  const rows = []; win.setMinimumSize(1, 1);
  for (const [width,height] of [[1366,768],[1093,614],[1079,540],[900,650],[800,650],[780,640]]) {
    win.setContentSize(width,height);
    await wait(() => evaluate(`innerWidth===${width}&&innerHeight===${height}`), 5000, 'VIEWPORT');
    const facts = await evaluate(`(() => {const rect=id=>document.getElementById(id).getBoundingClientRect();
      return {width:innerWidth,height:innerHeight,scroll:document.querySelector('.workbench').scrollWidth,
        nav:rect('open-navigation').width,sendBottom:rect('run-task').bottom,
        title:Array.from(document.querySelectorAll('#conversation-list button')).some(b=>b.title.includes(${JSON.stringify(TITLE)}))};})()`);
    need(facts.scroll <= facts.width && facts.nav === 44 && facts.sendBottom <= facts.height && facts.title, 'WORKBENCH_GEOMETRY');
    if (width < 800) await click('#open-navigation');
    await click('#open-settings');
    win.webContents.sendInputEvent({ type:'keyDown',keyCode:'Escape' }); win.webContents.sendInputEvent({ type:'keyUp',keyCode:'Escape' });
    await wait(() => evaluate(`document.activeElement.id===${JSON.stringify(width<800?'open-navigation':'open-settings')}`), 5000, 'SETTINGS_FOCUS');
    rows.push(facts);
  }
  win.setContentSize(1366,768); return rows;
}
module.exports = { seed, step, workbench, SKILL, PRIVATE, NOTE, LONG, PNG, JPEG, TITLE, sha };
