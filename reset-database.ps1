# Alliance Server Promoter - Database Reset Script (PowerShell)
# This script will reset the database and optionally create a new admin user

param(
    [switch]$Force,
    [string]$AdminUsername = "",
    [string]$AdminEmail = "",
    [string]$AdminPassword = ""
)

# Set console colors
$Host.UI.RawUI.ForegroundColor = "White"

function Write-ColoredOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    
    $currentColor = $Host.UI.RawUI.ForegroundColor
    $Host.UI.RawUI.ForegroundColor = $Color
    Write-Host $Message
    $Host.UI.RawUI.ForegroundColor = $currentColor
}

function Show-Banner {
    Write-ColoredOutput "`n🗃️  ALLIANCE SERVER PROMOTER - DATABASE RESET TOOL" "Yellow"
    Write-ColoredOutput ("=" * 60) "Yellow"
}

function Show-DatabaseStatus {
    Write-ColoredOutput "`n📋 Current database status:" "Cyan"
    
    $mainDbPath = ".\data.sqlite3"
    $sessionDbPath = ".\sessions.sqlite3"
    
    $mainDbExists = Test-Path $mainDbPath
    $sessionDbExists = Test-Path $sessionDbPath
    
    $mainStatus = if ($mainDbExists) { "✅ Exists" } else { "❌ Not found" }
    $sessionStatus = if ($sessionDbExists) { "✅ Exists" } else { "❌ Not found" }
    
    Write-ColoredOutput "   Main DB (data.sqlite3): $mainStatus" "White"
    Write-ColoredOutput "   Session DB (sessions.sqlite3): $sessionStatus" "White"
    
    return @{
        MainExists = $mainDbExists
        SessionExists = $sessionDbExists
    }
}

function Show-Warning {
    Write-ColoredOutput "`n⚠️  WARNING: This will permanently delete ALL data!" "Red"
    Write-ColoredOutput "   This includes:" "Yellow"
    Write-ColoredOutput "   • All users and admin accounts" "White"
    Write-ColoredOutput "   • All servers and server listings" "White"
    Write-ColoredOutput "   • All votes and voting history" "White"
    Write-ColoredOutput "   • All login sessions" "White"
    Write-ColoredOutput "   • All device tracking data" "White"
    Write-ColoredOutput "   • All security events and bot scores" "White"
    Write-ColoredOutput "   • All site settings" "White"
}

function Get-UserConfirmation {
    if ($Force) {
        Write-ColoredOutput "`n🔄 Force flag detected, proceeding without confirmation..." "Yellow"
        return $true
    }
    
    Write-Host "`n🤔 Are you sure you want to reset the database? (yes/no): " -NoNewline -ForegroundColor "Yellow"
    $confirmation = Read-Host
    
    return ($confirmation.ToLower() -eq "yes")
}

function Get-AdminUserInput {
    if ($AdminUsername -and $AdminEmail -and $AdminPassword) {
        Write-ColoredOutput "`n👤 Using provided admin credentials..." "Cyan"
        return @{
            Username = $AdminUsername
            Email = $AdminEmail
            Password = $AdminPassword
        }
    }
    
    Write-Host "`n👤 Would you like to create a new admin user after reset? (yes/no): " -NoNewline -ForegroundColor "Cyan"
    $createAdmin = Read-Host
    
    if ($createAdmin.ToLower() -ne "yes") {
        return $null
    }
    
    Write-ColoredOutput "`n📝 Admin user details:" "Cyan"
    Write-Host "   Username: " -NoNewline -ForegroundColor "White"
    $username = Read-Host
    Write-Host "   Email: " -NoNewline -ForegroundColor "White"
    $email = Read-Host
    Write-Host "   Password: " -NoNewline -ForegroundColor "White"
    $password = Read-Host -AsSecureString
    $passwordPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($password))
    
    if ($username -and $email -and $passwordPlain) {
        return @{
            Username = $username
            Email = $email
            Password = $passwordPlain
        }
    } else {
        Write-ColoredOutput "⚠️  Invalid admin details. Skipping admin creation." "Yellow"
        return $null
    }
}

function Reset-Database {
    param(
        [hashtable]$DbStatus,
        [hashtable]$AdminData
    )
    
    Write-ColoredOutput "`n🔄 Starting database reset..." "Blue"
    
    # Delete existing databases
    if ($DbStatus.MainExists) {
        try {
            Remove-Item ".\data.sqlite3" -Force
            Write-ColoredOutput "✅ Main database deleted" "Green"
        } catch {
            Write-ColoredOutput "❌ Failed to delete main database: $($_.Exception.Message)" "Red"
            return $false
        }
    }
    
    if ($DbStatus.SessionExists) {
        try {
            Remove-Item ".\sessions.sqlite3" -Force
            Write-ColoredOutput "✅ Session database deleted" "Green"
        } catch {
            Write-ColoredOutput "❌ Failed to delete session database: $($_.Exception.Message)" "Red"
            return $false
        }
    }
    
    # Call Node.js script to recreate database with proper schema
    Write-ColoredOutput "`n🔧 Creating fresh database with Node.js..." "Blue"
    
    if ($AdminData) {
        $env:RESET_ADMIN_USERNAME = $AdminData.Username
        $env:RESET_ADMIN_EMAIL = $AdminData.Email  
        $env:RESET_ADMIN_PASSWORD = $AdminData.Password
        $env:RESET_CREATE_ADMIN = "true"
    } else {
        $env:RESET_CREATE_ADMIN = "false"
    }
    
    try {
        $result = & node reset-database.js --silent 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-ColoredOutput "✅ Database schema created successfully" "Green"
            if ($AdminData) {
                Write-ColoredOutput "✅ Admin user '$($AdminData.Username)' created successfully" "Green"
            }
        } else {
            Write-ColoredOutput "❌ Failed to create database schema" "Red"
            Write-ColoredOutput $result "Red"
            return $false
        }
    } catch {
        Write-ColoredOutput "❌ Error running Node.js script: $($_.Exception.Message)" "Red"
        return $false
    } finally {
        # Clean up environment variables
        $env:RESET_ADMIN_USERNAME = ""
        $env:RESET_ADMIN_EMAIL = ""
        $env:RESET_ADMIN_PASSWORD = ""
        $env:RESET_CREATE_ADMIN = ""
    }
    
    return $true
}

function Show-Summary {
    param([hashtable]$AdminData)
    
    Write-ColoredOutput "`n🎉 DATABASE RESET COMPLETE!" "Green"
    Write-ColoredOutput "✅ Fresh database created with clean schema" "Green"
    Write-ColoredOutput "✅ All tables recreated" "Green"
    Write-ColoredOutput "✅ Default settings configured" "Green"
    
    if ($AdminData) {
        Write-ColoredOutput "✅ Admin user '$($AdminData.Username)' ready to use" "Green"
    }
    
    Write-ColoredOutput "`n📋 What's next:" "Cyan"
    Write-ColoredOutput "   1. Start your server: node server.js" "White"
    Write-ColoredOutput "   2. Visit: http://localhost:3000" "White"
    if ($AdminData) {
        Write-ColoredOutput "   3. Login as admin: $($AdminData.Username)" "White"
        Write-ColoredOutput "   4. Access admin panel and dashboard" "White"
    } else {
        Write-ColoredOutput "   3. Register a new user or create admin with setup-admin.js" "White"
    }
    
    Write-ColoredOutput "`n💡 Tip: The sessions database will be recreated automatically when you start the server." "Blue"
}

# Main execution
try {
    Show-Banner
    
    $dbStatus = Show-DatabaseStatus
    
    if (-not $dbStatus.MainExists -and -not $dbStatus.SessionExists) {
        Write-ColoredOutput "`n⚠️  No databases found. Nothing to reset." "Yellow"
        exit 0
    }
    
    Show-Warning
    
    if (-not (Get-UserConfirmation)) {
        Write-ColoredOutput "`n🚫 Database reset cancelled." "Yellow"
        exit 0
    }
    
    $adminData = Get-AdminUserInput
    
    $success = Reset-Database -DbStatus $dbStatus -AdminData $adminData
    
    if ($success) {
        Show-Summary -AdminData $adminData
    } else {
        Write-ColoredOutput "`n❌ Database reset failed!" "Red"
        exit 1
    }
    
} catch {
    Write-ColoredOutput "`n❌ Unexpected error: $($_.Exception.Message)" "Red"
    Write-ColoredOutput $_.ScriptStackTrace "Red"
    exit 1
}

Write-ColoredOutput "`n✨ Script completed successfully!" "Green"