/**
 * helper/logic_tests.cpp — Platform-neutral unit tests for the D-013 helper.
 *
 * Covers the protocol contract without Win32:
 *   - JSON parser: full request, Unicode (Chinese), escapes, invalid input,
 *     depth bomb, trailing garbage.
 *   - ParseJsonConfig mapping incl. bounds clamping.
 *   - argv command-line quoting (spaces, quotes, empty args, Chinese paths).
 *   - Path-shape classification: absolute vs bare/UNC/device/drive-relative/
 *     trailing-dot paths.
 *   - Allow-list: direct System32 tools only, canonical absolute path required,
 *     System32evil/subdir rejection, cmd.exe /d /s /c and /k rejection,
 *     non-whitelisted executables (C06).
 *   - ACL policy: per-run-root containment (boundary-safe) + ValidateAclPolicy.
 *   - Result rendering: exitCode/base64/truncation/aclChanges fields.
 *
 * Build & run (macOS/Linux build host):
 *   cmake -S helper -B helper/build-mac -DCMAKE_BUILD_TYPE=Release
 *   cmake --build helper/build-mac --target logic_tests
 *   ./helper/build-mac/logic_tests
 */

#include <cassert>
#include <cstdio>
#include <cstring>
#include <string>

#include "argv_builder.h"
#include "helper.h"
#include "json_parser.h"
#include "whitelist.h"

using namespace spike02;

static int gFailures = 0;

#define CHECK(cond)                                                      \
    do {                                                                 \
        if (!(cond)) {                                                   \
            std::fprintf(stderr, "FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); \
            ++gFailures;                                                 \
        }                                                                \
    } while (0)

static void TestJsonParser() {
    // Full valid request with Chinese + spaces.
    const std::string request =
        "{\"requestId\":\"c03-boundary\",\"executable\":\"C:\\\\Windows\\\\System32\\\\cmd.exe\","
        "\"argv\":[\"/d\",\"/s\",\"/c\",\"echo 中文 路径\"],"
        "\"workingDirectory\":\"C:\\\\工作 区\\\\子目录\",\"timeoutMs\":12345,\"maxOutputSize\":2048,"
        "\"allowNetwork\":false,\"allowedDirectories\":[\"C:\\\\工作 区\"],"
        "\"protectedDirectories\":[\"C:\\\\外部\"]}";
    JsonValue root;
    std::string error;
    CHECK(JsonParse(request, &root, &error));
    CHECK(root.type == JsonValue::Type::Object);

    const JsonValue* executable = JsonObjectGet(root, L"executable");
    CHECK(executable && executable->type == JsonValue::Type::String);
    CHECK(executable->str == L"C:\\Windows\\System32\\cmd.exe");

    const JsonValue* argv = JsonObjectGet(root, L"argv");
    CHECK(argv && argv->type == JsonValue::Type::Array && argv->array.size() == 4);
    CHECK(argv->array[3].str == L"echo 中文 路径");

    const JsonValue* cwd = JsonObjectGet(root, L"workingDirectory");
    CHECK(cwd && cwd->str == L"C:\\工作 区\\子目录");

    const JsonValue* timeout = JsonObjectGet(root, L"timeoutMs");
    CHECK(timeout && JsonAsInt(*timeout, 0) == 12345);

    const JsonValue* network = JsonObjectGet(root, L"allowNetwork");
    CHECK(network && JsonAsBool(*network, true) == false);

    const JsonValue* protectedDirs = JsonObjectGet(root, L"protectedDirectories");
    CHECK(protectedDirs && protectedDirs->array.size() == 1 &&
          protectedDirs->array[0].str == L"C:\\外部");

    // Escapes.
    CHECK(JsonParse("\"a\\\"b\\\\c\\/d\\b\\f\\n\\r\\t\"", &root, &error));
    CHECK(root.type == JsonValue::Type::String && root.str == L"a\"b\\c/d\b\f\n\r\t");

    // \uXXXX and surrogate pairs.
    CHECK(JsonParse("\"\\u4e2d\\u6587\\ud83d\\ude00\"", &root, &error));
    CHECK(root.str.size() == 4 && root.str[0] == 0x4E2D && root.str[1] == 0x6587);

    // Invalid inputs must fail.
    CHECK(!JsonParse("{", &root, &error));
    CHECK(!JsonParse("{\"a\":}", &root, &error));
    CHECK(!JsonParse("{\"a\":1} trailing", &root, &error));
    CHECK(!JsonParse("{\"a\":\"\\x\"}", &root, &error));
    CHECK(!JsonParse("[1,2,3", &root, &error));
    CHECK(!JsonParse("nul", &root, &error));

    // Depth bomb.
    std::string bomb;
    for (int i = 0; i < 200; ++i) bomb += "[";
    CHECK(!JsonParse(bomb, &root, &error));

    // Utf8ToUtf16 round trip.
    CHECK(Utf8ToUtf16("中文路径") == std::wstring(L"中文路径"));
    CHECK(Utf8ToUtf16("plain-ascii") == std::wstring(L"plain-ascii"));
}

static void TestParseJsonConfig() {
    ProcessConfig config;
    std::string error;

    const std::string valid =
        "{\"requestId\":\"r1\",\"executable\":\"C:\\\\Windows\\\\System32\\\\cmd.exe\","
        "\"argv\":[\"/d\",\"/s\",\"/c\",\"dir\"],\"timeoutMs\":5000,\"maxOutputSize\":1024}";
    CHECK(ParseJsonConfig(valid, &config, &error));
    CHECK(config.requestId == L"r1");
    CHECK(config.executable == L"C:\\Windows\\System32\\cmd.exe");
    CHECK(config.argv.size() == 4 && config.argv[3] == L"dir");
    CHECK(config.timeoutMs == 5000);
    CHECK(config.maxOutputSize == 1024);
    CHECK(config.allowNetwork == false);

    // Defaults + clamping (fresh config: struct default member initializers).
    ProcessConfig minimalConfig;
    const std::string minimal = "{\"executable\":\"cmd.exe\",\"argv\":[]}";
    CHECK(ParseJsonConfig(minimal, &minimalConfig, &error));
    CHECK(minimalConfig.timeoutMs == kDefaultTimeoutMs);
    CHECK(minimalConfig.maxOutputSize == kMaxOutputSizeDefault);
    CHECK(minimalConfig.workingDirectory.empty());

    const std::string clamped =
        "{\"executable\":\"cmd.exe\",\"argv\":[],\"timeoutMs\":999999999,\"maxOutputSize\":10}";
    CHECK(ParseJsonConfig(clamped, &config, &error));
    CHECK(config.timeoutMs == 3600000);
    CHECK(config.maxOutputSize == 1024);

    // aclPolicy parsing.
    ProcessConfig policyConfig;
    const std::string withPolicy =
        "{\"requestId\":\"p1\",\"executable\":\"C:\\\\Windows\\\\System32\\\\cmd.exe\","
        "\"argv\":[\"/d\",\"/s\",\"/c\",\"dir\"],"
        "\"aclPolicy\":{\"acceptanceRoot\":\"C:\\\\acc\",\"perRunRoot\":\"C:\\\\acc\\\\A1\\\\generated\"}}";
    CHECK(ParseJsonConfig(withPolicy, &policyConfig, &error));
    CHECK(policyConfig.aclPolicy.valid);
    CHECK(policyConfig.aclPolicy.acceptanceRoot == L"C:\\acc");
    CHECK(policyConfig.aclPolicy.perRunRoot == L"C:\\acc\\A1\\generated");

    // Malformed aclPolicy rejected.
    CHECK(!ParseJsonConfig("{\"executable\":\"C:\\\\Windows\\\\System32\\\\cmd.exe\",\"argv\":[],\"aclPolicy\":{}}",
                           &config, &error));
    CHECK(!ParseJsonConfig("{\"executable\":\"C:\\\\Windows\\\\System32\\\\cmd.exe\",\"argv\":[],\"aclPolicy\":\"nope\"}",
                           &config, &error));

    // Schema violations.
    CHECK(!ParseJsonConfig("{\"argv\":[]}", &config, &error));
    CHECK(!ParseJsonConfig("{\"executable\":\"\",\"argv\":[]}", &config, &error));
    CHECK(!ParseJsonConfig("{\"executable\":\"cmd.exe\",\"argv\":\"nope\"}", &config, &error));
    CHECK(!ParseJsonConfig("[]", &config, &error));
    CHECK(!ParseJsonConfig("garbage", &config, &error));
}

static void TestArgvBuilder() {
    CHECK(QuoteArg(L"plain") == L"plain");
    CHECK(QuoteArg(L"") == L"\"\"");
    CHECK(QuoteArg(L"has space") == L"\"has space\"");
    CHECK(QuoteArg(L"has\"quote") == L"\"has\\\"quote\"");
    CHECK(QuoteArg(L"中文 路径") == L"\"中文 路径\"");
    // Trailing backslash is literal when the argument is not quoted (the
    // parser only treats backslashes specially before a quote).
    CHECK(QuoteArg(L"end\\") == L"end\\");
    CHECK(QuoteArg(L"end\\ more") == L"\"end\\ more\"");

    // Paths without whitespace stay unquoted; args with whitespace are quoted.
    const std::wstring line = BuildCommandLine(
        L"C:\\Windows\\System32\\cmd.exe",
        {L"/d", L"/s", L"/c", L"echo 中文 路径"});
    CHECK(line == L"C:\\Windows\\System32\\cmd.exe /d /s /c \"echo 中文 路径\"");
    const std::wstring quotedExe = BuildCommandLine(
        L"C:\\Program Files\\My Tool\\run.exe", {L"--input", L"a b"});
    CHECK(quotedExe == L"\"C:\\Program Files\\My Tool\\run.exe\" --input \"a b\"");
}

static void TestWhitelist() {
    WhitelistConfig config;
    config.system32Directory = L"C:\\Windows\\System32";

    // Direct System32 tools allowed (canonical absolute drive paths, any case).
    CHECK(CheckWhitelist(L"C:\\Windows\\System32\\cmd.exe",
                         {L"/d", L"/s", L"/c", L"dir"}, config) == WhitelistDecision::Allow);
    CHECK(CheckWhitelist(L"C:\\Windows\\System32\\where.exe", {}, config) ==
          WhitelistDecision::Allow);
    CHECK(CheckWhitelist(L"C:\\WINDOWS\\SYSTEM32\\WHOAMI.EXE", {}, config) ==
          WhitelistDecision::Allow);
    CHECK(CheckWhitelist(L"c:\\windows\\system32\\findstr.exe", {}, config) ==
          WhitelistDecision::Allow);

    // Bare names are rejected (only canonical absolute paths are accepted).
    CHECK(CheckWhitelist(L"cmd.exe", {L"/d", L"/s", L"/c", L"dir"}, config) ==
          WhitelistDecision::RejectExecutable);
    CHECK(CheckWhitelist(L"reg.exe", {}, config) == WhitelistDecision::RejectExecutable);
    CHECK(CheckWhitelist(L"whoami.exe", {}, config) == WhitelistDecision::RejectExecutable);

    // Path-shape bypasses rejected.
    CHECK(CheckWhitelist(L".\\cmd.exe", {L"/d", L"/s", L"/c", L"dir"}, config) ==
          WhitelistDecision::RejectExecutable);
    CHECK(CheckWhitelist(L"C:cmd.exe", {L"/d", L"/s", L"/c", L"dir"}, config) ==
          WhitelistDecision::RejectExecutable);
    CHECK(CheckWhitelist(L"\\\\server\\share\\cmd.exe", {L"/d", L"/s", L"/c", L"dir"}, config) ==
          WhitelistDecision::RejectExecutable);
    CHECK(CheckWhitelist(L"\\\\.\\Device\\cmd.exe", {L"/d", L"/s", L"/c", L"dir"}, config) ==
          WhitelistDecision::RejectExecutable);
    CHECK(CheckWhitelist(L"C:\\Windows\\System32\\cmd.exe ", {L"/d", L"/s", L"/c", L"dir"}, config) ==
          WhitelistDecision::RejectExecutable);
    CHECK(CheckWhitelist(L"C:\\Windows\\System32.\\cmd.exe", {L"/d", L"/s", L"/c", L"dir"}, config) ==
          WhitelistDecision::RejectExecutable);

    // System32evil sibling and System32 subdirectories rejected.
    CHECK(CheckWhitelist(L"C:\\Windows\\System32evil\\cmd.exe", {L"/d", L"/s", L"/c", L"dir"}, config) ==
          WhitelistDecision::RejectExecutable);
    CHECK(CheckWhitelist(L"C:\\Windows\\System32\\sub\\cmd.exe", {L"/d", L"/s", L"/c", L"dir"}, config) ==
          WhitelistDecision::RejectExecutable);

    // Non-whitelisted executables rejected (C06).
    CHECK(CheckWhitelist(L"C:\\Windows\\System32\\notepad.exe", {}, config) ==
          WhitelistDecision::RejectExecutable);
    CHECK(CheckWhitelist(L"C:\\Windows\\System32\\powershell.exe", {}, config) ==
          WhitelistDecision::RejectExecutable);
    CHECK(CheckWhitelist(L"C:\\Users\\x\\evil.exe", {}, config) ==
          WhitelistDecision::RejectExecutable);

    // cmd.exe contract: /d /s /c required, /k rejected.
    CHECK(CheckWhitelist(L"C:\\Windows\\System32\\cmd.exe", {L"/c", L"dir"}, config) ==
          WhitelistDecision::RejectArgv);
    CHECK(CheckWhitelist(L"C:\\Windows\\System32\\cmd.exe", {L"/d", L"/s", L"/k", L"dir"}, config) ==
          WhitelistDecision::RejectArgv);
    CHECK(CheckWhitelist(L"C:\\Windows\\System32\\cmd.exe", {L"/D", L"/S", L"/C", L"dir"}, config) ==
          WhitelistDecision::Allow);
}

static void TestPathShape() {
    CHECK(ClassifyPathShape(L"C:\\Windows\\System32\\cmd.exe") == PathShape::Absolute);
    CHECK(ClassifyPathShape(L"c:/windows/system32/cmd.exe") == PathShape::Absolute);
    CHECK(ClassifyPathShape(L"cmd.exe") == PathShape::BareName);
    CHECK(ClassifyPathShape(L"C:cmd.exe") == PathShape::DriveRelative);
    CHECK(ClassifyPathShape(L"C:") == PathShape::DriveRelative);
    CHECK(ClassifyPathShape(L"\\\\server\\share\\cmd.exe") == PathShape::Unc);
    CHECK(ClassifyPathShape(L"\\\\.\\COM1") == PathShape::Device);
    CHECK(ClassifyPathShape(L"\\\\?\\C:\\x") == PathShape::Device);
    CHECK(ClassifyPathShape(L".\\cmd.exe") == PathShape::Relative);
    CHECK(ClassifyPathShape(L"..\\x.exe") == PathShape::Relative);
    CHECK(ClassifyPathShape(L"\\cmd.exe") == PathShape::Relative);
    CHECK(ClassifyPathShape(L"foo\\bar.exe") == PathShape::Relative);
    CHECK(ClassifyPathShape(L"C:\\Windows\\System32\\cmd.exe ") == PathShape::TrailingDotOrSpace);
    CHECK(ClassifyPathShape(L"C:\\Windows\\System32.\\cmd.exe") == PathShape::TrailingDotOrSpace);
    CHECK(ClassifyPathShape(std::wstring(L"C:\\a\0b", 5)) == PathShape::EmbeddedNul);
}

static void TestAclPolicy() {
    // Boundary-safe containment.
    CHECK(PathWithinRoot(L"C:\\acc\\A1\\generated", L"C:\\acc"));
    CHECK(PathWithinRoot(L"C:\\acc\\A1\\generated\\c03", L"C:\\acc\\A1\\generated"));
    CHECK(PathWithinRoot(L"C:\\acc\\A1\\generated", L"C:\\acc\\A1\\generated"));
    CHECK(!PathWithinRoot(L"C:\\acc2\\x", L"C:\\acc"));
    CHECK(!PathWithinRoot(L"C:\\acc\\A1\\generatedevil", L"C:\\acc\\A1\\generated"));

    CHECK(IsUnderSystem32(L"C:\\Windows\\System32\\cmd.exe", L"C:\\Windows\\System32"));
    CHECK(!IsUnderSystem32(L"C:\\Windows\\System32", L"C:\\Windows\\System32"));
    CHECK(!IsUnderSystem32(L"C:\\Windows\\System32evil\\cmd.exe", L"C:\\Windows\\System32"));

    // ValidateAclPolicy: valid policy passes; escapes are refused.
    ProcessConfig ok;
    ok.aclPolicy.valid = true;
    ok.aclPolicy.acceptanceRoot = L"C:\\acc";
    ok.aclPolicy.perRunRoot = L"C:\\acc\\A1\\generated";
    ok.allowedDirectories = {L"C:\\acc\\A1\\generated\\c03"};
    ok.protectedDirectories = {L"C:\\acc\\A1\\generated\\protected-outside"};
    std::wstring error;
    CHECK(ValidateAclPolicy(ok, &error));

    ProcessConfig none;  // no ACL request -> valid without a policy
    CHECK(ValidateAclPolicy(none, &error));

    ProcessConfig noPolicy;  // ACL request without policy -> refused
    noPolicy.allowedDirectories = {L"C:\\x"};
    CHECK(!ValidateAclPolicy(noPolicy, &error));

    ProcessConfig badRoot;  // perRunRoot outside acceptanceRoot -> refused
    badRoot.aclPolicy.valid = true;
    badRoot.aclPolicy.acceptanceRoot = L"C:\\acc";
    badRoot.aclPolicy.perRunRoot = L"C:\\elsewhere";
    badRoot.allowedDirectories = {L"C:\\elsewhere\\c03"};
    CHECK(!ValidateAclPolicy(badRoot, &error));

    ProcessConfig badTarget;  // target outside perRunRoot -> refused
    badTarget.aclPolicy.valid = true;
    badTarget.aclPolicy.acceptanceRoot = L"C:\\acc";
    badTarget.aclPolicy.perRunRoot = L"C:\\acc\\A1\\generated";
    badTarget.protectedDirectories = {L"C:\\Windows"};
    CHECK(!ValidateAclPolicy(badTarget, &error));

    ProcessConfig sibling;  // sibling-prefix target -> refused
    sibling.aclPolicy.valid = true;
    sibling.aclPolicy.acceptanceRoot = L"C:\\acc";
    sibling.aclPolicy.perRunRoot = L"C:\\acc\\A1\\generated";
    sibling.allowedDirectories = {L"C:\\acc\\A1\\generatedevil"};
    CHECK(!ValidateAclPolicy(sibling, &error));
}

static void TestRenderResult() {
    ProcessResult result;
    result.exitCode = 0;
    result.executionTimeMs = 16;
    result.containmentVerified = true;
    result.inputDetached = true;
    const std::string text = "hello 中文\n";
    result.stdoutBytes.assign(text.begin(), text.end());
    AclChangeRecord record;
    record.path = L"C:\\外部";
    record.mechanism = L"deny_ace";
    record.applied = true;
    record.verified = true;
    record.rolledBack = true;
    result.aclChanges.push_back(record);

    const std::string json = RenderResultJson("c03-boundary", result);
    CHECK(json.find("\"status\":\"completed\"") != std::string::npos);
    CHECK(json.find("\"exitCode\":0") != std::string::npos);
    CHECK(json.find("\"containmentVerified\":true") != std::string::npos);
    CHECK(json.find("\"inputDetached\":true") != std::string::npos);
    CHECK(json.find("\"stdoutSize\":13") != std::string::npos);
    // "hello 中文\n" = 68 65 6c 6c 6f 20 e4 b8 ad e6 96 87 0a (13 bytes)
    CHECK(json.find("\"stdoutBase64\":\"aGVsbG8g5Lit5paHCg==\"") != std::string::npos);
    CHECK(json.find("\"mechanism\":\"deny_ace\"") != std::string::npos);
    CHECK(json.find("\"rolledBack\":true") != std::string::npos);
    // Response is single-line JSON.
    CHECK(json.find('\n') == std::string::npos);

    // Truncation flag.
    ProcessResult truncated;
    truncated.exitCode = 1;
    truncated.timedOut = true;
    truncated.outputTruncated = true;
    const std::string json2 = RenderResultJson("r", truncated);
    CHECK(json2.find("\"timedOut\":true") != std::string::npos);
    CHECK(json2.find("\"outputTruncated\":true") != std::string::npos);

    // Error rendering keeps the C02 contract (error field at top level).
    const std::string err = RenderErrorJson("c02", "HOST_ALREADY_IN_JOB", "host in job");
    CHECK(err.find("\"error\":\"HOST_ALREADY_IN_JOB\"") != std::string::npos);
    CHECK(err.find("\"type\":\"error\"") != std::string::npos);
}

int main() {
    TestJsonParser();
    TestParseJsonConfig();
    TestArgvBuilder();
    TestPathShape();
    TestWhitelist();
    TestAclPolicy();
    TestRenderResult();

    if (gFailures == 0) {
        std::printf("logic_tests: ALL PASS\n");
        return 0;
    }
    std::fprintf(stderr, "logic_tests: %d failure(s)\n", gFailures);
    return 1;
}
