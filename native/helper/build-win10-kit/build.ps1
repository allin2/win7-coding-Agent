[CmdletBinding()]
param([switch]$SkipSmoke)

# D-013 containment helper — offline Win10 build kit.
#
# Builds spike02_helper.exe on a locked Windows 10 x64 host:
#   VS2019 [16.0,17.0) / v142 / MSVC 14.2x / Windows SDK 10.0.19041.0
# Static CRT (/MT), Win7 target (_WIN32_WINNT=0x0601), embedded manifest,
# PE/API/CRT gate, Win10 smoke, evidence-bound return package + SHA-256.
#
# Usage: .\build.ps1 [-SkipSmoke]
Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

$KitRoot = $PSScriptRoot
$WorkRoot = Join-Path $KitRoot "work"
$OutputRoot = Join-Path $KitRoot "output"
$EvidenceRoot = Join-Path $KitRoot "evidence"
$ResultRoot = Join-Path $KitRoot "result"
$TranscriptPath = Join-Path $EvidenceRoot "build-transcript.txt"

function Ensure-Directory([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { New-Item -ItemType Directory -Path $Path | Out-Null }
}

function Write-Json([object]$Value, [string]$Path) {
    [System.IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 12), (New-Object System.Text.UTF8Encoding($false)))
}

function Invoke-Utf8ProcessBytes(
    [string]$FilePath,
    [string]$Arguments,
    [AllowNull()][object]$StandardInputText,
    [string]$StdoutPath,
    [string]$StderrPath
) {
    # Windows PowerShell 5.1 decodes native-command output with its console/OEM
    # code page. That corrupts UTF-8 helper JSON on Chinese hosts and can let a
    # DBCS lead byte consume the closing quote. Read both redirected streams as
    # bytes, persist them before decoding, then apply strict UTF-8 explicitly.
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $FilePath
    $startInfo.Arguments = $Arguments
    $startInfo.WorkingDirectory = $KitRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    if (-not $process.Start()) { throw "Failed to start UTF-8 process: $FilePath" }

    $stdoutBuffer = New-Object System.IO.MemoryStream
    $stderrBuffer = New-Object System.IO.MemoryStream
    $stdoutTask = $process.StandardOutput.BaseStream.CopyToAsync($stdoutBuffer)
    $stderrTask = $process.StandardError.BaseStream.CopyToAsync($stderrBuffer)
    $utf8 = New-Object System.Text.UTF8Encoding($false, $true)
    if ($null -ne $StandardInputText) {
        $stdinBytes = $utf8.GetBytes(([string]$StandardInputText) + "`r`n")
        $null = $process.StandardInput.BaseStream.Write($stdinBytes, 0, $stdinBytes.Length)
        $null = $process.StandardInput.BaseStream.Flush()
    }
    $null = $process.StandardInput.Close()
    $null = $process.WaitForExit()
    # Windows PowerShell 5.1 can surface VoidTaskResult from these calls. Any
    # unsuppressed value becomes part of the function output and turns the
    # intended capture object into Object[]. Keep the output contract exact.
    $null = $stdoutTask.GetAwaiter().GetResult()
    $null = $stderrTask.GetAwaiter().GetResult()

    $stdoutBytes = $stdoutBuffer.ToArray()
    $stderrBytes = $stderrBuffer.ToArray()
    # These are the actual native bytes. Keep this ordering before GetString so
    # invalid UTF-8 remains recoverable in a DIAGNOSTICS return package.
    $null = [System.IO.File]::WriteAllBytes($StdoutPath, $stdoutBytes)
    $null = [System.IO.File]::WriteAllBytes($StderrPath, $stderrBytes)
    $stdoutText = $utf8.GetString($stdoutBytes)
    $stderrText = $utf8.GetString($stderrBytes)
    $exitCode = $process.ExitCode
    $null = $stdoutBuffer.Dispose()
    $null = $stderrBuffer.Dispose()
    $null = $process.Dispose()
    return [pscustomobject][ordered]@{
        exit_code = $exitCode
        stdout_text = $stdoutText
        stderr_text = $stderrText
        stdout_size = $stdoutBytes.Length
        stderr_size = $stderrBytes.Length
    }
}

function Get-ValidatedProcessCapture([object[]]$Items, [string]$Context) {
    if ($null -eq $Items -or $Items.Count -ne 1) {
        $actualCount = $(if ($null -eq $Items) { 0 } else { $Items.Count })
        throw "$Context process capture output contract failed: expected 1 object, got $actualCount."
    }
    $capture = $Items[0]
    foreach ($propertyName in @("exit_code", "stdout_text", "stderr_text", "stdout_size", "stderr_size")) {
        if ($null -eq $capture.PSObject.Properties[$propertyName]) {
            throw "$Context process capture output contract failed: missing property $propertyName."
        }
    }
    return $capture
}

function Reset-OwnedDirectory([string]$Path) {
    $root = [System.IO.Path]::GetFullPath($KitRoot).TrimEnd('\')
    $target = [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
    if (-not $target.StartsWith($root + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to reset a directory outside the kit: $target"
    }
    if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
    Ensure-Directory $target
}

function Get-RelativeFileName([string]$Root, [string]$FullName) {
    return $FullName.Substring($Root.Length + 1).Replace('\', '/')
}

function Get-ArtifactEntries([string]$Root) {
    $entries = @()
    if (-not (Test-Path -LiteralPath $Root -PathType Container)) { return $entries }
    foreach ($file in Get-ChildItem -LiteralPath $Root -Recurse -File) {
        $entries += [ordered]@{
            path = (Get-RelativeFileName $Root $file.FullName)
            size = $file.Length
            sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        }
    }
    return $entries
}

function New-ReturnPackage(
    [string]$Status,
    [string]$CurrentStage,
    [string]$FailureCode,
    [string]$FailureMessage,
    [string]$HelperError,
    [string]$ProfileId,
    [string]$SdkVersion,
    [string]$SmokeStatus,
    [string]$PeStatus,
    [string]$LogicStatus,
    [string]$CaptureStatus,
    [bool]$CandidateEligible,
    [string]$PackageOutputRoot,
    [string]$PackageEvidenceRoot,
    [string]$PackageResultRoot
) {
    Ensure-Directory $PackageOutputRoot
    Ensure-Directory $PackageEvidenceRoot
    Ensure-Directory $PackageResultRoot

    $artifactEntries = @(Get-ArtifactEntries $PackageOutputRoot)
    $buildResult = [ordered]@{
        schema_version = 3
        status = $Status
        stage = $CurrentStage
        failure_code = $FailureCode
        failure_message = $FailureMessage
        helper_error = $HelperError
        candidate_eligible = $CandidateEligible
        profile = $ProfileId
        completed_at = [DateTime]::UtcNow.ToString("o")
        helper = "spike02_helper"
        architecture = "x64"
        toolset = "v142"
        windows_sdk = $SdkVersion
        crt = "static /MT"
        manifest = "embedded"
        logic_tests = $LogicStatus
        process_capture_selftest = $CaptureStatus
        win10_smoke = $SmokeStatus
        pe_api_crt_analysis = $PeStatus
        win7_validation = "NOT_PERFORMED"
        artifacts = $artifactEntries
    }
    Write-Json $buildResult (Join-Path $PackageEvidenceRoot "build-result.json")

    $staging = Join-Path $WorkRoot ("result-staging-" + [Guid]::NewGuid().ToString("N"))
    Reset-OwnedDirectory $staging
    if ((Get-ChildItem -LiteralPath $PackageOutputRoot -Force | Measure-Object).Count -gt 0) {
        Copy-Item -LiteralPath $PackageOutputRoot -Destination (Join-Path $staging "output") -Recurse
    }
    Copy-Item -LiteralPath $PackageEvidenceRoot -Destination (Join-Path $staging "evidence") -Recurse
    foreach ($name in @("input-lock.json", "build-profile.json", "helper.exe.manifest", "PACKAGE_MANIFEST.json")) {
        $source = Join-Path $KitRoot $name
        if (Test-Path -LiteralPath $source -PathType Leaf) {
            Copy-Item -LiteralPath $source -Destination $staging
        }
    }

    $returnFiles = @()
    foreach ($file in Get-ChildItem -LiteralPath $staging -Recurse -File | Sort-Object FullName) {
        $returnFiles += [ordered]@{
            path = (Get-RelativeFileName $staging $file.FullName)
            size = $file.Length
            sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        }
    }
    Write-Json ([ordered]@{
        schema_version = 1
        status = $Status
        candidate_eligible = $CandidateEligible
        files = $returnFiles
    }) (Join-Path $staging "RETURN_PACKAGE_MANIFEST.json")

    $stamp = [DateTime]::UtcNow.ToString("yyyyMMdd-HHmmss")
    $prefix = $(if ($Status -eq "PASS") { "WIN7_D013_HELPER_ARTIFACTS_" } else { "WIN7_D013_HELPER_DIAGNOSTICS_" })
    $resultZip = Join-Path $PackageResultRoot ($prefix + $stamp + ".zip")
    Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $resultZip -CompressionLevel Optimal -Force
    $resultHash = (Get-FileHash -LiteralPath $resultZip -Algorithm SHA256).Hash.ToLowerInvariant()
    [System.IO.File]::WriteAllText(
        $resultZip + ".sha256",
        ($resultHash + "  " + [System.IO.Path]::GetFileName($resultZip) + "`r`n"),
        [System.Text.Encoding]::ASCII)
    Remove-Item -LiteralPath $staging -Recurse -Force
    return [ordered]@{ path = $resultZip; sha256 = $resultHash; status = $Status }
}

function Test-ReturnPackageWriter {
    $selfTestRoot = Join-Path $WorkRoot "return-package-selftest"
    Reset-OwnedDirectory $selfTestRoot
    $selfOutput = Join-Path $selfTestRoot "output"
    $selfEvidence = Join-Path $selfTestRoot "evidence"
    $selfResult = Join-Path $selfTestRoot "result"
    Ensure-Directory $selfOutput
    Ensure-Directory $selfEvidence
    Ensure-Directory $selfResult
    [System.IO.File]::WriteAllText(
        (Join-Path $selfEvidence "synthetic-failure.txt"),
        "TOKEN_CREATE_FAILED`r`n", [System.Text.Encoding]::ASCII)
    $created = New-ReturnPackage -Status "FAIL" -CurrentStage "SELFTEST" `
        -FailureCode "TOKEN_CREATE_FAILED" -FailureMessage "synthetic failure" `
        -HelperError "TOKEN_CREATE_FAILED" -ProfileId "SELFTEST" -SdkVersion "SELFTEST" `
        -SmokeStatus "FAIL" -PeStatus "NOT_PERFORMED" -LogicStatus "NOT_PERFORMED" `
        -CaptureStatus "NOT_PERFORMED" `
        -CandidateEligible $false -PackageOutputRoot $selfOutput `
        -PackageEvidenceRoot $selfEvidence -PackageResultRoot $selfResult
    if (-not ([System.IO.Path]::GetFileName([string]$created.path).StartsWith("WIN7_D013_HELPER_DIAGNOSTICS_"))) {
        throw "return-package self-test produced the wrong filename"
    }
    $expectedHash = (Get-Content -LiteralPath ([string]$created.path + ".sha256") -Raw).Split(' ')[0].Trim()
    $actualHash = (Get-FileHash -LiteralPath ([string]$created.path) -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($expectedHash -ne ([string]$created.sha256) -or $actualHash -ne ([string]$created.sha256)) {
        throw "return-package self-test ZIP/sidecar hash mismatch"
    }
    $extract = Join-Path $selfTestRoot "extract"
    Expand-Archive -LiteralPath ([string]$created.path) -DestinationPath $extract -Force
    $selfResultJson = Get-Content -LiteralPath (Join-Path $extract "evidence\build-result.json") -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($selfResultJson.schema_version -ne 3 -or $selfResultJson.status -ne "FAIL" -or
        $selfResultJson.stage -ne "SELFTEST" -or
        $selfResultJson.failure_code -ne "TOKEN_CREATE_FAILED" -or
        $selfResultJson.candidate_eligible -ne $false -or
        $selfResultJson.helper_error -ne "TOKEN_CREATE_FAILED" -or
        $selfResultJson.process_capture_selftest -ne "NOT_PERFORMED") {
        throw "return-package self-test build-result contract mismatch"
    }
    $returnManifestPath = Join-Path $extract "RETURN_PACKAGE_MANIFEST.json"
    if (-not (Test-Path -LiteralPath $returnManifestPath -PathType Leaf)) {
        throw "return-package self-test internal manifest missing"
    }
    $returnManifest = Get-Content -LiteralPath $returnManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($returnManifest.schema_version -ne 1 -or $returnManifest.status -ne "FAIL" -or
        $returnManifest.candidate_eligible -ne $false -or (@($returnManifest.files).Count -eq 0)) {
        throw "return-package self-test internal manifest contract mismatch"
    }
    $manifestPaths = @($returnManifest.files | ForEach-Object { [string]$_.path } | Sort-Object)
    $actualPaths = @(Get-ChildItem -LiteralPath $extract -Recurse -File | ForEach-Object {
        Get-RelativeFileName $extract $_.FullName
    } | Where-Object { $_ -ne "RETURN_PACKAGE_MANIFEST.json" } | Sort-Object)
    if (@(Compare-Object -ReferenceObject $manifestPaths -DifferenceObject $actualPaths).Count -ne 0) {
        throw "return-package self-test internal manifest file set mismatch"
    }
    foreach ($entry in $returnManifest.files) {
        $entryPath = Join-Path $extract ([string]$entry.path).Replace('/', '\')
        if (-not (Test-Path -LiteralPath $entryPath -PathType Leaf) -or
            (Get-Item -LiteralPath $entryPath).Length -ne [int64]$entry.size -or
            (Get-FileHash -LiteralPath $entryPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne
                ([string]$entry.sha256).ToLowerInvariant()) {
            throw "return-package self-test internal manifest mismatch: $($entry.path)"
        }
    }
    Remove-Item -LiteralPath $selfTestRoot -Recurse -Force
}

$currentStage = "INITIALIZE"
$buildStatus = "FAIL"
$buildExitCode = 1
$failureCode = "UNHANDLED_BUILD_FAILURE"
$failureMessage = ""
$helperError = ""
$profileId = "UNKNOWN"
$sdkVersion = "UNKNOWN"
$smokeStatus = "NOT_PERFORMED"
$peStatus = "NOT_PERFORMED"
$logicStatus = "NOT_PERFORMED"
$captureStatus = "NOT_PERFORMED"
$candidateEligible = $false
$returnPackage = $null
$transcriptStarted = $false
$packagingSucceeded = $false

try {
    # Work, output, evidence and result are build-owned state. Initialization
    # is inside the same failure closure, so even transcript startup failure
    # reaches the diagnostics finalizer instead of terminating the script.
    Reset-OwnedDirectory $WorkRoot
    Reset-OwnedDirectory $OutputRoot
    Reset-OwnedDirectory $EvidenceRoot
    Reset-OwnedDirectory $ResultRoot
    Start-Transcript -Path $TranscriptPath -Force | Out-Null
    $transcriptStarted = $true

    $lock = Get-Content -LiteralPath (Join-Path $KitRoot "input-lock.json") -Raw -Encoding UTF8 | ConvertFrom-Json
    $profile = Get-Content -LiteralPath (Join-Path $KitRoot "build-profile.json") -Raw -Encoding UTF8 | ConvertFrom-Json
    $profileId = [string]$profile.profile

    $currentStage = "VERIFY_INPUT"
    Write-Host "[1/9] Verify full package manifest and locked source snapshot"
    $packageManifest = Get-Content -LiteralPath (Join-Path $KitRoot "PACKAGE_MANIFEST.json") -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($entry in $packageManifest.files) {
        $path = Join-Path $KitRoot ([string]$entry.path).Replace('/', '\')
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing package file: $($entry.path)" }
        if ((Get-Item -LiteralPath $path).Length -ne [int64]$entry.size) { throw "Package file size mismatch: $($entry.path)" }
        if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne ([string]$entry.sha256).ToLowerInvariant()) {
            throw "Package file SHA-256 mismatch: $($entry.path)"
        }
    }
    $verifiedSources = @()
    foreach ($entry in $lock.sources) {
        $path = Join-Path $KitRoot ([string]$entry.path)
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing locked source: $($entry.path)" }
        $actualHash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
        $actualSize = (Get-Item -LiteralPath $path).Length
        if ($actualHash -ne ([string]$entry.sha256).ToLowerInvariant()) { throw "SHA-256 mismatch: $($entry.path)" }
        if ($actualSize -ne [int64]$entry.size) { throw "Size mismatch: $($entry.path)" }
        $verifiedSources += [ordered]@{ path = $entry.path; sha256 = $actualHash; size = $actualSize; status = "PASS" }
    }
    Write-Json ([ordered]@{ schema_version = 1; status = "PASS"; sources = $verifiedSources }) (Join-Path $EvidenceRoot "input-verification.json")

    $currentStage = "PROCESS_CAPTURE_SELFTEST"
    Write-Host "[2/9] Verify PowerShell 5.1 single-object and strict UTF-8 capture contract"
    $captureProbeScript = Join-Path $WorkRoot "capture-selftest.ps1"
    $captureProbeStdout = Join-Path $EvidenceRoot "capture-selftest-stdout.bin"
    $captureProbeStderr = Join-Path $EvidenceRoot "capture-selftest-stderr.bin"
    # Keep this probe source ASCII so Windows PowerShell 5.1 never depends on
    # BOM/ACP detection. The child constructs the non-ASCII marker by codepoint
    # and emits it with an explicitly strict UTF-8 console encoding.
    $captureProbeSource = '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false, $true); [Console]::Out.Write("D013_" + [char]0x4E2D + [char]0x6587)'
    $null = [System.IO.File]::WriteAllText($captureProbeScript, $captureProbeSource, [System.Text.Encoding]::ASCII)
    $powershellExe = Join-Path $PSHOME "powershell.exe"
    if (-not (Test-Path -LiteralPath $powershellExe -PathType Leaf)) {
        throw "Windows PowerShell executable was not detected for capture self-test."
    }
    $captureProbeArguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $captureProbeScript + '"'
    $captureProbeItems = @(Invoke-Utf8ProcessBytes -FilePath $powershellExe `
        -Arguments $captureProbeArguments -StandardInputText $null `
        -StdoutPath $captureProbeStdout -StderrPath $captureProbeStderr)
    $captureProbe = Get-ValidatedProcessCapture -Items $captureProbeItems -Context "capture self-test"
    $expectedCaptureMarker = "D013_" + [char]0x4E2D + [char]0x6587
    if ([int]$captureProbe.exit_code -ne 0 -or [string]$captureProbe.stdout_text -ne $expectedCaptureMarker -or
        [int]$captureProbe.stdout_size -ne 11 -or [int]$captureProbe.stderr_size -ne 0) {
        throw "PowerShell process capture self-test did not preserve the exact UTF-8 payload."
    }
    $captureStatus = "PASS"
    Write-Json ([ordered]@{
        schema_version = 1
        status = "PASS"
        output_object_count = $captureProbeItems.Count
        exit_code = [int]$captureProbe.exit_code
        stdout_size = [int]$captureProbe.stdout_size
        stderr_size = [int]$captureProbe.stderr_size
        decoded_marker = [string]$captureProbe.stdout_text
        raw_bytes_persisted_before_decode = $true
        strict_utf8 = $true
    }) (Join-Path $EvidenceRoot "capture-selftest.json")

    $currentStage = "RETURN_PACKAGE_SELFTEST"
    Write-Host "[3/9] Verify FAIL diagnostics finalizer with a synthetic TOKEN_CREATE_FAILED"
    Test-ReturnPackageWriter
    Write-Json ([ordered]@{
        schema_version = 1
        status = "PASS"
        scenario = "synthetic TOKEN_CREATE_FAILED"
        expected_prefix = "WIN7_D013_HELPER_DIAGNOSTICS_"
        expected_candidate_eligible = $false
    }) (Join-Path $EvidenceRoot "return-package-selftest.json")

    $currentStage = "VERIFY_BUILD_HOST"
    Write-Host "[4/9] Enforce Win10 + VS2019 + v142 + SDK 10.0.19041.0"
    if (-not [Environment]::Is64BitOperatingSystem) { throw "A 64-bit Windows build host is required." }
    $os = Get-CimInstance Win32_OperatingSystem
    if ($os.Caption -notlike "*Windows 10*") { throw "This locked profile requires Windows 10 x64; detected: $($os.Caption)." }

    $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
    if (-not (Test-Path -LiteralPath $vswhere)) { throw "vswhere.exe not found." }
    # VS2019 reports its built-in v142 C++ tools as VC.Tools.x86.x64. The
    # alternate VC.v142 ID is retained for installations that register it, but
    # the 16.x Visual Studio and 14.2 toolset gates below remain mandatory.
    $vsArgs = @(
        '-latest', '-version', '[16.0,17.0)', '-products', '*', '-requires',
        'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
        'Microsoft.VisualStudio.Component.VC.v142.x86.x64',
        '-requiresAny'
    )
    $vsPath = (& $vswhere @vsArgs -property installationPath | Select-Object -First 1)
    $vsVersion = (& $vswhere @vsArgs -property installationVersion | Select-Object -First 1)
    if (-not $vsPath -or -not ([string]$vsVersion).StartsWith('16.')) { throw "Visual Studio 2019 with v142 x64 was not detected." }

    $msvcRoot = Join-Path $vsPath "VC\Tools\MSVC"
    $msvcDirectory = Get-ChildItem -LiteralPath $msvcRoot -Directory | Where-Object { $_.Name -like '14.2*' } | Sort-Object Name -Descending | Select-Object -First 1
    if (-not $msvcDirectory) { throw "An MSVC 14.2x (v142) compiler directory was not detected." }
    $cl = Join-Path $msvcDirectory.FullName "bin\Hostx64\x64\cl.exe"
    $dumpbin = Join-Path $msvcDirectory.FullName "bin\Hostx64\x64\dumpbin.exe"
    if (-not (Test-Path -LiteralPath $cl) -or -not (Test-Path -LiteralPath $dumpbin)) { throw "cl.exe/dumpbin.exe x64 were not detected." }

    $sdkVersion = [string]$profile.build_host.windows_sdk_version
    $sdkInclude = Join-Path ${env:ProgramFiles(x86)} ("Windows Kits\10\Include\" + $sdkVersion)
    $sdkLib = Join-Path ${env:ProgramFiles(x86)} ("Windows Kits\10\Lib\" + $sdkVersion)
    if (-not (Test-Path -LiteralPath $sdkInclude) -or -not (Test-Path -LiteralPath $sdkLib)) {
        throw "Locked Windows SDK $sdkVersion was not detected."
    }
    $mt = Join-Path ${env:ProgramFiles(x86)} ("Windows Kits\10\bin\" + $sdkVersion + "\x64\mt.exe")
    if (-not (Test-Path -LiteralPath $mt)) { throw "mt.exe (SDK $sdkVersion x64) was not detected." }
    $tarCommand = Get-Command tar.exe -ErrorAction SilentlyContinue
    if (-not $tarCommand) { throw "Windows 10 tar.exe was not detected." }

    $environment = [ordered]@{
        schema_version = 1; status = "PASS"; captured_at = [DateTime]::UtcNow.ToString("o")
        computer_name = $env:COMPUTERNAME; os_caption = $os.Caption; os_version = $os.Version; os_build = $os.BuildNumber
        powershell = $PSVersionTable.PSVersion.ToString(); visual_studio_path = $vsPath; visual_studio_version = $vsVersion
        msvc_version = $msvcDirectory.Name; platform_toolset = "v142"; windows_sdk_version = $sdkVersion
        compiler = $cl; archive_tool = $tarCommand.Source; network_required = $false
    }
    Write-Json $environment (Join-Path $EvidenceRoot "environment.json")

    $currentStage = "BUILD_LOGIC_TESTS"
    Write-Host "[5/9] Build and run platform-neutral logic tests with v142"
    Reset-OwnedDirectory $WorkRoot
    Reset-OwnedDirectory $OutputRoot
    Ensure-Directory $ResultRoot
    $srcDir = Join-Path $KitRoot "src"
    $common = $profile.build_flags.compile | ForEach-Object { [string]$_ }
    $logicObjDir = Join-Path $WorkRoot "logic-obj"
    Ensure-Directory $logicObjDir
    $logicSources = @('logic_tests.cpp', 'json_parser.cpp', 'argv_builder.cpp', 'whitelist.cpp', 'protocol.cpp')
    $logicObjects = @()
    foreach ($source in $logicSources) {
        $obj = Join-Path $logicObjDir ($source -replace '\.cpp$', '.obj')
        & $cl @common "/I$srcDir" "/Fo$obj" "/c" (Join-Path $srcDir $source)
        if ($LASTEXITCODE -ne 0) {
            $logicStatus = "FAIL"
            throw "cl.exe failed for logic test source $source (exit $LASTEXITCODE)."
        }
        $logicObjects += $obj
    }
    $logicExe = Join-Path $WorkRoot "logic_tests.exe"
    $logicLinkArgs = @()
    foreach ($obj in $logicObjects) { $logicLinkArgs += $obj }
    $logicLinkArgs += "/link"
    foreach ($flag in $profile.build_flags.link) { $logicLinkArgs += [string]$flag }
    $logicLinkArgs += "/OUT:$logicExe"
    & $cl @logicLinkArgs
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $logicExe)) {
        $logicStatus = "FAIL"
        throw "logic_tests link failed (exit $LASTEXITCODE)."
    }
    $logicLines = @(& $logicExe 2>&1)
    $logicExit = $LASTEXITCODE
    [System.IO.File]::WriteAllLines(
        (Join-Path $EvidenceRoot "logic-tests.txt"), [string[]]$logicLines,
        [System.Text.Encoding]::UTF8)
    if ($logicExit -ne 0 -or (($logicLines -join "`n") -notmatch 'logic_tests: ALL PASS')) {
        $logicStatus = "FAIL"
        throw "logic_tests.exe failed (exit $logicExit)."
    }
    $logicStatus = "PASS"

    $currentStage = "BUILD_HELPER"
    Write-Host "[6/9] Build spike02_helper.exe (static CRT, Win7 target)"
    $objDir = Join-Path $WorkRoot "obj"
    Ensure-Directory $objDir
    $sources = @('helper.cpp', 'json_parser.cpp', 'argv_builder.cpp', 'whitelist.cpp', 'protocol.cpp')
    $objects = @()
    foreach ($source in $sources) {
        $obj = Join-Path $objDir ($source -replace '\.cpp$', '.obj')
        & $cl @common "/I$srcDir" "/Fo$obj" "/c" (Join-Path $srcDir $source)
        if ($LASTEXITCODE -ne 0) { throw "cl.exe failed for $source (exit $LASTEXITCODE)." }
        $objects += $obj
    }
    $helperExe = Join-Path $OutputRoot "helper.exe"
    $linkArgs = @()
    foreach ($obj in $objects) { $linkArgs += $obj }
    $linkArgs += "/link"
    foreach ($flag in $profile.build_flags.link) { $linkArgs += [string]$flag }
    $linkArgs += "/OUT:$helperExe"
    & $cl @linkArgs
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $helperExe)) { throw "link failed (exit $LASTEXITCODE)." }

    $currentStage = "EMBED_MANIFEST"
    Write-Host "[7/9] Embed application manifest"
    & $mt -nologo -manifest (Join-Path $KitRoot "helper.exe.manifest") -outputresource:"$helperExe;#1"
    if ($LASTEXITCODE -ne 0) { throw "mt.exe manifest embedding failed (exit $LASTEXITCODE)." }

    $currentStage = "PE_API_CRT_GATE"
    Write-Host "[8/9] Fail closed on PE architecture, forbidden APIs and CRT closure"
    $peResults = @()
    $peFailure = $false
    $crtRegex = '(?i)\b(?:VCRUNTIME[0-9_A-Z]*|MSVCP[0-9_A-Z]*|UCRTBASE|API-MS-WIN-CRT-[0-9A-Z-]+)\.DLL\b'
    $headersLog = Join-Path $EvidenceRoot "pe-helper-headers.txt"
    $dependentsLog = Join-Path $EvidenceRoot "pe-helper-dependents.txt"
    $importsLog = Join-Path $EvidenceRoot "pe-helper-imports.txt"
    $headerLines = @(& $dumpbin /HEADERS $helperExe 2>&1)
    if ($LASTEXITCODE -ne 0) { throw "dumpbin /HEADERS failed." }
    $dependentLines = @(& $dumpbin /DEPENDENTS $helperExe 2>&1)
    if ($LASTEXITCODE -ne 0) { throw "dumpbin /DEPENDENTS failed." }
    $importLines = @(& $dumpbin /IMPORTS $helperExe 2>&1)
    if ($LASTEXITCODE -ne 0) { throw "dumpbin /IMPORTS failed." }
    [System.IO.File]::WriteAllLines($headersLog, [string[]]$headerLines, [System.Text.Encoding]::UTF8)
    [System.IO.File]::WriteAllLines($dependentsLog, [string[]]$dependentLines, [System.Text.Encoding]::UTF8)
    [System.IO.File]::WriteAllLines($importsLog, [string[]]$importLines, [System.Text.Encoding]::UTF8)
    $headerText = $headerLines -join "`n"
    $importText = ($dependentLines + $importLines) -join "`n"
    $isX64 = $headerText -match '(?i)8664.*\(x64\)'
    $forbiddenHits = @()
    foreach ($api in $profile.forbidden_imports) { if ($importText -match ('(?i)\b' + [regex]::Escape([string]$api) + '\b')) { $forbiddenHits += [string]$api } }
    $crtDependencies = @([regex]::Matches($importText, $crtRegex) | ForEach-Object { $_.Value.ToUpperInvariant() } | Sort-Object -Unique)
    $status = "PASS"
    if (-not $isX64 -or $forbiddenHits.Count -gt 0 -or $crtDependencies.Count -gt 0) { $status = "FAIL"; $peFailure = $true }
    $peResults += [ordered]@{ path = "helper.exe"; status = $status; x64 = $isX64; forbidden_imports = $forbiddenHits; dynamic_crt_dependencies = $crtDependencies }
    Write-Json ([ordered]@{ schema_version = 1; status = $(if ($peFailure) { "FAIL" } else { "PASS" }); dumpbin = $dumpbin; files = $peResults }) (Join-Path $EvidenceRoot "pe-api-crt-analysis.json")
    if ($peFailure) {
        $peStatus = "FAIL"
        throw "PE/API/CRT closure failed. See pe-api-crt-analysis.json."
    }
    $peStatus = "PASS"

    $currentStage = "WIN10_SMOKE"
    Write-Host "[9/9] Win10 smoke: version, JSON round trip and exact token/ACL audit"
    $smokeStatus = "SKIPPED_REQUESTED"
    if (-not $SkipSmoke) {
        $smokeStdout = Join-Path $EvidenceRoot "smoke-stdout.txt"
        $smokeStderr = Join-Path $EvidenceRoot "smoke-stderr.txt"
        $smokeRoot = Join-Path $WorkRoot "smoke"
        Reset-OwnedDirectory $smokeRoot
        $smokeAllowed = Join-Path $smokeRoot "allowed"
        $smokeProtected = Join-Path $smokeRoot "protected"
        Ensure-Directory $smokeAllowed
        Ensure-Directory $smokeProtected
        $smokeAllowedAclBefore = (Get-Acl -LiteralPath $smokeAllowed).Sddl
        $smokeProtectedAclBefore = (Get-Acl -LiteralPath $smokeProtected).Sddl
        $cmdExe = Join-Path $env:SystemRoot "System32\cmd.exe"
        if (-not (Test-Path -LiteralPath $cmdExe -PathType Leaf)) { throw "cmd.exe smoke target was not detected." }
        $versionStdout = Join-Path $EvidenceRoot "version-stdout.txt"
        $versionStderr = Join-Path $EvidenceRoot "version-stderr.txt"
        $versionCaptureItems = @(Invoke-Utf8ProcessBytes -FilePath $helperExe -Arguments "--version" `
            -StandardInputText $null -StdoutPath $versionStdout -StderrPath $versionStderr)
        $versionCapture = Get-ValidatedProcessCapture -Items $versionCaptureItems -Context "helper --version"
        if ($versionCapture.exit_code -ne 0 -or $versionCapture.stdout_text -notmatch 'win7-x64') {
            throw "helper --version smoke failed."
        }
        $requestPayload = [ordered]@{
            schema_version = 1
            requestId = "d013-smoke"
            executable = $cmdExe
            argv = @('/d', '/s', '/c', 'echo D013_NATIVE_SMOKE')
            workingDirectory = $smokeAllowed
            timeoutMs = 10000
            idleTimeoutMs = 5000
            maxOutputSize = 4096
            allowedDirectories = @($smokeAllowed)
            protectedDirectories = @($smokeProtected)
            aclPolicy = [ordered]@{
                acceptanceRoot = $WorkRoot
                perRunRoot = $smokeRoot
            }
        }
        # Serialize the payload instead of hand-writing JSON. ConvertTo-Json
        # escapes Windows path separators, quotes and future special characters.
        $request = $requestPayload | ConvertTo-Json -Compress
        $requestCheck = $request | ConvertFrom-Json
        if (($requestCheck.executable -ne $requestPayload.executable) -or ($requestCheck.workingDirectory -ne $requestPayload.workingDirectory)) {
            throw "helper JSON smoke request did not survive serialization round trip."
        }
        $smokeCaptureItems = @(Invoke-Utf8ProcessBytes -FilePath $helperExe -Arguments "" `
            -StandardInputText $request -StdoutPath $smokeStdout -StderrPath $smokeStderr)
        $smokeCapture = Get-ValidatedProcessCapture -Items $smokeCaptureItems -Context "helper JSON smoke"
        $smokeProcessExit = [int]$smokeCapture.exit_code
        $responseText = ([string]$smokeCapture.stdout_text) -replace "[\r\n]+$", ""
        if ($smokeProcessExit -ne 0) {
            $smokeStatus = "FAIL"
            throw "helper JSON smoke process failed (exit $smokeProcessExit)."
        }
        $response = $responseText | ConvertFrom-Json
        if ($response.type -eq 'error' -and $response.error -eq 'HOST_ALREADY_IN_JOB') {
            # The build host itself runs inside a Job: the helper's C02
            # fail-closed behaviour is correct; smoke is environmentally skipped.
            $smokeStatus = "SKIPPED_IN_JOB"
            $helperError = [string]$response.error
        } elseif ($response.type -eq 'error' -and $response.error -eq 'PROCESS_CREATE_FAILED') {
            # Some agent sandboxes allow compilation but block restricted-token
            # process creation
            # from creating the restricted child. Keep the build evidence-bound
            # and non-PASS instead of masking the host limitation as success.
            $smokeStatus = "SKIPPED_PROCESS_CREATE_FAILED"
            $helperError = [string]$response.error
        } elseif ($response.type -eq 'error') {
            $smokeStatus = "FAIL"
            $helperError = [string]$response.error
            throw "helper JSON smoke returned error: $responseText"
        } else {
            if ($response.status -ne 'completed' -or $response.exitCode -ne 0) {
                $smokeStatus = "FAIL"
                $helperError = "CHILD_EXIT_" + [string]$response.exitCode
                throw "helper JSON smoke did not complete cleanly: $responseText"
            }
            $decoded = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String([string]$response.stdoutBase64))
            if ($decoded -notmatch 'D013_NATIVE_SMOKE') { throw "helper JSON smoke stdout did not contain the marker." }
            if ($response.containmentVerified -ne $true -or $response.inputDetached -ne $true) {
                throw "helper JSON smoke did not prove containment/input detachment."
            }
            $tokenAuditProperty = $response.PSObject.Properties['tokenAudit']
            if (-not $tokenAuditProperty) {
                throw "helper JSON smoke did not return the trusted child-token audit: $responseText"
            }
            $tokenAudit = $tokenAuditProperty.Value
            if ($tokenAudit.source -ne 'suspended_child_process_token' -or
                $tokenAudit.verified -ne $true -or
                $tokenAudit.isRestricted -ne $true -or
                $tokenAudit.tokenType -ne 'primary' -or
                $tokenAudit.restrictedSidSetVerified -ne $true -or
                $tokenAudit.userRestrictedSid -ne $true -or
                $tokenAudit.worldRestrictedSid -ne $true -or
                $tokenAudit.administratorsRestrictedSid -ne $false -or
                [int64]$tokenAudit.restrictedSidCount -lt 2 -or
                $tokenAudit.integritySid -ne 'S-1-16-4096' -or
                [int64]$tokenAudit.integrityRid -ne 4096) {
                $smokeStatus = "FAIL"
                $helperError = "TOKEN_AUDIT_CONTRACT_MISMATCH"
                throw "helper JSON smoke did not prove the actual child is a restricted primary Low Integrity token: $responseText"
            }
            $aclChanges = @($response.aclChanges)
            if ($aclChanges.Count -ne 2) {
                throw "helper JSON smoke did not return both ACL changes: $responseText"
            }
            $allowedChanges = @($aclChanges | Where-Object {
                $_.mechanism -eq 'low_integrity_label' -and
                [string]::Equals([string]$_.path, $smokeAllowed, [System.StringComparison]::OrdinalIgnoreCase)
            })
            $protectedChanges = @($aclChanges | Where-Object {
                $_.mechanism -eq 'deny_ace' -and
                [string]::Equals([string]$_.path, $smokeProtected, [System.StringComparison]::OrdinalIgnoreCase)
            })
            if ($allowedChanges.Count -ne 1 -or $protectedChanges.Count -ne 1) {
                throw "helper JSON smoke returned unexpected ACL paths/mechanisms: $responseText"
            }
            foreach ($aclChange in @($allowedChanges[0], $protectedChanges[0])) {
                if ($aclChange.applied -ne $true -or
                    $aclChange.verified -ne $true -or
                    $aclChange.rolledBack -ne $true) {
                    throw "helper JSON smoke did not prove both ACL applications and exact rollback: $responseText"
                }
            }
            $smokeAllowedAclAfter = (Get-Acl -LiteralPath $smokeAllowed).Sddl
            $smokeProtectedAclAfter = (Get-Acl -LiteralPath $smokeProtected).Sddl
            if ($smokeAllowedAclAfter -ne $smokeAllowedAclBefore -or
                $smokeProtectedAclAfter -ne $smokeProtectedAclBefore) {
                throw "helper JSON smoke changed an ACL/owner after rollback."
            }
            $smokeStatus = "PASS"
        }
    }
    $currentStage = "COMPLETE"
    if ($smokeStatus -eq "PASS") {
        $buildStatus = "PASS"
        $buildExitCode = 0
        $failureCode = ""
        $failureMessage = ""
        $candidateEligible = $true
    } else {
        $buildStatus = "PARTIAL"
        $buildExitCode = 2
        $failureCode = $smokeStatus
        $failureMessage = "Win10 smoke was skipped by request or a classified host limitation."
        $candidateEligible = $false
    }
} catch {
    $buildStatus = "FAIL"
    $buildExitCode = 1
    $candidateEligible = $false
    $failureMessage = [string]$_.Exception.Message
    if ($helperError) {
        $failureCode = $helperError
    } else {
        $failureCode = "BUILD_" + $currentStage + "_FAILED"
    }
    if ($smokeStatus -eq "NOT_PERFORMED" -or $smokeStatus -like "SKIPPED*") {
        $smokeStatus = "FAIL"
    }
    if ($currentStage -eq "PROCESS_CAPTURE_SELFTEST" -and $captureStatus -eq "NOT_PERFORMED") {
        $captureStatus = "FAIL"
    }
    [Console]::Error.WriteLine("BUILD ERROR: " + $failureMessage)
} finally {
    if ($transcriptStarted) { try { Stop-Transcript | Out-Null } catch {} }
}

try {
    $returnPackage = New-ReturnPackage -Status $buildStatus -CurrentStage $currentStage `
        -FailureCode $failureCode -FailureMessage $failureMessage -HelperError $helperError `
        -ProfileId $profileId -SdkVersion $sdkVersion -SmokeStatus $smokeStatus `
        -PeStatus $peStatus -LogicStatus $logicStatus -CaptureStatus $captureStatus `
        -CandidateEligible $candidateEligible `
        -PackageOutputRoot $OutputRoot -PackageEvidenceRoot $EvidenceRoot `
        -PackageResultRoot $ResultRoot
    $packagingSucceeded = $true
} catch {
    [Console]::Error.WriteLine("BUILD PACKAGING ERROR: " + [string]$_.Exception.Message)
    [Console]::Error.WriteLine("Unpackaged evidence directory: " + $EvidenceRoot)
    $buildExitCode = 1
}

if (-not $packagingSucceeded) {
    Write-Host "BUILD FAIL (RETURN PACKAGING)"
} elseif ($buildStatus -eq "PASS") {
    Write-Host "BUILD PASS"
} elseif ($buildStatus -eq "PARTIAL") {
    Write-Host "BUILD PARTIAL"
} else {
    Write-Host "BUILD FAIL"
}
if ($packagingSucceeded) {
    Write-Host "Return package: $($returnPackage.path)"
    Write-Host "SHA-256: $($returnPackage.sha256)"
}
exit $buildExitCode
