'use strict';

const { serializeError } = require('./desktop-host');

const ACTIONS = Object.freeze({
  SESSION_GET: 'session.get',
  GOAL_SET: 'goal.set',
  GOAL_RESOLVE: 'goal.resolve',
  WORKSPACE_LIST: 'workspace.list',
  WORKSPACE_READ: 'workspace.read',
  REVIEW_PREPARE: 'review.prepare',
  REVIEW_GET: 'review.get',
  REVIEW_DECIDE: 'review.decide',
  REVIEW_APPROVAL_ISSUE: 'review.approval.issue',
  REVIEW_APPLY: 'review.apply',
  REVIEW_VALIDATION: 'review.validation',
  REVIEW_RECOVERY: 'review.recovery',
  REVIEW_TASK_SUBMIT: 'review.task.submit',
});

const REVIEW_MUTATION_ACTIONS = new Set([
  ACTIONS.REVIEW_PREPARE,
  ACTIONS.REVIEW_DECIDE,
  ACTIONS.REVIEW_APPROVAL_ISSUE,
  ACTIONS.REVIEW_APPLY,
  ACTIONS.REVIEW_VALIDATION,
  ACTIONS.REVIEW_RECOVERY,
  ACTIONS.REVIEW_TASK_SUBMIT,
]);

function createA8ProductRequestHandler(options) {
  const config = options || {};
  return async function handleA8ProductRequest(event, request) {
    if (!config.isValidRendererSender(event)) throw new Error('RENDERER_CAPABILITY_DENIED');
    try {
      validateRequest(request);
      if (REVIEW_MUTATION_ACTIONS.has(request.action) && config.allowReviewMutations !== true) {
        throw codedError('A8_REVIEW_MUTATION_DISABLED_IN_A9');
      }
      const host = config.getDesktopHost();
      if (!host) throw codedError('DESKTOP_HOST_UNAVAILABLE');
      switch (request.action) {
        case ACTIONS.SESSION_GET:
          return { ok: true, projection: host.getSessionProjection(request.sessionId) };
        case ACTIONS.GOAL_SET:
          return { ok: true, result: host.setGoal({ sessionId: request.sessionId, ...request.payload }) };
        case ACTIONS.GOAL_RESOLVE:
          return { ok: true, result: host.resolveGoal({ sessionId: request.sessionId, ...request.payload }) };
        case ACTIONS.WORKSPACE_LIST:
          return { ok: true, result: host.listWorkspace({ sessionId: request.sessionId, ...request.payload }) };
        case ACTIONS.WORKSPACE_READ:
          return { ok: true, result: host.readWorkspaceFile({ sessionId: request.sessionId, ...request.payload }) };
        case ACTIONS.REVIEW_PREPARE:
          return { ok: true, result: host.prepareReview({ sessionId: request.sessionId, ...request.payload }) };
        case ACTIONS.REVIEW_GET:
          return { ok: true, result: host.getReview({ sessionId: request.sessionId, ...request.payload }) };
        case ACTIONS.REVIEW_DECIDE:
          return { ok: true, result: host.decideReview({ sessionId: request.sessionId, ...request.payload }) };
        case ACTIONS.REVIEW_APPROVAL_ISSUE:
          return { ok: true, result: host.issueReviewApproval({ sessionId: request.sessionId, ...request.payload }) };
        case ACTIONS.REVIEW_APPLY:
          return { ok: true, result: host.applyReview({ sessionId: request.sessionId, ...request.payload }) };
        case ACTIONS.REVIEW_VALIDATION:
          return { ok: true, result: host.recordReviewValidation({ sessionId: request.sessionId, ...request.payload }) };
        case ACTIONS.REVIEW_RECOVERY:
          return { ok: true, result: host.restoreReviewRecovery({ sessionId: request.sessionId, ...request.payload }) };
        case ACTIONS.REVIEW_TASK_SUBMIT:
          return { ok: true, result: host.submitTask({ sessionId: request.sessionId, prompt: request.payload.prompt, scenario: 'review' }) };
        default:
          throw codedError('A8_ACTION_UNAVAILABLE');
      }
    } catch (error) {
      return { ok: false, error: serializeError(error) };
    }
  };
}

function validateRequest(request) {
  exactObject(request, ['schemaVersion', 'action', 'sessionId', 'payload'], 'A8_REQUEST_SCHEMA_INVALID');
  if (request.schemaVersion !== 1 || !Object.values(ACTIONS).includes(request.action)) {
    throw codedError('A8_REQUEST_SCHEMA_INVALID');
  }
  nonEmptyString(request.sessionId, 'A8_REQUEST_SCHEMA_INVALID', 64);
  switch (request.action) {
    case ACTIONS.SESSION_GET:
      exactObject(request.payload, [], 'A8_REQUEST_SCHEMA_INVALID');
      return;
    case ACTIONS.GOAL_SET:
      exactObject(request.payload, ['text', 'expectedRevision'], 'A8_REQUEST_SCHEMA_INVALID');
      nonEmptyString(request.payload.text, 'A8_REQUEST_SCHEMA_INVALID', 2_000);
      revision(request.payload.expectedRevision);
      return;
    case ACTIONS.GOAL_RESOLVE:
      exactObject(request.payload, ['status', 'expectedRevision'], 'A8_REQUEST_SCHEMA_INVALID');
      if (request.payload.status !== 'ACHIEVED' && request.payload.status !== 'ABANDONED') {
        throw codedError('A8_REQUEST_SCHEMA_INVALID');
      }
      revision(request.payload.expectedRevision);
      return;
    case ACTIONS.WORKSPACE_LIST:
      exactObject(request.payload, ['path'], 'A8_REQUEST_SCHEMA_INVALID', ['path']);
      if (request.payload.path !== undefined) nonEmptyOrRootPath(request.payload.path);
      return;
    case ACTIONS.WORKSPACE_READ:
      exactObject(request.payload, ['path', 'encoding', 'startLine', 'maxLines'], 'A8_REQUEST_SCHEMA_INVALID', ['encoding', 'startLine', 'maxLines']);
      nonEmptyString(request.payload.path, 'A8_REQUEST_SCHEMA_INVALID', 1_024);
      if (request.payload.encoding !== undefined && request.payload.encoding !== 'utf-8' && request.payload.encoding !== 'gbk') {
        throw codedError('A8_REQUEST_SCHEMA_INVALID');
      }
      optionalInteger(request.payload.startLine, 1, 10_000_000);
      optionalInteger(request.payload.maxLines, 1, 500);
      return;
    case ACTIONS.REVIEW_PREPARE:
      exactObject(request.payload, ['taskId', 'proposals'], 'A8_REQUEST_SCHEMA_INVALID');
      nonEmptyString(request.payload.taskId, 'A8_REQUEST_SCHEMA_INVALID', 128);
      reviewProposals(request.payload.proposals);
      return;
    case ACTIONS.REVIEW_GET:
      exactObject(request.payload, ['taskId'], 'A8_REQUEST_SCHEMA_INVALID');
      nonEmptyString(request.payload.taskId, 'A8_REQUEST_SCHEMA_INVALID', 128);
      return;
    case ACTIONS.REVIEW_DECIDE:
      exactObject(request.payload, ['taskId', 'relativePath', 'decision'], 'A8_REQUEST_SCHEMA_INVALID');
      nonEmptyString(request.payload.taskId, 'A8_REQUEST_SCHEMA_INVALID', 128);
      nonEmptyString(request.payload.relativePath, 'A8_REQUEST_SCHEMA_INVALID', 1_024);
      if (!['PENDING', 'ACCEPTED', 'REJECTED'].includes(request.payload.decision)) throw codedError('A8_REQUEST_SCHEMA_INVALID');
      return;
    case ACTIONS.REVIEW_APPROVAL_ISSUE:
      exactObject(request.payload, ['taskId', 'subject'], 'A8_REQUEST_SCHEMA_INVALID');
      nonEmptyString(request.payload.taskId, 'A8_REQUEST_SCHEMA_INVALID', 128);
      nonEmptyString(request.payload.subject, 'A8_REQUEST_SCHEMA_INVALID', 128);
      return;
    case ACTIONS.REVIEW_APPLY:
      exactObject(request.payload, ['taskId', 'approval'], 'A8_REQUEST_SCHEMA_INVALID');
      nonEmptyString(request.payload.taskId, 'A8_REQUEST_SCHEMA_INVALID', 128);
      reviewApproval(request.payload.approval);
      return;
    case ACTIONS.REVIEW_VALIDATION:
      exactObject(request.payload, ['taskId', 'profileId', 'argv', 'status', 'complete', 'outputTruncated', 'summary', 'source', 'trustedAdapter', 'applicablePaths'], 'A8_REQUEST_SCHEMA_INVALID', ['profileId', 'argv', 'outputTruncated', 'trustedAdapter', 'applicablePaths']);
      nonEmptyString(request.payload.taskId, 'A8_REQUEST_SCHEMA_INVALID', 128);
      if (request.payload.profileId !== undefined) nonEmptyString(request.payload.profileId, 'A8_REQUEST_SCHEMA_INVALID', 128);
      if (request.payload.argv !== undefined) boundedStringArray(request.payload.argv, 128, 1_024);
      if (!['PASS', 'FAIL', 'CANCELLED', 'NOT_RUN'].includes(request.payload.status)) throw codedError('A8_REQUEST_SCHEMA_INVALID');
      if (typeof request.payload.complete !== 'boolean' || typeof request.payload.outputTruncated !== 'boolean' || typeof request.payload.trustedAdapter !== 'boolean') throw codedError('A8_REQUEST_SCHEMA_INVALID');
      nonEmptyString(request.payload.summary, 'A8_REQUEST_SCHEMA_INVALID', 8_000);
      nonEmptyString(request.payload.source, 'A8_REQUEST_SCHEMA_INVALID', 128);
      if (request.payload.applicablePaths !== undefined) boundedStringArray(request.payload.applicablePaths, 128, 1_024);
      return;
    case ACTIONS.REVIEW_RECOVERY:
      exactObject(request.payload, ['taskId'], 'A8_REQUEST_SCHEMA_INVALID');
      nonEmptyString(request.payload.taskId, 'A8_REQUEST_SCHEMA_INVALID', 128);
      return;
    case ACTIONS.REVIEW_TASK_SUBMIT:
      exactObject(request.payload, ['prompt'], 'A8_REQUEST_SCHEMA_INVALID');
      nonEmptyString(request.payload.prompt, 'A8_REQUEST_SCHEMA_INVALID', 8_000);
      return;
    default:
      throw codedError('A8_ACTION_UNAVAILABLE');
  }
}

function reviewProposals(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 128) throw codedError('A8_REQUEST_SCHEMA_INVALID');
  let totalBytes = 0;
  value.forEach((proposal) => {
    if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) throw codedError('A8_REQUEST_SCHEMA_INVALID');
    if (!['relativePath', 'operation', 'afterContentBase64'].every((key) => Object.prototype.hasOwnProperty.call(proposal, key)) && proposal.operation !== 'DELETE') throw codedError('A8_REQUEST_SCHEMA_INVALID');
    exactObject(proposal, ['relativePath', 'operation', 'afterContentBase64'], 'A8_REQUEST_SCHEMA_INVALID', proposal.operation === 'DELETE' ? ['afterContentBase64'] : []);
    nonEmptyString(proposal.relativePath, 'A8_REQUEST_SCHEMA_INVALID', 1_024);
    if (!['CREATE', 'MODIFY', 'DELETE'].includes(proposal.operation)) throw codedError('A8_REQUEST_SCHEMA_INVALID');
    if (proposal.operation !== 'DELETE') {
      if (typeof proposal.afterContentBase64 !== 'string' || proposal.afterContentBase64.length > 2_800_000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(proposal.afterContentBase64)) throw codedError('A8_REQUEST_SCHEMA_INVALID');
      totalBytes += Buffer.from(proposal.afterContentBase64, 'base64').length;
      if (totalBytes > 16 * 1024 * 1024) throw codedError('A8_REQUEST_SCHEMA_INVALID');
    }
  });
}

function reviewApproval(value) {
  exactObject(value, ['approvalId', 'sessionId', 'taskId', 'reviewId', 'revision', 'workspaceBaseHash', 'previewHash', 'acceptedSetHash', 'subject', 'expiresAt'], 'A8_REQUEST_SCHEMA_INVALID');
  ['approvalId', 'sessionId', 'taskId', 'reviewId', 'workspaceBaseHash', 'previewHash', 'acceptedSetHash', 'subject', 'expiresAt'].forEach((key) => nonEmptyString(value[key], 'A8_REQUEST_SCHEMA_INVALID', 256));
  revision(value.revision);
  ['workspaceBaseHash', 'previewHash', 'acceptedSetHash'].forEach((key) => { if (!/^[a-f0-9]{64}$/.test(value[key])) throw codedError('A8_REQUEST_SCHEMA_INVALID'); });
  if (!/^[a-z0-9-]+$/i.test(value.approvalId)) throw codedError('A8_REQUEST_SCHEMA_INVALID');
  if (!Number.isFinite(Date.parse(value.expiresAt))) throw codedError('A8_REQUEST_SCHEMA_INVALID');
}

function boundedStringArray(value, maxItems, maxLength) {
  if (!Array.isArray(value) || value.length > maxItems || value.some((item) => typeof item !== 'string' || item.length > maxLength)) throw codedError('A8_REQUEST_SCHEMA_INVALID');
}

function exactObject(value, allowed, code, optional) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw codedError(code);
  const optionalSet = new Set(optional || []);
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw codedError(code);
  if (allowed.some((key) => !optionalSet.has(key) && !Object.prototype.hasOwnProperty.call(value, key))) throw codedError(code);
}

function nonEmptyString(value, code, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) throw codedError(code);
}

function nonEmptyOrRootPath(value) {
  if (typeof value !== 'string' || value.length > 1_024) throw codedError('A8_REQUEST_SCHEMA_INVALID');
}

function revision(value) {
  if (!Number.isInteger(value) || value < 0) throw codedError('A8_REQUEST_SCHEMA_INVALID');
}

function optionalInteger(value, minimum, maximum) {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw codedError('A8_REQUEST_SCHEMA_INVALID');
}

function codedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

module.exports = { ACTIONS, createA8ProductRequestHandler, validateRequest };
