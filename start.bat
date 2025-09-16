@echo off
title Alliance Server Promoter - Starting...

echo.
echo ====================================================================
echo                    ALLIANCE SERVER PROMOTER
echo                      Starting Server...
echo ====================================================================
echo.

REM Check if Node.js is available
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Error: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Start the server
echo ✅ Node.js found, starting server...
echo.
node server.js

REM If we get here, the server stopped
echo.
echo ⚠️  Server stopped. Press any key to exit...
pause >nul