# A9-36 fixed ordinary-desktop entry. Windows PowerShell 5.1, UTF-8 source, ASCII diagnostics.
# Does not install, schedule, elevate or accept executable commands from a request.
param(
  [Parameter(Mandatory=$true)][string]$AuthorityFile,
  [Parameter(Mandatory=$true)][string]$AuthoritySha256,
  [Parameter(Mandatory=$true)][ValidateSet('m4','m1','m2','m3','m6','m5')][string]$Phase
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
if ($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1) { throw 'A9_36_POWERSHELL_VERSION' }
if ([Environment]::OSVersion.Version.ToString() -notmatch '^6\.1\.7601') { throw 'A9_36_OS' }
function File-Sha([string]$value) {
  $stream=[IO.File]::OpenRead($value)
  try { $algorithm=New-Object Security.Cryptography.SHA256Managed; return ([BitConverter]::ToString($algorithm.ComputeHash($stream)) -replace '-','').ToLower() }
  finally { $stream.Close() }
}
if ($AuthoritySha256 -notmatch '^[a-f0-9]{64}$' -or (File-Sha $AuthorityFile) -ne $AuthoritySha256) { throw 'A9_36_AUTHORITY_PIN' }
$a=[IO.File]::ReadAllText($AuthorityFile,[Text.Encoding]::UTF8)|ConvertFrom-Json
if ($a.task -ne 'A9-36' -or $a.status -ne 'OWNER_APPROVED') { throw 'A9_36_AUTHORITY_STATUS' }
$inputRoot=Split-Path -Parent $MyInvocation.MyCommand.Path
if ([IO.Path]::GetFullPath($AuthorityFile) -ne [IO.Path]::Combine($inputRoot,'authority.json')) { throw 'A9_36_AUTHORITY_LOCATION' }
foreach ($item in @('a9-alpha2-supplement.cjs','a9-alpha2-supplement-request.cjs','a9-alpha2-supplement-desktop.ps1','a9-batch2-driver-entry.cjs')) {
  if ((File-Sha ([IO.Path]::Combine($inputRoot,$item))) -ne $a.inputs.$item) { throw 'A9_36_INPUT_CHANGED' }
}
$electron=[IO.Path]::Combine([string]$a.candidate_root,'electron.exe')
if ((File-Sha $electron) -ne $a.runtime_sha256) { throw 'A9_36_RUNTIME_CHANGED' }
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class A236Native {
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool IsProcessInJob(IntPtr process,IntPtr job,out bool result);
 [DllImport("kernel32.dll")] public static extern IntPtr GetCurrentProcess();
}
"@
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$principal=New-Object Security.Principal.WindowsPrincipal($identity)
$groups=(& whoami.exe /groups /fo csv /nh)|Out-String
$integrity='Unknown'
if ($groups -match 'S-1-16-8192') { $integrity='Medium' }
if ($groups -match 'S-1-16-12288|S-1-16-16384|S-1-16-4096') { throw 'A9_36_INTEGRITY' }
$job=$false
if (-not [A236Native]::IsProcessInJob([A236Native]::GetCurrentProcess(),[IntPtr]::Zero,[ref]$job)) { throw 'A9_36_JOB_UNKNOWN' }
$fact=[ordered]@{machine=[Environment]::MachineName;sid=$identity.User.Value;session_id=[Diagnostics.Process]::GetCurrentProcess().SessionId;integrity=$integrity;elevated=$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator);in_job=$job}
foreach ($key in $fact.Keys) { if ($fact[$key] -cne $a.target.$key) { throw ('A9_36_TARGET_MISMATCH_'+$key) } }
$attemptRoot=[IO.Path]::Combine([string]$a.run_root,'identity')
if (-not [IO.Directory]::Exists($attemptRoot)) { [void][IO.Directory]::CreateDirectory($attemptRoot) }
$identityFile=[IO.Path]::Combine($attemptRoot,($Phase+'.json'))
if ([IO.File]::Exists($identityFile)) { throw 'A9_36_IDENTITY_ALREADY_RECORDED' }
$bytes=(New-Object Text.UTF8Encoding($false)).GetBytes(($fact|ConvertTo-Json -Compress))
$stream=New-Object IO.FileStream($identityFile,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
try { $stream.Write($bytes,0,$bytes.Length) } finally { $stream.Close() }
# All argument paths are bounded by the Node validator; prohibit quoting/metacharacter ambiguity here too.
foreach ($value in @($AuthorityFile,$identityFile,$inputRoot)) { if ($value -match '["\r\n\x00%]' -or $value.EndsWith('\')) { throw 'A9_36_ARGUMENT_PATH' } }
# electron.exe is a GUI-subsystem program. The second Win7 attempt failed with EPIPE inside the orchestrator when it was called with "&" and
# captured by assignment. The cause is a hypothesis (PowerShell does not wait for a GUI program nor keep its stdout pipe), not confirmed on the target.
# Start it as a .NET process, read both streams as UTF-8 (the orchestrator writes UTF-8), wait for its exit and pass the text on as exact UTF-8 bytes.
function Write-RawText($stream,[string]$text) {
  $bytes=(New-Object Text.UTF8Encoding($false)).GetBytes($text)
  $stream.Write($bytes,0,$bytes.Length)
  $stream.Flush()
}
function Invoke-Electron([string[]]$ArgumentList) {
  $info=New-Object Diagnostics.ProcessStartInfo
  $info.FileName=$electron
  $info.Arguments=((@($ArgumentList)|ForEach-Object { '"'+$_+'"' }) -join ' ')
  $info.UseShellExecute=$false
  $info.RedirectStandardOutput=$true
  $info.RedirectStandardError=$true
  $info.StandardOutputEncoding=[Text.Encoding]::UTF8
  $info.StandardErrorEncoding=[Text.Encoding]::UTF8
  $process=[Diagnostics.Process]::Start($info)
  $outTask=$process.StandardOutput.ReadToEndAsync()
  $errTask=$process.StandardError.ReadToEndAsync()
  $process.WaitForExit()
  [void][Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($outTask,$errTask))
  return [pscustomobject]@{ ExitCode=$process.ExitCode; Output=$outTask.Result; Error=$errTask.Result }
}
$oldNode=$env:ELECTRON_RUN_AS_NODE
$oldOptions=$env:NODE_OPTIONS
try {
  $env:ELECTRON_RUN_AS_NODE='1'
  $env:NODE_OPTIONS=''
  $orchestrator=[IO.Path]::Combine($inputRoot,'a9-alpha2-supplement.cjs')
  $issue=Invoke-Electron @($orchestrator,'--issue',$AuthorityFile,$AuthoritySha256,$identityFile,$Phase)
  if ($issue.ExitCode -ne 0) { Write-RawText ([Console]::OpenStandardError()) $issue.Error; throw 'A9_36_REQUEST_ISSUE_FAILED' }
  $RequestFile=$issue.Output.TrimEnd([char[]]"`r`n")
  if ($RequestFile -cne [IO.Path]::Combine([string]$a.run_root,('requests\'+$Phase+'.json'))) { throw 'A9_36_REQUEST_ISSUE_PATH' }
  $run=Invoke-Electron @($orchestrator,'--run',$AuthorityFile,$AuthoritySha256,$RequestFile,$identityFile,$Phase)
  Write-RawText ([Console]::OpenStandardOutput()) $run.Output
  Write-RawText ([Console]::OpenStandardError()) $run.Error
  $result=$run.ExitCode
} finally {
  $env:ELECTRON_RUN_AS_NODE=$oldNode
  $env:NODE_OPTIONS=$oldOptions
}
exit $result
