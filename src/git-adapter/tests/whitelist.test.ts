/**
 * @module whitelist.test
 * @description Git 命令白名单测试 — 读类允许、写类需审批、网络类禁止、未列命令禁止
 */

import {
  validateWhitelist,
  findCommandDef,
  getCommandCategory,
} from '../src/whitelist';
import { GitCommandCategory, GitRequest } from '../src/types';

function makeRequest(overrides: Partial<GitRequest> = {}): GitRequest {
  return {
    command: 'status',
    args: [],
    workDir: '/workspace',
    ...overrides,
  };
}

describe('findCommandDef()', () => {
  it('找到读类命令 status', () => {
    const def = findCommandDef('status');
    expect(def).toBeDefined();
    expect(def!.category).toBe(GitCommandCategory.READ);
    expect(def!.allowed).toBe(true);
  });

  it('找到写类命令 commit', () => {
    const def = findCommandDef('commit');
    expect(def).toBeDefined();
    expect(def!.category).toBe(GitCommandCategory.WRITE);
  });

  it('找到网络类命令 fetch（allowed=false）', () => {
    const def = findCommandDef('fetch');
    expect(def).toBeDefined();
    expect(def!.category).toBe(GitCommandCategory.NETWORK);
    expect(def!.allowed).toBe(false);
  });

  it('找到 worktree:list 子命令', () => {
    const def = findCommandDef('worktree', 'list');
    expect(def).toBeDefined();
    expect(def!.command).toBe('worktree');
    expect(def!.subcommand).toBe('list');
  });

  it('找到 worktree:add 子命令', () => {
    const def = findCommandDef('worktree', 'add');
    expect(def).toBeDefined();
    expect(def!.category).toBe(GitCommandCategory.WRITE);
  });

  it('未注册的命令返回 undefined', () => {
    const def = findCommandDef('submodule');
    expect(def).toBeUndefined();
  });
});

describe('validateWhitelist()', () => {
  describe('读类命令（允许）', () => {
    const readCommands = ['status', 'diff', 'log', 'show', 'branch', 'rev-parse', 'cat-file', 'ls-files', 'tag'];

    it.each(readCommands)('允许 %s', (command) => {
      const result = validateWhitelist(makeRequest({ command, args: [] }));
      expect(result.allowed).toBe(true);
      expect(result.found).toBe(true);
    });

    it('允许 worktree list', () => {
      const result = validateWhitelist(makeRequest({ command: 'worktree', args: ['list'] }));
      expect(result.allowed).toBe(true);
    });
  });

  describe('写类命令（在白名单中但需审批）', () => {
    it('add 在白名单中', () => {
      const result = validateWhitelist(makeRequest({ command: 'add', args: ['file.txt'] }));
      expect(result.found).toBe(true);
      expect(result.commandDef!.category).toBe(GitCommandCategory.WRITE);
    });

    it('commit 在白名单中', () => {
      const result = validateWhitelist(makeRequest({ command: 'commit', args: ['-m', 'msg'] }));
      expect(result.found).toBe(true);
    });

    it('worktree add 在白名单中', () => {
      const result = validateWhitelist(makeRequest({ command: 'worktree', args: ['add', '/path'] }));
      expect(result.found).toBe(true);
      expect(result.commandDef!.category).toBe(GitCommandCategory.WRITE);
    });
  });

  describe('网络类命令（v1 禁止）', () => {
    const networkCommands = ['fetch', 'push', 'clone', 'pull'];

    it.each(networkCommands)('禁止 %s', (command) => {
      const result = validateWhitelist(makeRequest({ command }));
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('prohibited');
    });
  });

  describe('未列命令（fail-closed 默认拒绝）', () => {
    it('拒绝 submodule', () => {
      const result = validateWhitelist(makeRequest({ command: 'submodule' }));
      expect(result.allowed).toBe(false);
      expect(result.found).toBe(false);
      expect(result.reason).toContain('fail-closed');
    });

    it('拒绝 config --global', () => {
      const result = validateWhitelist(makeRequest({ command: 'config', args: ['--global', '--list'] }));
      expect(result.allowed).toBe(false);
    });

    it('拒绝 rebase --interactive', () => {
      const result = validateWhitelist(makeRequest({ command: 'rebase', args: ['--interactive', 'HEAD~3'] }));
      expect(result.allowed).toBe(false);
    });

    it('拒绝完全未知的命令', () => {
      const result = validateWhitelist(makeRequest({ command: 'unknown-command' }));
      expect(result.allowed).toBe(false);
      expect(result.found).toBe(false);
    });
  });
});

describe('getCommandCategory()', () => {
  it('status 返回 READ', () => {
    expect(getCommandCategory('status')).toBe(GitCommandCategory.READ);
  });

  it('commit 返回 WRITE', () => {
    expect(getCommandCategory('commit')).toBe(GitCommandCategory.WRITE);
  });

  it('push 返回 NETWORK', () => {
    expect(getCommandCategory('push')).toBe(GitCommandCategory.NETWORK);
  });

  it('未知命令返回 undefined', () => {
    expect(getCommandCategory('unknown')).toBeUndefined();
  });
});
