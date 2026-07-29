@echo off
REM ═══════════════════════════════════════════════════════════
REM Start GoldenFarm ICT với OnlyOffice Document Server
REM ═══════════════════════════════════════════════════════════

echo.
echo ╔═══════════════════════════════════════════════════════════╗
echo ║   GoldenFarm ICT - Start All Services                     ║
echo ╚═══════════════════════════════════════════════════════════╝
echo.

cd /d "%~dp0"

echo [1/4] Starting PostgreSQL...
docker-compose up -d db
timeout /t 5 /nobreak > nul

echo [2/4] Starting Backend...
docker-compose up -d backend
timeout /t 5 /nobreak > nul

echo [3/4] Starting Frontend...
docker-compose up -d frontend
timeout /t 3 /nobreak > nul

echo [4/4] Starting OnlyOffice Document Server...
echo (This may take 2-3 minutes to start...)
docker-compose up -d onlyoffice

echo.
echo ╔═══════════════════════════════════════════════════════════╗
echo ║   All services started!                                    ║
echo ╚═══════════════════════════════════════════════════════════╝
echo.
echo Checking status...
docker-compose ps
echo.
echo ┌───────────────────────────────────────────────────────────┐
echo │  Frontend:    http://10.0.0.9:8088                        │
echo │  Backend API: http://10.0.0.9:8000                        │
echo │  OnlyOffice:  http://10.0.0.9:8080                        │
echo │  PostgreSQL:  10.0.0.9:5432                               │
echo └───────────────────────────────────────────────────────────┘
echo.
echo NOTE: OnlyOffice may take 2-3 minutes to become healthy.
echo       Check status: docker ps ^| findstr onlyoffice
echo       View logs:    docker logs goldenfarm-onlyoffice
echo.
pause
