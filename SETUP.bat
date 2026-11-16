@echo off
title AsuraBrowser — Setup
color 0A

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║      ASURABROWSER — SETUP          ║
echo  ║   Private AI-assisted browsing    ║
echo  ╚══════════════════════════════════════════╝
echo.

:: Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
  echo  [ERROR] Node.js not found!
  echo  Download from: https://nodejs.org
  pause
  exit /b 1
)

echo  [1/3] Node.js found:
node --version

echo.
echo  [2/3] Installing dependencies...
call npm install
if errorlevel 1 (
  echo  [ERROR] npm install failed!
  pause
  exit /b 1
)

echo.
echo  [3/3] Building TypeScript...
call npm run build
if errorlevel 1 (
  echo  [ERROR] TypeScript build failed!
  pause
  exit /b 1
)

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║   Setup complete! Launching AsuraBrowser…  ║
echo  ╚══════════════════════════════════════════╝
echo.
call npx electron .
pause
