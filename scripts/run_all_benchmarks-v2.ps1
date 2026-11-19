param(
    [string]$Prefix = "",
    [string]$OutDir = "audit",
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

if (-not [string]::IsNullOrEmpty($OutDir) -and -not (Test-Path $OutDir)) {
    New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
}

foreach ($v in $variants) {
    # Capture live system datetime per variant execution in HH-mm-ss-dd-MM-yy format
    $stamp = Get-Date -Format "HH-mm-ss-dd-MM-yy"
    $cleanPrefix = if ([string]::IsNullOrEmpty($Prefix)) {
        ""
    } elseif ($Prefix.EndsWith("_")) {
        $Prefix
    } else {
        "$Prefix`_"
    }

    $fileName = "$cleanPrefix$stamp`_$($v.Tag)$Extension"
    $baseOut = if ([string]::IsNullOrEmpty($OutDir)) {
        $fileName
    } else {
        Join-Path $OutDir $fileName
    }

    $targetDir = [System.IO.Path]::GetDirectoryName($baseOut)
    if (-not [string]::IsNullOrEmpty($targetDir) -and -not (Test-Path $targetDir)) {
        New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
    }

    Write-Host "=== Running benchmark for $($v.Tag) -> $baseOut ===" -ForegroundColor Cyan
    python -u $EvalScript --weights $v.Weights --out $baseOut
    if ($LASTEXITCODE -ne 0) {
        throw "Benchmark failed for $($v.Tag) (exit code $LASTEXITCODE)"
    }
}

Write-Host "All 4 benchmarks completed." -ForegroundColor Green
