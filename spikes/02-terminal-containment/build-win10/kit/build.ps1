[CmdletBinding()]
param([switch]$SkipSmoke)

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

Ensure-Directory $EvidenceRoot
Start-Transcript -Path $TranscriptPath -Force | Out-Null
$transcriptStopped = $false

try {
    $lock = Get-Content -LiteralPath (Join-Path $KitRoot "input-lock.json") -Raw -Encoding UTF8 | ConvertFrom-Json
    $profile = Get-Content -LiteralPath (Join-Path $KitRoot "build-profile.json") -Raw -Encoding UTF8 | ConvertFrom-Json

    Write-Host "[1/8] Verify full package manifest, locked sources and build lock"
    $packageManifest = Get-Content -LiteralPath (Join-Path $KitRoot "PACKAGE_MANIFEST.json") -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($entry in $packageManifest.files) {
        $path = Join-Path $KitRoot ([string]$entry.path).Replace('/', '\')
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing package file: $($entry.path)" }
        if ((Get-Item -LiteralPath $path).Length -ne [int64]$entry.size) { throw "Package file size mismatch: $($entry.path)" }
        if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne ([string]$entry.sha256).ToLowerInvariant()) {
            throw "Package file SHA-256 mismatch: $($entry.path)"
        }
    }
    $verifiedInputs = @()
    foreach ($entry in $lock.inputs) {
        $path = Join-Path $KitRoot ([string]$entry.path)
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing locked input: $($entry.path)" }
        $actualHash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
        $actualSize = (Get-Item -LiteralPath $path).Length
        if ($actualHash -ne ([string]$entry.sha256).ToLowerInvariant()) { throw "SHA-256 mismatch: $($entry.path)" }
        if ($actualSize -ne [int64]$entry.size) { throw "Size mismatch: $($entry.path)" }
        $verifiedInputs += [ordered]@{ path = $entry.path; sha256 = $actualHash; size = $actualSize; status = "PASS" }
    }
    Write-Json ([ordered]@{ schema_version = 1; status = "PASS"; inputs = $verifiedInputs }) (Join-Path $EvidenceRoot "input-verification.json")

    Write-Host "[2/8] Enforce Win10 + VS2019 + v142 + SDK 10.0.19041.0 + Python 3.8.10 x64"
    if (-not [Environment]::Is64BitOperatingSystem) { throw "A 64-bit Windows build host is required." }
    $os = Get-CimInstance Win32_OperatingSystem
    if ($os.Caption -notlike "*Windows 10*") { throw "This locked profile requires Windows 10 x64; detected: $($os.Caption)." }

    $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
    if (-not (Test-Path -LiteralPath $vswhere)) { throw "vswhere.exe not found." }
    $vsArgs = @('-latest', '-version', '[16.0,17.0)', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.v142.x86.x64')
    $vsPath = (& $vswhere @vsArgs -property installationPath | Select-Object -First 1)
    $vsVersion = (& $vswhere @vsArgs -property installationVersion | Select-Object -First 1)
    if (-not $vsPath -or -not ([string]$vsVersion).StartsWith('16.')) { throw "Visual Studio 2019 with v142 x64 was not detected." }

    $msvcRoot = Join-Path $vsPath "VC\Tools\MSVC"
    $msvcDirectory = Get-ChildItem -LiteralPath $msvcRoot -Directory | Where-Object { $_.Name -like '14.2*' } | Sort-Object Name -Descending | Select-Object -First 1
    if (-not $msvcDirectory) { throw "An MSVC 14.2x (v142) compiler directory was not detected." }
    $dumpbin = Join-Path $msvcDirectory.FullName "bin\Hostx64\x64\dumpbin.exe"
    if (-not (Test-Path -LiteralPath $dumpbin)) { throw "dumpbin.exe x64 was not detected." }
    $tarCommand = Get-Command tar.exe -ErrorAction SilentlyContinue
    if (-not $tarCommand) { throw "Windows 10 tar.exe was not detected." }

    $sdkVersion = [string]$profile.build_host.windows_sdk_version
    $sdkInclude = Join-Path ${env:ProgramFiles(x86)} ("Windows Kits\10\Include\" + $sdkVersion)
    $sdkLib = Join-Path ${env:ProgramFiles(x86)} ("Windows Kits\10\Lib\" + $sdkVersion)
    if (-not (Test-Path -LiteralPath $sdkInclude) -or -not (Test-Path -LiteralPath $sdkLib)) {
        throw "Locked Windows SDK $sdkVersion was not detected."
    }

    $pythonExe = $null
    try { $pythonExe = (& py -3.8 -c "import sys; print(sys.executable)" 2>$null | Select-Object -First 1) } catch {}
    if (-not $pythonExe) { throw "CPython 3.8.10 x64 was not detected through py -3.8." }
    $pythonFacts = (& $pythonExe -c "import json,platform; print(json.dumps({'version':platform.python_version(),'machine':platform.machine()}))" | ConvertFrom-Json)
    if ($pythonFacts.version -ne [string]$profile.build_host.python_version -or $pythonFacts.machine -ne [string]$profile.build_host.python_architecture) {
        throw "Expected Python 3.8.10 AMD64; detected $($pythonFacts.version) $($pythonFacts.machine)."
    }

    $environment = [ordered]@{
        schema_version = 1; status = "PASS"; captured_at = [DateTime]::UtcNow.ToString("o")
        computer_name = $env:COMPUTERNAME; os_caption = $os.Caption; os_version = $os.Version; os_build = $os.BuildNumber
        powershell = $PSVersionTable.PSVersion.ToString(); visual_studio_path = $vsPath; visual_studio_version = $vsVersion
        msvc_version = $msvcDirectory.Name; platform_toolset = "v142"; windows_sdk_version = $sdkVersion
        python_executable = $pythonExe; python_version = $pythonFacts.version; python_architecture = $pythonFacts.machine
        archive_tool = $tarCommand.Source; network_required = $false
    }
    Write-Json $environment (Join-Path $EvidenceRoot "environment.json")

    Write-Host "[3/8] Restore locked offline npm tooling"
    Reset-OwnedDirectory $WorkRoot
    Reset-OwnedDirectory $OutputRoot
    Ensure-Directory $ResultRoot
    $nodeRuntimeRoot = Join-Path $WorkRoot "node-runtime"
    Expand-Archive -LiteralPath (Join-Path $KitRoot "inputs\node-v16.17.1-win-x64.zip") -DestinationPath $nodeRuntimeRoot -Force
    $nodeHome = Join-Path $nodeRuntimeRoot "node-v16.17.1-win-x64"
    $nodeExe = Join-Path $nodeHome "node.exe"
    $npmCmd = Join-Path $nodeHome "npm.cmd"
    if (-not (Test-Path -LiteralPath $nodeExe)) { throw "Bundled Node runtime extraction failed." }

    $tooling = Join-Path $KitRoot "tooling"
    Push-Location $tooling
    try {
        & $npmCmd ci --offline --ignore-scripts --cache (Join-Path $KitRoot "npm-cache") --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw "Offline npm ci failed with exit code $LASTEXITCODE." }
    } finally { Pop-Location }

    Write-Host "[4/8] Reconstruct actual Electron headers and embedded winpty from verified archives"
    $headersExtract = Join-Path $WorkRoot "electron-headers"
    Ensure-Directory $headersExtract
    & $tarCommand.Source -xzf (Join-Path $KitRoot "inputs\node-v22.3.27-headers.tar.gz") -C $headersExtract
    if ($LASTEXITCODE -ne 0) { throw "Electron header extraction failed." }
    $headers = Join-Path $headersExtract "node_headers"
    Ensure-Directory (Join-Path $headers "x64")
    Copy-Item -LiteralPath (Join-Path $KitRoot "inputs\electron-v22.3.27-win-x64-node.lib") -Destination (Join-Path $headers "x64\node.lib") -Force
    if (-not (Test-Path -LiteralPath (Join-Path $headers "include\node\common.gypi"))) { throw "Extracted Electron headers are incomplete." }

    $headerEntries = @()
    foreach ($file in Get-ChildItem -LiteralPath $headers -Recurse -File | Sort-Object FullName) {
        $headerEntries += [ordered]@{ path = (Get-RelativeFileName $headers $file.FullName); size = $file.Length; sha256 = (Get-FileHash $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
    }
    Write-Json ([ordered]@{ schema_version = 1; status = "PASS"; source_archive_sha256 = "d89090506d7828888aaae85e4b8653a6700ec3ac11d95eb873cc4a30ac3cb743"; files = $headerEntries }) (Join-Path $EvidenceRoot "actual-electron-headers.json")

    $nodePtySource = Join-Path $tooling "node_modules\node-pty"
    $bundledWinpty = Join-Path $nodePtySource "deps\winpty"
    if (Test-Path -LiteralPath $bundledWinpty) { Remove-Item -LiteralPath $bundledWinpty -Recurse -Force }
    Ensure-Directory $bundledWinpty
    Expand-Archive -LiteralPath (Join-Path $KitRoot "inputs\node-pty-0.10.0-embedded-winpty-0.4.4-dev.zip") -DestinationPath $bundledWinpty -Force
    $winptyVersion = (Get-Content -LiteralPath (Join-Path $bundledWinpty "VERSION.txt") -Raw).Trim()
    if ($winptyVersion -ne "0.4.4-dev") { throw "Embedded winpty snapshot version mismatch." }
    $winptyHeader = Get-Content -LiteralPath (Join-Path $bundledWinpty "src\include\winpty.h") -Raw
    $winptyImpl = Get-Content -LiteralPath (Join-Path $bundledWinpty "src\libwinpty\winpty.cc") -Raw
    if ($winptyHeader -notmatch 'winpty_get_console_process_list' -or $winptyImpl -notmatch 'winpty_get_console_process_list') {
        throw "The locked winpty snapshot does not satisfy the node-pty 0.10.0 API contract."
    }
    $sourceContract = Get-Content -LiteralPath (Join-Path $KitRoot "compliance\source-contract.json") -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($entry in $sourceContract.files) {
        $contractPath = Join-Path $nodePtySource ([string]$entry.path_in_node_pty_tgz).Replace('/', '\')
        $contractHash = (Get-FileHash -LiteralPath $contractPath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($contractHash -ne ([string]$entry.sha256).ToLowerInvariant()) { throw "Source contract hash mismatch: $($entry.path_in_node_pty_tgz)" }
    }

    Write-Host "[5/8] Configure exact VS2019/v142/SDK build, then compile Electron ABI 110"
    $env:PATH = $nodeHome + ';' + $env:PATH
    $env:npm_config_python = $pythonExe
    $env:npm_config_msvs_version = "2019"
    $env:GYP_MSVS_VERSION = "2019"
    $env:GYP_MSVS_OVERRIDE_PATH = $vsPath
    $env:WindowsSDKVersion = $sdkVersion + '\'
    $env:VCToolsVersion = $msvcDirectory.Name
    $env:CL = "/D_WIN32_WINNT=0x0601 /DWINVER=0x0601"
    $nodeGyp = Join-Path $tooling "node_modules\node-gyp\bin\node-gyp.js"
    $gypCommon = @('--directory', $nodePtySource, '--target=22.3.27', '--arch=x64', ("--nodedir=" + $headers), '--msvs_version=2019', '--release')
    & $nodeExe $nodeGyp configure @gypCommon
    if ($LASTEXITCODE -ne 0) { throw "node-gyp configure failed with exit code $LASTEXITCODE." }

    $projects = @(Get-ChildItem -LiteralPath (Join-Path $nodePtySource "build") -Recurse -File -Filter *.vcxproj)
    if ($projects.Count -eq 0) { throw "node-gyp did not generate Visual C++ projects." }
    foreach ($project in $projects) {
        $text = Get-Content -LiteralPath $project.FullName -Raw
        $sdkElement = '<WindowsTargetPlatformVersion>' + $sdkVersion + '</WindowsTargetPlatformVersion>'
        $toolsElement = '<VCToolsVersion>' + $msvcDirectory.Name + '</VCToolsVersion>'
        if ($text -match '<WindowsTargetPlatformVersion>.*?</WindowsTargetPlatformVersion>') {
            $text = [regex]::Replace($text, '<WindowsTargetPlatformVersion>.*?</WindowsTargetPlatformVersion>', $sdkElement)
        } elseif ($text -match '<PropertyGroup Label="Globals">') {
            $text = $text.Replace('<PropertyGroup Label="Globals">', '<PropertyGroup Label="Globals">' + "`r`n    " + $sdkElement)
        } else {
            throw "Cannot pin Windows SDK in generated project $($project.FullName)."
        }
        if ($text -match '<VCToolsVersion>.*?</VCToolsVersion>') {
            $text = [regex]::Replace($text, '<VCToolsVersion>.*?</VCToolsVersion>', $toolsElement)
        } else {
            $text = $text.Replace('<PropertyGroup Label="Globals">', '<PropertyGroup Label="Globals">' + "`r`n    " + $toolsElement)
        }
        [System.IO.File]::WriteAllText($project.FullName, $text, (New-Object System.Text.UTF8Encoding($true)))
    }
    $projectText = ($projects | ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw }) -join "`n"
    if ($projectText -notmatch '<PlatformToolset>v142</PlatformToolset>') { throw "Generated projects are not locked to v142." }
    if ($projectText -notmatch ([regex]::Escape('<WindowsTargetPlatformVersion>' + $sdkVersion + '</WindowsTargetPlatformVersion>'))) {
        throw "Generated projects are not locked to Windows SDK $sdkVersion."
    }
    $projectPins = @()
    foreach ($project in $projects | Sort-Object FullName) {
        $projectPins += [ordered]@{ path = (Get-RelativeFileName (Join-Path $nodePtySource "build") $project.FullName); sha256 = (Get-FileHash $project.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
    }
    Write-Json ([ordered]@{ schema_version = 1; status = "PASS"; platform_toolset = "v142"; msvc_version = $msvcDirectory.Name; windows_sdk = $sdkVersion; projects = $projectPins }) (Join-Path $EvidenceRoot "generated-project-pins.json")
    & $nodeExe $nodeGyp build @gypCommon
    if ($LASTEXITCODE -ne 0) { throw "node-gyp build failed with exit code $LASTEXITCODE." }

    $nodePtyOutput = Join-Path $OutputRoot "node-pty"
    Ensure-Directory $nodePtyOutput
    foreach ($name in @('package.json', 'LICENSE', 'README.md', 'lib', 'typings')) {
        $source = Join-Path $nodePtySource $name
        if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $nodePtyOutput $name) -Recurse }
    }
    $sourceRelease = Join-Path $nodePtySource "build\Release"
    $outputRelease = Join-Path $nodePtyOutput "build\Release"
    Ensure-Directory $outputRelease
    $prunedConpty = @()
    foreach ($file in Get-ChildItem -LiteralPath $sourceRelease -File -Filter conpty*.node) {
        $prunedConpty += Get-RelativeFileName $nodePtySource $file.FullName
    }
    foreach ($name in @('pty.node', 'winpty-agent.exe', 'winpty.dll')) {
        $source = Join-Path $sourceRelease $name
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Required runtime artifact is missing: $name" }
        Copy-Item -LiteralPath $source -Destination (Join-Path $outputRelease $name)
    }
    $nativeModules = @(Get-ChildItem -LiteralPath $nodePtyOutput -Recurse -File -Filter *.node)
    $agents = @(Get-ChildItem -LiteralPath $nodePtyOutput -Recurse -File -Filter winpty-agent.exe)
    if ($nativeModules.Count -eq 0 -or $agents.Count -eq 0) { throw "Required node-pty/winpty native outputs were not produced." }
    $electronOutput = Join-Path $OutputRoot "electron"
    Expand-Archive -LiteralPath (Join-Path $KitRoot "inputs\electron-v22.3.27-win32-x64.zip") -DestinationPath $electronOutput -Force

    Write-Host "[6/8] Fail closed on PE architecture, forbidden APIs and CRT closure"
    $nativeFiles = @(Get-ChildItem -LiteralPath $nodePtyOutput -Recurse -File | Where-Object { $_.Extension -in @('.node', '.dll', '.exe') })
    $peResults = @()
    $peFailure = $false
    $crtRegex = '(?i)\b(?:VCRUNTIME[0-9_A-Z]*|MSVCP[0-9_A-Z]*|UCRTBASE|API-MS-WIN-CRT-[0-9A-Z-]+)\.DLL\b'
    foreach ($file in $nativeFiles) {
        $safe = (Get-RelativeFileName $nodePtyOutput $file.FullName).Replace('/', '__')
        $headersLog = Join-Path $EvidenceRoot ("pe-" + $safe + "-headers.txt")
        $dependentsLog = Join-Path $EvidenceRoot ("pe-" + $safe + "-dependents.txt")
        $importsLog = Join-Path $EvidenceRoot ("pe-" + $safe + "-imports.txt")
        $headerLines = @(& $dumpbin /HEADERS $file.FullName 2>&1)
        if ($LASTEXITCODE -ne 0) { throw "dumpbin /HEADERS failed for $($file.FullName)." }
        $dependentLines = @(& $dumpbin /DEPENDENTS $file.FullName 2>&1)
        if ($LASTEXITCODE -ne 0) { throw "dumpbin /DEPENDENTS failed for $($file.FullName)." }
        $importLines = @(& $dumpbin /IMPORTS $file.FullName 2>&1)
        if ($LASTEXITCODE -ne 0) { throw "dumpbin /IMPORTS failed for $($file.FullName)." }
        [System.IO.File]::WriteAllLines($headersLog, [string[]]$headerLines, [System.Text.Encoding]::UTF8)
        [System.IO.File]::WriteAllLines($dependentsLog, [string[]]$dependentLines, [System.Text.Encoding]::UTF8)
        [System.IO.File]::WriteAllLines($importsLog, [string[]]$importLines, [System.Text.Encoding]::UTF8)
        $headerText = $headerLines -join "`n"
        $importText = ($dependentLines + $importLines) -join "`n"
        $isX64 = $headerText -match '(?i)8664.*\(x64\)'
        $forbiddenHits = @()
        foreach ($api in $profile.forbidden_imports) { if ($importText -match ('(?i)\b' + [regex]::Escape([string]$api) + '\b')) { $forbiddenHits += [string]$api } }
        $crtDependencies = @([regex]::Matches($importText, $crtRegex) | ForEach-Object { $_.Value.ToUpperInvariant() } | Sort-Object -Unique)
        $missingCrt = @()
        foreach ($crt in $crtDependencies) {
            if (-not (Get-ChildItem -LiteralPath $OutputRoot -Recurse -File | Where-Object { $_.Name.ToUpperInvariant() -eq $crt } | Select-Object -First 1)) { $missingCrt += $crt }
        }
        $status = "PASS"
        if (-not $isX64 -or $forbiddenHits.Count -gt 0 -or $missingCrt.Count -gt 0) { $status = "FAIL"; $peFailure = $true }
        $peResults += [ordered]@{ path = (Get-RelativeFileName $nodePtyOutput $file.FullName); status = $status; x64 = $isX64; forbidden_imports = $forbiddenHits; dynamic_crt_dependencies = $crtDependencies; missing_crt_dependencies = $missingCrt }
    }
    Write-Json ([ordered]@{ schema_version = 1; status = $(if ($peFailure) { "FAIL" } else { "PASS" }); dumpbin = $dumpbin; files = $peResults }) (Join-Path $EvidenceRoot "pe-api-crt-analysis.json")
    if ($peFailure) { throw "PE/API/CRT closure failed. See pe-api-crt-analysis.json." }

    Write-Host "[7/8] Load native ABI in Electron and force the winpty backend"
    $smokeStatus = "SKIPPED"
    if (-not $SkipSmoke) {
        $env:WIN10_BUILD_OUTPUT = $OutputRoot
        $smokeStdout = Join-Path $EvidenceRoot "smoke-stdout.txt"
        $smokeStderr = Join-Path $EvidenceRoot "smoke-stderr.txt"
        $smokeScript = Join-Path $KitRoot "smoke\main.cjs"
        $smokeProcess = Start-Process -FilePath (Join-Path $electronOutput "electron.exe") -ArgumentList @('"' + $smokeScript + '"') -Wait -PassThru -NoNewWindow -RedirectStandardOutput $smokeStdout -RedirectStandardError $smokeStderr
        if ($smokeProcess.ExitCode -ne 0) { throw "Win10 Electron/winpty smoke failed with exit code $($smokeProcess.ExitCode)." }
        $smokeText = Get-Content -LiteralPath $smokeStdout -Raw
        if ($smokeText -notmatch 'WIN10_NATIVE_SMOKE' -or $smokeText -notmatch '"modules":"110"' -or $smokeText -notmatch '"forced_backend":"winpty"') {
            throw "Smoke did not prove marker, Electron ABI 110 and forced winpty backend."
        }
        $smokeStatus = "PASS"
    }

    Write-Host "[8/8] Produce evidence-bound return package"
    $artifactEntries = @()
    foreach ($file in Get-ChildItem -LiteralPath $OutputRoot -Recurse -File) {
        $artifactEntries += [ordered]@{ path = (Get-RelativeFileName $OutputRoot $file.FullName); size = $file.Length; sha256 = (Get-FileHash $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
    }
    $finalStatus = $(if ($smokeStatus -eq "PASS") { "PASS" } else { "PARTIAL" })
    $buildResult = [ordered]@{
        schema_version = 2; status = $finalStatus; profile = $profile.profile; completed_at = [DateTime]::UtcNow.ToString("o")
        electron = "22.3.27"; electron_abi = 110; node = "16.17.1"; node_pty = "0.10.0"
        winpty = "0.4.4-dev-embedded-snapshot"; architecture = "x64"; toolset = "v142"
        windows_sdk = $sdkVersion; windows_10_smoke = $smokeStatus; pe_api_crt_analysis = "PASS"
        pruned_win10_only_native_artifacts = $prunedConpty
        win7_validation = "NOT_PERFORMED"; build_host_missing_gate = "NOT_CLEARED_UNTIL_THIS_REPORT_IS_REVIEWED"
        artifacts = $artifactEntries
    }
    Write-Json $buildResult (Join-Path $EvidenceRoot "build-result.json")
    Stop-Transcript | Out-Null
    $transcriptStopped = $true

    $stamp = [DateTime]::UtcNow.ToString("yyyyMMdd-HHmmss")
    $staging = Join-Path $WorkRoot "result-staging"
    Ensure-Directory $staging
    Copy-Item -LiteralPath $OutputRoot -Destination (Join-Path $staging "output") -Recurse
    Copy-Item -LiteralPath $EvidenceRoot -Destination (Join-Path $staging "evidence") -Recurse
    Copy-Item -LiteralPath (Join-Path $KitRoot "input-lock.json") -Destination $staging
    Copy-Item -LiteralPath (Join-Path $KitRoot "build-profile.json") -Destination $staging
    Copy-Item -LiteralPath (Join-Path $KitRoot "compliance") -Destination (Join-Path $staging "compliance") -Recurse
    $resultZip = Join-Path $ResultRoot ("WIN7_NATIVE_ARTIFACTS_" + $stamp + ".zip")
    Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $resultZip -CompressionLevel Optimal -Force
    $resultHash = (Get-FileHash -LiteralPath $resultZip -Algorithm SHA256).Hash.ToLowerInvariant()
    [System.IO.File]::WriteAllText($resultZip + ".sha256", ($resultHash + "  " + [System.IO.Path]::GetFileName($resultZip) + "`r`n"), [System.Text.Encoding]::ASCII)
    if ($finalStatus -eq "PASS") { Write-Host "BUILD PASS" } else { Write-Host "BUILD PARTIAL (smoke skipped)" }
    Write-Host "Return package: $resultZip"
    Write-Host "SHA-256: $resultHash"
} catch {
    Write-Error $_
    exit 1
} finally {
    if (-not $transcriptStopped) { try { Stop-Transcript | Out-Null } catch {} }
}
