param(
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

$frontendDir = Join-Path $RepoRoot 'frontend'
$backendStaticfilesDir = Join-Path $RepoRoot 'backend\staticfiles'

if (!(Test-Path $frontendDir)) {
  throw "frontend folder not found at: $frontendDir"
}

Write-Host "RepoRoot: $RepoRoot"
Write-Host "Building frontend…"

Push-Location $frontendDir
try {
  if (!(Test-Path (Join-Path $frontendDir 'node_modules'))) {
    npm install
  }
  npm run build
} finally {
  Pop-Location
}

# Support both output dirs (repo variants): build/ or dist/
$buildOut = Join-Path $frontendDir 'build'
if (!(Test-Path $buildOut)) {
  $buildOut = Join-Path $frontendDir 'dist'
}
if (!(Test-Path $buildOut)) {
  throw "Build output not found (expected frontend\\build or frontend\\dist)."
}

if (!(Test-Path $backendStaticfilesDir)) {
  New-Item -ItemType Directory -Force -Path $backendStaticfilesDir | Out-Null
}

Write-Host "Deploying build output → backend/staticfiles…"

$assetsSrc = Join-Path $buildOut 'assets'
$assetsDst = Join-Path $backendStaticfilesDir 'assets'

if (Test-Path $assetsDst) {
  Remove-Item -Recurse -Force $assetsDst
}
New-Item -ItemType Directory -Force -Path $assetsDst | Out-Null

if (Test-Path $assetsSrc) {
  Copy-Item -Recurse -Force (Join-Path $assetsSrc '*') $assetsDst
} else {
  throw "No assets folder in build output: $assetsSrc"
}

Copy-Item -Force (Join-Path $buildOut 'index.html') (Join-Path $backendStaticfilesDir 'index.html')

# Optional top-level files (if present)
$optionalFiles = @('favicon.png', 'idcs-logo.png')
foreach ($f in $optionalFiles) {
  $src = Join-Path $buildOut $f
  if (Test-Path $src) {
    Copy-Item -Force $src (Join-Path $backendStaticfilesDir $f)
  }
}

Write-Host "Done. If the browser still shows old UI, do a hard refresh (Ctrl+F5) and ensure you’re serving backend/staticfiles/index.html."