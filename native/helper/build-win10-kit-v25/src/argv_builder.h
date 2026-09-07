/**
 * helper/argv_builder.h — Command-line construction for the D-013 helper.
 *
 * Builds Windows command lines for direct argv programs and for the explicitly
 * bound cmd.exe /d /s /c command payload used by the D-013 v2 profile.
 */

#ifndef SPIKE02_ARGV_BUILDER_H
#define SPIKE02_ARGV_BUILDER_H

#include <string>
#include <vector>

namespace spike02 {

// Quote one argument for the Windows command line. Returns the argument with
// surrounding quotes added when required (empty, whitespace, or embedded
// quotes), escaping internal quotes as \" and handling trailing backslashes
// before a quote.
std::wstring QuoteArg(const std::wstring& arg);

// Build a full command line from an executable and its argv (excluding argv[0]
// semantics: `executable` is the application path, `argv` the argument list).
std::wstring BuildCommandLine(const std::wstring& executable,
                              const std::vector<std::wstring>& argv);

// Build the cmd.exe v2 launch form while independently checking the exact
// /d /s /c argv and argv[3] == command binding. cmd.exe does not use CRT
// backslash escaping for quotes inside its command payload, so the payload is
// appended verbatim rather than passed through QuoteArg. Returns false for an
// invalid binding and leaves output empty.
bool BuildCmdVerbatimCommandLine(const std::wstring& executable,
                                 const std::vector<std::wstring>& argv,
                                 const std::wstring& command,
                                 std::wstring* output);

}  // namespace spike02

#endif  // SPIKE02_ARGV_BUILDER_H
