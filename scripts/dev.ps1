# Windows PowerShell Development Script
# Encoding: UTF-8 with BOM

$PORT = 5000
$env:PORT = $PORT

Write-Host "Starting development server on port $PORT..." -ForegroundColor Green
Write-Host ""

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
Write-Host "Starting Next.js development server..." -ForegroundColor Cyan

# Start server using tsx
pnpm tsx watch src/server.ts
