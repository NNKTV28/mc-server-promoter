@echo off
title Alliance Server Promoter - Detached Mode

echo.
echo ====================================================================
echo                    ALLIANCE SERVER PROMOTER  
echo                   Starting in Detached Mode...
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

echo ✅ Node.js found
echo 🚀 Starting server in detached mode...
echo.

REM Create a simple PowerShell script to run the server detached
echo $process = Start-Process -FilePath "node" -ArgumentList "server.js" -WindowStyle Hidden -PassThru > temp_start.ps1
echo Write-Host "✅ Server started with PID: $($process.Id)" >> temp_start.ps1
echo Write-Host "📡 Use 'node attach.js' or 'attach.bat' to connect" >> temp_start.ps1
echo Write-Host "🛑 Use 'taskkill /F /PID $($process.Id)' to stop server" >> temp_start.ps1
echo Write-Host "" >> temp_start.ps1
echo Write-Host "Server is now running in the background..." >> temp_start.ps1

REM Execute the PowerShell script
powershell -ExecutionPolicy Bypass -File temp_start.ps1

REM Clean up temporary file
del temp_start.ps1

echo.
echo 💡 To connect to the admin shell:
echo    • Double-click: attach.bat
echo    • Command line: node attach.js
echo.
echo 🛑 To stop the server:
echo    • Connect with attach.bat and type 'exit'
echo    • Or use Task Manager to kill Node.js processes
echo.

pause