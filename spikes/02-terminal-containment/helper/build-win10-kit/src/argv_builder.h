/**
 * helper/argv_builder.h — Command-line construction for the D-013 helper.
 *
 * Builds a Windows command line from a structured argv array with quoting that
 * matches CommandLineToArgvW / CreateProcessW semantics (C09: structured argv,
 * never a model-concatenated shell string; C10: Chinese + space paths).
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

}  // namespace spike02

#endif  // SPIKE02_ARGV_BUILDER_H
