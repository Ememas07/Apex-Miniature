$ErrorActionPreference = "Stop"
$projectRoot = "C:\Users\Marc Mas\Documents\AI Studio Shenanigans\Apex-Miniature"
Set-Location $projectRoot
$env:PYTHONUNBUFFERED = "1"
$python = "C:\Users\Marc Mas\Documents\AI Studio Shenanigans\Apex-Miniature\.venv-rl\Scripts\python.exe"

Write-Host "=== Starting Job 1: trainPPO_v1_clean_apex (1500 updates) ===" -ForegroundColor Cyan
& $python -u scripts/trainPPO_v1_clean_apex.py --envs 24 --steps 256 --updates 1500 --no-reset-best --actor-lr 5e-5 --tracks monaco montreal detroit-street laguna-seca hungaroring shanghai yas-marina vir
if ($LASTEXITCODE -ne 0) {
    throw "Job 1 failed with exit code $LASTEXITCODE"
}

Write-Host "=== Starting Job 2: trainPPO_v3_aggressive_pace (1500 updates) ===" -ForegroundColor Cyan
& $python -u scripts/trainPPO_v3_aggressive_pace.py --envs 24 --steps 256 --updates 1500 --no-reset-best --actor-lr 5e-5 --tracks daytona-road bahrain portimao mosport suzuka spa-francorchamps laguna-seca vir
if ($LASTEXITCODE -ne 0) {
    throw "Job 2 failed with exit code $LASTEXITCODE"
}

Write-Host "=== Both fine-tuning jobs completed successfully ===" -ForegroundColor Green
