param(
    [string]$Prefix = "",
    [string]$Extension = ".json",
    [string]$EvalScript = "scripts/evalAllTracksAndCars.py",
    [switch]$IncludeSeconds
)

$ErrorActionPreference = "Stop"
$projectRoot = "C:\Users\Marc Mas\Documents\AI Studio Shenanigans\Apex-Miniature"
if (Test-Path $projectRoot) {
    Set-Location $projectRoot
}

$env:PYTHONUNBUFFERED = "1"

if (-not [string]::IsNullOrEmpty($Extension) -and -not $Extension.StartsWith(".")) {
    $Extension = ".$Extension"
}

$variants = @(
    @{ Tag = "v1"; Weights = "src/game/aiPolicyWeights_v1.json" },
    @{ Tag = "v2"; Weights = "src/game/aiPolicyWeights_v2.json" },
    @{ Tag = "v3"; Weights = "src/game/aiPolicyWeights_v3.json" },
    @{ Tag = "v4"; Weights = "src/game/aiPolicyWeights_v4.json" }
)

foreach ($v in $variants) {
    # Capture live system datetime per variant execution in HH-mm-ss-dd-MM-yy format
    $stamp = Get-Date -Format "HH-mm-ss-dd-MM-yy"
    $baseOut = if ([string]::IsNullOrEmpty($Prefix)) {
        "$stamp`_$($v.Tag)$Extension"
    } else {
        "$Prefix`_$stamp`_$($v.Tag)$Extension"
    }

    $targetDir = [System.IO.Path]::GetDirectoryName($baseOut)
    if (-not [string]::IsNullOrEmpty($targetDir)) {
        New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
    }

    Write-Host "=== Running benchmark for $($v.Tag) -> $baseOut ===" -ForegroundColor Cyan
    python -u $EvalScript --weights $v.Weights --out $baseOut
    if ($LASTEXITCODE -ne 0) {
        throw "Benchmark failed for $($v.Tag) (exit code $LASTEXITCODE)"
    }
}

Write-Host "All 4 benchmarks completed." -ForegroundColor Green
