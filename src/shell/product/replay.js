'use strict';

/**
 * Deterministic model adapter for Desktop Alpha 1/2.
 *
 * This adapter deliberately has no network, process or filesystem access. It
 * only chooses structured ToolCalls from the ToolResult messages that Core
 * gives back to it. A2 edit calls are intents; the trusted preparer owns all
 * filesystem reads, hashes and writes.
 */
class ReplayModelAdapter {
  constructor(core, scenario, options) {
    this.core = core;
    this.scenario = scenario || 'structure';
    this.options = options || {};
    this.step = 0;
  }

  async createPlan(input) {
    this.step += 1;
    if (this.scenario === 'cancellable') await cancellablePause(input.signal);

    const observations = toolObservations(input.messages);
    const toolNames = observations.map((item) => item.toolName);
    const last = observations[observations.length - 1];

    if (!toolNames.includes('workspace.list_directory')) {
      return plan(this.core, `Replay 已开始：读取工作区目录结构。`, [
        call(this.core, `list-${this.step}`, 'workspace.list_directory', {}),
      ]);
    }

    if (!toolNames.includes('workspace.search_text')) {
      return plan(this.core, `Replay 正在搜索与任务相关的代码线索。`, [
        call(this.core, `search-${this.step}`, 'workspace.search_text', {
          pattern: searchPattern(input.messages),
          contextLines: 1,
        }),
      ]);
    }

    if (!toolNames.includes('workspace.read_text')) {
      const listed = firstToolOutput(observations, 'workspace.list_directory');
      const searched = firstToolOutput(observations, 'workspace.search_text');
      const target = this.scenario === 'encoding'
        ? encodingTarget(listed)
        : searchTarget(searched) || fileTarget(listed);
      if (!target) {
        return finalPlan('Replay 找不到可读取的文本文件；请选择包含源文件的工作区后重试。');
      }
      const encoding = this.scenario === 'encoding' && /\.(gbk|cp936)$/i.test(target)
        ? 'gbk'
        : 'utf-8';
      return plan(this.core, `Replay 正在读取 ${target}。`, [
        call(this.core, `read-${this.step}`, 'workspace.read_text', {
          path: target,
          ...(encoding === 'gbk' ? { encoding } : {}),
          startLine: 1,
          maxLines: 120,
        }),
      ]);
    }

    const read = last && last.toolName === 'workspace.read_text' ? last.output : undefined;
    const readPath = read && typeof read.path === 'string' ? read.path : '工作区文件';
    if (this.scenario === 'edit' || this.scenario === 'undo') {
      if (last && last.toolName === 'workspace.str_replace' && last.status === 'denied') {
        return finalPlan('用户拒绝了这次单文件修改，Replay 保持工作区不变。');
      }
      if (last && last.toolName === 'workspace.str_replace' && last.status === 'succeeded') {
        return finalPlan('单文件修改已完成：原子写入、内容校验和审批绑定均已通过。');
      }
      if (last && last.toolName === 'workspace.str_replace' && last.status === 'failed') {
        const reason = writeFailureReason(last.output) || last.error;
        if (/Base content (changed|disappeared)/i.test(reason || '')) {
          return finalPlan('REPLAN_REQUIRED：审批前后工作区基线已变化，未执行写入。请重新生成单文件修改计划。');
        }
        return finalPlan(`单文件修改未执行：${reason || 'Workspace apply failed; please regenerate the plan.'}`);
      }
      const intent = this.options.writeIntent || editIntent(read);
      if (!intent || !intent.oldText || !intent.newText || !intent.path) {
        return finalPlan('Replay 未能生成唯一的单文件修改意图；请先准备包含非空文本行的 UTF-8 文件。');
      }
      return plan(this.core, `Replay 已生成单文件修改意图：${intent.path}。等待可信计划与用户审批。`, [
        writeCall(this.core, `write-${this.step}`, intent),
      ]);
    }
    return finalPlan(
      `Replay 分析完成：已通过 Core Runtime 使用 list/search/read 检查 ${readPath}。` +
      ` 当前结果来自确定性 Replay，不代表真实模型调用。`,
    );
  }
}

function writeCall(core, id, intent) {
  return {
    call: {
      id,
      toolName: 'workspace.str_replace',
      args: { path: intent.path, oldText: intent.oldText, newText: intent.newText },
      approvalLevel: core.ApprovalLevel.WORKSPACE_WRITE,
      // Deliberately fake values: the trusted preparer must replace these.
      approvalContext: { previewSha256: 'model-untrusted', baselineSha256: 'model-untrusted' },
    },
  };
}

function editIntent(read) {
  if (!read || typeof read.path !== 'string' || typeof read.content !== 'string') return undefined;
  const first = read.content.split(/\r\n|\n|\r/).find((line) => /^\s*\d+:\s+/.test(line));
  if (!first) return undefined;
  const separator = first.indexOf(': ');
  const oldText = separator >= 0 ? first.slice(separator + 2) : '';
  if (!oldText.trim()) return undefined;
  return { path: read.path, oldText, newText: oldText + ' // A2 Replay edit' };
}

function writeFailureReason(output) {
  if (!output || typeof output !== 'object') return '';
  if (typeof output.error === 'string') return output.error;
  if (!Array.isArray(output.operations)) return '';
  const failed = output.operations.find((operation) => operation && operation.success === false);
  return failed && typeof failed.error === 'string' ? failed.error : '';
}

function call(core, id, toolName, args) {
  return {
    call: {
      id,
      toolName,
      args,
      approvalLevel: core.ApprovalLevel.READ_ONLY,
    },
  };
}

function plan(core, summary, toolCalls) {
  return {
    schemaVersion: '1.0',
    summary,
    toolCalls,
    verificationRequirements: [],
    usage: { inputTokens: 10, outputTokens: 8 },
  };
}

function finalPlan(content) {
  return {
    schemaVersion: '1.0',
    summary: content,
    finalResponse: content,
    toolCalls: [],
    verificationRequirements: [],
    usage: { inputTokens: 12, outputTokens: Math.min(80, content.length) },
  };
}

function toolObservations(messages) {
  return messages
    .filter((message) => message && message.role === 'tool')
    .map((message) => {
      let value = {};
      const observation = message.observation && typeof message.observation.content === 'string'
        ? message.observation.content
        : message.content;
      try { value = JSON.parse(observation || '{}'); } catch (_error) { value = {}; }
      const output = value && value.output;
      return {
        toolName: typeof value.toolName === 'string' ? value.toolName : '',
        status: typeof value.status === 'string' ? value.status : '',
        output: output && typeof output === 'object' ? output : undefined,
      };
    });
}

function firstToolOutput(observations, toolName) {
  const item = observations.find((candidate) => candidate.toolName === toolName);
  return item && item.output;
}

function searchPattern(messages) {
  const user = messages.find((message) => message && message.role === 'user');
  const prompt = user && typeof user.content === 'string' ? user.content : '';
  if (/修改|写入|edit|write|撤销|undo/i.test(prompt)) return 'export';
  return /class|类|结构/.test(prompt) ? 'class' : 'function';
}

function searchTarget(output) {
  if (!output || !Array.isArray(output.matches)) return undefined;
  return output.matches.find((match) => match && typeof match.path === 'string')?.path;
}

function fileTarget(output) {
  if (!output || !Array.isArray(output.entries)) return undefined;
  const entry = output.entries.find((candidate) => candidate && candidate.type === 'file');
  return entry && typeof entry.path === 'string' ? entry.path : undefined;
}

function encodingTarget(output) {
  if (!output || !Array.isArray(output.entries)) return undefined;
  const entry = output.entries.find((candidate) => candidate && candidate.type === 'file' && /\.(gbk|cp936)$/i.test(candidate.name)) ||
    output.entries.find((candidate) => candidate && candidate.type === 'file');
  return entry && typeof entry.path === 'string' ? entry.path : undefined;
}

function cancellablePause(signal) {
  return new Promise((resolve, reject) => {
    let remaining = 20;
    let timer;
    const tick = () => {
      if (signal.aborted) {
        clearTimeout(timer);
        reject(new Error('Replay cancelled'));
        return;
      }
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
        return;
      }
      timer = setTimeout(tick, 25);
    };
    tick();
  });
}

module.exports = { ReplayModelAdapter };
