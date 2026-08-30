@echo off
title Flash Report Pro - Block B EPC#1
echo =======================================================
echo           FLASH REPORT APPLICATION - BLOCK B EPC#1
echo =======================================================
echo.

cd /d "%~dp0"

echo [1/3] Checking Python dependencies...
python -m pip install -r backend\requirements.txt --quiet --no-warn-script-location

echo [2/3] Checking Frontend build...
if not exist "frontend\dist" (
    echo Building frontend web interface for first time use...
    cd frontend
    call npm install --quiet
    call npm run build
    cd ..
)

echo [3/3] Starting Flash Report Server...
echo Opening application in your default browser at http://localhost:8000
echo.

start "" "http://localhost:8000"
python backend\main.py

pause
