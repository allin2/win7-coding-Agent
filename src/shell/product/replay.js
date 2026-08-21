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

    const unsearchedScope = nextUnsearchedScope(observations);
    if (unsearchedScope !== undefined) {
      return plan(this.core, `Replay 正在搜索与任务相关的代码线索。`, [
        call(this.core, `search-${this.step}`, 'workspace.search_text', {
          pattern: searchPattern(input.messages),
          contextLines: 1,
          ...(unsearchedScope ? { path: unsearchedScope } : {}),
        }),
      ]);
    }

    const target = searchTarget(observations) || fileTarget(observations);
    if (!target) {
      const nextDirectory = nextUnlistedDirectory(observations);
      if (nextDirectory) {
        return plan(this.core, `Replay 正在检查目录 ${nextDirectory}。`, [
          call(this.core, `list-${this.step}`, 'workspace.list_directory', { path: nextDirectory }),
        ]);
      }
      return finalPlan('Replay 找不到可读取的文本文件；请选择包含源文件的工作区后重试。');
    }

    if (!toolNames.includes('workspace.read_text')) {
      const target = this.scenario === 'encoding'
        ? encodingTarget(observations)
        : searchTarget(observations) || fileTarget(observations);
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
    if (this.scenario === 'review') {
      if (last && last.toolName === 'workspace.review_prepare' && last.status === 'succeeded') {
        return finalPlan('Replay 已将多文件提案写入私有 Review 准备区；工作区尚未修改，等待逐文件决定。');
      }
      if (last && last.toolName === 'workspace.review_prepare' && last.status === 'failed') {
        return finalPlan(`Review 准备区创建失败：${writeFailureReason(last.output) || '提案未通过可信准备区校验。'}`);
      }
      const proposalsJson = reviewProposalsJson(
        this.options.reviewProposals || deriveReviewProposals(read),
      );
      if (!proposalsJson) return finalPlan('Replay 没有收到多文件提案；请重新生成 Review 任务。');
      return plan(this.core, 'Replay 已生成多文件准备区提案；等待可信 Host 写入私有 staging。', [
        call(this.core, `review-prepare-${this.step}`, 'workspace.review_prepare', { proposalsJson }),
      ]);
    }
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

function reviewProposalsJson(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 128) return '';
  try {
    const proposals = raw.map((proposal) => {
      if (!proposal || typeof proposal !== 'object' || typeof proposal.relativePath !== 'string' || typeof proposal.operation !== 'string') {
        throw new Error('invalid proposal');
      }
      const item = { relativePath: proposal.relativePath, operation: proposal.operation };
      if (proposal.operation !== 'DELETE') {
        const content = Buffer.isBuffer(proposal.afterContent)
          ? proposal.afterContent
          : typeof proposal.afterContentBase64 === 'string'
            ? Buffer.from(proposal.afterContentBase64, 'base64')
            : null;
        if (!content) throw new Error('missing after content');
        item.afterContentBase64 = content.toString('base64');
      }
      return item;
    });
    const encoded = JSON.stringify(proposals);
    return Buffer.byteLength(encoded, 'utf8') <= 20 * 1024 * 1024 ? encoded : '';
  } catch (_error) {
    return '';
  }
}

function deriveReviewProposals(read) {
  if (!read || typeof read.path !== 'string' || !Array.isArray(read.lines)) return [];
  const lines = read.lines
    .filter((line) => line && typeof line.text === 'string')
    .map((line) => line.text);
  if (lines.length === 0) return [];
  const first = `${lines[0]} // A8 Review Replay proposal`;
  lines[0] = first;
  return [{
    relativePath: read.path,
    operation: 'MODIFY',
    afterContent: Buffer.from(`${lines.join('\n')}\n`, 'utf8'),
  }];
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
  const lastUserIndex = messages.reduce((latest, message, index) =>
    message && message.role === 'user' ? index : latest, -1);
  return messages
    .slice(lastUserIndex + 1)
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

function searchTarget(observations) {
  return observations
    .filter((item) => item.toolName === 'workspace.search_text')
    .map((item) => item.output)
    .flatMap((output) => output && Array.isArray(output.matches) ? output.matches : [])
    .find((match) => match && typeof match.path === 'string')?.path;
}

function fileTarget(observations) {
  return observations
    .filter((item) => item.toolName === 'workspace.list_directory')
    .map((item) => item.output)
    .flatMap((output) => output && Array.isArray(output.entries) ? output.entries : [])
    .find((entry) => entry && entry.type === 'file' && typeof entry.path === 'string')?.path;
}

function encodingTarget(observations) {
  const entries = observations
    .filter((item) => item.toolName === 'workspace.list_directory')
    .map((item) => item.output)
    .flatMap((output) => output && Array.isArray(output.entries) ? output.entries : [])
    .filter((entry) => entry && entry.type === 'file' && typeof entry.path === 'string');
  const entry = entries.find((candidate) => /\.(gbk|cp936)$/i.test(candidate.name)) || entries[0];
  return entry && entry.path;
}

function nextUnsearchedScope(observations) {
  const listed = observations
    .filter((item) => item.toolName === 'workspace.list_directory' && item.output)
    .map((item) => item.output);
  const searched = new Set(observations
    .filter((item) => item.toolName === 'workspace.search_text' && item.output)
    .map((item) => scopeKey(item.output.root)));
  const candidate = listed.find((output) => !searched.has(scopeKey(output.path)));
  if (!candidate) return undefined;
  return scopePath(candidate.path);
}

function nextUnlistedDirectory(observations) {
  const listed = observations
    .filter((item) => item.toolName === 'workspace.list_directory' && item.output)
    .map((item) => item.output);
  const listedPaths = new Set(listed.map((output) => scopeKey(output.path)));
  for (const output of listed) {
    const directory = (output.entries || []).find((entry) => entry && entry.type === 'directory' && typeof entry.path === 'string' && !listedPaths.has(scopeKey(entry.path)));
    if (directory) return directory.path;
  }
  return undefined;
}

function scopeKey(value) {
  const normalized = String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
  return normalized || '.';
}

function scopePath(value) {
  return scopeKey(value) === '.' ? '' : String(value).replace(/\\/g, '/');
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
