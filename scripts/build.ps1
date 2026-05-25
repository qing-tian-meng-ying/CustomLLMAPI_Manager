# Windows PowerShell Build Script
# Encoding: UTF-8 with BOM

Write-Host "Building project..." -ForegroundColor Green
Write-Host ""

# Type check
Write-Host "Running type check..." -ForegroundColor Cyan
pnpm run ts-check
if ($LASTEXITCODE -ne 0) {
    Write-Host "Type check failed" -ForegroundColor Red
    exit 1
}

# Lint
Write-Host "Running lint..." -ForegroundColor Cyan
pnpm run lint:build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Lint failed" -ForegroundColor Red
    exit 1
}

# Build
Write-Host "Building application..." -ForegroundColor Cyan
pnpm next build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Build completed successfully!" -ForegroundColor Green
