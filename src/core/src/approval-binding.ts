import * as crypto from 'crypto';
import { ApprovalLevel, CapabilityBinding, ToolCall } from './types';

/** Build the exact approval identity used by Broker and Policy. */
export function bindCapabilityToToolCall(call: ToolCall): CapabilityBinding {
  if (call.approvalLevel !== ApprovalLevel.WORKSPACE_WRITE) {
    throw new TypeError('Only workspace_write calls can receive an approval binding');
  }
  if (!call.approvalContext) {
    throw new TypeError('workspace_write call requires preview and baseline digests');
  }
  return {
    callId: call.id,
    toolName: call.toolName,
    requestSha256: fingerprintToolCall(call),
    previewSha256: call.approvalContext.previewSha256,
    baselineSha256: call.approvalContext.baselineSha256,
  };
}

/** Deterministic request fingerprint; object key order cannot change approval identity. */
export function fingerprintToolCall(call: ToolCall): string {
  return crypto
    .createHash('sha256')
    .update(canonicalJson({
      callId: call.id,
      toolName: call.toolName,
      args: call.args,
      approvalLevel: call.approvalLevel,
    }), 'utf8')
    .digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}
