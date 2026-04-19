#!/usr/bin/env pwsh

param(
    [switch]$LegacyWebView
)

$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$assets = Join-Path $root "android\app\src\main\assets"
$syncOnlyMarker = Join-Path $root "android\app\src\main\java\com\steady\wrapper\sync\HealthSyncWorker.kt"

if ((Test-Path $syncOnlyMarker) -and -not $LegacyWebView) {
    Write-Host "=== Steady: Android is Health Sync Only ===" -ForegroundColor Cyan
    Write-Host "Root:   $root"
    Write-Host "Assets: $assets"
    Write-Host ""
    Write-Host "Android app is native Health Connect sync only; WebView assets are not used." -ForegroundColor Yellow
    Write-Host "Root HTML/CSS/JS is for GitHub Pages and will not be copied into Android assets." -ForegroundColor Yellow

    if (Test-Path $assets) {
        $resolvedAssets = [System.IO.Path]::GetFullPath($assets)
        $resolvedMain = [System.IO.Path]::GetFullPath((Join-Path $root "android\app\src\main"))
        if ($resolvedAssets.StartsWith($resolvedMain) -and (Split-Path $resolvedAssets -Leaf) -eq "assets") {
            Remove-Item -LiteralPath $resolvedAssets -Recurse -Force
            Write-Host "  [DELETED] stale android/app/src/main/assets" -ForegroundColor Red
        } else {
            throw "Refusing to delete unexpected assets path: $resolvedAssets"
        }
    } else {
        Write-Host "  [OK] android/app/src/main/assets is absent" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "Use .\sync-assets.ps1 -LegacyWebView only for the old WebView build." -ForegroundColor DarkGray
    exit 0
}

Write-Host "=== Steady: Root -> Android Assets Sync ===" -ForegroundColor Cyan
Write-Host "Root:   $root"
Write-Host "Assets: $assets"
Write-Host ""

if (!(Test-Path $assets)) {
    New-Item -ItemType Directory -Path $assets -Force | Out-Null
}

$rootFiles = @(
    "index.html",
    "manifest.json",
    "sw.js"
)

foreach ($file in $rootFiles) {
    $src = Join-Path $root $file
    $dst = Join-Path $assets $file
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination $dst -Force
        Write-Host "  [OK] $file" -ForegroundColor Green
    } else {
        Write-Host "  [SKIP] $file (not found)" -ForegroundColor Yellow
    }
}

$folders = @(
    @{ Name = "css";   Extensions = @(".css") },
    @{ Name = "js";    Extensions = @(".js") },
    @{ Name = "icons"; Extensions = @() }
)

foreach ($folder in $folders) {
    $name = $folder.Name
    $srcDir = Join-Path $root $name
    $dstDir = Join-Path $assets $name

    if (!(Test-Path $srcDir)) {
        Write-Host "  [SKIP] $name/ (not found)" -ForegroundColor Yellow
        continue
    }

    if (!(Test-Path $dstDir)) {
        New-Item -ItemType Directory -Path $dstDir -Force | Out-Null
    }

    $copied = 0
    Get-ChildItem -Path $srcDir -Recurse -File | ForEach-Object {
        if ($folder.Extensions.Count -gt 0 -and $_.Extension -notin $folder.Extensions) {
            return
        }

        $relativePath = $_.FullName.Substring($srcDir.Length).TrimStart('\')
        $targetPath = Join-Path $dstDir $relativePath
        $targetParent = Split-Path $targetPath -Parent

        if (!(Test-Path $targetParent)) {
            New-Item -ItemType Directory -Path $targetParent -Force | Out-Null
        }

        Copy-Item -Path $_.FullName -Destination $targetPath -Force
        $copied++
    }

    Write-Host "  [OK] $name/ ($copied files copied)" -ForegroundColor Green
}

$wwwDir = Join-Path $assets "www"
if (Test-Path $wwwDir) {
    Write-Host ""
    Write-Host "  [WARN] Removing legacy assets/www directory" -ForegroundColor Yellow
    Remove-Item -LiteralPath $wwwDir -Recurse -Force
    Write-Host "  [DELETED] assets/www/" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Verification ===" -ForegroundColor Cyan

$verifyFiles = @(
    "index.html",
    "manifest.json",
    "sw.js",
    "css\index.css",
    "css\final-polish.css",
    "js\app.js",
    "js\db.js",
    "js\judgment.js",
    "js\training.js",
    "js\utils.js",
    "js\final-helpers.js",
    "js\final-views.js",
    "js\sync\sheet-sync.js",
    "js\providers\base-provider.js",
    "js\providers\manual-provider.js",
    "js\providers\health-connect-provider.js",
    "js\views\dashboard.js",
    "js\views\condition-input.js",
    "js\views\workout.js",
    "js\views\health.js",
    "js\views\settings.js",
    "js\views\work-schedule.js",
    "js\views\history.js",
    "js\views\analytics.js",
    "js\views\onboarding.js"
)

$diffCount = 0
foreach ($file in $verifyFiles) {
    $rootFile = Join-Path $root $file
    $assetFile = Join-Path $assets $file

    if (!(Test-Path $rootFile) -or !(Test-Path $assetFile)) {
        Write-Host "  [SKIP] $file (missing in one side)" -ForegroundColor Yellow
        continue
    }

    $rootHash = (Get-FileHash -Path $rootFile).Hash
    $assetHash = (Get-FileHash -Path $assetFile).Hash

    if ($rootHash -ne $assetHash) {
        Write-Host "  [DIFF] $file" -ForegroundColor Red
        $diffCount++
    }
}

if ($diffCount -eq 0) {
    Write-Host "  All verified files are identical." -ForegroundColor Green
} else {
    Write-Host "  $diffCount files differ." -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Sync Complete ===" -ForegroundColor Cyan
