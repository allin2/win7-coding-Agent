/**
 * helper/whitelist.h — Executable/argv allow-list for the D-013 helper (C06).
 *
 * The helper refuses to launch executables outside the allow-list. The
 * default allow-list covers the system tools the SPIKE_02 harness uses
 * (cmd.exe, where.exe, reg.exe, whoami.exe, findstr.exe, ping.exe); callers
 * may supply an explicit extra allow-list in the request.
 */

#ifndef SPIKE02_WHITELIST_H
#define SPIKE02_WHITELIST_H

#include <string>
#include <vector>

namespace spike02 {

enum class WhitelistDecision {
    Allow,
    RejectExecutable,   // executable not in the allow-list (C06)
    RejectArgv,         // argv violates cmd.exe /d /s /c contract or /k
};

struct WhitelistConfig {
    // Windows directory (normally C:\Windows). Only binaries under
    // <windir>\System32 are accepted for the built-in allow-list.
    std::wstring windowsDirectory;
    // Optional caller-provided extra executables (exact path, any location).
    std::vector<std::wstring> extraExecutables;
};

// Evaluate the allow-list for `executable` + `argv`. `executable` may be a
// full path or a bare name; a bare name is resolved against <windir>\System32.
WhitelistDecision CheckWhitelist(const std::wstring& executable,
                                 const std::vector<std::wstring>& argv,
                                 const WhitelistConfig& config);

// True when `path` (lowercased, already normalized) is under system32.
bool IsUnderSystem32(const std::wstring& lowerPath, const std::wstring& lowerWindir);

}  // namespace spike02

#endif  // SPIKE02_WHITELIST_H
