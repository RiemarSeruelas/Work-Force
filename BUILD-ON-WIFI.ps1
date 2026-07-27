$ErrorActionPreference = "Stop"

Write-Host "Building Workforce images using the internet connection..." -ForegroundColor Cyan
docker compose build --pull

if ($LASTEXITCODE -ne 0) {
  throw "Docker build failed. Confirm that Wi-Fi/internet is connected, then run this script again."
}

Write-Host ""
Write-Host "Build complete. The app was not started." -ForegroundColor Green
Write-Host "Run .\START-WORKFORCE.ps1 now on Wi-Fi, or after switching to the database network."
