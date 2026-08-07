/**
 * SPIKE 02 / D-013 — C++ Helper header (Win32 containment).
 *
 * The helper establishes a restricted execution environment for a child
 * process tree:
 *   - Job Object (KILL_ON_JOB_CLOSE + process/active limits) with a
 *     fail-closed host probe (C02: host already in a Job -> refuse, Win7
 *     cannot nest Jobs).
 *   - Restricted Token (all privileges deleted, sensitive groups deny-only,
 *     Low Integrity mandatory label) actually applied to the child via
 *     CreateProcessWithTokenW (C03).
 *   - ACL handling: Low-Integrity mandatory label on allowed directories so
 *     the low-integrity child can write inside the workspace; explicit deny
 *     ACEs on protectedDirectories with automatic rollback (C04).
 *   - Structured argv + allow-list (C06/C09), timeout via TerminateJobObject
 *     (C07, never taskkill — N06), bounded output with truncation (P02/C07),
 *     and whole-tree reclamation on job close.
 *
 * Protocol: one JSON request per line on stdin, one JSON response on stdout.
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
// Job limits.
constexpr DWORD kJobActiveProcessLimit = 64;
constexpr SIZE_T kJobProcessMemoryLimit = 512ULL * 1024 * 1024;

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

// ─── Structures ──────────────────────────────────────────────────────────────

// Decoded request configuration (strings owned by the struct).
struct ProcessConfig {
    std::wstring requestId;
    std::wstring executable;
    std::vector<std::wstring> argv;
    std::wstring workingDirectory;
    long long timeoutMs = kDefaultTimeoutMs;
    long long maxOutputSize = kMaxOutputSizeDefault;
    bool allowNetwork = false;  // recorded only; never claimed as isolation
    std::vector<std::wstring> allowedDirectories;    // workspace (low label)
    std::vector<std::wstring> protectedDirectories;  // deny ACE + rollback (C04)
    std::vector<std::wstring> extraExecutables;      // argv allow-list extras
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

// Execution result (stdout/stderr as bytes + base64 rendering at output time).
struct ProcessResult {
    DWORD exitCode = 0;
    long long executionTimeMs = 0;
    bool timedOut = false;
    bool canceled = false;
    bool outputTruncated = false;
    bool containmentVerified = false;
    bool inputDetached = false;
    std::vector<unsigned char> stdoutBytes;
    std::vector<unsigned char> stderrBytes;
    std::vector<AclChangeRecord> aclChanges;
};

// ─── Win32 orchestration (implemented in helper.cpp) ─────────────────────────

#ifdef _WIN32

// Probe: is the CURRENT process already in any Job? Win7 cannot nest Jobs, so
// a positive answer means fail-closed (C02/P11). Returns true on probe failure.
bool HostIsInJob();

// Create a configured Job Object (KILL_ON_JOB_CLOSE + limits). Returns NULL on
// failure.
HANDLE CreateConfiguredJobObject();

// Build the restricted token (privileges deleted, sensitive groups deny-only,
// Low Integrity). Returns NULL on failure.
HANDLE CreateRestrictedProcessToken();

// Apply the Low-Integrity mandatory label to `directory` so a low-integrity
// child can write inside it. Returns false on failure (fail-closed).
bool ApplyLowIntegrityLabel(const std::wstring& directory, std::wstring* error);

// Add a deny ACE for `userSid` to `directory` (write/create/delete rights),
// returning the previous DACL in *restoreAcl for rollback. Returns false on
// failure.
bool ApplyDenyAce(const std::wstring& directory, PSID userSid, PACL* restoreAcl,
                  std::wstring* error);

// Restore a previously captured DACL (rollback). Returns false on failure.
bool RestoreDirectoryDacl(const std::wstring& directory, PACL restoreAcl,
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

// Render the execution result as a JSON response line (UTF-8, binary-safe via
// base64 for stdout/stderr).
std::string RenderResultJson(const std::string& requestId, const ProcessResult& result);

// Render an error response line.
std::string RenderErrorJson(const std::string& requestId, const char* code,
                            const std::string& message);

}  // namespace spike02

#endif  // HELPER_H
