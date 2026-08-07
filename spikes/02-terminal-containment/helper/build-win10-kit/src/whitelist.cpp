/**
 * helper/whitelist.cpp — Executable/argv allow-list implementation (C06).
 *
 * Policy:
 *  1. The built-in allow-list contains only System32 tools:
 *     cmd.exe, where.exe, reg.exe, whoami.exe, findstr.exe, ping.exe.
 *  2. A bare executable name is resolved against <windir>\System32.
 *  3. `extraExecutables` (from the request) may allow additional exact paths.
 *  4. cmd.exe requires argv prefix /d /s /c (case-insensitive) and rejects
 *     /k (keeps the shell open, which would defeat timeout containment).
 *
 * Everything else is rejected with RejectExecutable / RejectArgv.
 */

#include "whitelist.h"

#include <algorithm>

namespace spike02 {
namespace {

std::wstring ToLower(const std::wstring& in) {
    std::wstring out = in;
    for (wchar_t& ch : out) {
        if (ch >= L'A' && ch <= L'Z') ch = static_cast<wchar_t>(ch - L'A' + L'a');
    }
    return out;
}

std::wstring Basename(const std::wstring& path) {
    const size_t slash = path.find_last_of(L"/\\");
    return slash == std::wstring::npos ? path : path.substr(slash + 1);
}

}  // namespace

bool IsUnderSystem32(const std::wstring& lowerPath, const std::wstring& lowerWindir) {
    const std::wstring system32 = lowerWindir + L"\\system32";
    return lowerPath.size() >= system32.size() &&
           lowerPath.compare(0, system32.size(), system32) == 0;
}

WhitelistDecision CheckWhitelist(const std::wstring& executable,
                                 const std::vector<std::wstring>& argv,
                                 const WhitelistConfig& config) {
    if (executable.empty()) return WhitelistDecision::RejectExecutable;

    std::wstring exePath = executable;
    // Bare name -> resolve under <windir>\System32.
    if (Basename(exePath) == exePath && exePath.find(L':') == std::wstring::npos) {
        if (config.windowsDirectory.empty()) return WhitelistDecision::RejectExecutable;
        exePath = config.windowsDirectory + L"\\System32\\" + exePath;
    }

    const std::wstring lowerExe = ToLower(exePath);
    const std::wstring base = ToLower(Basename(exePath));

    // Caller-provided extras (exact path match).
    for (const std::wstring& extra : config.extraExecutables) {
        if (ToLower(extra) == lowerExe) return WhitelistDecision::Allow;
    }

    const std::wstring lowerWindir = ToLower(config.windowsDirectory);
    const bool inSystem32 = IsUnderSystem32(lowerExe, lowerWindir);

    static const wchar_t* kSystem32Tools[] = {
        L"cmd.exe", L"where.exe", L"reg.exe", L"whoami.exe",
        L"findstr.exe", L"ping.exe", L"tasklist.exe", L"certutil.exe",
    };
    bool knownTool = false;
    for (const wchar_t* tool : kSystem32Tools) {
        if (base == tool) { knownTool = true; break; }
    }
    if (!knownTool || !inSystem32) return WhitelistDecision::RejectExecutable;

    // cmd.exe contract: /d /s /c <command>; /k is rejected.
    if (base == L"cmd.exe") {
        if (argv.size() < 3) return WhitelistDecision::RejectArgv;
        for (int i = 0; i < 3; ++i) {
            const std::wstring arg = ToLower(argv[static_cast<size_t>(i)]);
            const wchar_t* expect = i == 0 ? L"/d" : (i == 1 ? L"/s" : L"/c");
            if (arg != expect) return WhitelistDecision::RejectArgv;
        }
        for (const std::wstring& arg : argv) {
            const std::wstring lower = ToLower(arg);
            if (lower == L"/k" || lower == L"/k0") return WhitelistDecision::RejectArgv;
        }
    }

    return WhitelistDecision::Allow;
}

}  // namespace spike02
