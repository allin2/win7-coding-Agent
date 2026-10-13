# A9-33 batch2 desktop controller (WIN7-43 tentative, ADR-0155 Proposed).
#
# Runs in the ordinary interactive desktop session of the approved user. PowerShell 2.0 compatible, ASCII only.
# It never reads a command from a request. Every action is one of the fixed ones below:
#   Run         verify one approved phase request, consume it, run the one derived packaged script, record the result
#   ClickDialog click one button of the product's own exit dialog by index (0..2) through UI Automation
# The request script (a9-batch2-desktop-request.cjs) does all JSON work, because PowerShell 2.0 has no JSON parser.
# This controller proves nothing about the product: a phase is PASS only when its phase-result.json says PASS.
param(
  [string]$Action = 'Run',
  [string]$RequestFile = '',
  [string]$ProcessId = '',
  [string]$ButtonIndex = ''
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$candidateRoot = Split-Path -Parent $scriptDir
$electron = Join-Path $candidateRoot 'electron.exe'
$requestScript = Join-Path $scriptDir 'a9-batch2-desktop-request.cjs'

function Fail([string]$message, [int]$code) {
  [Console]::Error.WriteLine($message)
  exit $code
}

function Quote-Arg([string]$value) {
  if ($value -eq $null) { return '""' }
  return '"' + ($value -replace '"', '\"') + '"'
}

function Get-Sha256Hex([string]$path) {
  $stream = [System.IO.File]::OpenRead($path)
  try {
    $sha = New-Object System.Security.Cryptography.SHA256Managed
    $bytes = $sha.ComputeHash($stream)
    return ([System.BitConverter]::ToString($bytes) -replace '-', '').ToLower()
  } finally { $stream.Close() }
}

# Runs the packaged electron.exe in its Node mode and returns exit code plus stdout/stderr text (small outputs only).
function Invoke-Node([string[]]$arguments) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $electron
  $psi.Arguments = (($arguments | ForEach-Object { Quote-Arg $_ }) -join ' ')
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  $psi.EnvironmentVariables['ELECTRON_RUN_AS_NODE'] = '1'
  if ($psi.EnvironmentVariables.ContainsKey('NODE_OPTIONS')) { $psi.EnvironmentVariables.Remove('NODE_OPTIONS') }
  $process = [System.Diagnostics.Process]::Start($psi)
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  return New-Object PSObject -Property @{ Code = $process.ExitCode; Out = $stdout; Err = $stderr }
}

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class B2Native {
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool IsProcessInJob(IntPtr process, IntPtr job, out bool result);
}
"@

function Get-IntegrityLevel {
  $groups = (& whoami.exe /groups /fo csv /nh) -join "`n"
  if ($groups -match 'S-1-16-4096') { return 'Low' }
  if ($groups -match 'S-1-16-8192') { return 'Medium' }
  if ($groups -match 'S-1-16-12288') { return 'High' }
  if ($groups -match 'S-1-16-16384') { return 'System' }
  return 'Unknown'
}

function Get-ControllerIdentity {
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
  # Job membership is a three-valued fact: 'true', 'false', or 'unknown' when the API call itself failed.
  # An unknown value is never written as false; the request script then refuses the request (the approved value is a boolean).
  $inJob = $false
  $jobQueryOk = [B2Native]::IsProcessInJob([System.Diagnostics.Process]::GetCurrentProcess().Handle, [IntPtr]::Zero, [ref]$inJob)
  if ($jobQueryOk) { $jobText = $inJob.ToString().ToLower() } else { $jobText = 'unknown' }
  return New-Object PSObject -Property @{
    MachineName = [System.Environment]::MachineName
    AccountName = $identity.Name
    AccountSid = $identity.User.Value
    Integrity = (Get-IntegrityLevel)
    SessionId = [System.Diagnostics.Process]::GetCurrentProcess().SessionId
    Elevated = $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
    InJob = $jobText
  }
}

function Json-Escape([string]$value) {
  return ($value -replace '\\', '\\' -replace '"', '\"')
}

# ---- ClickDialog -------------------------------------------------------------------------------------------------
if ($Action -eq 'ClickDialog') {
  $pidValue = 0
  $indexValue = -1
  if (-not [int]::TryParse($ProcessId, [ref]$pidValue) -or $pidValue -lt 1) { Fail 'ClickDialog needs a numeric -ProcessId.' 2 }
  if (-not [int]::TryParse($ButtonIndex, [ref]$indexValue) -or $indexValue -lt 0 -or $indexValue -gt 2) { Fail 'ClickDialog needs -ButtonIndex 0, 1 or 2.' 2 }
  # Labels of the product exit dialog, written as code points so this file stays ASCII.
  $labels = @(
    ([string][char]0x505C + [char]0x6B62 + [char]0x540E + [char]0x9000 + [char]0x51FA),
    ([string][char]0x7559 + [char]0x7ED9 + [char]0x7CFB + [char]0x7EDF + [char]0x540E + [char]0x9000 + [char]0x51FA),
    ([string][char]0x53D6 + [char]0x6D88)
  )
  [void][System.Reflection.Assembly]::LoadWithPartialName('UIAutomationClient')
  [void][System.Reflection.Assembly]::LoadWithPartialName('UIAutomationTypes')
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $byProcess = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $pidValue)
  $deadline = (Get-Date).AddSeconds(30)
  $clicked = $false
  while ((Get-Date) -lt $deadline -and -not $clicked) {
    $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $byProcess)
    foreach ($window in $windows) {
      $isButton = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
      $buttons = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $isButton)
      foreach ($button in $buttons) {
        $name = $button.Current.Name
        if ($name -and ($name.Replace('&', '') -eq $labels[$indexValue])) {
          $pattern = $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
          $pattern.Invoke()
          $clicked = $true
          break
        }
      }
      if ($clicked) { break }
    }
    if (-not $clicked) { Start-Sleep -Milliseconds 500 }
  }
  if (-not $clicked) { Fail 'The exit dialog button was not found within 30 seconds.' 3 }
  Write-Output ('clicked index ' + $indexValue)
  exit 0
}

# ---- Run ----------------------------------------------------------------------------------------------------------
if ($Action -ne 'Run') { Fail 'Unknown -Action. Allowed: Run, ClickDialog.' 2 }
if (-not $RequestFile -or -not (Test-Path -LiteralPath $RequestFile)) { Fail 'Run needs an existing -RequestFile.' 2 }
if (-not (Test-Path -LiteralPath $electron)) { Fail 'electron.exe was not found next to the validation folder.' 2 }

$requestFull = (Resolve-Path -LiteralPath $RequestFile).Path
$manifestSha = Get-Sha256Hex (Join-Path $candidateRoot 'release-manifest.json')
$kitSha = Get-Sha256Hex (Join-Path $candidateRoot 'A9_BATCH2_VALIDATION_KIT.json')
$identity = Get-ControllerIdentity

# The evidence root is named inside the request; the request script reads it, so nothing is derived from file names.
$common = @($requestScript)
$verifyArgs = $common + @('argv', ('--request=' + $requestFull), '--format=lines', ('--manifest-sha256=' + $manifestSha), ('--kit-sha256=' + $kitSha),
  ('--actual-machine-name=' + $identity.MachineName), ('--actual-account-sid=' + $identity.AccountSid), ('--actual-integrity-level=' + $identity.Integrity),
  ('--actual-session-id=' + $identity.SessionId), ('--actual-elevated=' + $identity.Elevated.ToString().ToLower()), ('--actual-in-job=' + $identity.InJob))
$derived = Invoke-Node $verifyArgs
if ($derived.Code -ne 0) { Fail ('The request was refused: ' + $derived.Out + $derived.Err) 4 }
$lines = @($derived.Out -split "`n" | ForEach-Object { $_.TrimEnd("`r") } | Where-Object { $_ -ne '' })
if ($lines.Count -lt 2) { Fail 'The request script returned no command.' 4 }
$program = $lines[0]
$arguments = @($lines[1..($lines.Count - 1)])
if ((Split-Path -Leaf $program).ToLower() -ne 'electron.exe') { Fail 'The derived program is not electron.exe.' 4 }

$consumeArgs = $common + @('consume', ('--request=' + $requestFull), ('--manifest-sha256=' + $manifestSha), ('--kit-sha256=' + $kitSha))
$consumed = Invoke-Node $consumeArgs
if ($consumed.Code -ne 0) { Fail ('The request could not be consumed: ' + $consumed.Out + $consumed.Err) 4 }
$attemptLine = ($consumed.Out | Select-String -Pattern '"attempt_directory":"([^"]+)"' | ForEach-Object { $_.Matches[0].Groups[1].Value })
if (-not $attemptLine) { Fail 'The consume step did not name an attempt directory.' 4 }
$attemptDir = $attemptLine -replace '\\\\', '\'

if ($identity.InJob -eq 'unknown') { $jobJson = 'null' } else { $jobJson = $identity.InJob }
$identityJson = '{"machine_name":"' + (Json-Escape $identity.MachineName) + '","account_name":"' + (Json-Escape $identity.AccountName) + '","account_sid":"' + $identity.AccountSid +
  '","integrity_level":"' + $identity.Integrity + '","session_id":' + $identity.SessionId + ',"elevated":' + $identity.Elevated.ToString().ToLower() + ',"in_job":' + $jobJson + '}'
[System.IO.File]::WriteAllText((Join-Path $attemptDir 'controller-identity.json'), $identityJson + "`n", (New-Object System.Text.UTF8Encoding($false)))

$env:ELECTRON_RUN_AS_NODE = '1'
if (Test-Path Env:\NODE_OPTIONS) { Remove-Item Env:\NODE_OPTIONS }
$quoted = ($arguments | ForEach-Object { Quote-Arg $_ }) -join ' '
$stdoutFile = Join-Path $attemptDir 'controller-stdout.txt'
$stderrFile = Join-Path $attemptDir 'controller-stderr.txt'
$phaseProcess = Start-Process -FilePath $program -ArgumentList $quoted -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile -PassThru -NoNewWindow
$null = $phaseProcess.Handle
$phaseProcess.WaitForExit()
$exitCode = $phaseProcess.ExitCode

$completeArgs = $common + @('complete', ('--request=' + $requestFull), '--result=auto', ('--exit-code=' + $exitCode))
$completed = Invoke-Node $completeArgs
if ($completed.Code -ne 0) { Fail ('The ledger completion failed: ' + $completed.Out + $completed.Err) 5 }
Write-Output $completed.Out
exit $exitCode
