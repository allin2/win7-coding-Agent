'use strict';
const { keys, reject } = require('./input-binding.cjs');
const TITLE = '退出时处理后台进程';
const BUTTONS = Object.freeze(['停止后退出', '留给系统后退出', '取消']);
function identity(opened, current) {
  keys(current, ['request_id', 'source', 'master_sha256', 'revision_sha256', 'phase', 'product_pid', 'creation_ticks']);
  if (!['StopExit', 'ReleaseExit'].includes(current.phase) || !Number.isInteger(current.product_pid) || current.product_pid < 1 || !/^[1-9][0-9]{17}$/.test(current.creation_ticks)) reject('LIFECYCLE_DIALOG_IDENTITY');
  keys(opened, ['schema_version', 'request_id', 'source', 'revision_sha256', 'master_sha256', 'phase', 'product_pid', 'sequence', 'status', 'called_at']);
  if (opened.schema_version !== 1 || opened.status !== 'ACTUAL_NATIVE_API_CALLED' || !Number.isInteger(opened.sequence) || opened.sequence < 1 || opened.sequence > 4 || Object.keys(current).filter(k => k !== 'creation_ticks').some(k => opened[k] !== current[k])) reject('LIFECYCLE_DIALOG_BINDING');
  if (!Number.isFinite(Date.parse(opened.called_at))) reject('LIFECYCLE_DIALOG_CLOCK');
}
function planAction(opened, current, windows, now) {
  identity(opened, current);
  if (!Number.isFinite(now) || now < Date.parse(opened.called_at) || now - Date.parse(opened.called_at) > 120000) reject('TIMEOUT_NATIVE_DIALOG');
  if (!Array.isArray(windows) || windows.length !== 1) reject('UI_DIALOG_NOT_UNIQUE');
  const w = windows[0]; keys(w, ['product_pid', 'creation_ticks', 'title', 'buttons', 'provider_status']);
  if (w.product_pid !== current.product_pid || w.creation_ticks !== current.creation_ticks || w.title !== TITLE || w.provider_status !== 'SEMANTIC_WINDOW_OBSERVED') reject('UI_DIALOG_IDENTITY');
  if (!Array.isArray(w.buttons) || w.buttons.length !== BUTTONS.length || w.buttons.some((b, i) => { keys(b, ['name', 'enabled']); return b.name !== BUTTONS[i] || b.enabled !== true; })) reject('UI_DIALOG_BUTTONS');
  return { status: 'NOT_PERFORMED', reason: 'LOCAL_ACTION_CONTRACT_ONLY', request_id: current.request_id, sequence: opened.sequence, expected_button: BUTTONS[current.phase === 'StopExit' ? 0 : 1], expected_response: current.phase === 'StopExit' ? 0 : 1 };
}
function verifyResponse(receipt, opened, current) {
  identity(opened, current);
  keys(receipt, ['schema_version', 'request_id', 'source', 'revision_sha256', 'master_sha256', 'phase', 'product_pid', 'sequence', 'status', 'response', 'returned_at']);
  if (receipt.schema_version !== 1 || receipt.status !== 'ACTUAL_NATIVE_API_RETURNED' || Object.keys(current).filter(k => k !== 'creation_ticks').some(k => receipt[k] !== current[k]) || receipt.sequence !== opened.sequence) reject('LIFECYCLE_DIALOG_RESPONSE_BINDING');
  const elapsed = Date.parse(receipt.returned_at) - Date.parse(opened.called_at);
  if (!Number.isFinite(elapsed) || elapsed < 0) reject('LIFECYCLE_DIALOG_CLOCK');
  if (elapsed > 120000) reject('POST_FINAL_OBSERVATION_NOT_ACCEPTANCE');
  if (receipt.response !== (current.phase === 'StopExit' ? 0 : 1)) reject('SAFETY_DRIVER_HARD_GATE');
  return { response: receipt.response, elapsed_ms: elapsed, scope: 'RECEIPT_CHECK_ONLY_NOT_UI_EXECUTION' };
}
function performAction() { reject('SCOPE_GUI_NOT_AUTHORIZED'); }
module.exports = { TITLE, BUTTONS, planAction, verifyResponse, performAction };
if (require.main === module) { process.stderr.write(JSON.stringify({ status: 'NOT_PERFORMED', error: 'SCOPE_GUI_NOT_AUTHORIZED' }) + '\n'); process.exitCode = 1; }
