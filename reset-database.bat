@echo off
title Alliance Server Promoter - Database Reset

echo.
echo ====================================================================
echo                 ALLIANCE SERVER PROMOTER
echo                    DATABASE RESET TOOL
echo ====================================================================
echo.

echo This will run the Node.js database reset script...
echo.

REM Check if Node.js is available
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Error: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if reset script exists
if not exist "reset-database.js" (
    echo ❌ Error: reset-database.js not found
    echo Make sure you're running this from the project directory
    pause
    exit /b 1
)

echo ✅ Node.js found
echo ✅ Reset script found
echo.

echo Starting interactive database reset...
echo.

REM Run the Node.js reset script
node reset-database.js

if %errorlevel% equ 0 (
    echo.
    echo ✨ Database reset completed successfully!
) else (
    echo.
    echo ❌ Database reset failed with error code %errorlevel%
)

echo.
echo Press any key to exit...
pause >nul