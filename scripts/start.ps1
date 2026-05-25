# Windows PowerShell Production Start Script
# Encoding: UTF-8 with BOM

$PORT = 5000
$env:PORT = $PORT
$env:NODE_ENV = "production"

Write-Host "Starting production server on port $PORT..." -ForegroundColor Green
Write-Host ""

# Check if build exists
if (-not (Test-Path ".next")) {
    Write-Host "Build not found, please run: pnpm run build" -ForegroundColor Red
    exit 1
}

# Check if port is in use
$connection = Get-NetTCPConnection -LocalPort $PORT -ErrorAction SilentlyContinue
if ($connection) {
    Write-Host "Port $PORT is in use, attempting to close..." -ForegroundColor Yellow
    $processId = $connection.OwningProcess
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    Write-Host "Port cleared" -ForegroundColor Green
} else {
    Write-Host "Port $PORT is available" -ForegroundColor Green
}

Write-Host ""
Write-Host "Starting server..." -ForegroundColor Cyan

# Start production server
node src/server.js
