param(
    [int]$env = 24,
    [int]$steps = 256,
    [int]$updates = 1000,
    [switch]$ResetBest,
    [switch]$SeparateWindows
)

$ErrorActionPreference = "Stop"
$projectRoot = "C:\Users\Marc Mas\Documents\AI Studio Shenanigans\Apex-Miniature"
if (Test-Path $projectRoot) {
    Set-Location $projectRoot
}

$env:PYTHONUNBUFFERED = "1"
$extraAll = if ($ResetBest) { " --reset-best" } else { "" }

$cmds = @(
    "python -u scripts/trainPPO_v1_clean_apex.py --envs $env --steps $steps --updates $updates$extraAll",
    "python -u scripts/trainPPO_v2_momentum.py --envs $env --steps $steps --updates $updates --reset-best",
    "python -u scripts/trainPPO_v3_aggressive_pace.py --envs $env --steps $steps --updates $updates$extraAll",
    "python -u scripts/trainPPO_v4_curriculum.py --envs $env --steps $steps --updates $updates --reset-best"
)

$wd = (Get-Location).Path
Write-Host "Launching 4 PPO training scripts with --envs $env (--steps $steps, --updates $updates)..." -ForegroundColor Cyan

if ($SeparateWindows) {
    foreach ($cmdStr in $cmds) {
        $wrapped = "Set-Location '$wd'; `$env:PYTHONUNBUFFERED='1'; $cmdStr"
        Start-Process powershell -ArgumentList "-NoExit", "-Command", $wrapped
    }
    Write-Host "Opened 4 separate PowerShell windows." -ForegroundColor Green
} else {
    $jobs = $cmds | ForEach-Object {
        Start-Job -ScriptBlock {
            param($cmdStr, $workDir)
            Set-Location $workDir
            $env:PYTHONUNBUFFERED = "1"
            Invoke-Expression $cmdStr
        } -ArgumentList $_, $wd
    }

    try {
        while ($jobs | Where-Object { $_.State -eq "Running" }) {
            $jobs | Receive-Job
            Start-Sleep -Seconds 3
        }
        $jobs | Receive-Job
    } finally {
        $jobs | Remove-Job -ErrorAction SilentlyContinue
    }
}
