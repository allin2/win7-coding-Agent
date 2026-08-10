"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NativeRunner = void 0;
const crypto_1 = require("crypto");
const approval_1 = require("./approval");
const output_1 = require("./output");
const profiles_1 = require("./profiles");
const runner_1 = require("./runner");
const types_1 = require("./types");
class NativeRunner {
    constructor(options) {
        this.options = options;
    }
    async execute(request) {
        const invalid = (0, runner_1.validateRequest)(request);
        if (invalid)
            return (0, runner_1.rejected)(invalid.code, invalid.message, invalid.action);
        const shell = (0, runner_1.findProhibitedShellHost)(request.command);
        if (shell)
            return (0, runner_1.rejected)(types_1.RunnerErrorCode.SHELL_HOST_PROHIBITED, `Shell host "${shell}" is prohibited`, '选择已登记的非 Shell profile。');
        let profile;
        try {
            profile = await this.options.registry.resolve(request.command, request.args, request.config.workDir);
        }
        catch (error) {
            if (error instanceof profiles_1.ProfileResolutionError)
                return (0, runner_1.rejected)(error.code, error.message, '更新受信 profile 或重新安装哈希匹配的离线工件。');
            return (0, runner_1.rejected)(types_1.RunnerErrorCode.PROFILE_PATH_INVALID, String(error), '检查 profile 路径与工作目录。');
        }
        const approval = this.validateApproval(request);
        if (approval)
            return approval;
        const requestId = request.requestId || `runner-${(0, crypto_1.randomBytes)(12).toString('hex')}`;
        const helperRequest = {
            schema_version: 1,
            requestId,
            executable: profile.canonicalExecutablePath,
            argv: [...request.args],
            workingDirectory: request.config.workDir,
            timeoutMs: request.config.timeoutMs,
            idleTimeoutMs: request.config.idleTimeoutMs,
            maxOutputSize: Math.max(request.config.maxStdoutBytes, request.config.maxStderrBytes, 1024),
            allowNetwork: false,
            allowedDirectories: profile.aclPolicy?.applyLowIntegrityToWorkDir ? [request.config.workDir] : [],
            protectedDirectories: [],
            ...(profile.aclPolicy ? { aclPolicy: {
                    acceptanceRoot: profile.aclPolicy.acceptanceRoot,
                    perRunRoot: profile.aclPolicy.perRunRoot,
                } } : {}),
        };
        this.emit('runner.started', requestId, { profileId: profile.id, cwd: request.config.workDir });
        const transport = await this.options.transport.invoke(helperRequest, request.signal);
        if (transport.kind !== 'response')
            return this.transportFailure(requestId, transport, request);
        if (transport.response.type === 'error') {
            const cleanup = transport.response.error === 'ACL_ROLLBACK_FAILED';
            const failed = (0, runner_1.result)(cleanup ? 'cleanup_failed' : 'capability_unavailable', null, '', transport.response.message, 0, { code: types_1.RunnerErrorCode.CONTAINMENT_UNAVAILABLE, message: transport.response.message,
                recommendedAction: '保持 fail-closed，检查 helper containment、ACL 回滚与宿主 Job 状态。' }, cleanup, request.config);
            this.emit('runner.finished', requestId, { status: failed.status, error: transport.response.error });
            return failed;
        }
        return this.executionResult(requestId, transport.response, request, profile.outputEncoding || 'auto');
    }
    validateApproval(request) {
        if (request.approvalLevel !== 'workspace_write')
            return undefined;
        if (!this.options.approvalLedger)
            return (0, runner_1.rejected)(types_1.RunnerErrorCode.APPROVAL_REQUIRED, 'Workspace write requires an approval ledger', '重新预览并取得一次性审批。');
        const checked = this.options.approvalLedger.validateAndConsume(request.approval, (0, approval_1.buildRunApprovalRequest)(request));
        if (checked.valid)
            return undefined;
        const code = checked.code === 'APPROVAL_REPLAYED' ? types_1.RunnerErrorCode.APPROVAL_REPLAYED
            : checked.code === 'APPROVAL_REQUIRED' ? types_1.RunnerErrorCode.APPROVAL_REQUIRED : types_1.RunnerErrorCode.APPROVAL_INVALID;
        return (0, runner_1.rejected)(code, checked.reason || 'Approval validation failed', '重新生成预览与基线并审批。');
    }
    executionResult(requestId, response, request, encoding) {
        let stdout;
        let stderr;
        try {
            stdout = strictBase64(response.stdoutBase64, response.stdoutSize);
            stderr = strictBase64(response.stderrBase64, response.stderrSize);
        }
        catch (error) {
            const failed = (0, runner_1.rejected)(types_1.RunnerErrorCode.HELPER_PROTOCOL_ERROR, String(error), '替换 helper 并核对协议版本与工件哈希。');
            this.emit('runner.finished', requestId, { status: failed.status });
            return failed;
        }
        const capturedOut = (0, output_1.captureBytes)(stdout, request.config.maxStdoutBytes, encoding);
        const capturedErr = (0, output_1.captureBytes)(stderr, request.config.maxStderrBytes, encoding);
        if (capturedOut.text)
            this.emit('runner.stdout', requestId, { text: capturedOut.text, bytes: capturedOut.bytesRead });
        if (capturedErr.text)
            this.emit('runner.stderr', requestId, { text: capturedErr.text, bytes: capturedErr.bytesRead });
        if (capturedOut.truncated)
            this.emit('runner.truncated', requestId, { stream: 'stdout', omittedBytes: capturedOut.omittedBytes });
        if (capturedErr.truncated)
            this.emit('runner.truncated', requestId, { stream: 'stderr', omittedBytes: capturedErr.omittedBytes });
        const hostJobOk = response.hostJob?.childJobAssignmentVerified === true &&
            (!response.hostJob.detected || response.hostJob.breakaway === 'explicit' || response.hostJob.breakaway === 'silent');
        const containmentOk = response.containmentVerified && response.inputDetached && hostJobOk && response.tokenAudit?.verified &&
            response.tokenAudit.isRestricted && response.tokenAudit.restrictedSidSetVerified && response.tokenAudit.integrityRid === 4096;
        const aclOk = response.aclChanges.every((change) => !change.applied || (change.verified && change.rolledBack));
        const status = !containmentOk || !aclOk ? 'cleanup_failed'
            : response.idleTimedOut ? 'idle_timeout' : response.timedOut ? 'timeout' : response.canceled ? 'cancelled' : 'exited';
        const failed = status !== 'exited';
        const runResult = {
            schemaVersion: '2.0', status, exitCode: status === 'exited' ? response.exitCode : null,
            stdout: capturedOut, stderr: capturedErr, durationMs: response.executionTimeMs,
            termination: {
                requested: response.timedOut || response.canceled || status === 'cleanup_failed',
                processTreeReaped: containmentOk && aclOk,
                containment: containmentOk ? 'job_object' : 'none',
                ...(!containmentOk || !aclOk ? { detail: 'Helper could not prove containment or ACL rollback' } : {}),
            },
            ...(failed ? { error: {
                    code: types_1.RunnerErrorCode.CONTAINMENT_UNAVAILABLE,
                    message: status === 'cleanup_failed' ? 'Cleanup could not be confirmed' : `Execution ended with ${status}`,
                    recommendedAction: status === 'cleanup_failed' ? '停止后续本地执行并检查残留。' : '缩小命令范围或调整获批 profile 超时。',
                } } : {}),
        };
        this.emit('runner.finished', requestId, { status, exitCode: runResult.exitCode, durationMs: runResult.durationMs });
        return runResult;
    }
    transportFailure(requestId, transport, request) {
        const status = transport.kind === 'spawn_failed' ? 'spawn_failed'
            : transport.kind === 'cancelled' && transport.cleanupConfirmed ? 'cancelled'
                : transport.cleanupConfirmed ? 'capability_unavailable' : 'cleanup_failed';
        const code = transport.kind === 'spawn_failed' ? types_1.RunnerErrorCode.INVALID_REQUEST : types_1.RunnerErrorCode.HELPER_CRASHED;
        const failed = (0, runner_1.result)(status, null, '', transport.detail, 0, { code, message: transport.detail,
            recommendedAction: transport.cleanupConfirmed ? '检查 helper 路径、哈希和运行前置。' : '停止本地执行并执行残留检查。' }, status === 'cleanup_failed', request.config);
        if (status === 'cancelled') {
            failed.termination = { requested: true, processTreeReaped: true, containment: 'job_object', detail: transport.detail };
        }
        this.emit('runner.finished', requestId, { status: failed.status, transport: transport.kind });
        return failed;
    }
    emit(kind, requestId, data) {
        this.options.onEvent?.({ kind, requestId, timestamp: new Date().toISOString(), data });
    }
}
exports.NativeRunner = NativeRunner;
function strictBase64(value, expectedSize) {
    if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
        throw new Error('Helper returned invalid base64');
    }
    const decoded = Buffer.from(value, 'base64');
    if (decoded.length !== expectedSize)
        throw new Error('Helper stream size does not match its payload');
    return decoded;
}
//# sourceMappingURL=native-runner.js.map