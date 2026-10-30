'use strict';
// ADR-0305 admission consumes read-only probe facts. It performs no cleanup or process action.
const c = require('./run-context.cjs');
function need(ok, code) { if (!ok) throw Error('CONTROLLER_ADMISSION:' + code); }
function admit(ctx, facts) {
  c.validate(ctx.descriptor);
  need(facts && facts.run_root === ctx.descriptor.remote_root, 'RUN_ROOT_BINDING');
  need(facts.run_directory_exists === false, 'RUN_DIRECTORY_EXISTS_OR_UNKNOWN');
  need(Number.isSafeInteger(facts.a9_dev_tasks) && facts.a9_dev_tasks === 0, 'A9_DEV_TASKS_NOT_ZERO_OR_UNKNOWN');
  need(Number.isSafeInteger(facts.channel_processes) && facts.channel_processes === 0, 'CHANNEL_PROCESSES_NOT_ZERO_OR_UNKNOWN');
  need(facts.lock_idle === true, 'LOCK_NOT_IDLE_OR_UNKNOWN');
  need(facts.ancestors_non_reparse === true, 'ANCESTORS_NOT_PROVED');
  need(typeof facts.machine_name === 'string' && facts.machine_name.toLowerCase() === ctx.budget.target_machine.toLowerCase() && facts.account_sid === ctx.budget.target_sid, 'IDENTITY');
  need(facts.session_id === ctx.budget.p1.target_session_id && facts.session_id > 0 && facts.console_active === true
    && facts.logonui_present === false, 'SESSION');
  return { ok: true, run_id: ctx.descriptor.run_id, evidence_class: ctx.descriptor.evidence_class };
}
module.exports = { admit };
