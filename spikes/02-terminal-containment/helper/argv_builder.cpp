/**
 * helper/argv_builder.cpp — Command-line construction implementation.
 *
 * Quoting rule (matching MSDN "Parsing C++ command-line arguments" and the
 * CommandLineToArgvW behavior): an argument is quoted when it is empty or
 * contains space/tab or a quote; internal quotes are escaped as \" and any
 * run of backslashes immediately before a quote is doubled.
 */

#include "argv_builder.h"

namespace spike02 {

std::wstring QuoteArg(const std::wstring& arg) {
    if (arg.empty()) return L"\"\"";
    bool needsQuote = false;
    for (wchar_t ch : arg) {
        if (ch == L' ' || ch == L'\t' || ch == L'"') {
            needsQuote = true;
            break;
        }
    }
    if (!needsQuote) return arg;

    std::wstring out;
    out.push_back(L'"');
    size_t backslashes = 0;
    for (wchar_t ch : arg) {
        if (ch == L'\\') {
            ++backslashes;
            continue;
        }
        if (ch == L'"') {
            // Double the run of backslashes preceding the quote, then escape
            // the quote itself.
            out.append(backslashes * 2 + 1, L'\\');
            out.push_back(L'"');
            backslashes = 0;
            continue;
        }
        out.append(backslashes, L'\\');
        backslashes = 0;
        out.push_back(ch);
    }
    // Trailing backslashes before the closing quote are doubled.
    out.append(backslashes * 2, L'\\');
    out.push_back(L'"');
    return out;
}

std::wstring BuildCommandLine(const std::wstring& executable,
                              const std::vector<std::wstring>& argv) {
    std::wstring line = QuoteArg(executable);
    for (const std::wstring& arg : argv) {
        line.push_back(L' ');
        line += QuoteArg(arg);
    }
    return line;
}

}  // namespace spike02
