import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

function loadController(): any {
  const source = fs.readFileSync(path.join(__dirname, '../../product/renderer/composer-controller.js'), 'utf8');
  const context: any = { window: {} };
  vm.runInNewContext(source, context);
  return context.window.win7AgentComposerController;
}

describe('A8-01 composer keyboard and mode contract', () => {
  it('submits with Enter but preserves Shift+Enter and IME composition', () => {
    const controller = loadController();
    expect(controller.shouldSubmit({ key: 'Enter' })).toBe(true);
    expect(controller.shouldSubmit({ key: 'Enter', shiftKey: true })).toBe(false);
    expect(controller.shouldSubmit({ key: 'Enter', isComposing: true })).toBe(false);
    expect(controller.shouldSubmit({ key: 'a' })).toBe(false);
  });

  it('prevents the newline only for an actual submission', () => {
    const controller = loadController();
    const preventDefault = jest.fn();
    const submit = jest.fn();
    expect(controller.handleKeydown({ key: 'Enter', shiftKey: true, preventDefault }, submit)).toBe(false);
    expect(controller.handleKeydown({ key: 'Enter', preventDefault }, submit)).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('allows only direct or plan execution modes', () => {
    const controller = loadController();
    expect(controller.normalizeMode('plan')).toBe('plan');
    expect(controller.normalizeMode('direct')).toBe('direct');
    expect(controller.normalizeMode('autonomous')).toBe('direct');
  });
});
