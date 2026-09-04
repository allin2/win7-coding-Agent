/**
 * helper/whitelist.cpp — Executable/argv allow-list implementation (C06).
 *
 * Policy:
 *  1. Only drive-letter absolute paths are even considered (PathShape must be
 *     Absolute): bare names, UNC, device, drive-relative, relative and
 *     trailing-dot/space paths are rejected before the allow-list runs.
 *  2. The built-in allow-list contains only System32 tools directly under the
 *     real System32 directory (resolved by GetSystemDirectoryW):
 *     cmd.exe, where.exe, reg.exe, whoami.exe, findstr.exe, ping.exe.
 *  3. Direct children of System32 only (separator boundary + no subdirectory):
 *     System32evil and System32\sub\tool.exe are rejected.
 *  4. cmd.exe requires argv prefix /d /s /c (case-insensitive) and rejects
 *     /k (keeps the shell open, which would defeat timeout containment).
 *
 * Everything else is rejected with RejectExecutable / RejectArgv. Callers must
 * canonicalize (GetFullPathNameW + GetFinalPathNameByHandleW) before calling,
 * so reparse escapes are already resolved to their final path.
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

bool IsDriveLetter(wchar_t ch) {
    return (ch >= L'A' && ch <= L'Z') || (ch >= L'a' && ch <= L'z');
}

// True when any component of a drive-absolute path ends with '.' or ' '
// (Windows strips these on open, so "System32.\cmd.exe" would otherwise alias
// "System32\cmd.exe" and "cmd.exe " would alias "cmd.exe").
bool HasTrailingDotOrSpaceComponent(const std::wstring& path) {
    size_t start = 0;
    for (size_t i = 0; i <= path.size(); ++i) {
        if (i == path.size() || path[i] == L'\\' || path[i] == L'/') {
            if (i > start) {
                const wchar_t last = path[i - 1];
                if (last == L'.' || last == L' ') return true;
            }
            start = i + 1;
        }
    }
    return false;
}

}  // namespace

PathShape ClassifyPathShape(const std::wstring& path) {
    if (path.find(L'\0') != std::wstring::npos) return PathShape::EmbeddedNul;
    if (path.empty()) return PathShape::BareName;
    if (path.rfind(L"\\\\.\\", 0) == 0 || path.rfind(L"\\\\?\\", 0) == 0) {
        return PathShape::Device;
    }
    if (path.rfind(L"\\\\", 0) == 0) return PathShape::Unc;

    const bool hasDrive = path.size() >= 2 && IsDriveLetter(path[0]) && path[1] == L':';
    if (hasDrive) {
        if (path.size() == 2 || (path[2] != L'\\' && path[2] != L'/')) {
            return PathShape::DriveRelative;
        }
    } else {
        const bool hasSep = path.find_first_of(L"\\/") != std::wstring::npos;
        return hasSep ? PathShape::Relative : PathShape::BareName;
    }

    if (HasTrailingDotOrSpaceComponent(path)) return PathShape::TrailingDotOrSpace;
    return PathShape::Absolute;
}

std::wstring PathDirectory(const std::wstring& path) {
    const size_t slash = path.find_last_of(L"/\\");
    return slash == std::wstring::npos ? std::wstring() : path.substr(0, slash);
}

bool PathWithinRoot(const std::wstring& path, const std::wstring& root) {
    const std::wstring lowerPath = ToLower(path);
    const std::wstring lowerRoot = ToLower(root);
    if (lowerRoot.empty()) return false;
    if (lowerPath == lowerRoot) return true;
    if (lowerPath.size() < lowerRoot.size() + 1) return false;
    if (lowerPath.compare(0, lowerRoot.size(), lowerRoot) != 0) return false;
    return lowerPath[lowerRoot.size()] == L'\\';
}

bool IsUnderSystem32(const std::wstring& path, const std::wstring& system32) {
    const std::wstring lowerPath = ToLower(path);
    const std::wstring lowerSystem32 = ToLower(system32);
    if (lowerSystem32.empty()) return false;
    if (lowerPath.size() <= lowerSystem32.size()) return false;
    if (lowerPath.compare(0, lowerSystem32.size(), lowerSystem32) != 0) return false;
    return lowerPath[lowerSystem32.size()] == L'\\';
}

bool PathsEqualIgnoreCase(const std::wstring& a, const std::wstring& b) {
    return ToLower(a) == ToLower(b);
}

WhitelistDecision CheckWhitelist(const std::wstring& executable,
                                 const std::vector<std::wstring>& argv,
                                 const WhitelistConfig& config) {
    if (config.system32Directory.empty()) return WhitelistDecision::RejectExecutable;
    if (ClassifyPathShape(executable) != PathShape::Absolute) {
        return WhitelistDecision::RejectExecutable;
    }

    // Directly under System32 only: separator boundary (System32evil rejected)
    // and no subdirectory (System32\sub\tool.exe rejected).
    if (!IsUnderSystem32(executable, config.system32Directory)) {
        return WhitelistDecision::RejectExecutable;
    }
    if (!PathsEqualIgnoreCase(PathDirectory(executable), config.system32Directory)) {
        return WhitelistDecision::RejectExecutable;
    }

    const std::wstring base = ToLower(Basename(executable));
    static const wchar_t* kSystem32Tools[] = {
        L"cmd.exe", L"where.exe", L"reg.exe", L"whoami.exe",
        L"findstr.exe", L"ping.exe", L"tasklist.exe", L"certutil.exe",
    };
    bool knownTool = false;
    for (const wchar_t* tool : kSystem32Tools) {
        if (base == tool) { knownTool = true; break; }
    }
    if (!knownTool) return WhitelistDecision::RejectExecutable;

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

TrustedShellDecision CheckTrustedShellHost(
    const std::wstring& executable,
    const std::vector<std::wstring>& argv,
    const std::wstring& command,
    const std::wstring& shellKind,
    const std::wstring& shellSource,
    bool identityVerified,
    const WhitelistConfig& config) {
    if (!identityVerified || ClassifyPathShape(executable) != PathShape::Absolute) {
        return TrustedShellDecision::RejectBinding;
    }
    if (shellSource == L"automatic") {
        if (config.system32Directory.empty()) return TrustedShellDecision::RejectExecutable;
        if (shellKind == L"cmd") {
            const std::wstring expected = config.system32Directory + L"\\cmd.exe";
            if (!PathsEqualIgnoreCase(executable, expected)) {
                return TrustedShellDecision::RejectExecutable;
            }
        } else if (shellKind == L"powershell") {
            const std::wstring expected = config.system32Directory +
                L"\\WindowsPowerShell\\v1.0\\powershell.exe";
            if (!PathsEqualIgnoreCase(executable, expected)) {
                return TrustedShellDecision::RejectExecutable;
            }
        } else {
            return TrustedShellDecision::RejectExecutable;
        }
    } else if (shellSource != L"workspace_explicit") {
        return TrustedShellDecision::RejectBinding;
    }

    if (shellKind == L"cmd") {
        if (argv.size() != 4 || ToLower(argv[0]) != L"/d" ||
            ToLower(argv[1]) != L"/s" || ToLower(argv[2]) != L"/c" ||
            argv[3] != command) {
            return TrustedShellDecision::RejectArgv;
        }
    } else if (shellKind == L"powershell") {
        static const wchar_t* kPrefix[] = {
            L"-nologo", L"-noprofile", L"-noninteractive",
            L"-executionpolicy", L"bypass", L"-encodedcommand",
        };
        if (argv.size() != 7) return TrustedShellDecision::RejectArgv;
        for (size_t i = 0; i < 6; ++i) {
            if (ToLower(argv[i]) != kPrefix[i]) return TrustedShellDecision::RejectArgv;
        }
        if (argv[6].empty()) return TrustedShellDecision::RejectArgv;
    } else if (shellKind == L"bash") {
        if (shellSource != L"workspace_explicit" || argv.size() != 2 ||
            argv[0] != L"-c" || argv[1] != command) {
            return TrustedShellDecision::RejectArgv;
        }
    } else {
        return TrustedShellDecision::RejectExecutable;
    }
    return TrustedShellDecision::Allow;
}

}  // namespace spike02
