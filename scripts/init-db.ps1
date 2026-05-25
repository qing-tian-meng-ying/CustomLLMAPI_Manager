# Database Initialization Script for Windows

Write-Host "Initializing SQLite database..." -ForegroundColor Green
Write-Host ""

# Run the TypeScript initialization script
pnpm tsx scripts/init-db.ts

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Database initialization completed successfully!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Database initialization failed!" -ForegroundColor Red
    exit 1
}
