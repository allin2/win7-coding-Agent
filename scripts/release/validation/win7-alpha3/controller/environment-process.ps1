# ADR-0256: classification only, never an owner/session/identity or termination exception.
function Test-EnvironmentProcess([string]$image) {
  if ([string]::IsNullOrEmpty($image)) { return $false }
  # Exact root segments and leaf, no traversal/device/alternate-stream aliases.
  $pattern = '\AC:\\Program Files \(x86\)\\SogouInput\\(?:(?!\.{1,2}\\)[^\\/:*?"<>|\x00-\x1f]+\\)*SGTool\.exe\z'
  return [regex]::IsMatch($image,$pattern,([Text.RegularExpressions.RegexOptions]::IgnoreCase -bor [Text.RegularExpressions.RegexOptions]::CultureInvariant))
}
function Environment-Record($p,[string]$state) {
  return ('{"schema":"writer-registry-v2","policy":"ADR-0256","role":"environment","state":' + (J $state) + ',"pid":' + $p.ProcessId + ',"ppid":' + $p.ParentProcessId + ',"creation_date":' + (J $p.CreationDate) + ',"image_path":' + (J $p.ExecutablePath) + ',"os_exit_observed":"UNKNOWN_UNTIL_HANDLE_OBSERVATION"}')
}
