# Apex Miniature - Benchmark Suite Runner
param(
    [string]$OutDir = "audit/bench_results",
    [string]$AuditDir = "audit",
    [string]$EvalScript = "scripts/evalAllTracksAndCars.py",
    [string]$MinifyScript = "scripts/minify_audit.py",
    [switch]$CleanStale = $true
)

$target = Join-Path $PSScriptRoot "scripts/benchmark_final.ps1"
& $target -OutDir $OutDir -AuditDir $AuditDir -EvalScript $EvalScript -MinifyScript $MinifyScript -CleanStale:$CleanStale
