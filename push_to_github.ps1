# Push EventFlow to GitHub repository
# Remote: https://github.com/himangs02/NotYourPlan.git

Write-Host "Initializing Git repository and pushing to GitHub..." -ForegroundColor Cyan

# 1. Initialize git if not already initialized
if (-not (Test-Path ".git")) {
    git init
    Write-Host "  [OK] Initialized new Git repository" -ForegroundColor Green
}

# 2. Check current remote and update
$remotes = git remote
if ($remotes -contains "origin") {
    git remote set-url origin https://github.com/himangs02/NotYourPlan.git
    Write-Host "  [OK] Updated origin remote to https://github.com/himangs02/NotYourPlan.git" -ForegroundColor Green
} else {
    git remote add origin https://github.com/himangs02/NotYourPlan.git
    Write-Host "  [OK] Added origin remote https://github.com/himangs02/NotYourPlan.git" -ForegroundColor Green
}

# 3. Rename branch to main
git branch -M main

# 4. Stage all files
Write-Host "Staging files..." -ForegroundColor Cyan
git add .

# 5. Commit
Write-Host "Committing changes..." -ForegroundColor Cyan
git commit -m "feat: complete EventFlow 3D semantic digital twin with city.glb integration, animated crowd, what-if scenarios, and deterministic safety evaluation"

# 6. Push to origin main
Write-Host "Pushing to https://github.com/himangs02/NotYourPlan.git (branch: main)..." -ForegroundColor Cyan
git push -u origin main

Write-Host "`nPush operation completed!" -ForegroundColor Green
