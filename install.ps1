#Requires -Version 5.1
<#
.SYNOPSIS
    Installs, builds, and optionally runs CyberFeed as a Windows service.

.DESCRIPTION
    This script:
      1. Checks and installs prerequisites (Go, Node.js) via winget if missing
      2. Builds the React frontend (npm install + npm run build)
      3. Builds the Go binary
      4. Optionally installs CyberFeed as a Windows service (NSSM)
      5. Opens http://localhost:8888 in the default browser

.PARAMETER InstallDir
    Directory to install CyberFeed into. Default: C:\CyberFeed

.PARAMETER InstallService
    If specified, installs CyberFeed as a persistent Windows service.

.PARAMETER ServiceName
    Name for the Windows service. Default: CyberFeed

.PARAMETER SkipPrereqs
    Skip prerequisite checks (Go, Node.js). Use if they are already on PATH.

.PARAMETER NoBrowser
    Do not open the browser after install.

.EXAMPLE
    # Basic install + build in default location
    .\install.ps1

.EXAMPLE
    # Install as a Windows service
    .\install.ps1 -InstallService

.EXAMPLE
    # Custom directory, service install, no browser
    .\install.ps1 -InstallDir D:\Tools\CyberFeed -InstallService -NoBrowser
#>

[CmdletBinding()]
param(
    [string]  $InstallDir     = 'C:\CyberFeed',
    [switch]  $InstallService,
    [string]  $ServiceName    = 'CyberFeed',
    [switch]  $SkipPrereqs,
    [switch]  $NoBrowser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ─── Colour helpers ───────────────────────────────────────────────────────────────────────

function Write-Header([string]$msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
}

function Write-OK([string]$msg)   { Write-Host "  [OK] $msg"    -ForegroundColor Green  }
function Write-Warn([string]$msg) { Write-Host "  [!!] $msg"    -ForegroundColor Yellow }
function Write-Fail([string]$msg) { Write-Host "  [XX] $msg"    -ForegroundColor Red    }
function Write-Info([string]$msg) { Write-Host "       $msg"    -ForegroundColor Gray   }

# ─── Elevation check ───────────────────────────────────────────────────────────────────────────

function Test-Admin {
    $id = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $p  = New-Object System.Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}

if ($InstallService -and -not (Test-Admin)) {
    Write-Fail "Installing as a Windows service requires Administrator privileges."
    Write-Info  "Re-run this script from an elevated PowerShell prompt, or omit -InstallService."
    exit 1
}

# ─── Prerequisite helpers ─────────────────────────────────────────────────────────────────────────

function Get-CommandVersion([string]$cmd, [string]$versionArg = 'version') {
    try {
        $out = & $cmd $versionArg 2>&1 | Select-Object -First 1
        return $out
    } catch {
        return $null
    }
}

function Install-ViaWinget([string]$packageId, [string]$friendlyName) {
    Write-Info "Installing $friendlyName via winget..."
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Fail "winget is not available. Please install $friendlyName manually:"
        Write-Fail "  Go:      https://go.dev/dl/"
        Write-Fail "  Node.js: https://nodejs.org/"
        exit 1
    }
    winget install --id $packageId --silent --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "winget install failed for $friendlyName (exit $LASTEXITCODE)."
        Write-Info "Please install it manually and re-run this script."
        exit 1
    }
    # Refresh PATH for the current session.
    $env:PATH = [System.Environment]::GetEnvironmentVariable('PATH', 'Machine') + ';' +
                [System.Environment]::GetEnvironmentVariable('PATH', 'User')
}

function Assert-Go {
    $ver = Get-CommandVersion 'go' 'version'
    if ($ver) {
        Write-OK "Go found: $ver"
        return
    }
    Write-Warn "Go not found - installing via winget..."
    Install-ViaWinget 'GoLang.Go' 'Go'
    $ver = Get-CommandVersion 'go' 'version'
    if (-not $ver) {
        Write-Fail "Go still not found after install. Open a new terminal and re-run."
        exit 1
    }
    Write-OK "Go installed: $ver"
}

function Assert-NodeNpm {
    $nodeVer = Get-CommandVersion 'node' '--version'
    $npmVer  = Get-CommandVersion 'npm'  '--version'

    if (-not $nodeVer -or -not $npmVer) {
        Write-Warn "Node.js/npm not found - installing via winget..."
        Install-ViaWinget 'OpenJS.NodeJS.LTS' 'Node.js LTS'
        $env:PATH = [System.Environment]::GetEnvironmentVariable('PATH', 'Machine') + ';' +
                    [System.Environment]::GetEnvironmentVariable('PATH', 'User')
        $nodeVer = Get-CommandVersion 'node' '--version'
        if (-not $nodeVer) {
            Write-Fail "Node.js still not found after install. Open a new terminal and re-run."
            exit 1
        }
        Write-OK "Node.js installed: $nodeVer"
        return
    }

    # Validate minimum version (Node 18+ required for Vite 5 / React 18).
    $nodeMajor = ($nodeVer -replace '^v', '') -split '\.' | Select-Object -First 1
    if ([int]$nodeMajor -lt 18) {
        Write-Fail "Node.js $nodeVer is too old. Version 18 or later is required."
        Write-Info "Install the latest LTS from https://nodejs.org/ or run:"
        Write-Info "  winget install --id OpenJS.NodeJS.LTS"
        exit 1
    }

    Write-OK "Node.js found: $nodeVer"
    Write-OK "npm found: $npmVer"
}

# ─── Script root (where install.ps1 lives = project root) ────────────────────────────────────────────

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ScriptDir) { $ScriptDir = Get-Location }

# ─── Banner ───────────────────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "   ___      _               ___              _ " -ForegroundColor Green
Write-Host "  / __|_  _| |__ ___ _ _  | __|__ ___ ___  | |" -ForegroundColor Green
Write-Host " | (__| || | '_ / -_) '_| | _/ -_) -_) _` | |_|" -ForegroundColor Green
Write-Host "  \___|\_,_|_.__\___|_|   |_|\___\___\__,_|  (_)" -ForegroundColor Green
Write-Host "                                                  " -ForegroundColor Green
Write-Host ""
Write-Host "  Security Intelligence Aggregator - Installer" -ForegroundColor Cyan
Write-Host "  Install directory : $InstallDir" -ForegroundColor Gray
Write-Host "  Install as service: $($InstallService.IsPresent)" -ForegroundColor Gray
Write-Host ""

# ─── Step 1 - Prerequisites ──────────────────────────────────────────────────────────────────────────

if (-not $SkipPrereqs) {
    Write-Header "Checking prerequisites"
    Assert-Go
    Assert-NodeNpm
} else {
    Write-Warn "Skipping prerequisite checks (-SkipPrereqs)."
}

# ─── Step 2 - Prepare install directory ───────────────────────────────────────────────────────────────

Write-Header "Preparing install directory"

if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    Write-OK "Created $InstallDir"
} else {
    Write-OK "Directory exists: $InstallDir"
}

# Copy project files (excluding build artefacts and repo metadata).
Write-Info "Copying project files..."
$excludes = @('node_modules', 'dist', 'cyberfeed.exe', 'cyberfeed', '.git', '.github')

Get-ChildItem -Path $ScriptDir -Recurse | ForEach-Object {
    $relative = $_.FullName.Substring($ScriptDir.Length).TrimStart('\\')
    # Skip excluded paths.
    foreach ($ex in $excludes) {
        if ($relative -like "$ex*" -or $relative -like "*\\$ex\\*" -or $relative -like "*\\$ex") {
            return
        }
    }
    $dest = Join-Path $InstallDir $relative
    if ($_.PSIsContainer) {
        if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest -Force | Out-Null }
    } else {
        $destDir = Split-Path $dest -Parent
        if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
        Copy-Item -Path $_.FullName -Destination $dest -Force
    }
}
Write-OK "Project files copied to $InstallDir"

# ─── Step 3 - Build React frontend ───────────────────────────────────────────────────────────────────

Write-Header "Building React frontend"

$webDir = Join-Path $InstallDir 'cmd\server\web'
if (-not (Test-Path $webDir)) {
    Write-Fail "Web directory not found: $webDir"
    Write-Info "Ensure the project was copied correctly."
    exit 1
}

Push-Location $webDir
try {
    # npm writes notices/warnings to stderr which PowerShell treats as errors.
    # Use cmd /c to merge stderr into stdout, then check exit code for real failures.
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'

    Write-Info "Running npm install..."
    $npmOut = cmd /c "npm install --prefer-offline 2>&1"
    $npmExit = $LASTEXITCODE
    $npmOut | ForEach-Object { Write-Info $_ }
    if ($npmExit -ne 0) { throw "npm install failed (exit $npmExit)" }
    Write-OK "npm install complete"

    # Run npm audit and report any vulnerabilities found.
    Write-Info "Running npm audit..."
    $auditOut = cmd /c "npm audit --json 2>&1"
    try {
        $audit = $auditOut | ConvertFrom-Json
        $total = $audit.metadata.vulnerabilities.total
        if ($total -gt 0) {
            $v = $audit.metadata.vulnerabilities
            Write-Host ""
            Write-Host "  [!!] npm audit found $total vulnerabilit$(if ($total -eq 1) {'y'} else {'ies'}):" -ForegroundColor Yellow
            if ($v.critical -gt 0) { Write-Host "       Critical  : $($v.critical)" -ForegroundColor Red     }
            if ($v.high     -gt 0) { Write-Host "       High      : $($v.high)"     -ForegroundColor Red     }
            if ($v.moderate -gt 0) { Write-Host "       Moderate  : $($v.moderate)" -ForegroundColor Yellow  }
            if ($v.low      -gt 0) { Write-Host "       Low       : $($v.low)"      -ForegroundColor Cyan    }
            if ($v.info     -gt 0) { Write-Host "       Info      : $($v.info)"     -ForegroundColor Gray    }
            Write-Host ""
            if ($audit.vulnerabilities) {
                $audit.vulnerabilities.PSObject.Properties | ForEach-Object {
                    $pkg = $_.Value
                    $sev = $pkg.severity.ToUpper()
                    $sevColor = switch ($pkg.severity) {
                        'critical' { 'Red'    }
                        'high'     { 'Red'    }
                        'moderate' { 'Yellow' }
                        'low'      { 'Cyan'   }
                        default    { 'Gray'   }
                    }
                    Write-Host "       [$sev] $($pkg.name)" -ForegroundColor $sevColor
                    if ($pkg.via -and $pkg.via.Count -gt 0) {
                        $pkg.via | Where-Object { $_ -is [PSCustomObject] } | ForEach-Object {
                            if ($_.url)   { Write-Host "              Advisory : $($_.url)"   -ForegroundColor Gray }
                            if ($_.title) { Write-Host "              Detail   : $($_.title)" -ForegroundColor Gray }
                        }
                    }
                    if ($pkg.fixAvailable -eq $true) {
                        Write-Host "              Fix      : run npm audit fix" -ForegroundColor Green
                    } elseif ($pkg.fixAvailable -and $pkg.fixAvailable -is [PSCustomObject]) {
                        Write-Host "              Fix      : breaking change in $($pkg.fixAvailable.name)@$($pkg.fixAvailable.version)" -ForegroundColor Yellow
                    }
                }
            }
            Write-Host ""
            Write-Warn "To resolve: cd `"$webDir`" && npm audit fix"
            Write-Host ""
        } else {
            Write-OK "npm audit: no vulnerabilities found"
        }
    } catch {
        Write-Warn "Could not parse npm audit JSON - raw output:"
        $auditOut | ForEach-Object { Write-Info $_ }
    }

    Write-Info "Running npm run build..."
    $buildOut = cmd /c "npm run build 2>&1"
    $buildExit = $LASTEXITCODE
    $buildOut | ForEach-Object { Write-Info $_ }
    if ($buildExit -ne 0) { throw "npm run build failed (exit $buildExit)" }

    $ErrorActionPreference = $prev

    $distIndex = Join-Path $webDir 'dist\index.html'
    if (-not (Test-Path $distIndex)) {
        throw "dist/index.html not found after build - something went wrong"
    }
    Write-OK "Frontend built successfully"
} finally {
    $ErrorActionPreference = $prev
    Pop-Location
}

# ─── Step 4 - Build Go binary ─────────────────────────────────────────────────────────────────────────────

Write-Header "Building Go binary"

Push-Location $InstallDir
try {
    $binaryPath = Join-Path $InstallDir 'cyberfeed.exe'
    $env:CGO_ENABLED = '0'
    Write-Info "Running: go build -ldflags=`"-s -w`" -trimpath -o cyberfeed.exe ./cmd/server"
    # Run without 2>&1 pipe — PowerShell treats go's download progress (stderr) as
    # NativeCommandError when piped through ForEach-Object, even though it isn't an error.
    go build -ldflags="-s -w" -trimpath -o $binaryPath .\cmd\server
    if ($LASTEXITCODE -ne 0) { throw "go build failed (exit $LASTEXITCODE)" }
    if (-not (Test-Path $binaryPath)) { throw "cyberfeed.exe not found after build" }
    Write-OK "Binary built: $binaryPath"
} finally {
    Pop-Location
}

# ─── Step 5 - Windows service (optional) ───────────────────────────────────────────────────────────────

if ($InstallService) {
    Write-Header "Installing Windows service: $ServiceName"

    $nssmPath = Join-Path $InstallDir 'nssm.exe'

    # Download NSSM if not present.
    if (-not (Test-Path $nssmPath)) {
        Write-Info "Downloading NSSM (Non-Sucking Service Manager)..."
        $nssmUrl = 'https://nssm.cc/release/nssm-2.24.zip'
        $nssmZip = Join-Path $env:TEMP 'nssm.zip'
        $nssmTmp = Join-Path $env:TEMP 'nssm-extract'

        try {
            Invoke-WebRequest -Uri $nssmUrl -OutFile $nssmZip -UseBasicParsing
            Expand-Archive -Path $nssmZip -DestinationPath $nssmTmp -Force
            $arch = if ([Environment]::Is64BitOperatingSystem) { 'win64' } else { 'win32' }
            $nssmSrc = Get-ChildItem -Path $nssmTmp -Recurse -Filter 'nssm.exe' |
                       Where-Object { $_.FullName -like "*$arch*" } |
                       Select-Object -First 1
            if (-not $nssmSrc) { throw "Could not locate nssm.exe ($arch) in archive" }
            Copy-Item -Path $nssmSrc.FullName -Destination $nssmPath -Force
            Write-OK "NSSM downloaded and extracted"
        } catch {
            Write-Warn "Could not download NSSM: $_"
            Write-Warn "Falling back to sc.exe for service registration."
            $nssmPath = $null
        } finally {
            Remove-Item $nssmZip -ErrorAction SilentlyContinue
            Remove-Item $nssmTmp -Recurse -ErrorAction SilentlyContinue
        }
    } else {
        Write-OK "NSSM already present: $nssmPath"
    }

    $binaryPath = Join-Path $InstallDir 'cyberfeed.exe'

    # Remove existing service if present.
    $existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Info "Stopping and removing existing service '$ServiceName'..."
        if ($existing.Status -eq 'Running') {
            Stop-Service -Name $ServiceName -Force
        }
        if ($nssmPath) {
            & $nssmPath remove $ServiceName confirm 2>&1 | Out-Null
        } else {
            sc.exe delete $ServiceName | Out-Null
        }
        Start-Sleep -Seconds 2
    }

    if ($nssmPath) {
        $logDir = Join-Path $InstallDir 'logs'
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null

        & $nssmPath install $ServiceName $binaryPath
        & $nssmPath set $ServiceName AppDirectory $InstallDir
        & $nssmPath set $ServiceName AppStdout (Join-Path $logDir 'cyberfeed.log')
        & $nssmPath set $ServiceName AppStderr (Join-Path $logDir 'cyberfeed-error.log')
        & $nssmPath set $ServiceName AppRotateFiles 1
        & $nssmPath set $ServiceName AppRotateBytes 10485760
        & $nssmPath set $ServiceName Description 'CyberFeed Security Intelligence Aggregator'
        & $nssmPath set $ServiceName Start SERVICE_AUTO_START
        Write-OK "Service '$ServiceName' registered via NSSM"
    } else {
        sc.exe create $ServiceName binPath= "`"$binaryPath`"" start= auto DisplayName= "CyberFeed"
        sc.exe description $ServiceName "CyberFeed Security Intelligence Aggregator"
        Write-OK "Service '$ServiceName' registered via sc.exe"
    }

    Start-Service -Name $ServiceName
    Start-Sleep -Seconds 2
    $svc = Get-Service -Name $ServiceName
    if ($svc.Status -eq 'Running') {
        Write-OK "Service '$ServiceName' is running"
    } else {
        Write-Warn "Service '$ServiceName' status: $($svc.Status)"
        Write-Info "Check logs in: $(Join-Path $InstallDir 'logs')"
    }
}

# ─── Step 6 - Create desktop shortcut ───────────────────────────────────────────────────────────────────

Write-Header "Creating shortcuts"

try {
    $wsh      = New-Object -ComObject WScript.Shell
    $desktop  = [System.Environment]::GetFolderPath('Desktop')
    $lnkPath  = Join-Path $desktop 'CyberFeed.lnk'
    $lnk      = $wsh.CreateShortcut($lnkPath)

    if ($InstallService) {
        $lnk.TargetPath     = 'http://localhost:8888'
        $lnk.Description    = 'Open CyberFeed in browser'
    } else {
        $lnk.TargetPath     = Join-Path $InstallDir 'cyberfeed.exe'
        $lnk.WorkingDirectory = $InstallDir
        $lnk.Description    = 'CyberFeed Security Intelligence Aggregator'
    }
    $lnk.Save()
    Write-OK "Desktop shortcut created: $lnkPath"
} catch {
    Write-Warn "Could not create desktop shortcut: $_"
}

# ─── Step 7 - Add to PATH (optional, for non-service install) ─────────────────────────────────────────

if (-not $InstallService) {
    $currentPath = [System.Environment]::GetEnvironmentVariable('PATH', 'User')
    if ($currentPath -notlike "*$InstallDir*") {
        Write-Header "Adding $InstallDir to user PATH"
        [System.Environment]::SetEnvironmentVariable(
            'PATH',
            "$currentPath;$InstallDir",
            'User'
        )
        $env:PATH += ";$InstallDir"
        Write-OK "Added to user PATH (effective in new terminals)"
    }
}

# ─── Done ───────────────────────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "-------------------------------------------------" -ForegroundColor Green
Write-Host "  CyberFeed installed successfully!" -ForegroundColor Green
Write-Host "-------------------------------------------------" -ForegroundColor Green
Write-Host ""
Write-Host "  Install dir : $InstallDir" -ForegroundColor Cyan
Write-Host "  Binary      : $(Join-Path $InstallDir 'cyberfeed.exe')" -ForegroundColor Cyan

if ($InstallService) {
    Write-Host "  Service     : $ServiceName (auto-start)" -ForegroundColor Cyan
    Write-Host "  Logs        : $(Join-Path $InstallDir 'logs')" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Manage service:" -ForegroundColor Gray
    Write-Host "    Start : Start-Service $ServiceName" -ForegroundColor Gray
    Write-Host "    Stop  : Stop-Service  $ServiceName" -ForegroundColor Gray
    Write-Host "    Remove: nssm remove   $ServiceName confirm  (run as Admin)" -ForegroundColor Gray
} else {
    Write-Host ""
    Write-Host "  To run manually:" -ForegroundColor Gray
    Write-Host "    cd `"$InstallDir`" && .\cyberfeed.exe" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  To install as a service later:" -ForegroundColor Gray
    Write-Host "    .\install.ps1 -InstallService" -ForegroundColor Gray
}

Write-Host ""
Write-Host "  Web UI: http://localhost:8888" -ForegroundColor Green
Write-Host ""

if (-not $NoBrowser) {
    if ($InstallService) {
        Write-Info "Opening browser in 3 seconds..."
        Start-Sleep -Seconds 3
        Start-Process 'http://localhost:8888'
    } else {
        $launch = Read-Host "Launch CyberFeed now? [Y/n]"
        if ($launch -ne 'n' -and $launch -ne 'N') {
            Write-Info "Starting cyberfeed.exe..."
            Start-Process -FilePath (Join-Path $InstallDir 'cyberfeed.exe') -WorkingDirectory $InstallDir
            Start-Sleep -Seconds 3
            Start-Process 'http://localhost:8888'
        }
    }
}
