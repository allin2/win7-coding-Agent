/**
 * SPIKE 02 / D-013 — C++ Helper main + Win32 containment orchestration.
 *
 * Win32 console application: reads one JSON request per line from stdin,
 * runs the requested executable inside a restricted environment, and writes
 * one JSON response line to stdout.
 *
 * Containment chain (each layer fails closed):
 *   C02  Host Job probe        IsProcessInJob(self, NULL) -> refuse on Win7
 *                              (Jobs are not nestable on Win7, P11).
 *   C01  Job Object            KILL_ON_JOB_CLOSE + active-process + per-process
 *                              memory limits; whole-tree reclamation on timeout
 *                              via TerminateJobObject (never taskkill, N06).
 *   C03  Restricted Token      maximum privileges disabled while preserving
 *                              SeChangeNotifyPrivilege, Administrators deny-only,
 *                              Low Integrity mandatory label; the
 *                              token is actually applied to the child through
 *                              CreateProcessAsUserW.
 *   C04  ACL                   Low-Integrity label on allowedDirectories so the
 *                              low-integrity child can write inside the
 *                              workspace; explicit deny ACEs on
 *                              protectedDirectories with automatic rollback.
 *                              A4-3: ACL changes are authorized by aclPolicy
 *                              (only inside the per-run root, which must be
 *                              under the acceptance root) and the original
 *                              integrity label is captured and restored.
 *   C06/C09 Structured argv    allow-list (canonical absolute System32 path
 *                              only) + proper command-line quoting.
 *   C07  Timeout/output cap    TerminateJobObject on timeout; per-stream byte
 *                              caps with truncation marker, pipes continuously
 *                              drained (P02 — no deadlock).
 *   C19  Input detached        child stdin is the NUL device; the helper's own
 *                              stdio is marked non-inheritable so the child can
 *                              never reach the JSON channel.
 *
 * Compile: MSVC v142 (VS2019), target Windows 7 SP1 x64, static CRT.
 * Win7-Validation: NOT_PERFORMED (Win7 runtime evidence pending WIN7_LEASE_GRANTED)
 */

#include "helper.h"

#include <algorithm>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#ifdef _WIN32

#include <fcntl.h>
#include <io.h>
#include <windows.h>
#include <sddl.h>
#endif

namespace spike02 {
namespace {

#ifdef _WIN32

#ifndef DELETE_CHILD  // winnt.h on MSVC; guard for cross-compilers
#define DELETE_CHILD 0x00000080
#endif

constexpr DWORD kProtectedWriteDenyMask =
    FILE_ADD_FILE | FILE_ADD_SUBDIRECTORY | FILE_WRITE_DATA | FILE_APPEND_DATA |
    FILE_WRITE_EA | FILE_WRITE_ATTRIBUTES | DELETE | DELETE_CHILD;

// ─── helpers ─────────────────────────────────────────────────────────────────

std::wstring WinErrorText(DWORD code) {
    wchar_t* buffer = nullptr;
    const DWORD len = FormatMessageW(
        FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM |
            FORMAT_MESSAGE_IGNORE_INSERTS,
        nullptr, code, 0, reinterpret_cast<wchar_t*>(&buffer), 0, nullptr);
    std::wstring text = len && buffer ? std::wstring(buffer, len) : L"unknown error";
    if (buffer) LocalFree(buffer);
    while (!text.empty() && (text.back() == L'\r' || text.back() == L'\n' || text.back() == L' ')) {
        text.pop_back();
    }
    return text;
}

std::string WideToUtf8(const std::wstring& wide) {
    if (wide.empty()) return std::string();
#ifdef _WIN32
    const int needed = WideCharToMultiByte(CP_UTF8, 0, wide.data(),
                                           static_cast<int>(wide.size()), nullptr, 0, nullptr, nullptr);
    if (needed <= 0) return std::string();
    std::string out(static_cast<size_t>(needed), '\0');
    WideCharToMultiByte(CP_UTF8, 0, wide.data(), static_cast<int>(wide.size()),
                        &out[0], needed, nullptr, nullptr);
    return out;
#else
    std::string out;
    for (wchar_t ch : wide) {
        if (ch < 0x80) out.push_back(static_cast<char>(ch));
        else if (ch < 0x800) {
            out.push_back(static_cast<char>(0xC0 | (ch >> 6)));
            out.push_back(static_cast<char>(0x80 | (ch & 0x3F)));
        } else if (ch < 0xD800 || ch > 0xDFFF) {
            out.push_back(static_cast<char>(0xE0 | (ch >> 12)));
            out.push_back(static_cast<char>(0x80 | ((ch >> 6) & 0x3F)));
            out.push_back(static_cast<char>(0x80 | (ch & 0x3F)));
        }
    }
    return out;
#endif
}

// Look up the user SID of a token (used for the deny ACE trustee).
PSID GetTokenUserSid(HANDLE token) {
    DWORD size = 0;
    GetTokenInformation(token, TokenUser, nullptr, 0, &size);
    if (size == 0) return nullptr;
    std::vector<unsigned char> buffer(size);
    if (!GetTokenInformation(token, TokenUser, buffer.data(), size, &size)) return nullptr;
    TOKEN_USER* user = reinterpret_cast<TOKEN_USER*>(buffer.data());
    PSID sid = nullptr;
    const DWORD sidLen = GetLengthSid(user->User.Sid);
    sid = static_cast<PSID>(LocalAlloc(LPTR, sidLen));
    if (sid && !CopySid(sidLen, sid, user->User.Sid)) {
        LocalFree(sid);
        return nullptr;
    }
    return sid;
}

void ReleaseSecurityDescriptorSnapshot(SecurityDescriptorSnapshot* snapshot) {
    if (!snapshot) return;
    if (snapshot->descriptor) LocalFree(snapshot->descriptor);
    snapshot->descriptor = nullptr;
    snapshot->acl = nullptr;
}

bool AclsEqual(PACL left, PACL right) {
    if (!left || !right) return left == right;
    ACL_SIZE_INFORMATION leftInfo = {};
    ACL_SIZE_INFORMATION rightInfo = {};
    if (!GetAclInformation(left, &leftInfo, sizeof(leftInfo), AclSizeInformation) ||
        !GetAclInformation(right, &rightInfo, sizeof(rightInfo), AclSizeInformation)) {
        return false;
    }
    if (leftInfo.AceCount != rightInfo.AceCount) return false;
    for (DWORD i = 0; i < leftInfo.AceCount; ++i) {
        ACE_HEADER* leftAce = nullptr;
        ACE_HEADER* rightAce = nullptr;
        if (!GetAce(left, i, reinterpret_cast<void**>(&leftAce)) ||
            !GetAce(right, i, reinterpret_cast<void**>(&rightAce)) ||
            leftAce->AceSize != rightAce->AceSize ||
            std::memcmp(leftAce, rightAce, leftAce->AceSize) != 0) {
            return false;
        }
    }
    return true;
}

// Win7 may materialize an absent LABEL_SECURITY_INFORMATION ACL as a valid
// zero-ACE ACL after SetNamedSecurityInfoW clears the last mandatory label.
// Those two representations both mean "no explicit mandatory label". This
// equivalence is LABEL-only: a null DACL and an empty DACL have very different
// access semantics and must continue through strict AclsEqual comparison.
bool LabelAclsEqual(PACL left, PACL right) {
    if (left && right) return AclsEqual(left, right);
    if (!left && !right) return true;
    PACL present = left ? left : right;
    ACL_SIZE_INFORMATION info = {};
    return GetAclInformation(present, &info, sizeof(info), AclSizeInformation) &&
           info.AceCount == 0;
}

std::wstring DescribeAclShape(PACL acl) {
    if (!acl) return L"null";
    ACL_SIZE_INFORMATION info = {};
    if (!GetAclInformation(acl, &info, sizeof(info), AclSizeInformation)) {
        return L"invalid";
    }
    return std::to_wstring(info.AceCount) + L" ACE(s)";
}

bool CurrentDaclMatches(const std::wstring& directory, PACL expected,
                        std::wstring* error) {
    PSECURITY_DESCRIPTOR descriptor = nullptr;
    PACL current = nullptr;
    const DWORD result = GetNamedSecurityInfoW(
        const_cast<wchar_t*>(directory.c_str()), SE_FILE_OBJECT,
        DACL_SECURITY_INFORMATION, nullptr, nullptr, &current, nullptr, &descriptor);
    if (result != ERROR_SUCCESS || !descriptor) {
        if (error) *error = L"GetNamedSecurityInfoW(DACL verify) failed: " + WinErrorText(result);
        if (descriptor) LocalFree(descriptor);
        return false;
    }
    const bool equal = AclsEqual(current, expected);
    if (!equal && error) *error = L"restored DACL does not match the captured DACL";
    LocalFree(descriptor);
    return equal;
}

bool CurrentLabelAclMatches(const std::wstring& directory, PACL expected,
                            std::wstring* error) {
    PSECURITY_DESCRIPTOR descriptor = nullptr;
    PACL current = nullptr;
    const DWORD result = GetNamedSecurityInfoW(
        const_cast<wchar_t*>(directory.c_str()), SE_FILE_OBJECT,
        LABEL_SECURITY_INFORMATION, nullptr, nullptr, nullptr, &current, &descriptor);
    if (result != ERROR_SUCCESS || !descriptor) {
        if (error) *error = L"GetNamedSecurityInfoW(label verify) failed: " + WinErrorText(result);
        if (descriptor) LocalFree(descriptor);
        return false;
    }
    const bool equal = LabelAclsEqual(current, expected);
    if (!equal && error) {
        *error = L"restored mandatory-label ACL does not match the captured ACL"
                 L" (captured=" + DescribeAclShape(expected) +
                 L", current=" + DescribeAclShape(current) + L")";
    }
    LocalFree(descriptor);
    return equal;
}

// Resolve `dir` to its final path via a real handle (reparse points followed,
// \\?\ prefix stripped). Fails closed when the object does not exist or cannot
// be opened — a target we cannot resolve must not be trusted.
bool ResolveDirPath(const std::wstring& dir, std::wstring* resolved, std::wstring* error) {
    wchar_t full[MAX_PATH * 2] = {};
    const DWORD fullLen = GetFullPathNameW(dir.c_str(),
                                           static_cast<DWORD>(MAX_PATH * 2), full, nullptr);
    if (fullLen == 0 || fullLen >= MAX_PATH * 2) {
        if (error) *error = L"GetFullPathNameW failed for: " + dir;
        return false;
    }
    HANDLE hDir = CreateFileW(std::wstring(full, fullLen).c_str(), 0,
                              FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                              nullptr, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS, nullptr);
    if (hDir == INVALID_HANDLE_VALUE) {
        if (error) *error = L"directory not openable: " + dir;
        return false;
    }
    wchar_t finalBuf[MAX_PATH * 2] = {};
    const DWORD finalLen = GetFinalPathNameByHandleW(
        hDir, finalBuf, static_cast<DWORD>(MAX_PATH * 2), FILE_NAME_NORMALIZED);
    CloseHandle(hDir);
    if (finalLen == 0 || finalLen >= MAX_PATH * 2) {
        if (error) *error = L"GetFinalPathNameByHandleW failed for: " + dir;
        return false;
    }
    std::wstring finalPath(finalBuf, finalLen);
    if (finalPath.rfind(L"\\\\?\\", 0) == 0) finalPath = finalPath.substr(4);
    *resolved = finalPath;
    return true;
}

bool ResolveExecutablePathInternal(const std::wstring& executable, std::wstring* canonical,
                                   std::wstring* error) {
    // First gate: only drive-letter absolute request paths are accepted.
    if (ClassifyPathShape(executable) != PathShape::Absolute) {
        if (error) *error = L"executable must be an absolute drive path (bare names, "
                            L"UNC, device, drive-relative and trailing-dot/space paths are rejected)";
        return false;
    }
    wchar_t full[MAX_PATH * 2] = {};
    const DWORD fullLen = GetFullPathNameW(executable.c_str(),
                                           static_cast<DWORD>(MAX_PATH * 2), full, nullptr);
    if (fullLen == 0 || fullLen >= MAX_PATH * 2) {
        if (error) *error = L"GetFullPathNameW failed for executable: " + executable;
        return false;
    }
    const std::wstring resolved(full, fullLen);
    // Resolve the final path through a real handle: a junction/symlink pointing
    // outside System32 resolves to its real target, so the allow-list on the
    // final path catches the escape (the file must exist and be openable).
    HANDLE hFile = CreateFileW(
        resolved.c_str(), 0,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr, OPEN_EXISTING,
        FILE_FLAG_BACKUP_SEMANTICS, nullptr);
    if (hFile == INVALID_HANDLE_VALUE) {
        if (error) *error = L"CreateFileW failed (executable not openable): " + executable;
        return false;
    }
    wchar_t finalBuf[MAX_PATH * 2] = {};
    const DWORD finalLen = GetFinalPathNameByHandleW(
        hFile, finalBuf, static_cast<DWORD>(MAX_PATH * 2), FILE_NAME_NORMALIZED);
    CloseHandle(hFile);
    if (finalLen == 0 || finalLen >= MAX_PATH * 2) {
        if (error) *error = L"GetFinalPathNameByHandleW failed for executable: " + executable;
        return false;
    }
    std::wstring finalPath(finalBuf, finalLen);
    if (finalPath.rfind(L"\\\\?\\", 0) == 0) finalPath = finalPath.substr(4);
    // Second gate: the final path must still be a local absolute path — a
    // reparse escape to a UNC/relative/device path is rejected here.
    if (ClassifyPathShape(finalPath) != PathShape::Absolute) {
        if (error) *error = L"resolved path is not an absolute drive path (reparse escape?)";
        return false;
    }
    *canonical = finalPath;
    return true;
}

// Verify the exact low-integrity mandatory label installed by
// ApplyLowIntegrityLabel: Low SID, NO_WRITE_UP, and inheritable to children.
bool VerifyLowIntegrityLabel(const std::wstring& directory) {
    PSECURITY_DESCRIPTOR descriptor = nullptr;
    PACL pLabelAcl = nullptr;
    const DWORD result = GetNamedSecurityInfoW(
        const_cast<wchar_t*>(directory.c_str()), SE_FILE_OBJECT,
        LABEL_SECURITY_INFORMATION, nullptr, nullptr, nullptr, &pLabelAcl, &descriptor);
    if (result != ERROR_SUCCESS || !descriptor || !pLabelAcl) {
        if (descriptor) LocalFree(descriptor);
        return false;
    }
    PSID lowSid = nullptr;
    if (!ConvertStringSidToSidW(L"S-1-16-4096", &lowSid)) {
        LocalFree(descriptor);
        return false;
    }
    bool present = false;
    const BYTE requiredFlags = CONTAINER_INHERIT_ACE | OBJECT_INHERIT_ACE;
    for (DWORD i = 0; i < pLabelAcl->AceCount && !present; ++i) {
        ACE_HEADER* header = nullptr;
        if (!GetAce(pLabelAcl, i, reinterpret_cast<void**>(&header)) ||
            header->AceType != SYSTEM_MANDATORY_LABEL_ACE_TYPE) {
            continue;
        }
        SYSTEM_MANDATORY_LABEL_ACE* ace =
            reinterpret_cast<SYSTEM_MANDATORY_LABEL_ACE*>(header);
        PSID aceSid = reinterpret_cast<PSID>(&ace->SidStart);
        present = EqualSid(aceSid, lowSid) &&
                  ace->Mask == SYSTEM_MANDATORY_LABEL_NO_WRITE_UP &&
                  (header->AceFlags & requiredFlags) == requiredFlags;
    }
    LocalFree(lowSid);
    LocalFree(descriptor);
    return present;
}

// Verify a deny ACE for `userSid` is present in the directory DACL.
bool VerifyDenyAce(const std::wstring& directory, PSID userSid) {
    PSECURITY_DESCRIPTOR descriptor = nullptr;
    PACL pDacl = nullptr;
    const DWORD result = GetNamedSecurityInfoW(
        const_cast<wchar_t*>(directory.c_str()), SE_FILE_OBJECT,
        DACL_SECURITY_INFORMATION, nullptr, nullptr, &pDacl, nullptr, &descriptor);
    if (result != ERROR_SUCCESS || !descriptor || !pDacl) {
        if (descriptor) LocalFree(descriptor);
        return false;
    }
    bool found = false;
    for (DWORD i = 0; i < pDacl->AceCount && !found; ++i) {
        ACE_HEADER* header = nullptr;
        if (!GetAce(pDacl, i, reinterpret_cast<void**>(&header))) continue;
        if (header->AceType != ACCESS_DENIED_ACE_TYPE) continue;
        ACCESS_DENIED_ACE* ace = reinterpret_cast<ACCESS_DENIED_ACE*>(header);
        PSID aceSid = reinterpret_cast<PSID>(&ace->SidStart);
        const BYTE requiredFlags = CONTAINER_INHERIT_ACE | OBJECT_INHERIT_ACE;
        if (EqualSid(aceSid, userSid) &&
            (ace->Mask & kProtectedWriteDenyMask) == kProtectedWriteDenyMask &&
            (header->AceFlags & requiredFlags) == requiredFlags) {
            found = true;
        }
    }
    LocalFree(descriptor);
    return found;
}

// Drain currently available bytes from a pipe. Returns false on EOF/broken pipe.
bool DrainAvailable(HANDLE hPipe, std::vector<unsigned char>* buffer,
                    long long cap, bool* truncated) {
    DWORD available = 0;
    DWORD total = 0;
    if (!PeekNamedPipe(hPipe, nullptr, 0, nullptr, &available, &total)) return false;
    if (available == 0) return true;
    unsigned char chunk[4096];
    const DWORD toRead = std::min<DWORD>(available, sizeof(chunk));
    DWORD read = 0;
    if (!ReadFile(hPipe, chunk, toRead, &read, nullptr) || read == 0) return false;
    const size_t room = cap > static_cast<long long>(buffer->size())
                            ? static_cast<size_t>(cap - static_cast<long long>(buffer->size()))
                            : 0;
    const size_t take = std::min<size_t>(room, read);
    if (take) buffer->insert(buffer->end(), chunk, chunk + take);
    if (take < read) *truncated = true;
    return true;
}

// Drain until EOF after the whole tree has been killed. Writers are dead, so a
// 1-byte probe cannot block.
void DrainUntilEof(HANDLE hPipe, std::vector<unsigned char>* buffer,
                   long long cap, bool* truncated) {
    for (int i = 0; i < 400; ++i) {  // bounded: ~4 s worst case at 10 ms sleep
        DWORD available = 0;
        if (!PeekNamedPipe(hPipe, nullptr, 0, nullptr, &available, nullptr)) return;
        if (available > 0) {
            if (!DrainAvailable(hPipe, buffer, cap, truncated)) return;
            continue;
        }
        unsigned char probe = 0;
        DWORD read = 0;
        if (!ReadFile(hPipe, &probe, 1, &read, nullptr) || read == 0) return;  // EOF
        if (buffer->size() < static_cast<size_t>(cap)) {
            buffer->push_back(probe);
        } else {
            *truncated = true;
        }
        Sleep(10);
    }
}

#endif  // _WIN32

}  // namespace

#ifdef _WIN32

bool ResolveExecutablePath(const std::wstring& executable, std::wstring* canonical,
                           std::wstring* error) {
    return ResolveExecutablePathInternal(executable, canonical, error);
}

bool HostIsInJob() {
    BOOL inJob = FALSE;
    // Fail closed when the probe itself fails.
    if (!IsProcessInJob(GetCurrentProcess(), nullptr, &inJob)) return true;
    return inJob ? true : false;
}

HANDLE CreateConfiguredJobObject() {
    HANDLE hJob = CreateJobObjectW(nullptr, nullptr);
    if (!hJob) return nullptr;

    JOBOBJECT_EXTENDED_LIMIT_INFORMATION jeli = {};
    jeli.BasicLimitInformation.LimitFlags =
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE |   // whole-tree reclamation on close
        JOB_OBJECT_LIMIT_ACTIVE_PROCESS |      // bound the process tree size
        JOB_OBJECT_LIMIT_PROCESS_MEMORY;       // bound per-process memory (budget #4)
    jeli.BasicLimitInformation.ActiveProcessLimit = kJobActiveProcessLimit;
    jeli.ProcessMemoryLimit = kJobProcessMemoryLimit;

    if (!SetInformationJobObject(hJob, JobObjectExtendedLimitInformation,
                                 &jeli, sizeof(jeli))) {
        CloseHandle(hJob);
        return nullptr;
    }
    return hJob;
}

HANDLE CreateRestrictedProcessToken() {
    HANDLE hSource = nullptr;
    if (!OpenProcessToken(GetCurrentProcess(), TOKEN_ALL_ACCESS, &hSource)) return nullptr;

    // 1. Disable Administrators as deny-only. Do not disable Everyone/World:
    // core OS objects may grant baseline read/execute access only through
    // Everyone, so making it deny-only can let CreateProcessAsUserW create the
    // process but make the Windows loader terminate it with
    // STATUS_ACCESS_DENIED (0xC0000022) before user code runs. The remaining
    // containment layers are DISABLE_MAX_PRIVILEGE, Low Integrity, the Job,
    // and the explicit protected-directory deny ACE.
    std::vector<SID_AND_ATTRIBUTES> sidsToDisable;
    PSID adminsSid = nullptr;
    SID_IDENTIFIER_AUTHORITY ntAuth = SECURITY_NT_AUTHORITY;
    if (!AllocateAndInitializeSid(&ntAuth, 2, SECURITY_BUILTIN_DOMAIN_RID,
                                  DOMAIN_ALIAS_RID_ADMINS, 0, 0, 0, 0, 0, 0, &adminsSid)) {
        CloseHandle(hSource);
        return nullptr;
    }
    sidsToDisable.push_back({adminsSid, 0});

    // 2. DISABLE_MAX_PRIVILEGE disables every privilege except
    // SeChangeNotifyPrivilege. Windows deliberately preserves that privilege
    // so normal directory traversal continues to work; manually deleting it
    // can make an otherwise valid working directory unusable.
    HANDLE hRestricted = nullptr;
    const BOOL created = CreateRestrictedToken(
        hSource, DISABLE_MAX_PRIVILEGE,
        static_cast<DWORD>(sidsToDisable.size()),
        sidsToDisable.empty() ? nullptr : sidsToDisable.data(),
        0, nullptr,
        0, nullptr, &hRestricted);

    for (SID_AND_ATTRIBUTES& sid : sidsToDisable) FreeSid(sid.Sid);
    CloseHandle(hSource);
    if (!created || !hRestricted) return nullptr;

    // 3. Drop to Low Integrity (mandatory label S-1-16-4096).
    PSID lowSid = nullptr;
    if (!ConvertStringSidToSidW(L"S-1-16-4096", &lowSid)) {
        CloseHandle(hRestricted);
        return nullptr;
    }
    TOKEN_MANDATORY_LABEL label = {};
    label.Label.Sid = lowSid;
    label.Label.Attributes = SE_GROUP_INTEGRITY;
    const BOOL levelOk = SetTokenInformation(
        hRestricted, TokenIntegrityLevel, &label,
        static_cast<DWORD>(sizeof(TOKEN_MANDATORY_LABEL) + GetLengthSid(lowSid)));
    LocalFree(lowSid);
    if (!levelOk) {
        CloseHandle(hRestricted);
        return nullptr;
    }
    return hRestricted;
}

bool ApplyLowIntegrityLabel(const std::wstring& directory, std::wstring* error) {
    PSID lowSid = nullptr;
    if (!ConvertStringSidToSidW(L"S-1-16-4096", &lowSid)) {
        if (error) *error = L"ConvertStringSidToSidW failed";
        return false;
    }
    const DWORD sidLen = GetLengthSid(lowSid);
    const DWORD aclSize = static_cast<DWORD>(sizeof(ACL) +
                                             sizeof(SYSTEM_MANDATORY_LABEL_ACE) - sizeof(DWORD) + sidLen);
    PACL pLabelAcl = static_cast<PACL>(LocalAlloc(LPTR, aclSize));
    bool ok = false;
    if (pLabelAcl && InitializeAcl(pLabelAcl, aclSize, ACL_REVISION)) {
        if (AddMandatoryAce(pLabelAcl, ACL_REVISION, 0, SYSTEM_MANDATORY_LABEL_NO_WRITE_UP,
                            lowSid)) {
            // Inheritable so files created inside the workspace keep the label.
            ACE_HEADER* header = reinterpret_cast<ACE_HEADER*>(
                reinterpret_cast<unsigned char*>(pLabelAcl) + sizeof(ACL));
            header->AceFlags = CONTAINER_INHERIT_ACE | OBJECT_INHERIT_ACE;
            // Mandatory labels are stored in the SACL. SetNamedSecurityInfoW's
            // final ACL arguments are pDacl followed by pSacl, so pDacl must
            // stay null and the label ACL must be passed as pSacl.
            const DWORD result = SetNamedSecurityInfoW(
                const_cast<wchar_t*>(directory.c_str()), SE_FILE_OBJECT,
                LABEL_SECURITY_INFORMATION, nullptr, nullptr, nullptr, pLabelAcl);
            if (result == ERROR_SUCCESS) {
                ok = true;
            } else if (error) {
                *error = L"SetNamedSecurityInfoW(LABEL) failed: " + WinErrorText(result);
            }
        } else if (error) {
            *error = L"AddMandatoryAce failed";
        }
    } else if (error) {
        *error = L"LocalAlloc/InitializeAcl failed";
    }
    if (pLabelAcl) LocalFree(pLabelAcl);
    LocalFree(lowSid);
    return ok;
}

bool ApplyDenyAce(const std::wstring& directory, PSID userSid,
                  SecurityDescriptorSnapshot* restore, std::wstring* error) {
    if (!restore) {
        if (error) *error = L"DACL restore snapshot output is null";
        return false;
    }
    *restore = {};
    PSECURITY_DESCRIPTOR oldDescriptor = nullptr;
    PACL pOldDacl = nullptr;
    DWORD result = GetNamedSecurityInfoW(
        const_cast<wchar_t*>(directory.c_str()), SE_FILE_OBJECT,
        DACL_SECURITY_INFORMATION, nullptr, nullptr, &pOldDacl, nullptr, &oldDescriptor);
    if (result != ERROR_SUCCESS || !oldDescriptor || !pOldDacl) {
        if (error) *error = L"GetNamedSecurityInfoW(DACL) failed: " + WinErrorText(result);
        if (oldDescriptor) LocalFree(oldDescriptor);
        return false;
    }

    EXPLICIT_ACCESSW explicitAccess = {};
    explicitAccess.grfAccessPermissions = kProtectedWriteDenyMask;
    explicitAccess.grfAccessMode = DENY_ACCESS;
    explicitAccess.grfInheritance = SUB_CONTAINERS_AND_OBJECTS_INHERIT;
    explicitAccess.Trustee.TrusteeForm = TRUSTEE_IS_SID;
    explicitAccess.Trustee.ptstrName = reinterpret_cast<LPWCH>(userSid);

    PACL pNewDacl = nullptr;
    result = SetEntriesInAclW(1, &explicitAccess, pOldDacl, &pNewDacl);
    if (result != ERROR_SUCCESS) {
        if (error) *error = L"SetEntriesInAclW failed: " + WinErrorText(result);
        if (oldDescriptor) LocalFree(oldDescriptor);
        return false;
    }

    result = SetNamedSecurityInfoW(
        const_cast<wchar_t*>(directory.c_str()), SE_FILE_OBJECT,
        DACL_SECURITY_INFORMATION, nullptr, nullptr, pNewDacl, nullptr);
    LocalFree(pNewDacl);
    if (result != ERROR_SUCCESS) {
        if (error) *error = L"SetNamedSecurityInfoW(DACL) failed: " + WinErrorText(result);
        if (oldDescriptor) LocalFree(oldDescriptor);
        return false;
    }
    restore->descriptor = oldDescriptor;
    restore->acl = pOldDacl;
    return true;
}

bool RestoreDirectoryDacl(const std::wstring& directory,
                          const SecurityDescriptorSnapshot& restore,
                          std::wstring* error) {
    const DWORD result = SetNamedSecurityInfoW(
        const_cast<wchar_t*>(directory.c_str()), SE_FILE_OBJECT,
        DACL_SECURITY_INFORMATION, nullptr, nullptr, restore.acl, nullptr);
    if (result != ERROR_SUCCESS) {
        if (error) *error = L"SetNamedSecurityInfoW(restore) failed: " + WinErrorText(result);
        return false;
    }
    return CurrentDaclMatches(directory, restore.acl, error);
}

bool CaptureLowIntegrityLabel(const std::wstring& directory,
                              SecurityDescriptorSnapshot* restore,
                              std::wstring* error) {
    if (!restore) {
        if (error) *error = L"label restore snapshot output is null";
        return false;
    }
    *restore = {};
    PSECURITY_DESCRIPTOR descriptor = nullptr;
    PACL pLabelAcl = nullptr;
    const DWORD result = GetNamedSecurityInfoW(
        const_cast<wchar_t*>(directory.c_str()), SE_FILE_OBJECT,
        LABEL_SECURITY_INFORMATION, nullptr, nullptr, nullptr, &pLabelAcl, &descriptor);
    if (result != ERROR_SUCCESS) {
        if (error) *error = L"GetNamedSecurityInfoW(LABEL) failed: " + WinErrorText(result);
        if (descriptor) LocalFree(descriptor);
        return false;
    }
    // Keep the descriptor even when pLabelAcl is null: restoring a null ACL
    // clears the label and returns the directory to its pre-run state.
    restore->descriptor = descriptor;
    restore->acl = pLabelAcl;
    return true;
}

bool RestoreLowIntegrityLabel(const std::wstring& directory,
                              const SecurityDescriptorSnapshot& restore,
                              std::wstring* error) {
    const DWORD result = SetNamedSecurityInfoW(
        const_cast<wchar_t*>(directory.c_str()), SE_FILE_OBJECT,
        LABEL_SECURITY_INFORMATION, nullptr, nullptr, nullptr, restore.acl);
    if (result != ERROR_SUCCESS) {
        if (error) *error = L"SetNamedSecurityInfoW(label restore) failed: " + WinErrorText(result);
        return false;
    }
    return CurrentLabelAclMatches(directory, restore.acl, error);
}

int LaunchRestrictedProcess(const ProcessConfig& config, ProcessResult* result) {
    // C02: fail closed when the host is already inside a Job (Win7 cannot nest).
    if (HostIsInJob()) return HELPER_ERR_HOST_IN_JOB;

    HANDLE hJob = CreateConfiguredJobObject();
    if (!hJob) return HELPER_ERR_JOB_CREATE;

    HANDLE hRestricted = CreateRestrictedProcessToken();
    if (!hRestricted) {
        CloseHandle(hJob);
        return HELPER_ERR_TOKEN_CREATE;
    }
    // CreateProcessAsUserW accepts the restricted version of the caller's
    // primary token without requiring SeAssignPrimaryTokenPrivilege. Keep the
    // token primary and verify that contract before launch.
    TOKEN_TYPE restrictedType = TokenImpersonation;
    DWORD restrictedTypeSize = 0;
    if (!GetTokenInformation(hRestricted, TokenType, &restrictedType,
                             sizeof(restrictedType), &restrictedTypeSize) ||
        restrictedType != TokenPrimary) {
        result->errorMessage = "restricted token is not a primary token";
        CloseHandle(hRestricted);
        CloseHandle(hJob);
        return HELPER_ERR_TOKEN_CREATE;
    }

    auto failAclPolicy = [&]() {
        CloseHandle(hRestricted);
        CloseHandle(hJob);
        return HELPER_ERR_ACL_POLICY;
    };

    // ─── ACL setup (C03/C04) ─────────────────────────────────────────────
    // Policy first (A4-3): Low-Integrity labels and deny ACEs may only be
    // applied inside perRunRoot (which must be under acceptanceRoot). Every
    // target is reparse-resolved before authorization, so a `..` or junction
    // escape cannot disguise an out-of-root directory.
    std::vector<std::wstring> allowedDirs;
    std::vector<std::wstring> protectedDirs;
    std::wstring aclError;
    if (!config.allowedDirectories.empty() || !config.protectedDirectories.empty()) {
        if (!config.aclPolicy.valid) return failAclPolicy();
        ProcessConfig canonical = config;
        canonical.allowedDirectories.clear();
        canonical.protectedDirectories.clear();
        if (!ResolveDirPath(config.aclPolicy.acceptanceRoot,
                            &canonical.aclPolicy.acceptanceRoot, &aclError) ||
            !ResolveDirPath(config.aclPolicy.perRunRoot,
                            &canonical.aclPolicy.perRunRoot, &aclError)) {
            return failAclPolicy();
        }
        for (const std::wstring& dir : config.allowedDirectories) {
            std::wstring resolved;
            if (!ResolveDirPath(dir, &resolved, &aclError)) return failAclPolicy();
            canonical.allowedDirectories.push_back(resolved);
        }
        for (const std::wstring& dir : config.protectedDirectories) {
            std::wstring resolved;
            if (!ResolveDirPath(dir, &resolved, &aclError)) return failAclPolicy();
            canonical.protectedDirectories.push_back(resolved);
        }
        if (!ValidateAclPolicy(canonical, &aclError)) return failAclPolicy();
        allowedDirs = canonical.allowedDirectories;
        protectedDirs = canonical.protectedDirectories;
    }

    std::vector<AclChangeRecord> aclRecords;
    bool fatalAclFailure = false;
    struct LabelRestore { std::wstring path; SecurityDescriptorSnapshot original; };
    std::vector<LabelRestore> pendingLabelRestores;

    for (const std::wstring& dir : allowedDirs) {
        AclChangeRecord record;
        record.path = dir;
        record.mechanism = L"low_integrity_label";
        SecurityDescriptorSnapshot original;
        if (!CaptureLowIntegrityLabel(dir, &original, &record.error)) {
            fatalAclFailure = true;  // cannot guarantee rollback -> fail closed
            aclRecords.push_back(record);
            continue;  // never mutate a directory we cannot restore
        }
        pendingLabelRestores.push_back({dir, original});
        record.applied = ApplyLowIntegrityLabel(dir, &record.error);
        if (record.applied) {
            record.verified = VerifyLowIntegrityLabel(dir);
            if (!record.verified) fatalAclFailure = true;
        } else {
            fatalAclFailure = true;  // workspace write would fail -> fail closed
        }
        aclRecords.push_back(record);
    }

    PSID userSid = GetTokenUserSid(hRestricted);
    struct DaclRestore { std::wstring path; SecurityDescriptorSnapshot original; };
    std::vector<DaclRestore> pendingRestores;
    for (const std::wstring& dir : protectedDirs) {
        AclChangeRecord record;
        record.path = dir;
        record.mechanism = L"deny_ace";
        SecurityDescriptorSnapshot restore;
        if (userSid && ApplyDenyAce(dir, userSid, &restore, &record.error)) {
            record.applied = true;
            record.verified = VerifyDenyAce(dir, userSid);
            pendingRestores.push_back({dir, restore});
            if (!record.verified) fatalAclFailure = true;
        } else {
            record.applied = false;
            fatalAclFailure = true;  // protected-directory policy must be effective
        }
        aclRecords.push_back(record);
    }

    auto rollbackAllAcl = [&](std::wstring* rollbackError) {
        bool rollbackOk = true;
        for (auto& entry : pendingRestores) {
            std::wstring localError;
            const bool restored = RestoreDirectoryDacl(entry.path, entry.original, &localError);
            if (!restored && rollbackError && rollbackError->empty()) {
                *rollbackError = L"DACL " + entry.path + L": " + localError;
            }
            rollbackOk = restored && rollbackOk;
            ReleaseSecurityDescriptorSnapshot(&entry.original);
        }
        pendingRestores.clear();
        for (auto& entry : pendingLabelRestores) {
            std::wstring localError;
            const bool restored = RestoreLowIntegrityLabel(entry.path, entry.original, &localError);
            if (!restored && rollbackError && rollbackError->empty()) {
                *rollbackError = L"label " + entry.path + L": " + localError;
            }
            rollbackOk = restored && rollbackOk;
            ReleaseSecurityDescriptorSnapshot(&entry.original);
        }
        pendingLabelRestores.clear();
        return rollbackOk;
    };

    auto failAfterRollback = [&](int primaryError) {
        std::wstring rollbackError;
        if (!rollbackAllAcl(&rollbackError)) {
            result->errorMessage = "ACL rollback failed";
            if (!rollbackError.empty()) {
                result->errorMessage += ": " + WideToUtf8(rollbackError);
            }
            return HELPER_ERR_ACL_ROLLBACK;
        }
        return primaryError;
    };

    if (fatalAclFailure) {
        const int failure = failAfterRollback(HELPER_ERR_ACL_SET);
        if (userSid) LocalFree(userSid);
        CloseHandle(hRestricted);
        CloseHandle(hJob);
        return failure;
    }

    // ─── Pipes + input detachment (P02/C19) ───────────────────────────────
    HANDLE hOutRead = nullptr, hOutWrite = nullptr;
    HANDLE hErrRead = nullptr, hErrWrite = nullptr;
    HANDLE hNullIn = nullptr;
    SECURITY_ATTRIBUTES sa = {};
    sa.nLength = sizeof(sa);
    sa.bInheritHandle = TRUE;

    if (!CreatePipe(&hOutRead, &hOutWrite, &sa, 0)) {
        const int failure = failAfterRollback(HELPER_ERR_PROCESS_CREATE);
        if (userSid) LocalFree(userSid);
        CloseHandle(hRestricted);
        CloseHandle(hJob);
        return failure;
    }
    if (!CreatePipe(&hErrRead, &hErrWrite, &sa, 0)) {
        CloseHandle(hOutRead); CloseHandle(hOutWrite);
        const int failure = failAfterRollback(HELPER_ERR_PROCESS_CREATE);
        if (userSid) LocalFree(userSid);
        CloseHandle(hRestricted);
        CloseHandle(hJob);
        return failure;
    }
    // The read ends must never be inherited by the child.
    if (!SetHandleInformation(hOutRead, HANDLE_FLAG_INHERIT, 0) ||
        !SetHandleInformation(hErrRead, HANDLE_FLAG_INHERIT, 0)) {
        CloseHandle(hOutRead); CloseHandle(hOutWrite);
        CloseHandle(hErrRead); CloseHandle(hErrWrite);
        const int failure = failAfterRollback(HELPER_ERR_PROCESS_CREATE);
        if (userSid) LocalFree(userSid);
        CloseHandle(hRestricted);
        CloseHandle(hJob);
        return failure;
    }

    hNullIn = CreateFileW(L"\\\\.\\NUL", GENERIC_READ | GENERIC_WRITE,
                          FILE_SHARE_READ | FILE_SHARE_WRITE, &sa, OPEN_EXISTING,
                          FILE_ATTRIBUTE_NORMAL, nullptr);
    if (hNullIn == INVALID_HANDLE_VALUE) {
        CloseHandle(hOutRead); CloseHandle(hOutWrite);
        CloseHandle(hErrRead); CloseHandle(hErrWrite);
        const int failure = failAfterRollback(HELPER_ERR_PROCESS_CREATE);
        if (userSid) LocalFree(userSid);
        CloseHandle(hRestricted);
        CloseHandle(hJob);
        return failure;
    }

    STARTUPINFOW si = {};
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESTDHANDLES;
    si.hStdInput = hNullIn;
    si.hStdOutput = hOutWrite;
    si.hStdError = hErrWrite;

    const std::wstring commandLine = BuildCommandLine(config.executable, config.argv);
    PROCESS_INFORMATION pi = {};

    // lpCommandLine must be writable (non-const).
    std::wstring mutableCommandLine = commandLine;
    const wchar_t* cwd = config.workingDirectory.empty() ? nullptr : config.workingDirectory.c_str();

    // Microsoft documents CreateProcessAsUserW as the launch path for a
    // restricted primary token. bInheritHandles must stay TRUE because the
    // child's stdio handles are the explicitly inheritable pipe/NUL handles
    // installed in STARTUPINFO. The process remains suspended until it is
    // assigned to and verified inside the Job Object below.
    BOOL created = CreateProcessAsUserW(
        hRestricted, config.executable.c_str(), &mutableCommandLine[0],
        nullptr, nullptr, TRUE,
        CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT, nullptr, cwd, &si, &pi);

    if (!created) {
        const DWORD lastError = GetLastError();
        CloseHandle(hNullIn);
        CloseHandle(hOutRead); CloseHandle(hOutWrite);
        CloseHandle(hErrRead); CloseHandle(hErrWrite);
        const int failure = failAfterRollback(HELPER_ERR_PROCESS_CREATE);
        if (failure != HELPER_ERR_ACL_ROLLBACK) {
            result->errorMessage = "CreateProcessAsUserW failed: Win32 error " +
                                   std::to_string(static_cast<unsigned long>(lastError));
        }
        if (userSid) LocalFree(userSid);
        CloseHandle(hRestricted);
        CloseHandle(hJob);
        return failure;
    }

    // ─── Assign to Job and verify (C01/C02-verification) ─────────────────
    if (!AssignProcessToJobObject(hJob, pi.hProcess)) {
        TerminateProcess(pi.hProcess, 1);
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
        CloseHandle(hNullIn);
        CloseHandle(hOutRead); CloseHandle(hOutWrite);
        CloseHandle(hErrRead); CloseHandle(hErrWrite);
        const int failure = failAfterRollback(HELPER_ERR_JOB_CREATE);
        if (userSid) LocalFree(userSid);
        CloseHandle(hRestricted);
        CloseHandle(hJob);
        return failure;
    }
    BOOL inJob = FALSE;
    result->containmentVerified =
        IsProcessInJob(pi.hProcess, hJob, &inJob) && inJob;
    if (!result->containmentVerified) {
        TerminateProcess(pi.hProcess, 1);
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
        CloseHandle(hNullIn);
        CloseHandle(hOutRead); CloseHandle(hOutWrite);
        CloseHandle(hErrRead); CloseHandle(hErrWrite);
        const int failure = failAfterRollback(HELPER_ERR_JOB_CREATE);
        if (userSid) LocalFree(userSid);
        CloseHandle(hRestricted);
        CloseHandle(hJob);
        return failure;
    }

    ResumeThread(pi.hThread);
    CloseHandle(pi.hThread);

    // Parent side of the pipes is no longer needed.
    CloseHandle(hOutWrite);
    CloseHandle(hErrWrite);

    // ─── Monitor with timeout + bounded output (C07) ──────────────────────
    const long long cap = config.maxOutputSize > 0 ? config.maxOutputSize
                                                   : kMaxOutputSizeDefault;
    const DWORD timeoutMs = static_cast<DWORD>(std::min<long long>(
        config.timeoutMs > 0 ? config.timeoutMs : kDefaultTimeoutMs, 0x7FFFFFFF));
    const ULONGLONG startTime = GetTickCount64();
    bool done = false;
    while (!done) {
        const ULONGLONG elapsed = GetTickCount64() - startTime;
        DWORD slice = 50;
        if (elapsed >= static_cast<ULONGLONG>(timeoutMs)) {
            slice = 1;  // final slice: timeout pending
        } else {
            const ULONGLONG remaining = static_cast<ULONGLONG>(timeoutMs) - elapsed;
            slice = static_cast<DWORD>(std::min<ULONGLONG>(remaining, 50));
        }
        const DWORD waitResult = WaitForSingleObject(pi.hProcess, slice);
        DrainAvailable(hOutRead, &result->stdoutBytes, cap, &result->outputTruncated);
        DrainAvailable(hErrRead, &result->stderrBytes, cap, &result->outputTruncated);
        if (waitResult == WAIT_OBJECT_0) {
            done = true;
        } else if (waitResult == WAIT_TIMEOUT) {
            if (GetTickCount64() - startTime >= static_cast<ULONGLONG>(timeoutMs)) {
                result->timedOut = true;
                done = true;
            }
        } else {
            // WAIT_FAILED: fail closed by killing the tree.
            result->timedOut = true;
            done = true;
        }
    }
    result->executionTimeMs = static_cast<long long>(GetTickCount64() - startTime);

    if (result->timedOut) {
        // Kill the whole tree — never taskkill (N06).
        TerminateJobObject(hJob, 1);
    } else {
        // Normal exit: make sure no grandchild lingers holding the pipes.
        TerminateJobObject(hJob, 0);
    }
    // Ensure the tree is gone before draining (writers dead -> EOF).
    WaitForSingleObject(pi.hProcess, 10000);
    DrainUntilEof(hOutRead, &result->stdoutBytes, cap, &result->outputTruncated);
    DrainUntilEof(hErrRead, &result->stderrBytes, cap, &result->outputTruncated);

    GetExitCodeProcess(pi.hProcess, &result->exitCode);
    result->inputDetached = true;

    // ─── Cleanup: restore ACLs + labels (C04/A4-3 rollback), close last ───
    bool rollbackSucceeded = true;
    std::wstring firstRollbackError;
    for (auto& entry : pendingRestores) {
        for (AclChangeRecord& record : aclRecords) {
            if (record.mechanism == L"deny_ace" && record.path == entry.path) {
                record.rolledBack = RestoreDirectoryDacl(entry.path, entry.original, &record.error);
                if (!record.rolledBack) {
                    rollbackSucceeded = false;
                    if (firstRollbackError.empty()) firstRollbackError = record.error;
                }
                break;
            }
        }
        ReleaseSecurityDescriptorSnapshot(&entry.original);
    }
    pendingRestores.clear();
    for (auto& entry : pendingLabelRestores) {
        for (AclChangeRecord& record : aclRecords) {
            if (record.mechanism == L"low_integrity_label" && record.path == entry.path) {
                std::wstring labelError;
                record.rolledBack = RestoreLowIntegrityLabel(entry.path, entry.original, &labelError);
                if (!record.rolledBack && record.error.empty()) record.error = labelError;
                if (!record.rolledBack) {
                    rollbackSucceeded = false;
                    if (firstRollbackError.empty()) firstRollbackError = labelError;
                }
                break;
            }
        }
        ReleaseSecurityDescriptorSnapshot(&entry.original);
    }
    pendingLabelRestores.clear();

    CloseHandle(pi.hProcess);
    CloseHandle(hNullIn);
    CloseHandle(hOutRead);
    CloseHandle(hErrRead);
    CloseHandle(hRestricted);
    if (userSid) LocalFree(userSid);
    result->aclChanges = std::move(aclRecords);

    // KILL_ON_JOB_CLOSE: any straggler dies here (whole-tree reclamation).
    CloseHandle(hJob);
    if (!rollbackSucceeded) {
        result->errorMessage = "ACL rollback failed";
        if (!firstRollbackError.empty()) {
            result->errorMessage += ": " + WideToUtf8(firstRollbackError);
        }
        return HELPER_ERR_ACL_ROLLBACK;
    }
    return HELPER_OK;
}

// ─── Line reader over the binary stdin ───────────────────────────────────────

bool ReadJsonLine(std::string* line) {
    line->clear();
    char buffer[4096];
    while (true) {
        DWORD bytesRead = 0;
        if (!ReadFile(GetStdHandle(STD_INPUT_HANDLE), buffer, sizeof(buffer), &bytesRead, nullptr) ||
            bytesRead == 0) {
            return false;  // EOF
        }
        for (DWORD i = 0; i < bytesRead; ++i) {
            const char ch = buffer[i];
            if (ch == '\n') {
                // A complete line (possibly with a trailing '\r').
                return true;
            }
            line->push_back(ch);
            if (line->size() >= static_cast<size_t>(kMaxJsonInputBytes) + 1) {
                return true;  // caller will reject an oversized line
            }
        }
    }
}

int RunHelperLoop() {
    while (true) {
        std::string line;
        if (!ReadJsonLine(&line)) {
            if (line.empty()) break;  // clean stdin EOF
        }
        if (line.empty()) continue;
        // Strip a trailing '\r' (Windows line endings).
        if (!line.empty() && line.back() == '\r') line.pop_back();

        std::string requestId;
        const size_t firstBrace = line.find('{');
        if (firstBrace != std::string::npos && firstBrace > 0) {
            // Tolerate a leading protocol prefix? Reject: keep the protocol strict.
        }

        ProcessConfig config;
        std::string error;
        if (!ParseJsonConfig(line, &config, &error)) {
            const std::string out = RenderErrorJson(requestId, "JSON_PARSE_FAILED",
                                                    "invalid request: " + error);
            std::fwrite(out.data(), 1, out.size(), stdout);
            std::fputc('\n', stdout);
            std::fflush(stdout);
            continue;
        }
        requestId = WideToUtf8(config.requestId);

        // C06: argv allow-list. The executable is canonicalized to its final
        // path first; the allow-list and CreateProcessAsUserW both use that
        // same canonical path, so the binary actually launched is the one that
        // passed the allow-list (no bare-name or reparse-escape bypass).
        WhitelistConfig whitelist;
        wchar_t sys32Buf[MAX_PATH] = {};
        const UINT sys32Len = GetSystemDirectoryW(sys32Buf, MAX_PATH);
        whitelist.system32Directory = sys32Len ? std::wstring(sys32Buf, sys32Len)
                                               : std::wstring(L"C:\\Windows\\System32");

        std::wstring canonical;
        std::wstring pathError;
        if (!ResolveExecutablePath(config.executable, &canonical, &pathError)) {
            const std::string out = RenderErrorJson(
                requestId, "EXECUTABLE_PATH_REJECTED",
                "executable path rejected: " + WideToUtf8(pathError));
            std::fwrite(out.data(), 1, out.size(), stdout);
            std::fputc('\n', stdout);
            std::fflush(stdout);
            continue;
        }
        config.executable = canonical;

        const WhitelistDecision decision =
            CheckWhitelist(config.executable, config.argv, whitelist);
        if (decision != WhitelistDecision::Allow) {
            const std::string out = RenderErrorJson(requestId, "ARGV_REJECTED",
                                                    decision == WhitelistDecision::RejectArgv
                                                        ? "cmd.exe argv must be /d /s /c (no /k)"
                                                        : "executable is not in the allow-list");
            std::fwrite(out.data(), 1, out.size(), stdout);
            std::fputc('\n', stdout);
            std::fflush(stdout);
            continue;
        }

        ProcessResult result;
        const int errorCode = LaunchRestrictedProcess(config, &result);
        if (errorCode != HELPER_OK) {
            const char* code = "PROCESS_LAUNCH_FAILED";
            if (errorCode == HELPER_ERR_HOST_IN_JOB) code = "HOST_ALREADY_IN_JOB";
            else if (errorCode == HELPER_ERR_JOB_CREATE) code = "JOB_CREATE_FAILED";
            else if (errorCode == HELPER_ERR_TOKEN_CREATE) code = "TOKEN_CREATE_FAILED";
            else if (errorCode == HELPER_ERR_ACL_SET) code = "ACL_SET_FAILED";
            else if (errorCode == HELPER_ERR_ACL_POLICY) code = "ACL_POLICY_REJECTED";
            else if (errorCode == HELPER_ERR_ACL_ROLLBACK) code = "ACL_ROLLBACK_FAILED";
            else if (errorCode == HELPER_ERR_PROCESS_CREATE) code = "PROCESS_CREATE_FAILED";
            const std::string out = RenderErrorJson(requestId, code, result.errorMessage);
            std::fwrite(out.data(), 1, out.size(), stdout);
            std::fputc('\n', stdout);
            std::fflush(stdout);
            continue;
        }

        const std::string out = RenderResultJson(requestId, result);
        std::fwrite(out.data(), 1, out.size(), stdout);
        std::fputc('\n', stdout);
        std::fflush(stdout);
    }
    return HELPER_OK;
}

#endif  // _WIN32

}  // namespace spike02

// ─── Entry point ─────────────────────────────────────────────────────────────

#ifdef _WIN32

int wmain(int argc, wchar_t* argv[]) {
    // Binary stdio: the protocol is JSON lines over byte streams.
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
    _setmode(_fileno(stderr), _O_BINARY);

    // The helper's own stdio must never be inherited by children: the child
    // would otherwise reach the JSON channel (C19 structural input detachment).
    if (!SetHandleInformation(GetStdHandle(STD_INPUT_HANDLE), HANDLE_FLAG_INHERIT, 0) ||
        !SetHandleInformation(GetStdHandle(STD_OUTPUT_HANDLE), HANDLE_FLAG_INHERIT, 0) ||
        !SetHandleInformation(GetStdHandle(STD_ERROR_HANDLE), HANDLE_FLAG_INHERIT, 0)) {
        std::fprintf(stderr, "spike02-helper: failed to make protocol handles non-inheritable\n");
        return HELPER_ERR_PROCESS_CREATE;
    }

    if (argc >= 2) {
        const std::wstring flag = argv[1];
        if (flag == L"--version" || flag == L"-v") {
            std::printf("spike02-helper 0.2.0-d013 win7-x64 (job+restricted-token+acl)\n");
            return 0;
        }
        if (flag == L"--help" || flag == L"-h") {
            std::printf(
                "spike02-helper: read one JSON request per line from stdin, run it in a\n"
                "restricted environment (Job Object + Restricted Token + Low Integrity +\n"
                "ACL), and write one JSON response per line to stdout.\n"
                "Request keys: executable, argv, workingDirectory, timeoutMs, maxOutputSize,\n"
                "allowNetwork, allowedDirectories, protectedDirectories, aclPolicy.\n"
                "executable must be a canonical absolute System32 path; ACL changes require\n"
                "aclPolicy (acceptanceRoot + perRunRoot) and stay inside perRunRoot.\n");
            return 0;
        }
    }

    return spike02::RunHelperLoop();
}

#else

// Non-Windows build: only the platform-neutral logic is compiled; the Win32
// orchestration is not available. Used for logic unit tests on the build host.
int main() {
    std::fprintf(stderr,
                 "spike02-helper: Win32 orchestration is only available on Windows.\n"
                 "On this platform compile/run the logic_tests target instead.\n");
    return 2;
}

#endif  // _WIN32
