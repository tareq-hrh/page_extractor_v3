$ErrorActionPreference = "Stop"

$root = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$manifestPath = Join-Path $root "manifest.json"
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$version = $manifest.version

if (-not $version) {
  throw "manifest.json does not contain a version."
}

$distDir = Join-Path $root "dist"
$stageDir = Join-Path $distDir "smart-page-extractor"
$zipPath = Join-Path $distDir "smart-page-extractor-v$version.zip"

if (-not (Test-Path -LiteralPath $distDir)) {
  New-Item -ItemType Directory -Path $distDir | Out-Null
}

$resolvedRoot = [System.IO.Path]::GetFullPath($root)
$resolvedDist = [System.IO.Path]::GetFullPath($distDir)
$resolvedStage = [System.IO.Path]::GetFullPath($stageDir)

if (-not $resolvedDist.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to write package outside repository root."
}

if (-not $resolvedStage.StartsWith($resolvedDist, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to stage package outside dist directory."
}

if (Test-Path -LiteralPath $stageDir) {
  Remove-Item -LiteralPath $stageDir -Recurse -Force
}

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

New-Item -ItemType Directory -Path $stageDir | Out-Null

$runtimeFiles = @(
  "manifest.json",
  "background.js",
  "content.js",
  "offscreen.html",
  "offscreen.js",
  "popup.html",
  "popup.js",
  "Readability.js",
  "shared.js"
)

foreach ($file in $runtimeFiles) {
  $sourcePath = Join-Path $root $file
  if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw "Missing runtime file: $file"
  }

  Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $stageDir $file)
}

$iconsSource = Join-Path $root "icons"
$iconsDestination = Join-Path $stageDir "icons"

if (-not (Test-Path -LiteralPath $iconsSource)) {
  throw "Missing icons directory."
}

Copy-Item -LiteralPath $iconsSource -Destination $iconsDestination -Recurse

Compress-Archive -Path (Join-Path $stageDir "*") -DestinationPath $zipPath -Force
Remove-Item -LiteralPath $stageDir -Recurse -Force

Write-Host "Created package: $zipPath"
