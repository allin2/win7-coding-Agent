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
 *   C03  Restricted Token      all privileges deleted, Everyone + Administrators
 *                              deny-only, Low Integrity mandatory label; the
 *                              token is actually applied to the child through
 *                              CreateProcessWithTokenW.
 *   C04  ACL                   Low-Integrity label on allowedDirectories so the
 *                              low-integrity child can write inside the
 *                              workspace; explicit deny ACEs on
 *                              protectedDirectories with automatic rollback.
 *   C06/C09 Structured argv    allow-list + proper command-line quoting.
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

// Verify a low-integrity mandatory label is present on a directory.
bool VerifyLowIntegrityLabel(const std::wstring& directory) {
    PACL pLabelAcl = nullptr;
    const DWORD result = GetNamedSecurityInfoW(
        const_cast<wchar_t*>(directory.c_str()), SE_FILE_OBJECT,
        LABEL_SECURITY_INFORMATION, nullptr, nullptr, nullptr, &pLabelAcl, nullptr);
    if (result != ERROR_SUCCESS || !pLabelAcl) return false;
    const bool present = pLabelAcl->AceCount >= 1;
    if (pLabelAcl) LocalFree(pLabelAcl);
    return present;
}

// Verify a deny ACE for `userSid` is present in the directory DACL.
bool VerifyDenyAce(const std::wstring& directory, PSID userSid) {
    PACL pDacl = nullptr;
    const DWORD result = GetNamedSecurityInfoW(
        const_cast<wchar_t*>(directory.c_str()), SE_FILE_OBJECT,
        DACL_SECURITY_INFORMATION, nullptr, nullptr, &pDacl, nullptr, nullptr);
    if (result != ERROR_SUCCESS || !pDacl) return false;
    bool found = false;
    for (DWORD i = 0; i < pDacl->AceCount && !found; ++i) {
        ACE_HEADER* header = nullptr;
        if (!GetAce(pDacl, i, reinterpret_cast<void**>(&header))) continue;
        if (header->AceType != ACCESS_DENIED_ACE_TYPE) continue;
        ACCESS_DENIED_ACE* ace = reinterpret_cast<ACCESS_DENIED_ACE*>(header);
        PSID aceSid = reinterpret_cast<PSID>(&ace->SidStart);
        if (EqualSid(aceSid, userSid)) found = true;
    }
    if (pDacl) LocalFree(pDacl);
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

    // 1. Enumerate every privilege and schedule it for deletion.
    std::vector<LUID_AND_ATTRIBUTES> privilegesToDelete;
    {
        DWORD size = 0;
        GetTokenInformation(hSource, TokenPrivileges, nullptr, 0, &size);
        if (size == 0) { CloseHandle(hSource); return nullptr; }
        std::vector<unsigned char> buffer(size);
        if (!GetTokenInformation(hSource, TokenPrivileges, buffer.data(), size, &size)) {
            CloseHandle(hSource);
            return nullptr;
        }
        TOKEN_PRIVILEGES* tokenPrivs = reinterpret_cast<TOKEN_PRIVILEGES*>(buffer.data());
        for (DWORD i = 0; i < tokenPrivs->PrivilegeCount; ++i) {
            LUID_AND_ATTRIBUTES entry = {};
            entry.Luid = tokenPrivs->Privileges[i].Luid;
            privilegesToDelete.push_back(entry);
        }
    }

    // 2. Disable Everyone (World) and Administrators as deny-only.
    std::vector<SID_AND_ATTRIBUTES> sidsToDisable;
    PSID worldSid = nullptr;
    PSID adminsSid = nullptr;
    {
        SID_IDENTIFIER_AUTHORITY worldAuth = SECURITY_WORLD_SID_AUTHORITY;
        if (AllocateAndInitializeSid(&worldAuth, 1, SECURITY_WORLD_RID, 0, 0, 0, 0, 0, 0, 0,
                                     &worldSid)) {
            sidsToDisable.push_back({worldSid, SE_GROUP_USE_FOR_DENY_ONLY});
        }
        SID_IDENTIFIER_AUTHORITY ntAuth = SECURITY_NT_AUTHORITY;
        if (AllocateAndInitializeSid(&ntAuth, 2, SECURITY_BUILTIN_DOMAIN_RID,
                                     DOMAIN_ALIAS_RID_ADMINS, 0, 0, 0, 0, 0, 0, &adminsSid)) {
            sidsToDisable.push_back({adminsSid, SE_GROUP_USE_FOR_DENY_ONLY});
        }
    }

    // 3. Create the restricted token with all privileges deleted.
    HANDLE hRestricted = nullptr;
    const BOOL created = CreateRestrictedToken(
        hSource, 0,
        static_cast<DWORD>(sidsToDisable.size()),
        sidsToDisable.empty() ? nullptr : sidsToDisable.data(),
        static_cast<DWORD>(privilegesToDelete.size()),
        privilegesToDelete.empty() ? nullptr : privilegesToDelete.data(),
        0, nullptr, &hRestricted);

    for (SID_AND_ATTRIBUTES& sid : sidsToDisable) FreeSid(sid.Sid);
    CloseHandle(hSource);
    if (!created || !hRestricted) return nullptr;

    // 4. Drop to Low Integrity (mandatory label S-1-16-4096).
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
            const DWORD result = SetNamedSecurityInfoW(
                const_cast<wchar_t*>(directory.c_str()), SE_FILE_OBJECT,
                LABEL_SECURITY_INFORMATION, nullptr, nullptr, pLabelAcl, nullptr);
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

bool ApplyDenyAce(const std::wstring& directory, PSID userSid, PACL* restoreAcl,
                  std::wstring* error) {
    *restoreAcl = nullptr;
    PACL pOldDacl = nullptr;
    DWORD result = GetNamedSecurityInfoW(
        const_cast<wchar_t*>(directory.c_str()), SE_FILE_OBJECT,
        DACL_SECURITY_INFORMATION, nullptr, nullptr, &pOldDacl, nullptr, nullptr);
    if (result != ERROR_SUCCESS) {
        if (error) *error = L"GetNamedSecurityInfoW(DACL) failed: " + WinErrorText(result);
        return false;
    }

    EXPLICIT_ACCESSW explicitAccess = {};
    explicitAccess.grfAccessPermissions =
        FILE_ADD_FILE | FILE_ADD_SUBDIRECTORY | FILE_WRITE_DATA | FILE_APPEND_DATA |
        FILE_WRITE_EA | FILE_WRITE_ATTRIBUTES | DELETE
#ifndef DELETE_CHILD  // winnt.h on MSVC; guard for cross-compilers
#define DELETE_CHILD 0x00000080
#endif
        | DELETE_CHILD;
    explicitAccess.grfAccessMode = DENY_ACCESS;
    explicitAccess.grfInheritance = SUB_CONTAINERS_AND_OBJECTS_INHERIT;
    explicitAccess.Trustee.TrusteeForm = TRUSTEE_IS_SID;
    explicitAccess.Trustee.ptstrName = reinterpret_cast<LPWCH>(userSid);

    PACL pNewDacl = nullptr;
    result = SetEntriesInAclW(1, &explicitAccess, pOldDacl, &pNewDacl);
    if (result != ERROR_SUCCESS) {
        if (error) *error = L"SetEntriesInAclW failed: " + WinErrorText(result);
        LocalFree(pOldDacl);
        return false;
    }

    result = SetNamedSecurityInfoW(
        const_cast<wchar_t*>(directory.c_str()), SE_FILE_OBJECT,
        DACL_SECURITY_INFORMATION, nullptr, nullptr, pNewDacl, nullptr);
    LocalFree(pNewDacl);
    if (result != ERROR_SUCCESS) {
        if (error) *error = L"SetNamedSecurityInfoW(DACL) failed: " + WinErrorText(result);
        LocalFree(pOldDacl);
        return false;
    }
    *restoreAcl = pOldDacl;
    return true;
}

bool RestoreDirectoryDacl(const std::wstring& directory, PACL restoreAcl,
                          std::wstring* error) {
    const DWORD result = SetNamedSecurityInfoW(
        const_cast<wchar_t*>(directory.c_str()), SE_FILE_OBJECT,
        DACL_SECURITY_INFORMATION, nullptr, nullptr, restoreAcl, nullptr);
    if (result != ERROR_SUCCESS && error) {
        *error = L"SetNamedSecurityInfoW(restore) failed: " + WinErrorText(result);
    }
    return result == ERROR_SUCCESS;
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
    HANDLE hImpersonation = nullptr;
    if (!DuplicateTokenEx(hRestricted, TOKEN_ALL_ACCESS, nullptr, SecurityImpersonation,
                          TokenImpersonation, &hImpersonation)) {
        CloseHandle(hRestricted);
        CloseHandle(hJob);
        return HELPER_ERR_TOKEN_CREATE;
    }

    // ─── ACL setup (C03/C04) ─────────────────────────────────────────────
    std::vector<AclChangeRecord> aclRecords;
    std::wstring aclError;
    bool fatalAclFailure = false;

    for (const std::wstring& dir : config.allowedDirectories) {
        AclChangeRecord record;
        record.path = dir;
        record.mechanism = L"low_integrity_label";
        record.applied = ApplyLowIntegrityLabel(dir, &record.error);
        if (record.applied) {
            record.verified = VerifyLowIntegrityLabel(dir);
        } else {
            fatalAclFailure = true;  // workspace write would fail -> fail closed
        }
        aclRecords.push_back(record);
    }

    PSID userSid = GetTokenUserSid(hRestricted);
    std::vector<std::pair<std::wstring, PACL>> pendingRestores;
    for (const std::wstring& dir : config.protectedDirectories) {
        AclChangeRecord record;
        record.path = dir;
        record.mechanism = L"deny_ace";
        PACL restoreAcl = nullptr;
        if (userSid && ApplyDenyAce(dir, userSid, &restoreAcl, &record.error)) {
            record.applied = true;
            record.verified = VerifyDenyAce(dir, userSid);
            pendingRestores.emplace_back(dir, restoreAcl);
        } else {
            record.applied = false;  // defense-in-depth only; low integrity still blocks
        }
        aclRecords.push_back(record);
    }

    auto rollbackDenyAces = [&]() {
        for (auto& entry : pendingRestores) {
            RestoreDirectoryDacl(entry.first, entry.second, nullptr);
            LocalFree(entry.second);
        }
        pendingRestores.clear();
    };

    if (fatalAclFailure) {
        rollbackDenyAces();
        if (userSid) LocalFree(userSid);
        CloseHandle(hImpersonation);
        CloseHandle(hRestricted);
        CloseHandle(hJob);
        return HELPER_ERR_ACL_SET;
    }

    // ─── Pipes + input detachment (P02/C19) ───────────────────────────────
    HANDLE hOutRead = nullptr, hOutWrite = nullptr;
    HANDLE hErrRead = nullptr, hErrWrite = nullptr;
    HANDLE hNullIn = nullptr;
    SECURITY_ATTRIBUTES sa = {};
    sa.nLength = sizeof(sa);
    sa.bInheritHandle = TRUE;

    if (!CreatePipe(&hOutRead, &hOutWrite, &sa, 0) ||
        !CreatePipe(&hErrRead, &hErrWrite, &sa, 0)) {
        rollbackDenyAces();
        if (userSid) LocalFree(userSid);
        CloseHandle(hImpersonation);
        CloseHandle(hRestricted);
        CloseHandle(hJob);
        return HELPER_ERR_PROCESS_CREATE;
    }
    // The read ends must never be inherited by the child.
    SetHandleInformation(hOutRead, HANDLE_FLAG_INHERIT, 0);
    SetHandleInformation(hErrRead, HANDLE_FLAG_INHERIT, 0);

    hNullIn = CreateFileW(L"\\\\.\\NUL", GENERIC_READ | GENERIC_WRITE,
                          FILE_SHARE_READ | FILE_SHARE_WRITE, &sa, OPEN_EXISTING,
                          FILE_ATTRIBUTE_NORMAL, nullptr);
    if (hNullIn == INVALID_HANDLE_VALUE) {
        CloseHandle(hOutRead); CloseHandle(hOutWrite);
        CloseHandle(hErrRead); CloseHandle(hErrWrite);
        rollbackDenyAces();
        if (userSid) LocalFree(userSid);
        CloseHandle(hImpersonation);
        CloseHandle(hRestricted);
        CloseHandle(hJob);
        return HELPER_ERR_PROCESS_CREATE;
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

    BOOL created = CreateProcessWithTokenW(
        hImpersonation, 0, config.executable.c_str(), &mutableCommandLine[0],
        CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT, nullptr, cwd, &si, &pi);

    if (!created) {
        const DWORD lastError = GetLastError();
        CloseHandle(hNullIn);
        CloseHandle(hOutRead); CloseHandle(hOutWrite);
        CloseHandle(hErrRead); CloseHandle(hErrWrite);
        rollbackDenyAces();
        if (userSid) LocalFree(userSid);
        CloseHandle(hImpersonation);
        CloseHandle(hRestricted);
        CloseHandle(hJob);
        // Surface the Win32 error through result->aclChanges? Keep the error
        // code; the protocol layer reports PROCESS_CREATE_FAILED.
        (void)lastError;
        return HELPER_ERR_PROCESS_CREATE;
    }

    // ─── Assign to Job and verify (C01/C02-verification) ─────────────────
    if (!AssignProcessToJobObject(hJob, pi.hProcess)) {
        TerminateProcess(pi.hProcess, 1);
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
        CloseHandle(hNullIn);
        CloseHandle(hOutRead); CloseHandle(hOutWrite);
        CloseHandle(hErrRead); CloseHandle(hErrWrite);
        rollbackDenyAces();
        if (userSid) LocalFree(userSid);
        CloseHandle(hImpersonation);
        CloseHandle(hRestricted);
        CloseHandle(hJob);
        return HELPER_ERR_JOB_CREATE;
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
        rollbackDenyAces();
        if (userSid) LocalFree(userSid);
        CloseHandle(hImpersonation);
        CloseHandle(hRestricted);
        CloseHandle(hJob);
        return HELPER_ERR_JOB_CREATE;
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

    // ─── Cleanup: restore ACLs (C04 rollback), close job last (C01) ───────
    for (auto& entry : pendingRestores) {
        for (AclChangeRecord& record : aclRecords) {
            if (record.mechanism == L"deny_ace" && record.path == entry.first) {
                record.rolledBack = RestoreDirectoryDacl(entry.first, entry.second, &record.error);
                break;
            }
        }
        LocalFree(entry.second);
    }
    pendingRestores.clear();

    CloseHandle(pi.hProcess);
    CloseHandle(hNullIn);
    CloseHandle(hOutRead);
    CloseHandle(hErrRead);
    CloseHandle(hImpersonation);
    CloseHandle(hRestricted);
    if (userSid) LocalFree(userSid);
    result->aclChanges = std::move(aclRecords);

    // KILL_ON_JOB_CLOSE: any straggler dies here (whole-tree reclamation).
    CloseHandle(hJob);
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

        // C06: argv allow-list.
        WhitelistConfig whitelist;
        wchar_t windirBuf[MAX_PATH] = {};
        const UINT windirLen = GetWindowsDirectoryW(windirBuf, MAX_PATH);
        whitelist.windowsDirectory = windirLen ? std::wstring(windirBuf, windirLen)
                                               : std::wstring(L"C:\\Windows");
        whitelist.extraExecutables = config.extraExecutables;
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
            else if (errorCode == HELPER_ERR_PROCESS_CREATE) code = "PROCESS_CREATE_FAILED";
            const std::string out = RenderErrorJson(requestId, code, "");
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
    SetHandleInformation(GetStdHandle(STD_INPUT_HANDLE), HANDLE_FLAG_INHERIT, 0);
    SetHandleInformation(GetStdHandle(STD_OUTPUT_HANDLE), HANDLE_FLAG_INHERIT, 0);
    SetHandleInformation(GetStdHandle(STD_ERROR_HANDLE), HANDLE_FLAG_INHERIT, 0);

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
                "allowNetwork, allowedDirectories, protectedDirectories, allowExecutables.\n");
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
