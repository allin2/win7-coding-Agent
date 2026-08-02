import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const quick = process.argv.includes('--quick');
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const modules = [
  'gateway',
  'workspace',
  'state',
  'core',
  'runner',
  'git-adapter',
  'shell',
];

let failures = 0;

runDesignGuards();

for (const moduleName of modules) {
  const moduleDir = join(repositoryRoot, 'src', moduleName);
  const packagePath = join(moduleDir, 'package.json');
  if (!existsSync(packagePath)) {
    reportFailure(moduleName, 'package.json 不存在；整合分支可能缺少权威源码');
    continue;
  }
  if (!existsSync(join(moduleDir, 'node_modules'))) {
    reportFailure(
      moduleName,
      `依赖未安装；先执行 ${npmExecutable} ci --prefix src/${moduleName}`,
    );
    continue;
  }

  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  const commands = [];
  if (packageJson.scripts?.lint) commands.push(['run', 'lint']);
  if (packageJson.scripts?.build) commands.push(['run', 'build']);
  if (!quick && packageJson.scripts?.test) commands.push(['test', '--', '--runInBand']);

  for (const args of commands) {
    console.log(`\n[verify] ${moduleName}: npm ${args.join(' ')}`);
    const result = spawnSync(npmExecutable, args, {
      cwd: moduleDir,
      stdio: 'inherit',
      shell: false,
      env: { ...process.env, CI: '1' },
    });
    if (result.error) {
      reportFailure(moduleName, result.error.message);
      break;
    }
    if (result.status !== 0) {
      reportFailure(moduleName, `命令退出码 ${String(result.status)}`);
      break;
    }
  }
}

if (failures > 0) {
  console.error(`\n[verify] 失败：${failures} 个模块未通过。请从上方第一个失败命令开始处理。`);
  process.exit(1);
}

console.log(`\n[verify] 通过：${modules.length} 个 Phase 3–7 模块完成${quick ? '编译/静态' : '编译/静态/测试'}验证。`);
console.log('[verify] 此结果不等于 Win7 实机验收通过。');

function runDesignGuards() {
  console.log('[verify] design-guards: Agent 安全闭环静态门');
  const guards = [
    {
      name: '完成态必须经过 Verification Gate',
      file: 'src/core/src/state-machine.ts',
      includes: [
        "['execution_complete', AgentState.VERIFYING]",
        "['verification_passed', AgentState.COMPLETED]",
      ],
    },
    {
      name: 'Agent Loop 必须把工具结果送回下一模型 Step 并提供预算收尾',
      file: 'src/core/src/runtime.ts',
      includes: [
        'while (true)',
        'messages.push({',
        "role: 'tool'",
        'callModelWithRetry(',
        'requestFinalSummary(',
      ],
    },
    {
      name: 'Turn 必须穷举六类结局和四维预算',
      file: 'src/core/src/loop-control.ts',
      includes: [
        "COMPLETED = 'completed'",
        "NEEDS_APPROVAL = 'needs_approval'",
        "BUDGET_EXCEEDED = 'budget_exceeded'",
        "CANCELLED = 'cancelled'",
        "STUCK = 'stuck'",
        "FAILED = 'failed'",
        'maxSteps',
        'maxTokens',
        'maxWallMs',
        'maxToolCalls',
      ],
    },
    {
      name: '能力令牌必须绑定具体 ToolCall',
      file: 'src/core/src/policy.ts',
      includes: [
        'bindCapabilityToToolCall(toolCall)',
        '能力令牌与工具请求、预览或工作区基线不匹配',
      ],
    },
    {
      name: 'Workspace 写入点必须消费审批记录',
      file: 'src/workspace/src/apply.ts',
      includes: ['approvalLedger.validateAndConsume(', 'workspaceRoot'],
    },
    {
      name: 'Runner 执行点必须消费审批记录',
      file: 'src/runner/src/runner.ts',
      includes: ['approvalLedger.validateAndConsume(', 'APPROVAL_REQUIRED'],
    },
    {
      name: 'Git Adapter 只能通过注入 Runner 执行',
      file: 'src/git-adapter/src/adapter.ts',
      includes: ['GitRunnerPort', 'this.runner.execute('],
      excludes: [
        /from\s+['"]child_process['"]/,
        /require\(\s*['"]child_process['"]\s*\)/,
        /import\(\s*['"]child_process['"]\s*\)/,
      ],
    },
  ];

  for (const guard of guards) {
    const absolutePath = join(repositoryRoot, guard.file);
    if (!existsSync(absolutePath)) {
      reportFailure('design-guards', `${guard.name}: ${guard.file} 不存在`);
      continue;
    }
    const source = readFileSync(absolutePath, 'utf8');
    const missing = (guard.includes ?? []).filter((value) => !source.includes(value));
    const forbidden = (guard.excludes ?? []).filter((pattern) => pattern.test(source));
    if (missing.length > 0 || forbidden.length > 0) {
      reportFailure(
        'design-guards',
        `${guard.name}: 缺少 ${missing.join(', ') || '无'}；命中禁用模式 ${forbidden.join(', ') || '无'}`,
      );
      continue;
    }
    console.log(`[verify] design-guards 通过：${guard.name}`);
  }
}

function reportFailure(moduleName, reason) {
  failures += 1;
  console.error(`[verify] ${moduleName} 失败：${reason}`);
}
