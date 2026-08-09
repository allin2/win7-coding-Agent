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

# Evidence is build-owned state. Clear it before every run so a retry cannot
# carry stale logs or JSON into the next return package.
Reset-OwnedDirectory $EvidenceRoot
Start-Transcript -Path $TranscriptPath -Force | Out-Null
$transcriptStopped = $false

try {
    $lock = Get-Content -LiteralPath (Join-Path $KitRoot "input-lock.json") -Raw -Encoding UTF8 | ConvertFrom-Json
    $profile = Get-Content -LiteralPath (Join-Path $KitRoot "build-profile.json") -Raw -Encoding UTF8 | ConvertFrom-Json

    Write-Host "[1/7] Verify full package manifest and locked source snapshot"
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

    Write-Host "[2/7] Enforce Win10 + VS2019 + v142 + SDK 10.0.19041.0"
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

    Write-Host "[3/7] Build spike02_helper.exe (static CRT, Win7 target)"
    Reset-OwnedDirectory $WorkRoot
    Reset-OwnedDirectory $OutputRoot
    Ensure-Directory $ResultRoot
    $srcDir = Join-Path $KitRoot "src"
    $objDir = Join-Path $WorkRoot "obj"
    Ensure-Directory $objDir
    $sources = @('helper.cpp', 'json_parser.cpp', 'argv_builder.cpp', 'whitelist.cpp', 'protocol.cpp')
    $common = $profile.build_flags.compile | ForEach-Object { [string]$_ }
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

    Write-Host "[4/7] Embed application manifest"
    & $mt -nologo -manifest (Join-Path $KitRoot "helper.exe.manifest") -outputresource:"$helperExe;#1"
    if ($LASTEXITCODE -ne 0) { throw "mt.exe manifest embedding failed (exit $LASTEXITCODE)." }

    Write-Host "[5/7] Fail closed on PE architecture, forbidden APIs and CRT closure"
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
    if ($peFailure) { throw "PE/API/CRT closure failed. See pe-api-crt-analysis.json." }

    Write-Host "[6/7] Win10 smoke: version, help and JSON round trip"
    $smokeStatus = "SKIPPED"
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
        $versionOut = & $helperExe --version 2>$smokeStderr
        if ($LASTEXITCODE -ne 0 -or $versionOut -notmatch 'win7-x64') { throw "helper --version smoke failed." }
        $requestPayload = [ordered]@{
            requestId = "d013-smoke"
            executable = $cmdExe
            argv = @('/d', '/s', '/c', 'echo D013_NATIVE_SMOKE')
            workingDirectory = $smokeAllowed
            timeoutMs = 10000
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
        $responseText = $request | & $helperExe 2>$smokeStderr
        if ($LASTEXITCODE -ne 0) { throw "helper JSON smoke process failed." }
        $response = $responseText | ConvertFrom-Json
        if ($response.type -eq 'error' -and $response.error -eq 'HOST_ALREADY_IN_JOB') {
            # The build host itself runs inside a Job: the helper's C02
            # fail-closed behaviour is correct; smoke is environmentally skipped.
            $smokeStatus = "SKIPPED_IN_JOB"
        } elseif ($response.type -eq 'error' -and $response.error -eq 'PROCESS_CREATE_FAILED') {
            # Some agent sandboxes allow compilation but block restricted-token
            # process creation
            # from creating the restricted child. Keep the build evidence-bound
            # and non-PASS instead of masking the host limitation as success.
            $smokeStatus = "SKIPPED_PROCESS_CREATE_FAILED"
        } elseif ($response.type -eq 'error') {
            throw "helper JSON smoke returned error: $responseText"
        } else {
            if ($response.status -ne 'completed' -or $response.exitCode -ne 0) {
                throw "helper JSON smoke did not complete cleanly: $responseText"
            }
            $decoded = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String([string]$response.stdoutBase64))
            if ($decoded -notmatch 'D013_NATIVE_SMOKE') { throw "helper JSON smoke stdout did not contain the marker." }
            if ($response.containmentVerified -ne $true -or $response.inputDetached -ne $true) {
                throw "helper JSON smoke did not prove containment/input detachment."
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
        [System.IO.File]::WriteAllText($smokeStdout, "$versionOut`n$responseText", (New-Object System.Text.UTF8Encoding($false)))
    }

    Write-Host "[7/7] Produce evidence-bound return package"
    $artifactEntries = @()
    foreach ($file in Get-ChildItem -LiteralPath $OutputRoot -Recurse -File) {
        $artifactEntries += [ordered]@{ path = (Get-RelativeFileName $OutputRoot $file.FullName); size = $file.Length; sha256 = (Get-FileHash $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
    }
    $finalStatus = $(if ($smokeStatus -eq "PASS") { "PASS" } else { "PARTIAL" })
    $buildResult = [ordered]@{
        schema_version = 2; status = $finalStatus; profile = $profile.profile; completed_at = [DateTime]::UtcNow.ToString("o")
        helper = "spike02_helper"; architecture = "x64"; toolset = "v142"; windows_sdk = $sdkVersion
        crt = "static /MT"; manifest = "embedded"; win10_smoke = $smokeStatus; pe_api_crt_analysis = "PASS"
        win7_validation = "NOT_PERFORMED"; status_marker = "READY_FOR_WIN10_BUILD until this report is reviewed"
        artifacts = $artifactEntries
    }
    Write-Json $buildResult (Join-Path $EvidenceRoot "build-result.json")
    Stop-Transcript | Out-Null
    $transcriptStopped = $true

    $stamp = [DateTime]::UtcNow.ToString("yyyyMMdd-HHmmss")
    $staging = Join-Path $WorkRoot "result-staging"
    Reset-OwnedDirectory $staging
    Copy-Item -LiteralPath $OutputRoot -Destination (Join-Path $staging "output") -Recurse
    Copy-Item -LiteralPath $EvidenceRoot -Destination (Join-Path $staging "evidence") -Recurse
    Copy-Item -LiteralPath (Join-Path $KitRoot "input-lock.json") -Destination $staging
    Copy-Item -LiteralPath (Join-Path $KitRoot "build-profile.json") -Destination $staging
    Copy-Item -LiteralPath (Join-Path $KitRoot "helper.exe.manifest") -Destination $staging
    $resultZip = Join-Path $ResultRoot ("WIN7_D013_HELPER_ARTIFACTS_" + $stamp + ".zip")
    Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $resultZip -CompressionLevel Optimal -Force
    $resultHash = (Get-FileHash -LiteralPath $resultZip -Algorithm SHA256).Hash.ToLowerInvariant()
    [System.IO.File]::WriteAllText($resultZip + ".sha256", ($resultHash + "  " + [System.IO.Path]::GetFileName($resultZip) + "`r`n"), [System.Text.Encoding]::ASCII)
    if ($finalStatus -eq "PASS") { Write-Host "BUILD PASS" } else { Write-Host "BUILD PARTIAL (smoke skipped/environment)" }
    Write-Host "Return package: $resultZip"
    Write-Host "SHA-256: $resultHash"
} catch {
    Write-Error $_
    exit 1
} finally {
    if (-not $transcriptStopped) { try { Stop-Transcript | Out-Null } catch {} }
}
