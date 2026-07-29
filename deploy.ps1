# ═══════════════════════════════════════════════════════════════
# GoldenFarm ICT - Deploy Script
# ═══════════════════════════════════════════════════════════════

param(
    [switch]$BuildFrontend,
    [switch]$BuildBackend,
    [switch]$BuildAll,
    [switch]$RestartAll,
    [switch]$Logs
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   GoldenFarm ICT - Deployment Tool                        ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Change to script directory
Set-Location $PSScriptRoot

if ($BuildFrontend -or $BuildAll) {
    Write-Host "[Frontend] Stopping container..." -ForegroundColor Yellow
    docker stop goldenfarm-frontend 2>$null
    docker rm goldenfarm-frontend 2>$null
    
    Write-Host "[Frontend] Building new image..." -ForegroundColor Yellow
    docker-compose build frontend
    
    Write-Host "[Frontend] Starting container..." -ForegroundColor Yellow
    docker-compose up -d frontend
    
    Write-Host "[Frontend] Waiting for startup..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
    
    Write-Host "[Frontend] ✓ Deployed successfully!" -ForegroundColor Green
    Write-Host ""
}

if ($BuildBackend -or $BuildAll) {
    Write-Host "[Backend] Stopping container..." -ForegroundColor Yellow
    docker stop goldenfarm-backend 2>$null
    docker rm goldenfarm-backend 2>$null
    
    Write-Host "[Backend] Starting container..." -ForegroundColor Yellow
    docker-compose up -d backend
    
    Write-Host "[Backend] Waiting for startup..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
    
    Write-Host "[Backend] ✓ Deployed successfully!" -ForegroundColor Green
    Write-Host ""
}

if ($RestartAll) {
    Write-Host "[All Services] Restarting..." -ForegroundColor Yellow
    docker-compose restart
    
    Write-Host "[All Services] ✓ Restarted successfully!" -ForegroundColor Green
    Write-Host ""
}

if ($Logs) {
    Write-Host "[Logs] Displaying recent logs..." -ForegroundColor Yellow
    Write-Host ""
    docker-compose logs --tail=30
}

if (-not ($BuildFrontend -or $BuildBackend -or $BuildAll -or $RestartAll -or $Logs)) {
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\deploy.ps1 -BuildFrontend    # Rebuild frontend only"
    Write-Host "  .\deploy.ps1 -BuildBackend     # Rebuild backend only"
    Write-Host "  .\deploy.ps1 -BuildAll         # Rebuild all services"
    Write-Host "  .\deploy.ps1 -RestartAll       # Restart all services"
    Write-Host "  .\deploy.ps1 -Logs             # Show logs"
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Yellow
    Write-Host "  .\deploy.ps1 -BuildFrontend -Logs"
    Write-Host "  .\deploy.ps1 -BuildAll"
    Write-Host ""
}

# Show status
Write-Host "Current Status:" -ForegroundColor Cyan
docker-compose ps

Write-Host ""
Write-Host "Access URLs:" -ForegroundColor Cyan
Write-Host "  Frontend:    http://10.0.0.9:8088" -ForegroundColor White
Write-Host "  Backend API: http://10.0.0.9:8000" -ForegroundColor White
Write-Host "  OnlyOffice:  http://10.0.0.9:8080" -ForegroundColor White
Write-Host "  PostgreSQL:  10.0.0.9:5432" -ForegroundColor White
Write-Host ""
