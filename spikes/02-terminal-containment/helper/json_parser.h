/**
 * helper/json_parser.h — Platform-neutral JSON parser (UTF-8 input) for the
 * SPIKE_02 / D-013 helper protocol.
 *
 * The helper intentionally does not link a third-party JSON library
 * (D-013 profile: Win32 API + CRT only). This parser is a small recursive
 * descent parser covering exactly the flat request object the helper needs:
 * string/number/bool/null/array/object values, UTF-8 strings, \uXXXX escapes.
 *
 * Win7-Validation: NOT_PERFORMED (Win7 runtime evidence pending WIN7_LEASE_GRANTED)
 * Build: MSVC v142 (Windows), clang/g++ (macOS logic tests), MinGW (compile check)
 */

#ifndef SPIKE02_JSON_PARSER_H
#define SPIKE02_JSON_PARSER_H

#include <string>
#include <vector>
#include <utility>

namespace spike02 {

// Parsed JSON value. For the helper protocol only object/array/string/number/
// bool/null are needed; other shapes are rejected by the config extractor.
struct JsonValue {
    enum class Type { Null, Bool, Number, String, Array, Object };
    Type type = Type::Null;
    bool boolean = false;
    double number = 0.0;
    std::wstring str;                                        // decoded UTF-16 string
    std::vector<JsonValue> array;                            // array items
    std::vector<std::pair<std::wstring, JsonValue>> object;  // object members
};

// Maximum nesting depth accepted by the parser (bounded processing, N05-adjacent).
constexpr int kMaxJsonDepth = 32;

// Maximum UTF-8 input accepted for a single request line.
constexpr int kMaxJsonInputBytes = 64 * 1024;

// Decode a UTF-8 byte string to UTF-16. On Windows this is MultiByteToWideChar
// (CP_UTF8); on non-Windows platforms a small built-in decoder is used so the
// parser can be unit-tested on the build machine.
std::wstring Utf8ToUtf16(const std::string& utf8);

// Parse a complete UTF-8 JSON document. Returns true on success. On failure
// writes a reason string into *error.
bool JsonParse(const std::string& utf8, JsonValue* out, std::string* error);

// Find an object member by key (first match). Returns nullptr when missing.
const JsonValue* JsonObjectGet(const JsonValue& object, const wchar_t* key);

// Convert a JSON string value to a std::wstring. Returns false when the value
// is not a string.
bool JsonAsString(const JsonValue& value, std::wstring* out);

// Convert a JSON number/bool to an integer with bounds; returns the provided
// default when the value is missing or not a number.
long long JsonAsInt(const JsonValue& value, long long fallback);

// Convert a JSON bool with a default.
bool JsonAsBool(const JsonValue& value, bool fallback);

}  // namespace spike02

#endif  // SPIKE02_JSON_PARSER_H
