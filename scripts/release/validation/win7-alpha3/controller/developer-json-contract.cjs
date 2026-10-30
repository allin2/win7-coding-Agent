'use strict';
// Candidate-external JSON wire names. No aliases, key normalization or platform-dependent I/O.
const LOCAL_RESULT_FIELDS=Object.freeze(['ok','error','ssh_sessions','retries','started_utc','developer_utc','wall_seconds','exit_code','clock_skew_seconds','observed','script_sha256','stdout_sha256','stderr_sha256']);
const OBSERVED_FIELDS=Object.freeze(['machine_name','account_sid','active_console_session_id','logonui_present','new_root_exists','target_utc']);
const SIGNED_PREFLIGHT_FIELDS=Object.freeze([...OBSERVED_FIELDS,'developer_utc','clock_skew_seconds']);
const FINALIZATION_FIELDS=Object.freeze(['ok','status','authority_file','authority_sha256','owner_input_sha256','package_sha256','wrapper_sha256','preflight_result_sha256','developer_utc','confirmation_deadline_utc','confirmation_reply_verbatim','signed','activation','r1','remaining_confirmation_seconds']);
const ACTIVATION_FIELDS=Object.freeze(['ok','stage','verifier','evidence_class','run_id','authority_sha256','started_at_utc','common_deadline_utc']);
const ACTIVATION_ANCHOR_FIELDS=Object.freeze(['schema_version','run_id','authority_sha256','activation_sha256']);
function hasFields(value,names){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===names.length&&names.every(n=>Object.prototype.hasOwnProperty.call(value,n));}
function signingPreflight(result){return {...Object.fromEntries(OBSERVED_FIELDS.map(n=>[n,result.observed[n]])),developer_utc:result.developer_utc,clock_skew_seconds:result.clock_skew_seconds};}
module.exports={LOCAL_RESULT_FIELDS,OBSERVED_FIELDS,SIGNED_PREFLIGHT_FIELDS,FINALIZATION_FIELDS,ACTIVATION_FIELDS,ACTIVATION_ANCHOR_FIELDS,hasFields,signingPreflight};
