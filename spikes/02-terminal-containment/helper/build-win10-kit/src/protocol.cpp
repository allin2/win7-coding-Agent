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

}  // namespace

bool ParseJsonConfig(const std::string& jsonUtf8, ProcessConfig* config,
                     std::string* error) {
    JsonValue root;
    if (!JsonParse(jsonUtf8, &root, error)) return false;
    if (root.type != JsonValue::Type::Object) {
        *error = "request must be a JSON object";
        return false;
    }

    const JsonValue* requestId = JsonObjectGet(root, L"requestId");
    if (requestId) JsonAsString(*requestId, &config->requestId);

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
    out += ",\"canceled\":";
    out += result.canceled ? "true" : "false";
    out += ",\"outputTruncated\":";
    out += result.outputTruncated ? "true" : "false";
    out += ",\"containmentVerified\":";
    out += result.containmentVerified ? "true" : "false";
    out += ",\"inputDetached\":";
    out += result.inputDetached ? "true" : "false";
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

std::string RenderErrorJson(const std::string& requestId, const char* code,
                            const std::string& message) {
    std::string out = "{\"schema_version\":1,\"type\":\"error\",\"requestId\":\"";
    out += JsonEscape(Utf8ToUtf16(requestId));
    out += "\",\"error\":\"";
    out += code;
    out += "\",\"message\":\"";
    out += JsonEscape(Utf8ToUtf16(message));
    out += "\"}";
    return out;
}

}  // namespace spike02
