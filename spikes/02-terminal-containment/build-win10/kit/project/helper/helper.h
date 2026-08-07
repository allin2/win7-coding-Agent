/**
 * SPIKE 02 - C++ Helper 头文件定义
 *
 * 终端容器化 Helper：通过 Win32 API 实现安全子进程隔离
 * - Job Object 限制进程资源
 * - Restricted Token 降低权限
 * - ACL 控制文件系统访问
 *
 * 编译要求：MSVC v142 (Visual Studio 2019)
 * 目标平台：Windows 7 SP1 x64
 *
 * Win7-Validation: NOT_PERFORMED
 */

#ifndef HELPER_H
#define HELPER_H

#include <windows.h>
#include <aclapi.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// ─── 常量定义 ────────────────────────────────────────────────────────────────

// 最大输出缓冲区大小（16 MB）
#define MAX_OUTPUT_SIZE (16 * 1024 * 1024)

// 默认超时时间（毫秒）- 30 秒
#define DEFAULT_TIMEOUT_MS 30000

// JSON 输入缓冲区大小
#define JSON_INPUT_BUFFER_SIZE 65536

// ─── 错误码 ──────────────────────────────────────────────────────────────────

#define HELPER_OK 0
#define HELPER_ERR_JOB_CREATE 1
#define HELPER_ERR_TOKEN_CREATE 2
#define HELPER_ERR_ACL_SET 3
#define HELPER_ERR_PROCESS_CREATE 4
#define HELPER_ERR_TIMEOUT 5
#define HELPER_ERR_OUTPUT_LIMIT 6
#define HELPER_ERR_INVALID_ARGV 7
#define HELPER_ERR_JSON_PARSE 8

// ─── 数据结构 ────────────────────────────────────────────────────────────────

/**
 * 子进程配置
 */
typedef struct _ProcessConfig {
    // 可执行文件路径（必须为白名单内的命令）
    LPCWSTR executablePath;
    
    // 命令行参数数组
    LPWSTR* argv;
    int argc;
    
    // 工作目录
    LPCWSTR workingDirectory;
    
    // 超时时间（毫秒）
    DWORD timeoutMs;
    
    // 最大输出大小（字节）
    DWORD maxOutputSize;
    
    // 是否允许网络访问
    BOOL allowNetwork;
    
    // 允许访问的目录列表（ACL 白名单）
    LPCWSTR* allowedDirectories;
    int allowedDirectoryCount;
} ProcessConfig;

/**
 * 子进程执行结果
 */
typedef struct _ProcessResult {
    // 退出码
    DWORD exitCode;
    
    // 标准输出内容
    char* stdoutBuffer;
    DWORD stdoutSize;
    
    // 标准错误内容
    char* stderrBuffer;
    DWORD stderrSize;
    
    // 是否超时终止
    BOOL timedOut;
    
    // 是否因输出上限截断
    BOOL outputTruncated;
    
    // 执行时间（毫秒）
    DWORD executionTimeMs;
} ProcessResult;

// ─── 函数声明 ────────────────────────────────────────────────────────────────

/**
 * 创建 Job Object 并配置限制
 * 
 * 关键 Win32 API:
 *   - CreateJobObjectW
 *   - SetInformationJobObject (JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE)
 *
 * @param jobName Job Object 名称（可为 NULL）
 * @return Job Object 句柄，失败返回 NULL
 */
HANDLE CreateConfiguredJobObject(LPCWSTR jobName);

/**
 * 创建 Restricted Token
 *
 * 关键 Win32 API:
 *   - OpenProcessToken
 *   - CreateRestrictedToken
 *   - AdjustTokenPrivileges
 *
 * @param restrictedToken 输出参数：创建的 Restricted Token
 * @return TRUE 成功，FALSE 失败
 */
BOOL CreateRestrictedProcessToken(HANDLE* restrictedToken);

/**
 * 设置目录 ACL（限制文件系统访问）
 *
 * 关键 Win32 API:
 *   - SetEntriesInAclW
 *   - SetNamedSecurityInfoW
 *
 * @param directory 目标目录路径
 * @param token 进程 Token
 * @return TRUE 成功，FALSE 失败
 */
BOOL SetDirectoryACL(LPCWSTR directory, HANDLE token);

/**
 * 验证 argv 白名单
 *
 * 检查可执行文件和参数是否在允许列表中
 *
 * @param config 进程配置
 * @return TRUE 白名单验证通过，FALSE 被拒绝
 */
BOOL ValidateArgvWhitelist(const ProcessConfig* config);

/**
 * 启动受限子进程并监控
 *
 * 关键 Win32 API:
 *   - CreateProcessW
 *   - AssignProcessToJobObject
 *   - IsProcessInJob
 *   - WaitForSingleObject
 *
 * @param config 进程配置
 * @param result 输出参数：执行结果
 * @return 错误码（HELPER_OK 表示成功）
 */
int LaunchRestrictedProcess(const ProcessConfig* config, ProcessResult* result);

/**
 * 释放 ProcessResult 资源
 *
 * @param result 要释放的结果结构
 */
void FreeProcessResult(ProcessResult* result);

/**
 * 解析 JSON 输入（从 stdin）
 *
 * JSON 格式：
 * {
 *   "executable": "C:\\Windows\\System32\\cmd.exe",
 *   "argv": ["/c", "echo hello"],
 *   "workingDirectory": "C:\\workspace",
 *   "timeoutMs": 30000,
 *   "maxOutputSize": 16777216,
 *   "allowNetwork": false,
 *   "allowedDirectories": ["C:\\workspace"]
 * }
 *
 * @param jsonInput JSON 字符串
 * @param config 输出参数：解析的配置
 * @return TRUE 解析成功，FALSE 解析失败
 */
BOOL ParseJsonConfig(const char* jsonInput, ProcessConfig* config);

#endif // HELPER_H
