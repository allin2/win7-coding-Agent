"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StdioHelperTransport = void 0;
const child_process_1 = require("child_process");
const native_protocol_1 = require("./native-protocol");
/** One request per helper process. No shell and no inherited stdio. */
class StdioHelperTransport {
    constructor(helperPath, protocolOutputLimit = 96 * 1024 * 1024) {
        this.helperPath = helperPath;
        this.protocolOutputLimit = protocolOutputLimit;
    }
    invoke(request, signal) {
        return new Promise((resolve) => {
            let settled = false;
            let forcedExit = null;
            let cancelRequested = false;
            let cancellationEscalated = false;
            let forcedExitTimer;
            let stdout = Buffer.alloc(0);
            let stderr = Buffer.alloc(0);
            let child;
            const finish = (result) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(watchdog);
                if (forcedExitTimer)
                    clearTimeout(forcedExitTimer);
                signal?.removeEventListener('abort', onAbort);
                resolve(result);
            };
            const onAbort = () => {
                if (cancelRequested || settled)
                    return;
                cancelRequested = true;
                try {
                    child?.stdin.end(`${JSON.stringify({ schema_version: 1, type: 'cancel', requestId: request.requestId })}\n`, 'utf8');
                }
                catch (_error) {
                    cancellationEscalated = true;
                    child?.kill();
                }
                forcedExitTimer = setTimeout(() => {
                    cancellationEscalated = true;
                    child?.kill();
                    forcedExitTimer = setTimeout(() => finish({
                        kind: 'cancelled', detail: 'Helper did not acknowledge cooperative cancellation', cleanupConfirmed: false,
                    }), 5000);
                }, 5000);
            };
            const watchdog = setTimeout(() => {
                forcedExit = 'watchdog_timeout';
                child?.kill();
                forcedExitTimer = setTimeout(() => finish({
                    kind: 'watchdog_timeout', detail: 'Helper did not close after watchdog termination', cleanupConfirmed: false,
                }), 5000);
            }, request.timeoutMs + 15000);
            try {
                child = (0, child_process_1.spawn)(this.helperPath, [], {
                    shell: false,
                    windowsHide: true,
                    stdio: ['pipe', 'pipe', 'pipe'],
                });
            }
            catch (error) {
                finish({ kind: 'spawn_failed', detail: String(error), cleanupConfirmed: true });
                return;
            }
            child.once('error', (error) => finish({ kind: 'spawn_failed', detail: String(error), cleanupConfirmed: true }));
            child.stdout.on('data', (chunk) => {
                stdout = Buffer.concat([stdout, chunk]);
                if (stdout.length > this.protocolOutputLimit) {
                    child?.kill();
                    finish({ kind: 'helper_crashed', detail: 'Helper protocol output exceeded its hard limit', cleanupConfirmed: false });
                }
            });
            child.stderr.on('data', (chunk) => {
                if (stderr.length < 64 * 1024)
                    stderr = Buffer.concat([stderr, chunk]).subarray(0, 64 * 1024);
            });
            child.once('close', (code) => {
                if (settled)
                    return;
                if (forcedExit === 'watchdog_timeout') {
                    finish({ kind: 'watchdog_timeout', detail: 'Helper required watchdog termination', cleanupConfirmed: false });
                    return;
                }
                if (cancellationEscalated) {
                    finish({ kind: 'cancelled', detail: 'Helper required forced termination during cancellation', cleanupConfirmed: false });
                    return;
                }
                const lines = stdout.toString('utf8').trim().split(/\r?\n/).filter(Boolean);
                if (code !== 0 || lines.length !== 1) {
                    finish({ kind: 'helper_crashed', detail: `Helper exited ${code}: ${stderr.toString('utf8')}`, cleanupConfirmed: code === 0 });
                    return;
                }
                try {
                    const response = (0, native_protocol_1.parseNativeHelperResponse)(lines[0], request.requestId);
                    if (cancelRequested && (response.type !== 'execution_result' || response.canceled !== true)) {
                        finish({ kind: 'cancelled', detail: 'Helper response did not acknowledge cancellation', cleanupConfirmed: false });
                        return;
                    }
                    finish({ kind: 'response', response });
                }
                catch (error) {
                    finish({ kind: 'helper_crashed', detail: String(error), cleanupConfirmed: true });
                }
            });
            signal?.addEventListener('abort', onAbort, { once: true });
            child.stdin.write(`${JSON.stringify(request)}\n`, 'utf8');
            if (signal?.aborted)
                onAbort();
        });
    }
}
exports.StdioHelperTransport = StdioHelperTransport;
//# sourceMappingURL=native-transport.js.map