"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseNativeHelperResponse = exports.decodeNativeHelperBase64 = exports.hasCompleteHelperCleanupProof = void 0;
/** One profile-aware cleanup-proof predicate shared by every helper consumer. */
function hasCompleteHelperCleanupProof(result) {
    const hostJobOk = result.hostJob.childJobAssignmentVerified === true
        && (!result.hostJob.detected || result.hostJob.breakaway === 'explicit' || result.hostJob.breakaway === 'silent');
    const hostJobSemanticsOk = result.hostJob.detected
        ? result.hostJob.breakaway === 'explicit' || result.hostJob.breakaway === 'silent'
        : result.hostJob.breakaway === 'none';
    if ('schemaVersion' in result) {
        const tokenOk = result.profileId === 'a9-trusted-shell-current-user-v1'
            && result.tokenAudit.verified === true
            && result.tokenAudit.tokenMode === 'current_user'
            && result.tokenAudit.restrictedToken === false
            && result.tokenAudit.tokenType === 'primary'
            && result.tokenAudit.sameUser === true
            && result.tokenAudit.lowIntegrity === false;
        return result.containmentVerified === true && result.inputDetached === true
            && result.cleanupConfirmed === true && result.workDirAclModified === false
            && hostJobOk && hostJobSemanticsOk && tokenOk;
    }
    const tokenOk = result.tokenAudit.verified === true
        && result.tokenAudit.isRestricted === true
        && result.tokenAudit.tokenType === 'primary'
        && result.tokenAudit.restrictedSidSetVerified === true
        && result.tokenAudit.userRestrictedSid === true
        && result.tokenAudit.worldRestrictedSid === true
        && result.tokenAudit.administratorsRestrictedSid === false
        && result.tokenAudit.restrictedSidCount >= 2
        && result.tokenAudit.integritySid === 'S-1-16-4096'
        && result.tokenAudit.integrityRid === 4096;
    const aclOk = result.aclChanges.every((change) => !change.applied || (change.verified && change.rolledBack));
    return result.containmentVerified === true && result.inputDetached === true
        && hostJobOk && hostJobSemanticsOk && tokenOk && aclOk;
}
exports.hasCompleteHelperCleanupProof = hasCompleteHelperCleanupProof;
/** Reject permissive Node base64 decoding and bind declared byte counts. */
function decodeNativeHelperBase64(value, expectedSize, label) {
    if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
        throw new Error(`${label} is not canonical base64`);
    }
    const decoded = Buffer.from(value, 'base64');
    if (decoded.length !== expectedSize || decoded.toString('base64') !== value) {
        throw new Error(`${label} byte count or canonical encoding mismatch`);
    }
    return decoded;
}
exports.decodeNativeHelperBase64 = decodeNativeHelperBase64;
function parseNativeHelperResponse(line, expectedRequestId, expectedSchemaVersion = 1) {
    let value;
    try {
        value = JSON.parse(line);
    }
    catch (_error) {
        throw new Error('Helper response is not valid JSON');
    }
    if (!isRecord(value))
        throw new Error('Helper response is not an object');
    return expectedSchemaVersion === 2
        ? parseV2(value, expectedRequestId)
        : parseV1(value, expectedRequestId);
}
exports.parseNativeHelperResponse = parseNativeHelperResponse;
function parseV2(value, expectedRequestId) {
    if (value.schemaVersion !== 2 || value.requestId !== expectedRequestId
        || !['execution_started', 'execution_result', 'error'].includes(String(value.type))) {
        throw new Error('Helper v2 envelope or request binding is invalid');
    }
    if (value.type === 'error') {
        if (!hasExactKeys(value, ['schemaVersion', 'type', 'requestId', 'error', 'message'])
            || typeof value.error !== 'string' || typeof value.message !== 'string') {
            throw new Error('Helper v2 error fields are invalid');
        }
        return value;
    }
    if (value.type === 'execution_started') {
        if (!hasExactKeys(value, ['schemaVersion', 'type', 'requestId', 'profileId', 'helperPid', 'childPid', 'ready', 'tokenAudit'])
            || value.profileId !== 'a9-trusted-shell-current-user-v1'
            || !isPositiveInteger(value.helperPid) || !isPositiveInteger(value.childPid)
            || !isRecord(value.ready)
            || !hasExactKeys(value.ready, ['childJobAssignmentVerified', 'inputDetached', 'stdoutCaptureReady', 'stderrCaptureReady'])
            || Object.values(value.ready).some((item) => item !== true)
            || !isCurrentUserTokenProof(value.tokenAudit)) {
            throw new Error('Helper v2 readiness proof is invalid');
        }
        return value;
    }
    const exact = ['schemaVersion', 'type', 'requestId', 'profileId', 'status', 'exitCode', 'executionTimeMs',
        'timedOut', 'idleTimedOut', 'canceled', 'outputTruncated', 'containmentVerified', 'inputDetached',
        'cleanupConfirmed', 'workDirAclModified', 'hostJob', 'tokenAudit', 'stdoutSize', 'stderrSize',
        'stdoutBase64', 'stderrBase64'];
    if (!hasExactKeys(value, exact) || value.profileId !== 'a9-trusted-shell-current-user-v1'
        || value.status !== 'completed' || !isUInt32(value.exitCode)
        || !isNonNegativeInteger(value.executionTimeMs) || !isNonNegativeInteger(value.stdoutSize)
        || !isNonNegativeInteger(value.stderrSize)
        || ['timedOut', 'idleTimedOut', 'canceled', 'outputTruncated', 'containmentVerified',
            'inputDetached', 'cleanupConfirmed'].some((key) => typeof value[key] !== 'boolean')
        || value.workDirAclModified !== false || !isHostJobProof(value.hostJob)
        || !isCurrentUserTokenProof(value.tokenAudit)
        || typeof value.stdoutBase64 !== 'string' || typeof value.stderrBase64 !== 'string') {
        throw new Error('Helper v2 execution response fields are invalid');
    }
    decodeNativeHelperBase64(value.stdoutBase64, value.stdoutSize, 'stdoutBase64');
    decodeNativeHelperBase64(value.stderrBase64, value.stderrSize, 'stderrBase64');
    return value;
}
function parseV1(value, expectedRequestId) {
    if (value.schema_version !== 1 || value.requestId !== expectedRequestId
        || (value.type !== 'execution_result' && value.type !== 'error')) {
        throw new Error('Helper response envelope or request binding is invalid');
    }
    if (value.type === 'error') {
        if (!hasExactKeys(value, ['schema_version', 'type', 'requestId', 'error', 'message'])
            || typeof value.error !== 'string' || typeof value.message !== 'string') {
            throw new Error('Helper error response fields are invalid');
        }
        return value;
    }
    const exact = ['schema_version', 'type', 'requestId', 'status', 'exitCode', 'executionTimeMs',
        'timedOut', 'idleTimedOut', 'canceled', 'outputTruncated', 'containmentVerified', 'inputDetached',
        'hostJob', 'tokenAudit', 'stdoutSize', 'stderrSize', 'stdoutBase64', 'stderrBase64', 'aclChanges'];
    if (!hasExactKeys(value, exact) || value.status !== 'completed' || !isUInt32(value.exitCode)
        || !isNonNegativeInteger(value.executionTimeMs) || !isNonNegativeInteger(value.stdoutSize)
        || !isNonNegativeInteger(value.stderrSize)
        || ['timedOut', 'idleTimedOut', 'canceled', 'outputTruncated', 'containmentVerified', 'inputDetached']
            .some((key) => typeof value[key] !== 'boolean')
        || !isHostJobProof(value.hostJob) || !isRecord(value.tokenAudit)
        || !hasExactKeys(value.tokenAudit, ['source', 'verified', 'isRestricted', 'tokenType', 'restrictedSidSetVerified',
            'userRestrictedSid', 'worldRestrictedSid', 'administratorsRestrictedSid', 'restrictedSidCount', 'integritySid', 'integrityRid'])
        || value.tokenAudit.source !== 'suspended_child_process_token'
        || ['verified', 'isRestricted', 'restrictedSidSetVerified', 'userRestrictedSid', 'worldRestrictedSid',
            'administratorsRestrictedSid'].some((key) => typeof value.tokenAudit[key] !== 'boolean')
        || typeof value.tokenAudit.tokenType !== 'string' || !isNonNegativeInteger(value.tokenAudit.restrictedSidCount)
        || typeof value.tokenAudit.integritySid !== 'string' || !/^S-1-16-[0-9]+$/.test(value.tokenAudit.integritySid)
        || !isNonNegativeInteger(value.tokenAudit.integrityRid) || !Array.isArray(value.aclChanges)
        || value.aclChanges.some((change) => !isRecord(change)
            || !hasExactKeys(change, ['path', 'mechanism', 'applied', 'verified', 'rolledBack', 'error'])
            || typeof change.path !== 'string' || change.path.length === 0
            || !['low_integrity_label', 'deny_ace'].includes(String(change.mechanism))
            || typeof change.applied !== 'boolean' || typeof change.verified !== 'boolean'
            || typeof change.rolledBack !== 'boolean' || typeof change.error !== 'string')
        || typeof value.stdoutBase64 !== 'string' || typeof value.stderrBase64 !== 'string') {
        throw new Error('Helper execution response fields are invalid');
    }
    decodeNativeHelperBase64(value.stdoutBase64, value.stdoutSize, 'stdoutBase64');
    decodeNativeHelperBase64(value.stderrBase64, value.stderrSize, 'stderrBase64');
    return value;
}
function isCurrentUserTokenProof(value) {
    return isRecord(value)
        && hasExactKeys(value, ['source', 'verified', 'tokenMode', 'restrictedToken', 'tokenType', 'sameUser', 'lowIntegrity', 'integritySid', 'integrityRid'])
        && value.source === 'suspended_child_process_token' && value.verified === true
        && value.tokenMode === 'current_user' && value.restrictedToken === false
        && value.tokenType === 'primary' && value.sameUser === true && value.lowIntegrity === false
        && typeof value.integritySid === 'string' && /^S-1-16-[0-9]+$/.test(value.integritySid)
        && isNonNegativeInteger(value.integrityRid) && value.integrityRid > 4096;
}
function isHostJobProof(value) {
    return isRecord(value) && hasExactKeys(value, ['detected', 'breakaway', 'limitFlags', 'childJobAssignmentVerified'])
        && typeof value.detected === 'boolean' && ['none', 'explicit', 'silent'].includes(String(value.breakaway))
        && isNonNegativeInteger(value.limitFlags) && typeof value.childJobAssignmentVerified === 'boolean';
}
function isUInt32(value) {
    return isNonNegativeInteger(value) && value <= 0xFFFFFFFF;
}
function isPositiveInteger(value) {
    return isNonNegativeInteger(value) && value > 0;
}
function isNonNegativeInteger(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function hasExactKeys(value, expected) {
    const actual = Object.keys(value).sort();
    const canonical = [...expected].sort();
    return actual.length === canonical.length && actual.every((key, index) => key === canonical[index]);
}
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
//# sourceMappingURL=native-protocol.js.map