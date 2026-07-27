$ErrorActionPreference = "Stop"

Write-Host "Starting Workforce from local Docker images only..." -ForegroundColor Cyan
docker compose up -d --no-build --pull never

if ($LASTEXITCODE -ne 0) {
  throw "Startup failed. Run .\BUILD-ON-WIFI.ps1 once while connected to Wi-Fi, then try again."
}

Write-Host ""
docker compose ps
Write-Host ""
Write-Host "Workforce is available at http://localhost:5056" -ForegroundColor Green
Write-Host "The interface starts even when PostgreSQL is unavailable."
Write-Host "Optional database check: curl.exe http://localhost:5056/api/health"
