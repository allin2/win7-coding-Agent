'use strict';

/**
 * A9 产品 IPC（A9-06）：版本化 + Schema 校验的 a9 动作白名单。
 * Renderer 只能通过此窄接口访问 A9 能力；未知 action / 多余字段 / 类型
 * 不符一律结构化拒绝。Renderer 不获得 fs/child_process/凭据/任意网络。
 */

const { serializeError } = require('./desktop-host');

const A9_ACTIONS = Object.freeze({
  SNAPSHOT_GET: 'a9.snapshot.get',
  MODE_SET: 'a9.mode.set',
  PROVIDER_CONFIGURE: 'a9.provider.configure',
  PROVIDER_PROBE: 'a9.provider.probe',
  TURN_SUBMIT: 'a9.turn.submit',
  TURN_RESUME_APPROVAL: 'a9.turn.resumeApproval',
  TURN_STOP: 'a9.turn.stop',
  CONVERSATION_CREATE: 'a9.conversation.create',
  CONVERSATION_ACTIVATE: 'a9.conversation.activate',
  CONVERSATION_RENAME: 'a9.conversation.rename',
  CONVERSATION_ARCHIVE: 'a9.conversation.archive',
  CONVERSATION_RESTORE: 'a9.conversation.restore',
  DRAFT_SAVE: 'a9.draft.save',
  CHECKPOINT_LIST: 'a9.checkpoint.list',
  CHECKPOINT_UNDO_TURN: 'a9.checkpoint.undoTurn',
  CHECKPOINT_UNDO_FILE: 'a9.checkpoint.undoFile',
  DIFF_GET: 'a9.diff.get',
  GIT_STATUS: 'a9.git.status',
});

/**
 * v3（ADR-0098）：增加对话/草稿白名单，审批回复绑定对话+任务+Turn。
 */
const A9_IPC_SCHEMA_VERSION = 3;

function exactObject(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new Error(`${code}: request must be an object`), { code });
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw Object.assign(new Error(`${code}: unknown field '${key}'`), { code });
  }
  for (const key of keys) {
    if (!(key in value)) throw Object.assign(new Error(`${code}: missing field '${key}'`), { code });
  }
}

function createA9ProductRequestHandler(options) {
  const config = options || {};
  return async function handleA9ProductRequest(event, request) {
    if (!config.isValidRendererSender || !config.isValidRendererSender(event)) {
      return { ok: false, error: { code: 'RENDERER_CAPABILITY_DENIED' } };
    }
    try {
      exactObject(request, ['schemaVersion', 'action', 'payload'], 'A9_REQUEST_SCHEMA_INVALID');
      if (request.schemaVersion !== A9_IPC_SCHEMA_VERSION) {
        throw Object.assign(new Error(`A9_SCHEMA_VERSION_UNSUPPORTED:${request.schemaVersion}`), { code: 'A9_SCHEMA_VERSION_UNSUPPORTED' });
      }
      if (!Object.values(A9_ACTIONS).includes(request.action)) {
        throw Object.assign(new Error(`A9_ACTION_UNAVAILABLE:${request.action}`), { code: 'A9_ACTION_UNAVAILABLE' });
      }
      const runtime = config.getA9Runtime ? await config.getA9Runtime() : null;
      if (runtime && runtime.__a9WorkspaceRequired === true) {
        return {
          ok: false,
          error: {
            code: 'A9_WORKSPACE_REQUIRED',
            message: '尚未选择工作区：A9 runtime 只能绑定主进程确认的活动工作区。',
            recommendedAction: '在产品中选择一个本地工作区后重试。',
          },
        };
      }
      if (!runtime) throw Object.assign(new Error('A9_RUNTIME_UNAVAILABLE'), { code: 'A9_RUNTIME_UNAVAILABLE' });

      const payload = request.payload || {};
      switch (request.action) {
        case A9_ACTIONS.SNAPSHOT_GET:
          return { ok: true, snapshot: runtime.getSnapshot() };
        case A9_ACTIONS.MODE_SET: {
          exactObject(payload, ['mode'], 'A9_PAYLOAD_INVALID');
          return runtime.setMode(payload.mode);
        }
        case A9_ACTIONS.PROVIDER_CONFIGURE: {
          const allowed = ['baseUrl', 'model', 'apiKey', 'rememberApiKey', 'customHeaders', 'caBundle', 'proxy'];
          for (const key of Object.keys(payload)) {
            if (!allowed.includes(key)) throw Object.assign(new Error(`A9_PAYLOAD_INVALID: unknown '${key}'`), { code: 'A9_PAYLOAD_INVALID' });
          }
          return runtime.configureProvider(payload);
        }
        case A9_ACTIONS.PROVIDER_PROBE:
          return { ok: true, probe: await runtime.probeProvider() };
        case A9_ACTIONS.TURN_SUBMIT: {
          exactObject(payload, ['prompt'], 'A9_PAYLOAD_INVALID');
          return runtime.submitTurn(payload.prompt);
        }
        case A9_ACTIONS.TURN_RESUME_APPROVAL: {
          exactObject(payload, ['approvalId', 'decision', 'bindingDigest', 'conversationId', 'taskId', 'turnId'], 'A9_PAYLOAD_INVALID');
          if (payload.decision !== 'approved' && payload.decision !== 'denied') {
            throw Object.assign(new Error('A9_PAYLOAD_INVALID: decision must be approved|denied'), { code: 'A9_PAYLOAD_INVALID' });
          }
          return runtime.resumeApproval(payload);
        }
        case A9_ACTIONS.TURN_STOP:
          return runtime.stop();
        case A9_ACTIONS.CONVERSATION_CREATE:
          exactObject(payload, [], 'A9_PAYLOAD_INVALID');
          return runtime.createConversation();
        case A9_ACTIONS.CONVERSATION_ACTIVATE:
          exactObject(payload, ['conversationId'], 'A9_PAYLOAD_INVALID');
          return runtime.activateConversation(payload.conversationId);
        case A9_ACTIONS.CONVERSATION_RENAME:
          exactObject(payload, ['conversationId', 'title'], 'A9_PAYLOAD_INVALID');
          return runtime.renameConversation(payload.conversationId, payload.title);
        case A9_ACTIONS.CONVERSATION_ARCHIVE:
          exactObject(payload, ['conversationId'], 'A9_PAYLOAD_INVALID');
          return runtime.archiveConversation(payload.conversationId);
        case A9_ACTIONS.CONVERSATION_RESTORE:
          exactObject(payload, ['conversationId'], 'A9_PAYLOAD_INVALID');
          return runtime.restoreConversation(payload.conversationId);
        case A9_ACTIONS.DRAFT_SAVE:
          exactObject(payload, ['text'], 'A9_PAYLOAD_INVALID');
          return runtime.saveDraft(payload.text);
        case A9_ACTIONS.CHECKPOINT_LIST:
          return { ok: true, checkpoints: runtime.getSnapshot().checkpoints };
        case A9_ACTIONS.CHECKPOINT_UNDO_TURN: {
          exactObject(payload, ['turnId'], 'A9_PAYLOAD_INVALID');
          return runtime.undoTurn(payload.turnId);
        }
        case A9_ACTIONS.CHECKPOINT_UNDO_FILE: {
          exactObject(payload, ['turnId', 'path'], 'A9_PAYLOAD_INVALID');
          return runtime.undoFile(payload.turnId, payload.path);
        }
        case A9_ACTIONS.DIFF_GET: {
          exactObject(payload, ['turnId'], 'A9_PAYLOAD_INVALID');
          return runtime.getDiff(payload.turnId);
        }
        case A9_ACTIONS.GIT_STATUS:
          return runtime.gitStatus();
        default:
          throw Object.assign(new Error('A9_ACTION_UNAVAILABLE'), { code: 'A9_ACTION_UNAVAILABLE' });
      }
    } catch (error) {
      return { ok: false, error: serializeError(error) };
    }
  };
}

module.exports = { createA9ProductRequestHandler, A9_ACTIONS, A9_IPC_SCHEMA_VERSION };
