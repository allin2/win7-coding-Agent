/**
 * SPIKE 02 / D-013 — C++ Helper header (Win32 containment).
 *
 * The helper establishes a restricted execution environment for a child
 * process tree:
 *   - Job Object (KILL_ON_JOB_CLOSE + process/active limits) with a
 *     fail-closed host probe. On Win7 an inherited host Job is accepted only
 *     when its flags permit a verified child breakaway before assignment to
 *     the helper-owned Job; nested Jobs remain prohibited.
 *   - Restricted Token (maximum privileges disabled while preserving normal
 *     directory traversal, Administrators deny-only, Low Integrity mandatory
 *     label) actually applied to the child via
 *     CreateProcessAsUserW with a restricted primary token (C03).
 *   - ACL handling: Low-Integrity mandatory label on allowed directories so
 *     the low-integrity child can write inside the workspace; explicit deny
 *     ACEs on protectedDirectories with automatic rollback (C04).
 *   - Structured argv + allow-list (C06/C09), timeout via TerminateJobObject
 *     (C07, never taskkill — N06), bounded output with truncation (P02/C07),
 *     and whole-tree reclamation on job close.
 *
 * Protocol: one JSON execution request, optional matching cancel control,
 * and one JSON response per helper process.
 * Interface is frozen for SPIKE_02 (argv + JSON over stdio).
 *
 * Compile: MSVC v142 (VS2019), target Windows 7 SP1 x64, static CRT.
 * Win7-Validation: NOT_PERFORMED (Win7 runtime evidence pending WIN7_LEASE_GRANTED)
 */

#ifndef HELPER_H
#define HELPER_H

#ifdef _WIN32
#include <windows.h>
#include <aclapi.h>
#else
// Minimal portable aliases so the platform-neutral layers compile and can be
// unit-tested on non-Windows build hosts.
#include <cstddef>
#include <cstdint>
using DWORD = uint32_t;
using SIZE_T = size_t;
#endif

#include <string>
#include <utility>
#include <vector>

#include "json_parser.h"
#include "argv_builder.h"
#include "whitelist.h"

namespace spike02 {

// ─── Limits ──────────────────────────────────────────────────────────────────

// Default per-stream output cap (16 MB).
constexpr long long kMaxOutputSizeDefault = 16LL * 1024 * 1024;
// Absolute cap for a single stream (64 MB) — bounded processing.
constexpr long long kMaxOutputSizeAbsolute = 64LL * 1024 * 1024;
// Default timeout (30 s).
constexpr long long kDefaultTimeoutMs = 30000;
// Default no-output deadline. This is distinct from the total deadline.
constexpr long long kDefaultIdleTimeoutMs = 15000;
// Job limits.
constexpr DWORD kJobActiveProcessLimit = 64;
constexpr SIZE_T kJobProcessMemoryLimit = 512ULL * 1024 * 1024;

// GetTokenInformation size probes normally fail with this Win32 error while
// returning the required buffer size. Keep the numeric value portable so the
// v19 empty TokenRestrictedSids regression can be unit-tested off Windows.
constexpr DWORD kWinErrorInsufficientBuffer = 122;
constexpr DWORD kJobLimitBreakawayOk = 0x00000800;
constexpr DWORD kJobLimitSilentBreakawayOk = 0x00001000;

// TOKEN_GROUPS uses an ANYSIZE_ARRAY, so sizeof(TOKEN_GROUPS) includes storage
// for one entry. A legal empty TokenRestrictedSids result needs only the
// GroupCount header. Accept the size probe when that header fits and the API
// either succeeded or reported the documented insufficient-buffer result.
inline bool TokenGroupsSizeProbeAccepted(bool querySucceeded, DWORD queryError,
                                         DWORD returnedSize, DWORD headerSize) {
    return returnedSize >= headerSize &&
           (querySucceeded || queryError == kWinErrorInsufficientBuffer);
}

enum class HostJobLaunchMode {
    NoHostJob,
    ExplicitBreakaway,
    SilentBreakaway,
    Blocked,
    ProbeFailed,
};

// Pure policy decision kept portable for logic tests. Win7 cannot nest Jobs:
// an inherited host Job is usable only if Windows documents an explicit or
// silent breakaway path. Probe ambiguity always fails closed.
inline HostJobLaunchMode DecideHostJobLaunchMode(bool inJobProbeSucceeded,
                                                 bool inJob,
                                                 bool jobInfoQuerySucceeded,
                                                 DWORD limitFlags) {
    if (!inJobProbeSucceeded) return HostJobLaunchMode::ProbeFailed;
    if (!inJob) return HostJobLaunchMode::NoHostJob;
    if (!jobInfoQuerySucceeded) return HostJobLaunchMode::ProbeFailed;
    if ((limitFlags & kJobLimitSilentBreakawayOk) != 0) {
        return HostJobLaunchMode::SilentBreakaway;
    }
    if ((limitFlags & kJobLimitBreakawayOk) != 0) {
        return HostJobLaunchMode::ExplicitBreakaway;
    }
    return HostJobLaunchMode::Blocked;
}

// ─── Error codes (kept stable for protocol consumers) ────────────────────────

#define HELPER_OK 0
#define HELPER_ERR_JOB_CREATE 1
#define HELPER_ERR_TOKEN_CREATE 2
#define HELPER_ERR_ACL_SET 3
#define HELPER_ERR_PROCESS_CREATE 4
#define HELPER_ERR_TIMEOUT 5
#define HELPER_ERR_OUTPUT_LIMIT 6
#define HELPER_ERR_INVALID_ARGV 7
#define HELPER_ERR_JSON_PARSE 8
#define HELPER_ERR_HOST_IN_JOB 9
#define HELPER_ERR_INTERNAL 10
#define HELPER_ERR_ACL_POLICY 11
#define HELPER_ERR_ACL_ROLLBACK 12
#define HELPER_ERR_CANCEL_PROTOCOL 13
#define HELPER_ERR_SHELL_IDENTITY 14
#define HELPER_ERR_ENVIRONMENT 15

// ─── Structures ──────────────────────────────────────────────────────────────

// ACL-change policy (C04 hardening): Low-Integrity labels and deny ACEs may
// only be applied inside perRunRoot, which must itself live under
// acceptanceRoot. `valid` is true only when both roots were provided.
struct AclPolicy {
    std::wstring acceptanceRoot;
    std::wstring perRunRoot;
    bool valid = false;
};

// Decoded request configuration (strings owned by the struct).
struct ProcessConfig {
    int schemaVersion = 1;
    std::wstring requestId;
    std::wstring executable;
    std::vector<std::wstring> argv;
    std::wstring workingDirectory;
    long long timeoutMs = kDefaultTimeoutMs;
    long long idleTimeoutMs = kDefaultIdleTimeoutMs;
    long long maxOutputSize = kMaxOutputSizeDefault;
    long long maxStdoutBytes = kMaxOutputSizeDefault;
    long long maxStderrBytes = kMaxOutputSizeDefault;
    bool allowNetwork = false;  // recorded only; never claimed as isolation
    std::vector<std::wstring> allowedDirectories;    // workspace (low label)
    std::vector<std::wstring> protectedDirectories;  // deny ACE + rollback (C04)
    AclPolicy aclPolicy;                              // ACL-change authorization

    // D-013 v25 / protocol v2. This is a trusted-shell execution profile for
    // the current ordinary Windows user; it is explicitly not a sandbox.
    std::wstring profileId;
    std::wstring shellKind;
    std::wstring shellPath;
    std::wstring shellVersion;
    std::wstring shellIdentity;
    std::wstring shellSource;
    std::wstring command;
    std::vector<std::pair<std::wstring, std::wstring>> envOverlay;
    bool managed = false;
    bool deadlineEnabled = true;
    bool idleDeadlineEnabled = true;
};

// Per-directory ACL change record returned to the caller (C04 audit).
struct AclChangeRecord {
    std::wstring path;
    std::wstring mechanism;  // "low_integrity_label" | "deny_ace"
    bool applied = false;
    bool verified = false;
    bool rolledBack = false;
    std::wstring error;
};

// Trusted audit of the token attached to the actual child process while that
// process is still suspended. This intentionally does not rely on `whoami` or
// localized console output from inside the restricted process (C03).
struct RestrictedTokenAudit {
    bool verified = false;
    bool isRestricted = false;
    bool isPrimary = false;
    bool restrictedSidSetVerified = false;
    bool userRestrictedSid = false;
    bool worldRestrictedSid = false;
    bool administratorsRestrictedSid = false;
    DWORD restrictedSidCount = 0;
    std::wstring integritySid;
    DWORD integrityRid = 0;
    bool sameUser = false;
    bool lowIntegrity = false;
};

// Canonical SID-set expectation derived from the source primary token before
// CreateRestrictedToken. The child audit compares TokenRestrictedSids against
// this exact sorted set without exposing account SID strings in the protocol.
struct RestrictedSidExpectation {
    std::vector<std::wstring> canonicalSids;
    std::wstring userSid;
};

// Execution result (stdout/stderr as bytes + base64 rendering at output time).
struct ProcessResult {
    int schemaVersion = 1;
    std::wstring profileId;
    DWORD exitCode = 0;
    long long executionTimeMs = 0;
    bool timedOut = false;
    bool idleTimedOut = false;
    bool canceled = false;
    bool outputTruncated = false;
    bool containmentVerified = false;
    bool inputDetached = false;
    bool hostJobDetected = false;
    std::string hostJobBreakaway = "none";
    DWORD hostJobLimitFlags = 0;
    bool childJobAssignmentVerified = false;
    bool cleanupConfirmed = false;
    bool workDirAclModified = false;
    bool stdoutCaptureReady = false;
    bool stderrCaptureReady = false;
    DWORD childPid = 0;
    std::vector<unsigned char> stdoutBytes;
    std::vector<unsigned char> stderrBytes;
    RestrictedTokenAudit tokenAudit;
    std::vector<AclChangeRecord> aclChanges;
    // Structured detail for fatal setup/rollback errors. Normal execution
    // responses remain unchanged; fatal protocol errors include this message.
    std::string errorMessage;
};

// ─── Win32 orchestration (implemented in helper.cpp) ─────────────────────────

#ifdef _WIN32

struct HostJobLaunchPlan {
    HostJobLaunchMode mode = HostJobLaunchMode::ProbeFailed;
    DWORD limitFlags = 0;
    DWORD probeError = 0;
};

// Probe the CURRENT process Job and select the only permitted Win7 launch
// path. A host Job without documented breakaway flags remains fail-closed.
HostJobLaunchPlan InspectHostJobLaunchPlan();

// Canonicalize `executable` to the resolved absolute path (GetFullPathNameW +
// GetFinalPathNameByHandleW, reparse-safe). Returns false with *error on
// rejection: bare name, UNC, device, drive-relative, trailing-dot/space path,
// unopenable file, or a reparse escape to a non-absolute path.
bool ResolveExecutablePath(const std::wstring& executable, std::wstring* canonical,
                           std::wstring* error);

// GetNamedSecurityInfoW returns ACL pointers into an owning security-descriptor
// buffer. Keep both together; freeing the PACL directly is invalid.
struct SecurityDescriptorSnapshot {
    PSECURITY_DESCRIPTOR descriptor = nullptr;
    PACL acl = nullptr;  // non-owning view into `descriptor`; may be nullptr
};

// Capture the current LABEL_SECURITY_INFORMATION so it can be restored later.
// On success `restore` owns the returned security descriptor. A null `acl`
// means the original object had no explicit label and restore must clear it.
bool CaptureLowIntegrityLabel(const std::wstring& directory,
                              SecurityDescriptorSnapshot* restore,
                              std::wstring* error);

// Restore a previously captured label ACL. The snapshot remains owned by the
// caller and must be released after this call. Returns false on failure.
bool RestoreLowIntegrityLabel(const std::wstring& directory,
                              const SecurityDescriptorSnapshot& restore,
                              std::wstring* error);

// Create a configured Job Object (KILL_ON_JOB_CLOSE + limits). Returns NULL on
// failure.
HANDLE CreateConfiguredJobObject();

// Build the restricted primary token (maximum privileges disabled while
// retaining SeChangeNotifyPrivilege, Administrators deny-only, Low Integrity).
// The restricting set is derived from the source TokenUser plus every enabled,
// non-deny-only TokenGroup except Administrators. This preserves the ordinary
// non-admin ACL coverage needed by the loader, working directory, window
// station and desktop while giving IsTokenRestricted a real SID-list contract.
// Returns NULL on any source-token ambiguity or creation failure.
HANDLE CreateRestrictedProcessToken(RestrictedSidExpectation* expectation,
                                    std::wstring* error);

// Open and audit the token attached to `childProcess` while the child is still
// suspended. Success requires the exact source-derived restricting SID set,
// including TokenUser and Everyone/World but excluding Administrators, plus a
// Low Integrity mandatory SID of S-1-16-4096. Any mismatch fails closed before
// ResumeThread.
bool AuditRestrictedChildToken(HANDLE childProcess,
                               const RestrictedSidExpectation& expectation,
                               RestrictedTokenAudit* audit,
                               std::wstring* error);

// Verify the suspended v25 child is running as the same user with a Primary,
// non-restricted token and without a Low Integrity downgrade.
bool AuditCurrentUserChildToken(HANDLE childProcess,
                                RestrictedTokenAudit* audit,
                                std::wstring* error);

// Apply the Low-Integrity mandatory label to `directory` so a low-integrity
// child can write inside it. Returns false on failure (fail-closed).
bool ApplyLowIntegrityLabel(const std::wstring& directory, std::wstring* error);

// Add a deny ACE for `userSid` to `directory` (write/create/delete rights),
// returning the previous DACL and its owning security descriptor in `restore`
// for rollback. Returns false on failure.
bool ApplyDenyAce(const std::wstring& directory, PSID userSid,
                  SecurityDescriptorSnapshot* restore, std::wstring* error);

// Restore a previously captured DACL (rollback), including its inheritance
// control bits. The snapshot remains owned by the caller and must be released
// after this call. Returns false on failure.
bool RestoreDirectoryDacl(const std::wstring& directory,
                          const SecurityDescriptorSnapshot& restore,
                          std::wstring* error);

#endif  // _WIN32

// Full pipeline: whitelist -> host probe -> job -> token -> ACL -> spawn ->
// monitor -> reclaim. Returns HELPER_OK on success (result populated) or an
// error code (result left untouched on fatal errors).
int LaunchRestrictedProcess(const ProcessConfig& config, ProcessResult* result);

// ─── Protocol (implemented in protocol.cpp, platform-neutral) ────────────────

// Parse a JSON request line into `config`. Returns false with `*error` set on
// protocol violations.
bool ParseJsonConfig(const std::string& jsonUtf8, ProcessConfig* config,
                     std::string* error);

// One deny rule is shared by protocol-v2 overlay parsing and inherited
// current-user environment filtering. Values are never accepted by or
// included in this predicate.
bool IsForbiddenEnvironmentName(const std::wstring& name);

// Parse the only control message accepted after the single execution request.
// The request ID must match so a stale or cross-request cancel cannot affect
// another helper process.
bool ParseCancelControl(const std::string& jsonUtf8,
                        const std::wstring& expectedRequestId,
                        int expectedSchemaVersion,
                        std::string* error);

// Validate that every ACL target in `config` stays inside perRunRoot and that
// perRunRoot stays inside acceptanceRoot (boundary-safe, case-insensitive).
// Pure path logic so the policy is unit-testable off-Windows. Returns true
// when no ACL change is requested (nothing to authorize).
bool ValidateAclPolicy(const ProcessConfig& config, std::wstring* error);

// Render the execution result as a JSON response line (UTF-8, binary-safe via
// base64 for stdout/stderr).
std::string RenderResultJson(const std::string& requestId, const ProcessResult& result);

// Render the v2 readiness boundary. This is emitted only after the child is
// assigned to the helper Job, stdin is detached, captures are ready and the
// current-user token audit has passed.
std::string RenderStartedJson(const std::string& requestId, const ProcessResult& result);

// Render an error response line.
std::string RenderErrorJson(const std::string& requestId, const char* code,
                            const std::string& message, int schemaVersion = 1);

}  // namespace spike02

#endif  // HELPER_H
