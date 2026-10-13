# A9-33 batch2 desktop controller (WIN7-43 tentative, ADR-0155 Proposed).
#
# Runs in the ordinary interactive desktop session of the approved user. PowerShell 2.0 compatible, ASCII only.
# It never reads a command from a request. Every action is one of the fixed ones below:
#   Run         verify one approved phase request, consume it, run the one derived packaged script, record the result
#   ClickDialog click one button of the product's own exit dialog by index (0..2): Win32 button click, then UI Automation
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
  [DllImport("kernel32.dll")]
  public static extern IntPtr GetCurrentProcess();
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
  # Rehearsal 4 saw the query fail once with no recorded cause. It is retried up to 5 times, alternating the .NET process handle and the pseudo handle,
  # and the number of attempts and the last Win32 error are kept so a refusal explains itself. A failure after all attempts stays 'unknown'.
  $inJob = $false
  $jobQueryOk = $false
  $jobAttempts = 0
  $jobLastError = 0
  while ((-not $jobQueryOk) -and ($jobAttempts -lt 5)) {
    $jobAttempts = $jobAttempts + 1
    if (($jobAttempts % 2) -eq 1) { $jobHandle = [System.Diagnostics.Process]::GetCurrentProcess().Handle } else { $jobHandle = [B2Native]::GetCurrentProcess() }
    $jobQueryOk = [B2Native]::IsProcessInJob($jobHandle, [IntPtr]::Zero, [ref]$inJob)
    if (-not $jobQueryOk) {
      $jobLastError = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
      Start-Sleep -Milliseconds 300
    }
  }
  if ($jobQueryOk) { $jobText = $inJob.ToString().ToLower() } else { $jobText = 'unknown' }
  return New-Object PSObject -Property @{
    MachineName = [System.Environment]::MachineName
    AccountName = $identity.Name
    AccountSid = $identity.User.Value
    Integrity = (Get-IntegrityLevel)
    SessionId = [System.Diagnostics.Process]::GetCurrentProcess().SessionId
    Elevated = $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
    InJob = $jobText
    InJobAttempts = $jobAttempts
    InJobLastError = $jobLastError
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

  # The exit dialog is a native dialog window (class #32770) of the product process. Two ways to press its button are tried in turn:
  # 1. the push button window of that dialog (BM_CLICK, what a user click sends), 2. UI Automation Invoke on a button of a #32770 window of
  # the same process. UI Automation never walks the product's Chromium window, and the Win32 search sends no message to it. A miss writes
  # what was seen to stderr (ASCII only), because the Win7 desktop cannot be inspected from outside; the first run of this action
  # (WIN7-43 rehearsal 2) found no button and left no trace.
  function Normalize-Label([string]$text) {
    if ($text -eq $null) { return '' }
    $plain = $text -replace '&', ''
    $plain = $plain -replace '\([A-Za-z]\)\s*$', ''
    return ($plain -replace '\s+', '')
  }
  function Ascii-Safe([string]$text) {
    if ($text -eq $null) { return '' }
    $builder = New-Object System.Text.StringBuilder
    foreach ($ch in $text.ToCharArray()) {
      $code = [int]$ch
      if ($code -ge 32 -and $code -lt 127) { [void]$builder.Append($ch) } else { [void]$builder.Append('\u' + $code.ToString('x4')) }
    }
    return $builder.ToString()
  }

  $win32Ready = $false
  $win32Error = ''
  try {
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class B2Dialog {
  private delegate bool EnumProc(IntPtr hwnd, IntPtr lparam);
  [DllImport("user32.dll")]
  private static extern bool EnumWindows(EnumProc callback, IntPtr lparam);
  [DllImport("user32.dll")]
  private static extern bool EnumChildWindows(IntPtr parent, EnumProc callback, IntPtr lparam);
  [DllImport("user32.dll")]
  private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int max);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  private static extern int GetClassName(IntPtr hwnd, StringBuilder text, int max);
  [DllImport("user32.dll")]
  private static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")]
  private static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr wparam, IntPtr lparam);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  private static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint message, UIntPtr wparam, StringBuilder lparam, uint flags, uint timeout, out UIntPtr result);
  // GetWindowText does not return the text of a control that lives in another process, so a button or label falls back to WM_GETTEXT
  // (answered within 500 ms or abandoned). Other window classes, the Chromium ones included, are never sent a message.
  private static string TextOf(IntPtr hwnd, string windowClass) {
    StringBuilder builder = new StringBuilder(512);
    GetWindowText(hwnd, builder, 512);
    string text = builder.ToString();
    if (text.Length == 0 && (windowClass == "Button" || windowClass == "Static")) {
      StringBuilder viaMessage = new StringBuilder(512);
      UIntPtr result = UIntPtr.Zero;
      SendMessageTimeout(hwnd, 0x000D, new UIntPtr(512), viaMessage, 0x0002, 500, out result);
      text = viaMessage.ToString();
    }
    return text;
  }
  private static string ClassOf(IntPtr hwnd) {
    StringBuilder builder = new StringBuilder(256);
    GetClassName(hwnd, builder, 256);
    return builder.ToString();
  }
  // One row per top-level window of the process: handle|class|visible|title
  public static string[] TopWindows(int processId) {
    List<string> found = new List<string>();
    EnumWindows(delegate(IntPtr hwnd, IntPtr lparam) {
      uint owner = 0;
      GetWindowThreadProcessId(hwnd, out owner);
      if (owner == (uint)processId) {
        string windowClass = ClassOf(hwnd);
        found.Add(hwnd.ToInt64().ToString() + "|" + windowClass + "|" + (IsWindowVisible(hwnd) ? "1" : "0") + "|" + TextOf(hwnd, windowClass));
      }
      return true;
    }, IntPtr.Zero);
    return found.ToArray();
  }
  // One row per descendant window: handle|class|text
  public static string[] Children(long parent) {
    List<string> found = new List<string>();
    EnumChildWindows(new IntPtr(parent), delegate(IntPtr hwnd, IntPtr lparam) {
      string windowClass = ClassOf(hwnd);
      found.Add(hwnd.ToInt64().ToString() + "|" + windowClass + "|" + TextOf(hwnd, windowClass));
      return true;
    }, IntPtr.Zero);
    return found.ToArray();
  }
  // BM_CLICK is posted, not sent, so a dialog that closes on the click cannot block this process.
  public static bool Click(long hwnd) {
    return PostMessage(new IntPtr(hwnd), 0x00F5, IntPtr.Zero, IntPtr.Zero);
  }
}
'@
    $win32Ready = $true
  } catch { $win32Error = $_.Exception.Message }

  $uiaReady = $false
  $uiaError = ''
  try {
    [void][System.Reflection.Assembly]::LoadWithPartialName('UIAutomationClient')
    [void][System.Reflection.Assembly]::LoadWithPartialName('UIAutomationTypes')
    [void][System.Windows.Automation.AutomationElement]::RootElement
    $uiaReady = $true
  } catch { $uiaError = $_.Exception.Message }

  function Get-DialogWindows([int]$owner) {
    $rows = @()
    foreach ($row in [B2Dialog]::TopWindows($owner)) {
      $parts = $row -split '\|', 4
      $rows += New-Object PSObject -Property @{ Handle = [long]$parts[0]; Class = $parts[1]; Visible = ($parts[2] -eq '1'); Title = $parts[3] }
    }
    return $rows
  }
  function Find-ButtonWindow([int]$owner, [string]$wanted) {
    foreach ($window in @(Get-DialogWindows $owner)) {
      if (-not $window.Visible) { continue }
      foreach ($childRow in [B2Dialog]::Children($window.Handle)) {
        $child = $childRow -split '\|', 3
        if ($child[1] -eq 'Button' -and (Normalize-Label $child[2]) -eq $wanted) { return [long]$child[0] }
      }
    }
    return [long]0
  }
  function Invoke-UiaButton([int]$owner, [string]$wanted) {
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $byProcess = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $owner)
    $byClass = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty, '#32770')
    $isDialog = New-Object System.Windows.Automation.AndCondition($byProcess, $byClass)
    $isButton = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
    foreach ($window in $root.FindAll([System.Windows.Automation.TreeScope]::Children, $isDialog)) {
      foreach ($button in $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $isButton)) {
        if ((Normalize-Label $button.Current.Name) -eq $wanted) {
          $pattern = $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
          $pattern.Invoke()
          return $true
        }
      }
    }
    return $false
  }

  $wanted = Normalize-Label $labels[$indexValue]
  $deadline = (Get-Date).AddSeconds(30)
  $method = ''
  $uiaFailure = ''
  while ((Get-Date) -lt $deadline -and $method -eq '') {
    if ($win32Ready) {
      $buttonWindow = Find-ButtonWindow $pidValue $wanted
      if ($buttonWindow -ne 0) {
        if ([B2Dialog]::Click($buttonWindow)) { $method = 'win32' }
      }
    }
    if ($method -eq '' -and $uiaReady) {
      try { if (Invoke-UiaButton $pidValue $wanted) { $method = 'uia' } } catch { $uiaFailure = $_.Exception.Message }
    }
    if ($method -eq '') { Start-Sleep -Milliseconds 500 }
  }

  if ($method -ne '') {
    # A pressed button closes the dialog. The wait makes a click that did nothing visible in the output (button_gone=False).
    $gone = 'unknown'
    if ($win32Ready) {
      $gone = 'False'
      $until = (Get-Date).AddSeconds(8)
      while ((Get-Date) -lt $until -and $gone -eq 'False') {
        if ((Find-ButtonWindow $pidValue $wanted) -eq 0) { $gone = 'True' } else { Start-Sleep -Milliseconds 250 }
      }
    }
    Write-Output ('clicked index ' + $indexValue + ' via ' + $method + '; button_gone=' + $gone)
    exit 0
  }

  # Not found: describe what the process showed. This must never change the exit code below.
  $report = New-Object System.Text.StringBuilder
  [void]$report.Append('The exit dialog button was not found within 30 seconds. want=' + (Ascii-Safe $wanted) + '; win32_ready=' + $win32Ready + '; uia_ready=' + $uiaReady + '.')
  if ($win32Error) { [void]$report.Append(' win32_error=' + (Ascii-Safe $win32Error) + '.') }
  if ($uiaError) { [void]$report.Append(' uia_error=' + (Ascii-Safe $uiaError) + '.') }
  if ($uiaFailure) { [void]$report.Append(' uia_last_failure=' + (Ascii-Safe $uiaFailure) + '.') }
  try {
    if ($win32Ready) {
      foreach ($window in @(Get-DialogWindows $pidValue)) {
        [void]$report.Append(' W[' + $window.Handle + ',' + $window.Class + ',visible=' + $window.Visible + ',' + (Ascii-Safe $window.Title) + ']')
        if ($window.Class -like 'Chrome_*') { continue }
        foreach ($childRow in [B2Dialog]::Children($window.Handle)) {
          $child = $childRow -split '\|', 3
          [void]$report.Append(' C[' + $child[1] + ',' + (Ascii-Safe $child[2]) + ']')
        }
      }
    }
  } catch { [void]$report.Append(' win32_dump_failed=' + (Ascii-Safe $_.Exception.Message)) }
  try {
    if ($uiaReady) {
      $root = [System.Windows.Automation.AutomationElement]::RootElement
      $byProcess = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $pidValue)
      foreach ($window in $root.FindAll([System.Windows.Automation.TreeScope]::Children, $byProcess)) {
        $className = $window.Current.ClassName
        [void]$report.Append(' U[' + $className + ',' + (Ascii-Safe $window.Current.Name) + ']')
        if ($className -like 'Chrome_*') { continue }
        $shown = 0
        foreach ($item in $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) {
          if ($shown -ge 30) { break }
          [void]$report.Append(' u[' + $item.Current.ControlType.ProgrammaticName + ',' + (Ascii-Safe $item.Current.Name) + ']')
          $shown = $shown + 1
        }
      }
    }
  } catch { [void]$report.Append(' uia_dump_failed=' + (Ascii-Safe $_.Exception.Message)) }
  $text = $report.ToString()
  if ($text.Length -gt 7000) { $text = $text.Substring(0, 7000) }
  Fail $text 3
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
$identityText = 'machine=' + $identity.MachineName + ' sid=' + $identity.AccountSid + ' integrity=' + $identity.Integrity + ' session=' + $identity.SessionId + ' elevated=' + $identity.Elevated.ToString().ToLower() +
  ' in_job=' + $identity.InJob + ' in_job_attempts=' + $identity.InJobAttempts + ' in_job_last_error=' + $identity.InJobLastError
if ($derived.Code -ne 0) { Fail ('The request was refused: ' + $derived.Out + $derived.Err + ' actual_identity: ' + $identityText) 4 }
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
  '","integrity_level":"' + $identity.Integrity + '","session_id":' + $identity.SessionId + ',"elevated":' + $identity.Elevated.ToString().ToLower() + ',"in_job":' + $jobJson + ',"in_job_attempts":' + $identity.InJobAttempts + ',"in_job_last_error":' + $identity.InJobLastError + '}'
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
