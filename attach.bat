@echo off
title Alliance Server Promoter - Attach to Session

echo.
echo ====================================================================
echo                    ALLIANCE SERVER PROMOTER
echo                     Attaching to Session...
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

REM Check if attach script exists
if not exist "attach.js" (
    echo ❌ Error: attach.js not found
    echo Make sure you're running this from the project directory
    pause
    exit /b 1
)

echo ✅ Node.js found, connecting to session...
echo.

REM Connect to session
node attach.js

REM If we get here, the session ended
echo.
echo 🔌 Session disconnected. Press any key to exit...
pause >nul