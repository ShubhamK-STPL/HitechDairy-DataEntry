param (
    [string]$TargetDir = "..\new-playwright-project"
)

$targetPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $TargetDir))
Write-Host "`n🚀 Scaffolding new Enterprise Playwright Project at:`n$targetPath`n" -ForegroundColor Cyan

# 1. Directory Tree
$directories = @(
    "docs",
    "scripts",
    "src\api",
    "src\components\table",
    "src\components\modal",
    "src\components\toast",
    "src\components\dropdown",
    "src\components\date-picker",
    "src\config",
    "src\fixtures",
    "src\pages",
    "src\utils",
    "test-data",
    "tests"
)

foreach ($dir in $directories) {
    $fullDir = Join-Path $targetPath $dir
    if (-not (Test-Path $fullDir)) {
        New-Item -ItemType Directory -Path $fullDir -Force | Out-Null
    }
}

# Run node generator to populate starter config files
node (Join-Path (Get-Location) "scaffold-new-project.mjs") $targetPath

Write-Host "`n✨ Done! New project folder structure is ready at:`n$targetPath" -ForegroundColor Green

