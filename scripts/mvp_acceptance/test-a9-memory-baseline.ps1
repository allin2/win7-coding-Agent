<# ASCII-only fixture tests for a9_win7_memory_baseline.ps1. #>
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$testDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$script = Join-Path $testDir 'a9_win7_memory_baseline.ps1'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -Scenario TEST -TestMode
if ($LASTEXITCODE -ne 0) { throw "memory baseline fixture tests failed: $LASTEXITCODE" }
Write-Host 'a9 memory baseline fixture tests passed'
