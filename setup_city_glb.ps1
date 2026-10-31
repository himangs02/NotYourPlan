# EventFlow - city.glb Integration Setup Script
# Run this from the project root: hackcbs9.0\

Write-Host "EventFlow city.glb integration setup..." -ForegroundColor Cyan

# 1. Create the public/models directory
$modelsDir = "apps\web\public\models"
if (-not (Test-Path $modelsDir)) {
    New-Item -ItemType Directory -Force $modelsDir | Out-Null
    Write-Host "  [OK] Created $modelsDir" -ForegroundColor Green
} else {
    Write-Host "  [--] $modelsDir already exists" -ForegroundColor Gray
}

# 2. Copy city.glb from project root to public/models/
$src = "city.glb"
$dst = "$modelsDir\city.glb"

if (Test-Path $src) {
    Copy-Item $src $dst -Force
    $fileItem = Get-Item $dst
    $sizeMB = [math]::Round($fileItem.Length / 1MB, 1)
    Write-Host "  [OK] Copied city.glb -> $dst ($sizeMB MB)" -ForegroundColor Green
} else {
    Write-Host "  [WARN] city.glb not found in root. If already copied to $dst, continuing..." -ForegroundColor Yellow
}

# 3. Verify key integration files exist
$files = @(
    "apps\web\components\twin\worldAnchors.ts",
    "apps\web\components\twin\VenueTwinViewer.tsx",
    "apps\web\components\twin\AssetLibrary.ts",
    "apps\web\components\twin\types.ts",
    "apps\web\app\page.tsx",
    "docs\ASSET_LICENSES.md"
)

Write-Host ""
Write-Host "Verifying integration files..." -ForegroundColor Cyan
foreach ($f in $files) {
    if (Test-Path $f) {
        Write-Host "  [OK] $f" -ForegroundColor Green
    } else {
        Write-Host "  [MISSING] $f" -ForegroundColor Red
    }
}

# 4. Run Python backend tests
Write-Host ""
Write-Host "Running backend tests..." -ForegroundColor Cyan
python -m pytest tests/ -v

# 5. Run Next.js build
Write-Host ""
Write-Host "Running Next.js production build..." -ForegroundColor Cyan
Push-Location "apps\web"
if (Test-Path ".next") {
    Remove-Item -Recurse -Force ".next" | Out-Null
}
npm run build
Pop-Location

Write-Host ""
Write-Host "Setup complete. Start dev server with:" -ForegroundColor Cyan
Write-Host "  npm run dev --prefix apps/web" -ForegroundColor White
Write-Host "  Then open http://localhost:3000" -ForegroundColor White
