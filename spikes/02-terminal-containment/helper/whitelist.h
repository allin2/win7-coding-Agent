/**
 * helper/whitelist.h — Executable/argv allow-list for the D-013 helper (C06).
 *
 * The helper refuses to launch executables outside the allow-list. The allow-
 * list contains only tools under the real System32 directory (resolved via
 * GetSystemDirectoryW and reparse-resolved by the caller), so a bare name,
 * a path-shaped sibling like System32evil, or a reparse escape is rejected.
 *
 * Callers must pass an absolute drive-letter path that has already been
 * canonicalized (GetFullPathNameW + GetFinalPathNameByHandleW). The pure
 * path-shape classifier here is the first fail-closed gate; it rejects bare
 * names, UNC, device, drive-relative, relative and trailing-dot/space paths.
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

// Shape of an executable path, used as the first fail-closed gate before any
// allow-list evaluation. Only Absolute is acceptable.
enum class PathShape {
    Absolute,           // C:\Windows\System32\cmd.exe (drive-letter absolute)
    BareName,           // cmd.exe (no directory, no drive)
    DriveRelative,      // C:cmd.exe or a bare "C:"
    Unc,                // \\server\share\...
    Device,             // \\.\... or \\?\...
    Relative,           // .\cmd.exe, ..\x, \cmd.exe, foo\bar.exe
    TrailingDotOrSpace, // a path component ends with '.' or ' '
    EmbeddedNul,        // contains L'\0'
};

// Classify `path` by shape. Pure string logic (cross-platform, case-aware only
// where Windows would be); `path` must not contain an embedded NUL for
// anything but EmbeddedNul classification.
PathShape ClassifyPathShape(const std::wstring& path);

// Directory of a path ("C:\Windows\System32\cmd.exe" -> "C:\Windows\System32").
std::wstring PathDirectory(const std::wstring& path);

// Case-insensitive, boundary-safe "is at or under": true when `path` equals
// `root` or is directly/indirectly below it with a separator boundary
// (root="C:\a", path="C:\ab" -> false; path="C:\a\b" -> true).
bool PathWithinRoot(const std::wstring& path, const std::wstring& root);

// Strictly-under-System32 check: `path` must be below `system32` with a
// separator boundary (System32evil and System32 itself are rejected).
bool IsUnderSystem32(const std::wstring& path, const std::wstring& system32);

// Case-insensitive path equality.
bool PathsEqualIgnoreCase(const std::wstring& a, const std::wstring& b);

struct WhitelistConfig {
    // Canonical System32 directory (normally C:\Windows\System32), resolved by
    // GetSystemDirectoryW. Only binaries directly under it are accepted.
    std::wstring system32Directory;
};

// Evaluate the allow-list for `executable` + `argv`. `executable` must be an
// already-canonicalized absolute drive path; a bare name, UNC, device,
// drive-relative, trailing-dot path or anything outside System32 is rejected.
WhitelistDecision CheckWhitelist(const std::wstring& executable,
                                 const std::vector<std::wstring>& argv,
                                 const WhitelistConfig& config);

}  // namespace spike02

#endif  // SPIKE02_WHITELIST_H
