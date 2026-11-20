param(
    [string]$OutDir = "audit/bench_results",
    [string]$AuditDir = "audit",
    [string]$EvalScript = "scripts/evalAllTracksAndCars.py",
    [string]$MinifyScript = "scripts/minify_audit.py",
    [string[]]$Variants = @(),
    [switch]$CleanStale = $true
)

$ErrorActionPreference = "Stop"
$projectRoot = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { (Get-Location).Path }
if (Test-Path $projectRoot) {
    Set-Location $projectRoot
}

$env:PYTHONUNBUFFERED = "1"

# 1. Clean stale json and csv files if requested
if ($CleanStale) {
    if (Test-Path $OutDir) {
        Write-Host "Cleaning stale benchmark files in $OutDir..." -ForegroundColor Yellow
        Get-ChildItem -Path $OutDir -Include *.json, *.csv -File -Recurse | Remove-Item -Force
    }
    if (Test-Path $AuditDir) {
        Get-ChildItem -Path $AuditDir -Filter *.csv -File | Remove-Item -Force
    }
}

if (-not (Test-Path $OutDir)) {
    New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
}
if (-not (Test-Path $AuditDir)) {
    New-Item -ItemType Directory -Force -Path $AuditDir | Out-Null
}

$allVariants = @(
    @{ Tag = "v1"; Weights = "src/game/aiPolicyWeights_v1.json" },
    @{ Tag = "v2"; Weights = "src/game/aiPolicyWeights_v2.json" },
    @{ Tag = "v3"; Weights = "src/game/aiPolicyWeights_v3.json" },
    @{ Tag = "v4"; Weights = "src/game/aiPolicyWeights_v4.json" },
    @{ Tag = "v5"; Weights = "src/game/aiPolicyWeights_v5.json" },
    @{ Tag = "v6"; Weights = "src/game/aiPolicyWeights_v6.json" },
    @{ Tag = "v7"; Weights = "src/game/aiPolicyWeights_v7.json" },
    @{ Tag = "v8"; Weights = "src/game/aiPolicyWeights_v8.json" }
)

if ($Variants -and $Variants.Count -gt 0) {
    $normFilter = $Variants | ForEach-Object { "$_".Split(",") } | ForEach-Object {
        $s = "$_".Trim().ToLower()
        if ($s) {
            if ($s -match "^v") { $s } else { "v$s" }
        }
    }
    $selectedVariants = $allVariants | Where-Object { $normFilter -contains $_.Tag }
} else {
    $selectedVariants = $allVariants
}

$generatedFiles = @()

foreach ($v in $selectedVariants) {
    if (-not (Test-Path $v.Weights)) {
        Write-Host "Skipping $($v.Tag) ($($v.Weights) not found yet)" -ForegroundColor DarkGray
        continue
    }

    # Capture live system datetime per variant execution in HH-mm-ss-dd-MM-yy format
    $stamp = Get-Date -Format "HH-mm-ss-dd-MM-yy"
    $baseOut = Join-Path $OutDir "$stamp`_$($v.Tag).json"

    Write-Host "=== Running benchmark for $($v.Tag) -> $baseOut ===" -ForegroundColor Cyan
    python -u $EvalScript --weights $v.Weights --out $baseOut
    if ($LASTEXITCODE -ne 0) {
        throw "Benchmark failed for $($v.Tag) (exit code $LASTEXITCODE)"
    }
    $generatedFiles += $baseOut
}

if ($generatedFiles.Count -eq 0) {
    throw "No trained policy weight files found to benchmark."
}

# 2. Generate unified audit result and summary with the completion date & time
$auditStamp = Get-Date -Format "HH-mm-ss-dd-MM-yy"
$auditResultOut = Join-Path $AuditDir "audit_result_$auditStamp.md"
$summaryOut = Join-Path $AuditDir "summary_$auditStamp.md"

Write-Host "=== Generating minified audit results: $auditResultOut ===" -ForegroundColor Cyan
python $MinifyScript @generatedFiles -o $auditResultOut
if ($LASTEXITCODE -ne 0) {
    throw "Minification failed (exit code $LASTEXITCODE)"
}

Copy-Item $auditResultOut $summaryOut -Force
Write-Host "All $($generatedFiles.Count) benchmarks completed and minified." -ForegroundColor Green
Write-Host "Audit result -> $auditResultOut" -ForegroundColor Green
Write-Host "Summary      -> $summaryOut" -ForegroundColor Green
