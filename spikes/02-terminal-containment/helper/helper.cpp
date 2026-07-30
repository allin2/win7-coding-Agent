/**
 * SPIKE 02 - C++ Helper 主入口
 *
 * Win32 控制台应用：通过 JSON over stdio 接收命令，创建受限子进程。
 *
 * 核心功能：
 *   1. 解析 JSON over stdio 输入
 *   2. 创建 Job Object（JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE）
 *   3. 创建 Restricted Token
 *   4. 设置 ACL（限制文件系统访问）
 *   5. argv 白名单验证
 *   6. 启动子进程并监控
 *   7. 超时 / 输出上限处理
 *
 * 编译要求：MSVC v142 (Visual Studio 2019)，目标平台 Windows 7 SP1 x64
 *
 * Win7-Validation: NOT_PERFORMED
 */

#include "helper.h"

// ─── 前向声明 ────────────────────────────────────────────────────────────────

static int RunHelperLoop(void);
static void OutputResult(const ProcessResult* result);

// ─── 主入口 ──────────────────────────────────────────────────────────────────

int wmain(int argc, wchar_t* argv[]) {
    // 设置 stdout 为二进制模式（JSON 输出）
    _setmode(_fileno(stdout), _O_BINARY);
    _setmode(_fileno(stdin), _O_BINARY);

    // TODO: 解析命令行参数（如 --debug, --timeout 等）
    
    return RunHelperLoop();
}

/**
 * 主循环：从 stdin 读取 JSON 命令，执行子进程，输出结果
 */
static int RunHelperLoop(void) {
    char jsonBuffer[JSON_INPUT_BUFFER_SIZE];
    
    while (1) {
        // 读取 JSON 输入（以换行符分隔）
        // TODO: 实现完整的 JSON 流解析，当前为简化版
        DWORD bytesRead = 0;
        if (!ReadFile(GetStdHandle(STD_INPUT_HANDLE), jsonBuffer, 
                      JSON_INPUT_BUFFER_SIZE - 1, &bytesRead, NULL) || bytesRead == 0) {
            break; // stdin 关闭，退出
        }
        jsonBuffer[bytesRead] = '\0';

        // 解析 JSON 配置
        ProcessConfig config = {0};
        if (!ParseJsonConfig(jsonBuffer, &config)) {
            // 输出错误 JSON
            fprintf(stdout, "{\"error\": \"JSON_PARSE_FAILED\"}\n");
            fflush(stdout);
            continue;
        }

        // argv 白名单验证
        if (!ValidateArgvWhitelist(&config)) {
            fprintf(stdout, "{\"error\": \"ARGV_REJECTED\"}\n");
            fflush(stdout);
            continue;
        }

        // 启动受限子进程
        ProcessResult result = {0};
        int errCode = LaunchRestrictedProcess(&config, &result);
        
        if (errCode != HELPER_OK) {
            fprintf(stdout, "{\"error\": \"PROCESS_LAUNCH_FAILED\", \"code\": %d}\n", errCode);
            fflush(stdout);
            continue;
        }

        // 输出结果
        OutputResult(&result);
        FreeProcessResult(&result);
    }

    return HELPER_OK;
}

// ─── Job Object 创建（C01 / C11）────────────────────────────────────────────

HANDLE CreateConfiguredJobObject(LPCWSTR jobName) {
    // CreateJobObjectW - 创建或打开 Job Object
    HANDLE hJob = CreateJobObjectW(NULL, jobName);
    if (hJob == NULL) {
        return NULL;
    }

    // 配置 Job Object 限制
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION jeli = {0};
    
    // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: 关闭 Job 句柄时终止所有关联进程
    jeli.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    
    // TODO: 添加更多限制
    // - JOB_OBJECT_LIMIT_ACTIVE_PROCESS（限制活动进程数）
    // - JOB_OBJECT_LIMIT_WORKINGSET（限制工作集大小）
    // - JOB_OBJECT_LIMIT_PRIORITY_CLASS（限制优先级）

    // SetInformationJobObject - 设置 Job Object 限制信息
    if (!SetInformationJobObject(hJob, JobObjectExtendedLimitInformation, 
                                  &jeli, sizeof(jeli))) {
        CloseHandle(hJob);
        return NULL;
    }

    return hJob;
}

// ─── Restricted Token 创建（C02）────────────────────────────────────────────

BOOL CreateRestrictedProcessToken(HANDLE* restrictedToken) {
    HANDLE hProcessToken = NULL;
    
    // OpenProcessToken - 获取当前进程 Token
    if (!OpenProcessToken(GetCurrentProcess(), TOKEN_ALL_ACCESS, &hProcessToken)) {
        return FALSE;
    }

    // 要禁用的 SID 列表（Everyone / World）
    SID_IDENTIFIER_AUTHORITY worldAuth = SECURITY_WORLD_SID_AUTHORITY;
    PSID worldSid = NULL;
    if (!AllocateAndInitializeSid(&worldAuth, 1, SECURITY_WORLD_RID, 
                                   0, 0, 0, 0, 0, 0, 0, &worldSid)) {
        CloseHandle(hProcessToken);
        return FALSE;
    }

    SID_AND_ATTRIBUTES sidsToDisable[] = {
        { worldSid, SE_GROUP_USE_FOR_DENY_ONLY }
    };

    // 要删除的特权列表（全部删除）
    LUID_AND_ATTRIBUTES privsToDelete[1];
    // TODO: 填充要删除的特权列表

    // CreateRestrictedToken - 创建受限 Token
    if (!CreateRestrictedToken(hProcessToken, 0, 
                                1, sidsToDisable,      // 禁用 SID
                                0, NULL,                // 不删除特权（简化）
                                0, NULL,                // 不限制 SID
                                restrictedToken)) {
        FreeSid(worldSid);
        CloseHandle(hProcessToken);
        return FALSE;
    }

    FreeSid(worldSid);
    CloseHandle(hProcessToken);
    return TRUE;
}

// ─── ACL 设置（C03）─────────────────────────────────────────────────────────

BOOL SetDirectoryACL(LPCWSTR directory, HANDLE token) {
    // TODO: 实现目录 ACL 设置
    // 1. 获取目录当前 DACL
    // 2. 创建新的 ACE（仅允许特定访问）
    // 3. 使用 SetEntriesInAclW 构建新 DACL
    // 4. 使用 SetNamedSecurityInfoW 应用新 DACL
    
    // 关键 Win32 API:
    //   GetNamedSecurityInfoW
    //   SetEntriesInAclW
    //   SetNamedSecurityInfoW
    
    return TRUE; // 骨架：暂返回成功
}

// ─── argv 白名单验证（C04）──────────────────────────────────────────────────

BOOL ValidateArgvWhitelist(const ProcessConfig* config) {
    // TODO: 实现完整的白名单验证
    // 白名单命令示例：
    //   - cmd.exe /c <allowed_command>
    //   - powershell.exe -Command <allowed_command>
    //   - git.exe <allowed_subcommand>
    //   - python.exe <script_path>
    
    // 检查可执行文件路径是否在白名单中
    // 检查参数是否包含危险字符（如 |, &, ;, ` 等）
    
    if (config->argc == 0) {
        return FALSE;
    }
    
    return TRUE; // 骨架：暂返回成功
}

// ─── 启动受限子进程（C05 / C06 / C07 / C12）────────────────────────────────

int LaunchRestrictedProcess(const ProcessConfig* config, ProcessResult* result) {
    HANDLE hJob = NULL;
    HANDLE hToken = NULL;
    HANDLE hProcess = NULL;
    HANDLE hThread = NULL;
    
    // 1. 创建 Job Object
    hJob = CreateConfiguredJobObject(L"SPIKE02_ChildJob");
    if (hJob == NULL) {
        return HELPER_ERR_JOB_CREATE;
    }

    // 2. 创建 Restricted Token
    if (!CreateRestrictedProcessToken(&hToken)) {
        CloseHandle(hJob);
        return HELPER_ERR_TOKEN_CREATE;
    }

    // 3. 设置 ACL（对允许访问的目录）
    for (int i = 0; i < config->allowedDirectoryCount; i++) {
        SetDirectoryACL(config->allowedDirectories[i], hToken);
    }

    // 4. 构建命令行
    // TODO: 正确构建命令行字符串，处理中文+空格路径（C10）
    wchar_t commandLine[4096] = {0};
    // 简化：直接拼接可执行文件和参数
    
    // 5. 创建子进程
    STARTUPINFOW si = {0};
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESTDHANDLES;
    
    // 创建管道用于捕获 stdout/stderr
    HANDLE hStdoutRead, hStdoutWrite;
    HANDLE hStderrRead, hStderrWrite;
    
    SECURITY_ATTRIBUTES sa = {0};
    sa.nLength = sizeof(SECURITY_ATTRIBUTES);
    sa.bInheritHandle = TRUE;
    
    if (!CreatePipe(&hStdoutRead, &hStdoutWrite, &sa, 0) ||
        !CreatePipe(&hStderrRead, &hStderrWrite, &sa, 0)) {
        CloseHandle(hToken);
        CloseHandle(hJob);
        return HELPER_ERR_PROCESS_CREATE;
    }
    
    si.hStdOutput = hStdoutWrite;
    si.hStdError = hStderrWrite;
    si.hStdInput = GetStdHandle(STD_INPUT_HANDLE);

    PROCESS_INFORMATION pi = {0};
    
    // CreateProcessW - 创建子进程
    // TODO: 使用 Restricted Token 创建进程
    if (!CreateProcessW(
            config->executablePath,
            commandLine,
            NULL, NULL,
            TRUE,                    // 继承句柄
            CREATE_SUSPENDED,        // 先挂起，分配给 Job 后恢复
            NULL,                    // 使用当前环境
            config->workingDirectory,
            &si, &pi)) {
        CloseHandle(hStdoutRead);
        CloseHandle(hStdoutWrite);
        CloseHandle(hStderrRead);
        CloseHandle(hStderrWrite);
        CloseHandle(hToken);
        CloseHandle(hJob);
        return HELPER_ERR_PROCESS_CREATE;
    }

    // 6. 将子进程分配给 Job Object
    // AssignProcessToJobObject - 将进程关联到 Job
    if (!AssignProcessToJobObject(hJob, pi.hProcess)) {
        TerminateProcess(pi.hProcess, 1);
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
        CloseHandle(hStdoutRead);
        CloseHandle(hStdoutWrite);
        CloseHandle(hStderrRead);
        CloseHandle(hStderrWrite);
        CloseHandle(hToken);
        CloseHandle(hJob);
        return HELPER_ERR_JOB_CREATE;
    }

    // 7. 验证进程在 Job 中（C12）
    // IsProcessInJob - 探测进程是否在 Job 中
    BOOL isInJob = FALSE;
    if (!IsProcessInJob(pi.hProcess, hJob, &isInJob) || !isInJob) {
        // 进程不在 Job 中，终止
        TerminateProcess(pi.hProcess, 1);
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
        CloseHandle(hStdoutRead);
        CloseHandle(hStdoutWrite);
        CloseHandle(hStderrRead);
        CloseHandle(hStderrWrite);
        CloseHandle(hToken);
        CloseHandle(hJob);
        return HELPER_ERR_JOB_CREATE;
    }

    // 8. 恢复子进程执行
    ResumeThread(pi.hThread);
    
    // 关闭写入端，准备读取
    CloseHandle(hStdoutWrite);
    CloseHandle(hStderrWrite);

    // 9. 等待子进程完成或超时（C06）
    DWORD timeout = config->timeoutMs > 0 ? config->timeoutMs : DEFAULT_TIMEOUT_MS;
    DWORD startTime = GetTickCount();
    DWORD waitResult = WaitForSingleObject(pi.hProcess, timeout);
    
    result->executionTimeMs = GetTickCount() - startTime;

    if (waitResult == WAIT_TIMEOUT) {
        // 超时终止
        result->timedOut = TRUE;
        TerminateProcess(pi.hProcess, 1);
    }

    // 10. 读取输出（C07 - 输出上限截断）
    DWORD maxOutput = config->maxOutputSize > 0 ? config->maxOutputSize : MAX_OUTPUT_SIZE;
    // TODO: 实现异步读取 stdout/stderr，支持输出上限截断
    
    // 简化：同步读取
    result->stdoutBuffer = (char*)malloc(maxOutput);
    if (result->stdoutBuffer) {
        ReadFile(hStdoutRead, result->stdoutBuffer, maxOutput, &result->stdoutSize, NULL);
    }
    
    result->stderrBuffer = (char*)malloc(maxOutput);
    if (result->stderrBuffer) {
        ReadFile(hStderrRead, result->stderrBuffer, maxOutput, &result->stderrSize, NULL);
    }

    // 获取退出码
    GetExitCodeProcess(pi.hProcess, &result->exitCode);

    // 清理
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
    CloseHandle(hStdoutRead);
    CloseHandle(hStderrRead);
    CloseHandle(hToken);
    CloseHandle(hJob);

    return HELPER_OK;
}

// ─── JSON 解析（简化版）─────────────────────────────────────────────────────

BOOL ParseJsonConfig(const char* jsonInput, ProcessConfig* config) {
    // TODO: 实现完整的 JSON 解析
    // 可选方案：
    //   1. 使用 cJSON 或 nlohmann/json 库
    //   2. 手写简单 JSON 解析器（仅支持扁平对象）
    
    // 骨架：设置默认值
    config->timeoutMs = DEFAULT_TIMEOUT_MS;
    config->maxOutputSize = MAX_OUTPUT_SIZE;
    config->allowNetwork = FALSE;
    
    return TRUE;
}

// ─── 输出结果 ────────────────────────────────────────────────────────────────

static void OutputResult(const ProcessResult* result) {
    // 输出 JSON 格式结果到 stdout
    fprintf(stdout, "{\n");
    fprintf(stdout, "  \"exitCode\": %lu,\n", result->exitCode);
    fprintf(stdout, "  \"executionTimeMs\": %lu,\n", result->executionTimeMs);
    fprintf(stdout, "  \"timedOut\": %s,\n", result->timedOut ? "true" : "false");
    fprintf(stdout, "  \"outputTruncated\": %s,\n", result->outputTruncated ? "true" : "false");
    fprintf(stdout, "  \"stdoutSize\": %lu,\n", result->stdoutSize);
    fprintf(stdout, "  \"stderrSize\": %lu\n", result->stderrSize);
    fprintf(stdout, "}\n");
    fflush(stdout);
}

// ─── 资源释放 ────────────────────────────────────────────────────────────────

void FreeProcessResult(ProcessResult* result) {
    if (result->stdoutBuffer) {
        free(result->stdoutBuffer);
        result->stdoutBuffer = NULL;
    }
    if (result->stderrBuffer) {
        free(result->stderrBuffer);
        result->stderrBuffer = NULL;
    }
}
