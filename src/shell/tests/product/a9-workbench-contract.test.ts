import * as fs from 'fs';
import * as path from 'path';

describe('A9 unified desktop workbench contract', () => {
  const productRoot = path.join(__dirname, '../../product');
  const html = fs.readFileSync(path.join(productRoot, 'renderer/workbench.html'), 'utf8');
  const css = fs.readFileSync(path.join(productRoot, 'renderer/a9-workbench.css'), 'utf8');
  const script = fs.readFileSync(path.join(productRoot, 'renderer/a9-workbench.js'), 'utf8');
  const main = fs.readFileSync(path.join(productRoot, 'main.js'), 'utf8');
  const smokeDriver = fs.readFileSync(path.join(__dirname, 'a9-06-driver-entry.cjs'), 'utf8');

  it('loads the unified workbench for the product while preserving the historical A8 smoke entry', () => {
    expect(main).toContain("const legacyRendererEntry = path.join(rendererRoot, 'index.html');");
    expect(main).toContain(": path.join(rendererRoot, 'workbench.html');");
    expect(main).toContain("item.indexOf('--a8-review-smoke-') === 0");
    expect(main).toContain("item.indexOf('--a8-boundary-smoke-') === 0");
    expect(main).toContain("readArgument('--a9-workbench-screenshot=')");
    expect(main).toContain('mainWindow.setContentSize(1366, 768);');
    expect(main).toContain('mainWindow.webContents.setZoomFactor(a9WorkbenchZoom);');
    expect(main).toContain("document.getElementById('workspace-select').focus()");
    expect(main).toContain('mainWindow.webContents.capturePage()');
  });

  it('has one visible A9 task entry and one central approval action area', () => {
    expect((html.match(/id="task-prompt"/g) || [])).toHaveLength(1);
    expect((html.match(/id="run-task"/g) || [])).toHaveLength(1);
    expect((html.match(/id="cancel-task"/g) || [])).toHaveLength(1);
    expect((html.match(/id="a9-approval-card"/g) || [])).toHaveLength(1);
    expect(html).not.toContain('id="a9-prompt"');
    expect(html.indexOf('id="a9-approval-card"')).toBeLessThan(html.indexOf('id="task-prompt"'));
    expect(script).toContain('await a9.submitTurn(prompt)');
    expect(script).toContain("snapshot.provider.probe.classification === 'tool_calling'");
    expect(script).not.toContain('api.submitTask');
    expect(script).toContain('activeManagedProcesses(snapshot)');
    expect(script).toContain('snapshot.controls && snapshot.controls.canStop');
    expect(script).toContain("stopKind === 'turn' ? '停止任务' : stopKind === 'managed_process' ? '停止后台进程' : '停止'");
    expect(script).toContain('function renderConversation(snapshot)');
    expect((html.match(/id="rail-stop"/g) || [])).toHaveLength(1);
    expect(script).toContain("el('rail-stop').addEventListener('click'");
  });

  it('provides isolated conversation navigation and per-conversation encrypted drafts', () => {
    ['conversation-new', 'conversation-list', 'conversation-rename', 'conversation-archive', 'conversation-archive-list'].forEach((id) => {
      expect(html).toContain(`id="${id}"`);
    });
    expect(script).toContain('function renderConversationDirectory(snapshot)');
    expect(script).toContain('a9.createConversation()');
    expect(script).toContain('a9.activateConversation(conversationId)');
    expect(script).toContain('a9.archiveConversation(state.activeConversationId)');
    expect(script).toContain('a9.restoreConversation(conversationId)');
    expect(script).toContain("root.setTimeout(() => { void saveDraftNow(); }, 450)");
    expect(script).toContain("a9.saveDraft(el('task-prompt').value)");
    expect(css).toContain('.conversation-directory');
    expect(css).toContain('.conversation-list');
  });

  it('shows complete checkpoint identities and rebuilds persisted conversation cards', () => {
    expect(script).toContain('identity.textContent = String(checkpoint.turnId);');
    expect(script).toContain('identity.title = String(checkpoint.turnId);');
    expect(script).not.toContain('String(checkpoint.turnId).slice(0, 16)');
    expect(script).toContain("copy.textContent = '复制 ID';");
    expect(script).toContain('copyText(String(checkpoint.turnId))');
    expect(script).toContain('const facts = snapshot.conversation || [];');
    expect(css).toContain('.checkpoint-id');
    expect(css).toContain('overflow-wrap: anywhere');
  });

  it('waits for A9 managed-process cleanup before Electron quits', () => {
    expect(main).toContain("app.on('before-quit', beginA9ShutdownBeforeQuit)");
    expect(main).toContain('await a9RuntimeInstance.shutdown()');
    expect(main).toContain('A9_SHUTDOWN_RESIDUE');
    expect(main).toContain("dialog.showErrorBox('无法确认安全退出'");
  });

  it('binds approvals to conversation/task/turn and disables both actions while processing', () => {
    expect(script).toContain('card.dataset.conversationId = pending.conversationId');
    expect(script).toContain('card.dataset.taskId = pending.taskId');
    expect(script).toContain('card.dataset.turnId = pending.turnId');
    expect(script).toContain('a9.resumeApproval(approvalId, decision, bindingDigest, conversationId, taskId, turnId)');
    expect(script).toContain("button.textContent = busy ? '处理中…' : label");
  });

  it('drives the production workbench contract in the formal Electron smoke', () => {
    expect(smokeDriver).toContain("includes('renderer/workbench.html')");
    expect(smokeDriver).toContain("getElementById('task-prompt')");
    expect(smokeDriver).toContain("getElementById('run-task')");
    expect(smokeDriver).toContain("getElementById(\"cancel-task\")");
    expect(smokeDriver).toContain('A9F0-MAIN-COMPOSER-A9-BOUNDARY');
    expect(smokeDriver).not.toContain('getElementById("a9-prompt")');
    expect(smokeDriver).not.toContain('getElementById("a9-submit")');
    expect(smokeDriver).not.toContain('getElementById("a9-stop")');
  });

  it('limits Alpha 1 mode selection to Full Access and Read Only', () => {
    expect(html).toContain('name="a9-mode-choice" value="full_access"');
    expect(html).toContain('name="a9-mode-choice" value="read_only"');
    expect(html).not.toContain('value="review"');
    expect(html).toContain('Review</strong><p>完整准备、审批与应用工作流将在下一阶段提供');
    expect(script).toContain("const SUPPORTED_MODES = new Set(['full_access', 'read_only']);");
    expect(script).toContain("snapshot.mode === 'review'");
  });

  it('uses contextual Inspector tabs instead of a long duplicate control stack', () => {
    ['files', 'changes', 'activity', 'environment'].forEach((name) => {
      expect(html).toContain(`id="inspector-tab-${name}"`);
      expect(html).toContain(`id="inspector-panel-${name}"`);
    });
    expect(html).not.toContain('Provider 配置（任意 Base URL');
    expect(html).not.toContain('A8 历史能力');
    expect(script).toContain("const TAB_IDS = ['files', 'changes', 'activity', 'environment'];");
  });

  it('keeps Provider secrets in one progressive Settings surface with explicit insecure TLS confirmation', () => {
    expect((html.match(/id="a9-provider-key"/g) || [])).toHaveLength(1);
    expect((html.match(/id="a9-provider-apply"/g) || [])).toHaveLength(1);
    expect(html).toContain('<summary>企业网络</summary>');
    expect(html).toContain('<summary>危险设置</summary>');
    expect(html).toContain('id="a9-insecure-dialog"');
    expect(script).toContain("el('a9-provider-key').value = '';");
    expect(script).toContain("el('a9-provider-header-value').value = '';");
    expect(script).toContain("setFieldError('a9-provider-diagnostics'");
  });

  it('preserves the local CSP and Renderer isolation boundary', () => {
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("frame-src 'none'");
    expect(script).not.toMatch(/require\(|child_process|\bfetch\(|WebSocket\(|XMLHttpRequest/);
    expect(script).toContain('const api = root.win7Agent;');
  });

  it('defines semantic dark tokens, stable targets, responsive drawers and reduced motion', () => {
    expect(css).toContain('--bg-canvas:');
    expect(css).toContain('--text-primary:');
    expect(css).toContain('--accent:');
    expect(css).toContain('min-height: 44px');
    expect(css).toContain('@media (max-width: 1199px)');
    expect(css).toContain('@media (max-width: 799px)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('grid-template-columns: 232px minmax(500px, 1fr) 360px');
    expect(script).toContain('function trapFocus(container, event)');
  });
});
