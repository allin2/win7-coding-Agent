/**
 * helper/json_parser.cpp — Platform-neutral JSON parser implementation.
 *
 * Parser contract:
 *  - Input is one complete UTF-8 JSON document (no trailing garbage).
 *  - Strings are decoded to UTF-16 (surrogate pairs handled on Windows via
 *    MultiByteToWideChar; on other platforms via a small built-in decoder).
 *  - Numbers use strtod; no arbitrary-precision requirement for this protocol.
 *  - Nesting depth is bounded (kMaxJsonDepth) and the input size is bounded
 *    by the caller (kMaxJsonInputBytes) to keep processing bounded.
 */

#include "json_parser.h"

#include <cerrno>
#include <cmath>
#include <cstdlib>

#ifdef _WIN32
#include <windows.h>
#endif

namespace spike02 {
namespace {

struct Cursor {
    const char* p;
    const char* end;
    int depth;
    std::string* error;
};

void Fail(Cursor* c, const char* message) {
    if (c->error && c->error->empty()) {
        *c->error = message;
    }
}

void SkipWs(Cursor* c) {
    while (c->p < c->end) {
        const char ch = *c->p;
        if (ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r') {
            ++c->p;
        } else {
            break;
        }
    }
}

bool ParseValue(Cursor* c, JsonValue* out);

bool ParseHex4(Cursor* c, unsigned* value) {
    *value = 0;
    if (c->end - c->p < 4) {
        return false;
    }
    for (int i = 0; i < 4; ++i) {
        const char ch = c->p[i];
        unsigned digit;
        if (ch >= '0' && ch <= '9') digit = static_cast<unsigned>(ch - '0');
        else if (ch >= 'a' && ch <= 'f') digit = static_cast<unsigned>(ch - 'a' + 10);
        else if (ch >= 'A' && ch <= 'F') digit = static_cast<unsigned>(ch - 'A' + 10);
        else return false;
        *value = (*value << 4) | digit;
    }
    c->p += 4;
    return true;
}

// Append a UTF-16 code unit (handles surrogate pairs assembled by the caller).
void AppendUtf16(std::wstring* out, unsigned code) {
    if (code <= 0xFFFF) {
        out->push_back(static_cast<wchar_t>(code));
    } else {
        code -= 0x10000;
        out->push_back(static_cast<wchar_t>(0xD800 + (code >> 10)));
        out->push_back(static_cast<wchar_t>(0xDC00 + (code & 0x3FF)));
    }
}

// Decode one UTF-8 code point at *p into *code; advances p. Returns false on
// invalid sequences.
bool DecodeUtf8(const char** p, const char* end, unsigned* code) {
    const unsigned char b0 = static_cast<unsigned char>(**p);
    if (b0 < 0x80) {
        *code = b0;
        ++*p;
        return true;
    }
    int extra;
    unsigned cp;
    if ((b0 & 0xE0) == 0xC0) { extra = 1; cp = b0 & 0x1F; }
    else if ((b0 & 0xF0) == 0xE0) { extra = 2; cp = b0 & 0x0F; }
    else if ((b0 & 0xF8) == 0xF0) { extra = 3; cp = b0 & 0x07; }
    else { return false; }
    if (end - *p < extra + 1) { return false; }
    for (int i = 1; i <= extra; ++i) {
        const unsigned char bn = static_cast<unsigned char>((*p)[i]);
        if ((bn & 0xC0) != 0x80) { return false; }
        cp = (cp << 6) | (bn & 0x3F);
    }
    // Reject overlong encodings and surrogates encoded in UTF-8.
    if ((extra == 1 && cp < 0x80) || (extra == 2 && cp < 0x800) ||
        (extra == 3 && cp < 0x10000) || cp > 0x10FFFF ||
        (cp >= 0xD800 && cp <= 0xDFFF)) {
        return false;
    }
    *code = cp;
    *p += extra + 1;
    return true;
}

bool ParseString(Cursor* c, std::wstring* out) {
    if (c->p >= c->end || *c->p != '"') {
        Fail(c, "expected string");
        return false;
    }
    ++c->p;
    out->clear();
    while (c->p < c->end) {
        const char ch = *c->p;
        if (ch == '"') {
            ++c->p;
            return true;
        }
        if (ch == '\\') {
            ++c->p;
            if (c->p >= c->end) { Fail(c, "truncated escape"); return false; }
            const char esc = *c->p;
            switch (esc) {
                case '"': out->push_back(L'"'); ++c->p; break;
                case '\\': out->push_back(L'\\'); ++c->p; break;
                case '/': out->push_back(L'/'); ++c->p; break;
                case 'b': out->push_back(L'\b'); ++c->p; break;
                case 'f': out->push_back(L'\f'); ++c->p; break;
                case 'n': out->push_back(L'\n'); ++c->p; break;
                case 'r': out->push_back(L'\r'); ++c->p; break;
                case 't': out->push_back(L'\t'); ++c->p; break;
                case 'u': {
                    ++c->p;
                    unsigned first = 0;
                    if (!ParseHex4(c, &first)) { Fail(c, "bad \\u escape"); return false; }
                    if (first >= 0xD800 && first <= 0xDBFF) {
                        // High surrogate: require a low surrogate.
                        if (c->p + 1 < c->end && c->p[0] == '\\' && c->p[1] == 'u') {
                            c->p += 2;
                            unsigned second = 0;
                            if (!ParseHex4(c, &second)) { Fail(c, "bad \\u low surrogate"); return false; }
                            if (second >= 0xDC00 && second <= 0xDFFF) {
                                AppendUtf16(out, 0x10000 + ((first - 0xD800) << 10) + (second - 0xDC00));
                                break;
                            }
                        }
                        Fail(c, "unpaired high surrogate");
                        return false;
                    }
                    if (first >= 0xDC00 && first <= 0xDFFF) {
                        Fail(c, "unpaired low surrogate");
                        return false;
                    }
                    out->push_back(static_cast<wchar_t>(first));
                    break;
                }
                default:
                    Fail(c, "unknown escape");
                    return false;
            }
            continue;
        }
        // Raw UTF-8 byte sequence.
        unsigned cp = 0;
        const char* start = c->p;
        if (!DecodeUtf8(&c->p, c->end, &cp)) {
            c->p = start;
            Fail(c, "invalid UTF-8 in string");
            return false;
        }
        AppendUtf16(out, cp);
    }
    Fail(c, "unterminated string");
    return false;
}

bool ParseNumber(Cursor* c, JsonValue* out) {
    const char* start = c->p;
    if (c->p < c->end && (*c->p == '-' || *c->p == '+')) ++c->p;
    bool digits = false;
    while (c->p < c->end && *c->p >= '0' && *c->p <= '9') { ++c->p; digits = true; }
    if (!digits) { Fail(c, "bad number"); return false; }
    if (c->p < c->end && *c->p == '.') {
        ++c->p;
        while (c->p < c->end && *c->p >= '0' && *c->p <= '9') ++c->p;
    }
    if (c->p < c->end && (*c->p == 'e' || *c->p == 'E')) {
        ++c->p;
        if (c->p < c->end && (*c->p == '-' || *c->p == '+')) ++c->p;
        while (c->p < c->end && *c->p >= '0' && *c->p <= '9') ++c->p;
    }
    std::string token(start, c->p);
    errno = 0;
    char* endp = nullptr;
    const double value = std::strtod(token.c_str(), &endp);
    if (errno == ERANGE || !endp || *endp != '\0') {
        Fail(c, "number out of range");
        return false;
    }
    out->type = JsonValue::Type::Number;
    out->number = value;
    return true;
}

bool ParseArray(Cursor* c, JsonValue* out) {
    ++c->p;  // '['
    out->type = JsonValue::Type::Array;
    if (c->depth >= kMaxJsonDepth) { Fail(c, "nesting too deep"); return false; }
    SkipWs(c);
    if (c->p < c->end && *c->p == ']') { ++c->p; return true; }
    while (true) {
        SkipWs(c);
        JsonValue item;
        ++c->depth;
        const bool ok = ParseValue(c, &item);
        --c->depth;
        if (!ok) return false;
        out->array.push_back(std::move(item));
        SkipWs(c);
        if (c->p >= c->end) { Fail(c, "unterminated array"); return false; }
        if (*c->p == ',') { ++c->p; continue; }
        if (*c->p == ']') { ++c->p; return true; }
        Fail(c, "expected ',' or ']'");
        return false;
    }
}

bool ParseObject(Cursor* c, JsonValue* out) {
    ++c->p;  // '{'
    out->type = JsonValue::Type::Object;
    if (c->depth >= kMaxJsonDepth) { Fail(c, "nesting too deep"); return false; }
    SkipWs(c);
    if (c->p < c->end && *c->p == '}') { ++c->p; return true; }
    while (true) {
        SkipWs(c);
        std::wstring key;
        if (!ParseString(c, &key)) return false;
        SkipWs(c);
        if (c->p >= c->end || *c->p != ':') { Fail(c, "expected ':'"); return false; }
        ++c->p;
        SkipWs(c);
        JsonValue value;
        ++c->depth;
        const bool ok = ParseValue(c, &value);
        --c->depth;
        if (!ok) return false;
        out->object.emplace_back(std::move(key), std::move(value));
        SkipWs(c);
        if (c->p >= c->end) { Fail(c, "unterminated object"); return false; }
        if (*c->p == ',') { ++c->p; continue; }
        if (*c->p == '}') { ++c->p; return true; }
        Fail(c, "expected ',' or '}'");
        return false;
    }
}

bool ParseLiteral(Cursor* c, const char* literal, JsonValue::Type type) {
    const size_t len = std::char_traits<char>::length(literal);
    if (static_cast<size_t>(c->end - c->p) < len ||
        std::char_traits<char>::compare(c->p, literal, len) != 0) {
        Fail(c, "bad literal");
        return false;
    }
    c->p += len;
    (void)type;
    return true;
}

bool ParseValue(Cursor* c, JsonValue* out) {
    SkipWs(c);
    if (c->p >= c->end) { Fail(c, "unexpected end of input"); return false; }
    switch (*c->p) {
        case '{': return ParseObject(c, out);
        case '[': return ParseArray(c, out);
        case '"': return ParseString(c, &out->str) ? (out->type = JsonValue::Type::String, true) : false;
        case 't':
            if (!ParseLiteral(c, "true", JsonValue::Type::Bool)) return false;
            out->type = JsonValue::Type::Bool; out->boolean = true; return true;
        case 'f':
            if (!ParseLiteral(c, "false", JsonValue::Type::Bool)) return false;
            out->type = JsonValue::Type::Bool; out->boolean = false; return true;
        case 'n':
            if (!ParseLiteral(c, "null", JsonValue::Type::Null)) return false;
            out->type = JsonValue::Type::Null; return true;
        default:
            if (*c->p == '-' || (*c->p >= '0' && *c->p <= '9')) return ParseNumber(c, out);
            Fail(c, "unexpected token");
            return false;
    }
}

}  // namespace

std::wstring Utf8ToUtf16(const std::string& utf8) {
#ifdef _WIN32
    if (utf8.empty()) return std::wstring();
    const int needed = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, utf8.data(),
                                           static_cast<int>(utf8.size()), nullptr, 0);
    if (needed <= 0) return std::wstring();
    std::wstring result(static_cast<size_t>(needed), L'\0');
    MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, utf8.data(),
                        static_cast<int>(utf8.size()), &result[0], needed);
    return result;
#else
    std::wstring result;
    const char* p = utf8.data();
    const char* end = p + utf8.size();
    while (p < end) {
        unsigned cp = 0;
        if (!DecodeUtf8(&p, end, &cp)) {
            result.clear();
            return result;
        }
        AppendUtf16(&result, cp);
    }
    return result;
#endif
}

bool JsonParse(const std::string& utf8, JsonValue* out, std::string* error) {
    if (utf8.size() > static_cast<size_t>(kMaxJsonInputBytes)) {
        if (error) *error = "input exceeds kMaxJsonInputBytes";
        return false;
    }
    Cursor cursor{utf8.data(), utf8.data() + utf8.size(), 0, error};
    JsonValue root;
    if (!ParseValue(&cursor, &root)) return false;
    SkipWs(&cursor);
    if (cursor.p != cursor.end) {
        Fail(&cursor, "trailing characters after JSON document");
        return false;
    }
    *out = std::move(root);
    return true;
}

const JsonValue* JsonObjectGet(const JsonValue& object, const wchar_t* key) {
    if (object.type != JsonValue::Type::Object) return nullptr;
    const std::wstring needle(key);
    for (const auto& member : object.object) {
        if (member.first == needle) return &member.second;
    }
    return nullptr;
}

bool JsonAsString(const JsonValue& value, std::wstring* out) {
    if (value.type != JsonValue::Type::String) return false;
    *out = value.str;
    return true;
}

long long JsonAsInt(const JsonValue& value, long long fallback) {
    if (value.type == JsonValue::Type::Number) {
        const double n = value.number;
        if (n >= static_cast<double>(0x7FFFFFFF)) return static_cast<long long>(0x7FFFFFFF);
        if (n < 0) return 0;
        return static_cast<long long>(n);
    }
    if (value.type == JsonValue::Type::Bool) return value.boolean ? 1 : 0;
    return fallback;
}

bool JsonAsBool(const JsonValue& value, bool fallback) {
    if (value.type == JsonValue::Type::Bool) return value.boolean;
    if (value.type == JsonValue::Type::Number) return value.number != 0.0;
    return fallback;
}

}  // namespace spike02
