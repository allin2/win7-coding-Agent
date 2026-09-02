/**
 * helper/protocol.cpp — Request parsing and response rendering for the
 * D-013 helper protocol (JSON over stdio). Platform-neutral so the protocol
 * contract can be unit-tested on the build machine.
 *
 * Request  (UTF-8 JSON, one line on stdin):
 *   {
 *     "schema_version": 1,
 *     "requestId": "c03-restricted-boundary",
 *     "executable": "C:\\Windows\\System32\\cmd.exe",
 *     "argv": ["/d", "/s", "/c", "script.cmd"],
 *     "workingDirectory": "C:\\workspace",
 *     "timeoutMs": 30000,
 *     "maxOutputSize": 16777216,
 *     "allowNetwork": false,          // recorded only; never claimed as isolation
 *     "allowedDirectories": ["C:\\workspace"],
 *     "protectedDirectories": ["C:\\outside"],  // deny ACE + rollback (C04)
 *     "aclPolicy": {"acceptanceRoot": "C:\\acceptance",
 *                   "perRunRoot": "C:\\acceptance\\A4-xxx\\generated"}
 *   }
 *
 * Success response:
 *   {"schema_version":1,"type":"execution_result","requestId":...,"status":"completed",
 *    "exitCode":0,"executionTimeMs":16,"timedOut":false,"canceled":false,
 *    "outputTruncated":false,"containmentVerified":true,"inputDetached":true,
 *    "hostJob":{"detected":false,"breakaway":"none","limitFlags":0,
 *      "childJobAssignmentVerified":true},
 *    "tokenAudit":{"source":"suspended_child_process_token","verified":true,
 *      "isRestricted":true,"tokenType":"primary","restrictedSidSetVerified":true,
 *      "userRestrictedSid":true,"worldRestrictedSid":true,
 *      "administratorsRestrictedSid":false,"restrictedSidCount":8,
 *      "integritySid":"S-1-16-4096","integrityRid":4096},
 *    "stdoutSize":0,"stderrSize":0,"stdoutBase64":"","stderrBase64":"",
 *    "aclChanges":[{"path":...,"mechanism":...,"applied":true,"verified":true,"rolledBack":true}]}
 *
 * Error response:
 *   {"schema_version":1,"type":"error","requestId":...,"error":"HOST_ALREADY_IN_JOB","message":...}
 */

#include "helper.h"

#include <cstdint>
#include <cstdio>
#include <cstring>
#include <algorithm>

namespace spike02 {
namespace {

// ─── Base64 ──────────────────────────────────────────────────────────────────

const char kBase64Table[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

std::string Base64Encode(const unsigned char* data, size_t size) {
    std::string out;
    out.reserve(((size + 2) / 3) * 4);
    size_t i = 0;
    while (i + 3 <= size) {
        const uint32_t v = (static_cast<uint32_t>(data[i]) << 16) |
                           (static_cast<uint32_t>(data[i + 1]) << 8) |
                           static_cast<uint32_t>(data[i + 2]);
        out.push_back(kBase64Table[(v >> 18) & 0x3F]);
        out.push_back(kBase64Table[(v >> 12) & 0x3F]);
        out.push_back(kBase64Table[(v >> 6) & 0x3F]);
        out.push_back(kBase64Table[v & 0x3F]);
        i += 3;
    }
    if (i + 2 == size) {
        const uint32_t v = (static_cast<uint32_t>(data[i]) << 16) |
                           (static_cast<uint32_t>(data[i + 1]) << 8);
        out.push_back(kBase64Table[(v >> 18) & 0x3F]);
        out.push_back(kBase64Table[(v >> 12) & 0x3F]);
        out.push_back(kBase64Table[(v >> 6) & 0x3F]);
        out.push_back('=');
    } else if (i + 1 == size) {
        const uint32_t v = static_cast<uint32_t>(data[i]) << 16;
        out.push_back(kBase64Table[(v >> 18) & 0x3F]);
        out.push_back(kBase64Table[(v >> 12) & 0x3F]);
        out.push_back('=');
        out.push_back('=');
    }
    return out;
}

// ─── JSON escaping ───────────────────────────────────────────────────────────

std::string JsonEscape(const std::wstring& text) {
    std::string out;
    for (wchar_t ch : text) {
        switch (ch) {
            case L'"': out += "\\\""; break;
            case L'\\': out += "\\\\"; break;
            case L'\b': out += "\\b"; break;
            case L'\f': out += "\\f"; break;
            case L'\n': out += "\\n"; break;
            case L'\r': out += "\\r"; break;
            case L'\t': out += "\\t"; break;
            default:
                if (ch < 0x20) {
                    char buf[8];
                    std::snprintf(buf, sizeof(buf), "\\u%04x", static_cast<unsigned>(ch));
                    out += buf;
                } else if (ch < 0x80) {
                    out.push_back(static_cast<char>(ch));
                } else if (ch < 0x800) {
                    out.push_back(static_cast<char>(0xC0 | (ch >> 6)));
                    out.push_back(static_cast<char>(0x80 | (ch & 0x3F)));
                } else if (ch < 0xD800 || ch > 0xDFFF) {
                    out.push_back(static_cast<char>(0xE0 | (ch >> 12)));
                    out.push_back(static_cast<char>(0x80 | ((ch >> 6) & 0x3F)));
                    out.push_back(static_cast<char>(0x80 | (ch & 0x3F)));
                } else {
                    // Lone surrogate: lossy but safe — replace with U+FFFD.
                    out += "\xEF\xBF\xBD";
                }
                break;
        }
    }
    return out;
}

// ─── String-array extraction ─────────────────────────────────────────────────

bool ExtractStringArray(const JsonValue& value, std::vector<std::wstring>* out,
                        std::string* error) {
    if (value.type != JsonValue::Type::Array) {
        *error = "expected an array";
        return false;
    }
    for (const JsonValue& item : value.array) {
        std::wstring text;
        if (!JsonAsString(item, &text)) {
            *error = "array item is not a string";
            return false;
        }
        out->push_back(text);
    }
    return true;
}

bool ObjectHasOnlyUniqueKeys(const JsonValue& value,
                             const std::vector<std::wstring>& allowed,
                             std::string* error) {
    if (value.type != JsonValue::Type::Object) {
        *error = "expected an object";
        return false;
    }
    std::vector<std::wstring> seen;
    for (const auto& member : value.object) {
        if (std::find(allowed.begin(), allowed.end(), member.first) == allowed.end()) {
            *error = "unknown field in protocol v2 request";
            return false;
        }
        if (std::find(seen.begin(), seen.end(), member.first) != seen.end()) {
            *error = "duplicate field in protocol v2 request";
            return false;
        }
        seen.push_back(member.first);
    }
    return true;
}

std::wstring UpperAscii(const std::wstring& value) {
    std::wstring out = value;
    for (wchar_t& ch : out) {
        if (ch >= L'a' && ch <= L'z') ch = static_cast<wchar_t>(ch - L'a' + L'A');
    }
    return out;
}

bool IsForbiddenEnvironmentNameImpl(const std::wstring& name) {
    const std::wstring upper = UpperAscii(name);
    static const wchar_t* kExact[] = {
        L"NODE_OPTIONS", L"NODE_EXTRA_CA_CERTS", L"NODE_PATH", L"NODE_REDIRECT_WARNINGS", L"NODE_V8_COVERAGE",
        L"ELECTRON_RUN_AS_NODE", L"ELECTRON_EXTRA_LAUNCH_ARGS", L"ELECTRON_NO_ASAR",
        L"ELECTRON_ENABLE_LOGGING", L"ELECTRON_DISABLE_SECURITY_WARNINGS",
        L"ELECTRON_OVERRIDE_DIST_PATH", L"NODE_TLS_REJECT_UNAUTHORIZED",
        L"SSLKEYLOGFILE", L"OPENSSL_CONF", L"OPENSSL_MODULES",
        L"GIT_SSL_NO_VERIFY", L"GIT_SSL_CAINFO", L"GIT_SSL_CAPATH", L"PYTHONHTTPSVERIFY",
        L"SSL_CERT_FILE", L"SSL_CERT_DIR", L"REQUESTS_CA_BUNDLE", L"CURL_CA_BUNDLE", L"AWS_CA_BUNDLE",
        L"NPM_CONFIG_STRICT_SSL", L"YARN_STRICT_SSL", L"PIP_CERT", L"PIP_TRUSTED_HOST",
    };
    for (const wchar_t* blocked : kExact) {
        if (upper == blocked) return true;
    }
    return upper.find(L"ELECTRON_") == 0 || upper.find(L"NODE_") == 0 ||
           upper.find(L"API_KEY") != std::wstring::npos ||
           upper.find(L"APIKEY") != std::wstring::npos ||
           upper.find(L"ACCESS_KEY") != std::wstring::npos ||
           upper.find(L"ACCESSKEY") != std::wstring::npos ||
           upper.find(L"PRIVATE_KEY") != std::wstring::npos ||
           upper.find(L"PRIVATEKEY") != std::wstring::npos ||
           upper.find(L"CREDENTIAL") != std::wstring::npos ||
           upper.find(L"AUTHORIZATION") != std::wstring::npos ||
           upper.find(L"PASSWORD") != std::wstring::npos ||
           upper.find(L"SECRET") != std::wstring::npos ||
           upper.find(L"TOKEN") != std::wstring::npos ||
           ((upper.find(L"PROVIDER") != std::wstring::npos ||
             upper.find(L"OPENAI") != std::wstring::npos ||
             upper.find(L"ANTHROPIC") != std::wstring::npos ||
             upper.find(L"DEEPSEEK") != std::wstring::npos ||
             upper.find(L"AZURE") != std::wstring::npos) &&
            upper.find(L"KEY") != std::wstring::npos);
}

bool ExtractEnvironmentOverlay(const JsonValue& value,
                               std::vector<std::pair<std::wstring, std::wstring>>* out,
                               std::string* error) {
    if (value.type != JsonValue::Type::Object || value.object.size() > 64) {
        *error = "invalid 'envOverlay'";
        return false;
    }
    size_t totalCharacters = 0;
    std::vector<std::wstring> seen;
    for (const auto& member : value.object) {
        std::wstring text;
        const std::wstring upper = UpperAscii(member.first);
        if (member.first.empty() || member.first.size() > 128 ||
            member.first.find(L'=') != std::wstring::npos ||
            member.first.find(L'\0') != std::wstring::npos ||
            IsForbiddenEnvironmentNameImpl(member.first) ||
            std::find(seen.begin(), seen.end(), upper) != seen.end() ||
            !JsonAsString(member.second, &text) || text.size() > 8192 ||
            text.find(L'\0') != std::wstring::npos) {
            *error = "invalid or forbidden environment overlay entry";
            return false;
        }
        totalCharacters += member.first.size() + text.size() + 2;
        if (totalCharacters > 32767) {
            *error = "environment overlay exceeds the v2 bound";
            return false;
        }
        seen.push_back(upper);
        out->push_back(std::make_pair(member.first, text));
    }
    return true;
}

bool ExtractRequiredString(const JsonValue& root, const wchar_t* key,
                           std::wstring* out, size_t maxLength,
                           std::string* error) {
    const JsonValue* value = JsonObjectGet(root, key);
    if (!value || !JsonAsString(*value, out) || out->empty() || out->size() > maxLength) {
        *error = "missing or invalid protocol v2 string field";
        return false;
    }
    return true;
}

}  // namespace

bool IsForbiddenEnvironmentName(const std::wstring& name) {
    return IsForbiddenEnvironmentNameImpl(name);
}

bool ParseJsonConfig(const std::string& jsonUtf8, ProcessConfig* config,
                     std::string* error) {
    *config = ProcessConfig();
    JsonValue root;
    if (!JsonParse(jsonUtf8, &root, error)) return false;
    if (root.type != JsonValue::Type::Object) {
        *error = "request must be a JSON object";
        return false;
    }

    const JsonValue* legacySchemaVersion = JsonObjectGet(root, L"schema_version");
    const JsonValue* currentSchemaVersion = JsonObjectGet(root, L"schemaVersion");
    if (legacySchemaVersion && currentSchemaVersion) {
        *error = "ambiguous schema version field";
        return false;
    }
    const JsonValue* schemaVersion = legacySchemaVersion
        ? legacySchemaVersion : currentSchemaVersion;
    const long long schema = schemaVersion ? JsonAsInt(*schemaVersion, -1) : -1;
    if (schema != 1 && schema != 2) {
        *error = "unsupported or missing 'schema_version'";
        return false;
    }
    if ((schema == 1 && !legacySchemaVersion) ||
        (schema == 2 && !currentSchemaVersion)) {
        *error = "schema version field does not match the protocol version";
        return false;
    }
    config->schemaVersion = static_cast<int>(schema);

    if (schema == 2) {
        const std::vector<std::wstring> allowedKeys = {
            L"schemaVersion", L"requestId", L"profileId", L"executable", L"argv",
            L"shellKind", L"shellPath", L"shellVersion", L"shellIdentity", L"shellSource",
            L"command", L"cwd", L"envOverlay", L"maxStdoutBytes", L"maxStderrBytes", L"managed",
            L"deadlineMode", L"timeoutMs", L"idleTimeoutMs",
        };
        if (!ObjectHasOnlyUniqueKeys(root, allowedKeys, error)) return false;

        if (!ExtractRequiredString(root, L"requestId", &config->requestId, 128, error) ||
            !ExtractRequiredString(root, L"profileId", &config->profileId, 128, error) ||
            config->profileId != L"a9-trusted-shell-current-user-v1" ||
            !ExtractRequiredString(root, L"executable", &config->executable, 32767, error) ||
            !ExtractRequiredString(root, L"shellKind", &config->shellKind, 32, error) ||
            !ExtractRequiredString(root, L"shellPath", &config->shellPath, 32767, error) ||
            !ExtractRequiredString(root, L"shellVersion", &config->shellVersion, 256, error) ||
            !ExtractRequiredString(root, L"shellIdentity", &config->shellIdentity, 64, error) ||
            !ExtractRequiredString(root, L"shellSource", &config->shellSource, 32, error) ||
            !ExtractRequiredString(root, L"command", &config->command, 32767, error) ||
            !ExtractRequiredString(root, L"cwd", &config->workingDirectory, 32767, error)) {
            if (error->empty()) *error = "invalid protocol v2 request";
            return false;
        }
        if ((config->shellKind != L"cmd" && config->shellKind != L"powershell" &&
             config->shellKind != L"bash") ||
            (config->shellSource != L"automatic" && config->shellSource != L"workspace_explicit")) {
            *error = "unsupported shellKind or shellSource";
            return false;
        }
        if (config->shellIdentity.size() != 64 ||
            config->shellIdentity.find_first_not_of(L"0123456789abcdefABCDEF") != std::wstring::npos) {
            *error = "invalid shell identity";
            return false;
        }
        const JsonValue* argv = JsonObjectGet(root, L"argv");
        if (!argv || !ExtractStringArray(*argv, &config->argv, error) ||
            config->argv.empty() || config->argv.size() > 128) {
            *error = "missing or invalid 'argv'";
            return false;
        }
        const JsonValue* overlay = JsonObjectGet(root, L"envOverlay");
        if (!overlay || !ExtractEnvironmentOverlay(*overlay, &config->envOverlay, error)) return false;
        const JsonValue* managed = JsonObjectGet(root, L"managed");
        if (!managed || managed->type != JsonValue::Type::Bool) {
            *error = "missing or invalid 'managed'";
            return false;
        }
        config->managed = managed->boolean;

        const JsonValue* deadlineMode = JsonObjectGet(root, L"deadlineMode");
        std::wstring mode;
        if (!deadlineMode || !JsonAsString(*deadlineMode, &mode) ||
            (mode != L"none" && mode != L"fixed")) {
            *error = "missing or invalid 'deadlineMode'";
            return false;
        }
        const JsonValue* timeout = JsonObjectGet(root, L"timeoutMs");
        const JsonValue* idleTimeout = JsonObjectGet(root, L"idleTimeoutMs");
        if (mode == L"none") {
            if (timeout || idleTimeout) {
                *error = "deadlineMode 'none' cannot include timeout fields";
                return false;
            }
            config->deadlineEnabled = false;
            config->idleDeadlineEnabled = false;
        } else {
            if (!timeout || timeout->type != JsonValue::Type::Number) {
                *error = "deadlineMode 'fixed' requires timeoutMs";
                return false;
            }
            const long long total = JsonAsInt(*timeout, -1);
            if (total < 1 || total > 3600000) {
                *error = "timeoutMs is outside the v2 bound";
                return false;
            }
            config->timeoutMs = total;
            config->deadlineEnabled = true;
            if (idleTimeout) {
                if (idleTimeout->type != JsonValue::Type::Number) {
                    *error = "invalid idleTimeoutMs";
                    return false;
                }
                const long long idle = JsonAsInt(*idleTimeout, -1);
                if (idle < 1 || idle > total) {
                    *error = "idleTimeoutMs is outside the v2 bound";
                    return false;
                }
                config->idleTimeoutMs = idle;
                config->idleDeadlineEnabled = true;
            } else {
                config->idleDeadlineEnabled = false;
            }
        }
        const JsonValue* stdoutCap = JsonObjectGet(root, L"maxStdoutBytes");
        const JsonValue* stderrCap = JsonObjectGet(root, L"maxStderrBytes");
        if (!stdoutCap || stdoutCap->type != JsonValue::Type::Number ||
            !stderrCap || stderrCap->type != JsonValue::Type::Number) {
            *error = "missing or invalid output bounds";
            return false;
        }
        const long long stdoutCapValue = JsonAsInt(*stdoutCap, -1);
        const long long stderrCapValue = JsonAsInt(*stderrCap, -1);
        if (stdoutCapValue < 1024 || stdoutCapValue > kMaxOutputSizeAbsolute ||
            stderrCapValue < 1024 || stderrCapValue > kMaxOutputSizeAbsolute) {
            *error = "output bound is outside the v2 limit";
            return false;
        }
        config->maxStdoutBytes = stdoutCapValue;
        config->maxStderrBytes = stderrCapValue;
        config->maxOutputSize = std::max(stdoutCapValue, stderrCapValue);
        return true;
    }

    const JsonValue* requestId = JsonObjectGet(root, L"requestId");
    if (!requestId || !JsonAsString(*requestId, &config->requestId) ||
        config->requestId.empty() || config->requestId.size() > 128) {
        *error = "missing or invalid 'requestId'";
        return false;
    }

    const JsonValue* executable = JsonObjectGet(root, L"executable");
    if (!executable || !JsonAsString(*executable, &config->executable) ||
        config->executable.empty()) {
        *error = "missing or invalid 'executable'";
        return false;
    }

    const JsonValue* argv = JsonObjectGet(root, L"argv");
    if (!argv || !ExtractStringArray(*argv, &config->argv, error)) {
        *error = "missing or invalid 'argv'";
        return false;
    }

    const JsonValue* cwd = JsonObjectGet(root, L"workingDirectory");
    if (cwd) JsonAsString(*cwd, &config->workingDirectory);

    const JsonValue* timeout = JsonObjectGet(root, L"timeoutMs");
    if (timeout) {
        const long long value = JsonAsInt(*timeout, kDefaultTimeoutMs);
        config->timeoutMs = value < 1 ? 1 : (value > 3600000 ? 3600000 : value);
    }

    const JsonValue* idleTimeout = JsonObjectGet(root, L"idleTimeoutMs");
    if (idleTimeout) {
        const long long value = JsonAsInt(*idleTimeout, kDefaultIdleTimeoutMs);
        config->idleTimeoutMs = value < 1 ? 1 :
            (value > config->timeoutMs ? config->timeoutMs : value);
    } else if (config->idleTimeoutMs > config->timeoutMs) {
        config->idleTimeoutMs = config->timeoutMs;
    }

    const JsonValue* cap = JsonObjectGet(root, L"maxOutputSize");
    if (cap) {
        const long long value = JsonAsInt(*cap, kMaxOutputSizeDefault);
        config->maxOutputSize =
            value < 1024 ? 1024 : (value > kMaxOutputSizeAbsolute ? kMaxOutputSizeAbsolute : value);
    }

    const JsonValue* network = JsonObjectGet(root, L"allowNetwork");
    if (network) config->allowNetwork = JsonAsBool(*network, false);

    const JsonValue* allowed = JsonObjectGet(root, L"allowedDirectories");
    if (allowed && !ExtractStringArray(*allowed, &config->allowedDirectories, error)) {
        *error = "invalid 'allowedDirectories'";
        return false;
    }

    const JsonValue* protectedDirs = JsonObjectGet(root, L"protectedDirectories");
    if (protectedDirs && !ExtractStringArray(*protectedDirs, &config->protectedDirectories, error)) {
        *error = "invalid 'protectedDirectories'";
        return false;
    }

    const JsonValue* policy = JsonObjectGet(root, L"aclPolicy");
    if (policy) {
        if (policy->type != JsonValue::Type::Object) {
            *error = "invalid 'aclPolicy'";
            return false;
        }
        const JsonValue* acceptanceRoot = JsonObjectGet(*policy, L"acceptanceRoot");
        const JsonValue* perRunRoot = JsonObjectGet(*policy, L"perRunRoot");
        if (!acceptanceRoot || !JsonAsString(*acceptanceRoot, &config->aclPolicy.acceptanceRoot) ||
            config->aclPolicy.acceptanceRoot.empty() ||
            !perRunRoot || !JsonAsString(*perRunRoot, &config->aclPolicy.perRunRoot) ||
            config->aclPolicy.perRunRoot.empty()) {
            *error = "invalid 'aclPolicy' (acceptanceRoot + perRunRoot required)";
            return false;
        }
        config->aclPolicy.valid = true;
    }

    return true;
}

bool ParseCancelControl(const std::string& jsonUtf8,
                        const std::wstring& expectedRequestId,
                        int expectedSchemaVersion,
                        std::string* error) {
    JsonValue root;
    if (!JsonParse(jsonUtf8, &root, error) || root.type != JsonValue::Type::Object) {
        *error = "cancel control must be a JSON object";
        return false;
    }
    const JsonValue* schemaVersion = JsonObjectGet(
        root, expectedSchemaVersion == 2 ? L"schemaVersion" : L"schema_version");
    const JsonValue* type = JsonObjectGet(root, L"type");
    const JsonValue* requestId = JsonObjectGet(root, L"requestId");
    std::wstring controlType;
    std::wstring controlRequestId;
    if (!schemaVersion || JsonAsInt(*schemaVersion, -1) != expectedSchemaVersion ||
        !type || !JsonAsString(*type, &controlType) || controlType != L"cancel" ||
        !requestId || !JsonAsString(*requestId, &controlRequestId) ||
        controlRequestId != expectedRequestId) {
        *error = "cancel control schema, type, or requestId mismatch";
        return false;
    }
    return true;
}

bool ValidateAclPolicy(const ProcessConfig& config, std::wstring* error) {
    if (config.allowedDirectories.empty() && config.protectedDirectories.empty()) return true;
    if (!config.aclPolicy.valid) {
        if (error) *error = L"ACL changes requested without a valid aclPolicy";
        return false;
    }
    if (!PathWithinRoot(config.aclPolicy.perRunRoot, config.aclPolicy.acceptanceRoot)) {
        if (error) *error = L"perRunRoot is outside acceptanceRoot: " + config.aclPolicy.perRunRoot;
        return false;
    }
    for (const std::wstring& dir : config.allowedDirectories) {
        if (!PathWithinRoot(dir, config.aclPolicy.perRunRoot)) {
            if (error) *error = L"allowedDirectory outside perRunRoot: " + dir;
            return false;
        }
    }
    for (const std::wstring& dir : config.protectedDirectories) {
        if (!PathWithinRoot(dir, config.aclPolicy.perRunRoot)) {
            if (error) *error = L"protectedDirectory outside perRunRoot: " + dir;
            return false;
        }
    }
    return true;
}

std::string RenderResultJson(const std::string& requestId, const ProcessResult& result) {
    if (result.schemaVersion == 2) {
        std::string out;
        out.reserve(640 + result.stdoutBytes.size() / 3 * 4 + result.stderrBytes.size() / 3 * 4);
        out += "{\"schemaVersion\":2,\"type\":\"execution_result\",\"requestId\":\"";
        out += JsonEscape(Utf8ToUtf16(requestId));
        out += "\",\"profileId\":\"";
        out += JsonEscape(result.profileId);
        out += "\",\"status\":\"completed\",\"exitCode\":";
        out += std::to_string(static_cast<unsigned long>(result.exitCode));
        out += ",\"executionTimeMs\":" + std::to_string(result.executionTimeMs);
        out += ",\"timedOut\":"; out += result.timedOut ? "true" : "false";
        out += ",\"idleTimedOut\":"; out += result.idleTimedOut ? "true" : "false";
        out += ",\"canceled\":"; out += result.canceled ? "true" : "false";
        out += ",\"outputTruncated\":"; out += result.outputTruncated ? "true" : "false";
        out += ",\"containmentVerified\":"; out += result.containmentVerified ? "true" : "false";
        out += ",\"inputDetached\":"; out += result.inputDetached ? "true" : "false";
        out += ",\"cleanupConfirmed\":"; out += result.cleanupConfirmed ? "true" : "false";
        out += ",\"workDirAclModified\":"; out += result.workDirAclModified ? "true" : "false";
        out += ",\"hostJob\":{\"detected\":"; out += result.hostJobDetected ? "true" : "false";
        out += ",\"breakaway\":\"" + result.hostJobBreakaway + "\",\"limitFlags\":";
        out += std::to_string(static_cast<unsigned long>(result.hostJobLimitFlags));
        out += ",\"childJobAssignmentVerified\":";
        out += result.childJobAssignmentVerified ? "true" : "false";
        out += "},\"tokenAudit\":{\"source\":\"suspended_child_process_token\",\"verified\":";
        out += result.tokenAudit.verified ? "true" : "false";
        out += ",\"tokenMode\":\"current_user\",\"restrictedToken\":";
        out += result.tokenAudit.isRestricted ? "true" : "false";
        out += ",\"tokenType\":\"";
        out += result.tokenAudit.isPrimary ? "primary" : "not_primary";
        out += "\",\"sameUser\":"; out += result.tokenAudit.sameUser ? "true" : "false";
        out += ",\"lowIntegrity\":"; out += result.tokenAudit.lowIntegrity ? "true" : "false";
        out += ",\"integritySid\":\"" + JsonEscape(result.tokenAudit.integritySid) + "\",\"integrityRid\":";
        out += std::to_string(static_cast<unsigned long>(result.tokenAudit.integrityRid));
        out += "},\"stdoutSize\":" + std::to_string(static_cast<long long>(result.stdoutBytes.size()));
        out += ",\"stderrSize\":" + std::to_string(static_cast<long long>(result.stderrBytes.size()));
        out += ",\"stdoutBase64\":\"" + Base64Encode(result.stdoutBytes.data(), result.stdoutBytes.size());
        out += "\",\"stderrBase64\":\"" + Base64Encode(result.stderrBytes.data(), result.stderrBytes.size());
        out += "\"}";
        return out;
    }
    std::string out;
    out.reserve(512 + result.stdoutBytes.size() / 3 * 4 + result.stderrBytes.size() / 3 * 4);
    out += "{\"schema_version\":1,\"type\":\"execution_result\",\"requestId\":\"";
    out += JsonEscape(Utf8ToUtf16(requestId));
    out += "\",\"status\":\"completed\",\"exitCode\":";
    out += std::to_string(static_cast<long long>(result.exitCode));
    out += ",\"executionTimeMs\":";
    out += std::to_string(result.executionTimeMs);
    out += ",\"timedOut\":";
    out += result.timedOut ? "true" : "false";
    out += ",\"idleTimedOut\":";
    out += result.idleTimedOut ? "true" : "false";
    out += ",\"canceled\":";
    out += result.canceled ? "true" : "false";
    out += ",\"outputTruncated\":";
    out += result.outputTruncated ? "true" : "false";
    out += ",\"containmentVerified\":";
    out += result.containmentVerified ? "true" : "false";
    out += ",\"inputDetached\":";
    out += result.inputDetached ? "true" : "false";
    out += ",\"hostJob\":{\"detected\":";
    out += result.hostJobDetected ? "true" : "false";
    out += ",\"breakaway\":\"";
    out += result.hostJobBreakaway;
    out += "\",\"limitFlags\":";
    out += std::to_string(static_cast<unsigned long>(result.hostJobLimitFlags));
    out += ",\"childJobAssignmentVerified\":";
    out += result.childJobAssignmentVerified ? "true" : "false";
    out += "}";
    out += ",\"tokenAudit\":{\"source\":\"suspended_child_process_token\",\"verified\":";
    out += result.tokenAudit.verified ? "true" : "false";
    out += ",\"isRestricted\":";
    out += result.tokenAudit.isRestricted ? "true" : "false";
    out += ",\"tokenType\":\"";
    out += result.tokenAudit.isPrimary ? "primary" : "not_primary";
    out += "\",\"restrictedSidSetVerified\":";
    out += result.tokenAudit.restrictedSidSetVerified ? "true" : "false";
    out += ",\"userRestrictedSid\":";
    out += result.tokenAudit.userRestrictedSid ? "true" : "false";
    out += ",\"worldRestrictedSid\":";
    out += result.tokenAudit.worldRestrictedSid ? "true" : "false";
    out += ",\"administratorsRestrictedSid\":";
    out += result.tokenAudit.administratorsRestrictedSid ? "true" : "false";
    out += ",\"restrictedSidCount\":";
    out += std::to_string(static_cast<unsigned long>(result.tokenAudit.restrictedSidCount));
    out += ",\"integritySid\":\"";
    out += JsonEscape(result.tokenAudit.integritySid);
    out += "\",\"integrityRid\":";
    out += std::to_string(static_cast<unsigned long>(result.tokenAudit.integrityRid));
    out += "}";
    out += ",\"stdoutSize\":";
    out += std::to_string(static_cast<long long>(result.stdoutBytes.size()));
    out += ",\"stderrSize\":";
    out += std::to_string(static_cast<long long>(result.stderrBytes.size()));
    out += ",\"stdoutBase64\":\"";
    out += Base64Encode(result.stdoutBytes.data(), result.stdoutBytes.size());
    out += "\",\"stderrBase64\":\"";
    out += Base64Encode(result.stderrBytes.data(), result.stderrBytes.size());
    out += "\",\"aclChanges\":[";
    for (size_t i = 0; i < result.aclChanges.size(); ++i) {
        const AclChangeRecord& rec = result.aclChanges[i];
        if (i) out += ",";
        out += "{\"path\":\"";
        out += JsonEscape(rec.path);
        out += "\",\"mechanism\":\"";
        out += JsonEscape(rec.mechanism);
        out += "\",\"applied\":";
        out += rec.applied ? "true" : "false";
        out += ",\"verified\":";
        out += rec.verified ? "true" : "false";
        out += ",\"rolledBack\":";
        out += rec.rolledBack ? "true" : "false";
        out += ",\"error\":\"";
        out += JsonEscape(rec.error);
        out += "\"}";
    }
    out += "]}";
    return out;
}

std::string RenderStartedJson(const std::string& requestId, const ProcessResult& result) {
    std::string out = "{\"schemaVersion\":2,\"type\":\"execution_started\",\"requestId\":\"";
    out += JsonEscape(Utf8ToUtf16(requestId));
    out += "\",\"profileId\":\"" + JsonEscape(result.profileId);
    out += "\",\"helperPid\":";
#ifdef _WIN32
    out += std::to_string(static_cast<unsigned long>(GetCurrentProcessId()));
#else
    out += "0";
#endif
    out += ",\"childPid\":" + std::to_string(static_cast<unsigned long>(result.childPid));
    out += ",\"ready\":{\"childJobAssignmentVerified\":";
    out += result.childJobAssignmentVerified ? "true" : "false";
    out += ",\"inputDetached\":"; out += result.inputDetached ? "true" : "false";
    out += ",\"stdoutCaptureReady\":"; out += result.stdoutCaptureReady ? "true" : "false";
    out += ",\"stderrCaptureReady\":"; out += result.stderrCaptureReady ? "true" : "false";
    out += "},\"tokenAudit\":{\"source\":\"suspended_child_process_token\",\"verified\":";
    out += result.tokenAudit.verified ? "true" : "false";
    out += ",\"tokenMode\":\"current_user\",\"restrictedToken\":";
    out += result.tokenAudit.isRestricted ? "true" : "false";
    out += ",\"tokenType\":\"";
    out += result.tokenAudit.isPrimary ? "primary" : "not_primary";
    out += "\",\"sameUser\":"; out += result.tokenAudit.sameUser ? "true" : "false";
    out += ",\"lowIntegrity\":"; out += result.tokenAudit.lowIntegrity ? "true" : "false";
    out += ",\"integritySid\":\"" + JsonEscape(result.tokenAudit.integritySid) + "\",\"integrityRid\":";
    out += std::to_string(static_cast<unsigned long>(result.tokenAudit.integrityRid));
    out += "}}";
    return out;
}

std::string RenderErrorJson(const std::string& requestId, const char* code,
                            const std::string& message, int schemaVersion) {
    std::string out = std::string("{\"") + (schemaVersion == 2 ? "schemaVersion" : "schema_version") +
                      "\":" + std::to_string(schemaVersion) +
                      ",\"type\":\"error\",\"requestId\":\"";
    out += JsonEscape(Utf8ToUtf16(requestId));
    out += "\",\"error\":\"";
    out += code;
    out += "\",\"message\":\"";
    out += JsonEscape(Utf8ToUtf16(message));
    out += "\"}";
    return out;
}

}  // namespace spike02
