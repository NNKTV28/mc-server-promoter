#!/usr/bin/env node

import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file paths
const dbFile = path.join(__dirname, 'data.sqlite3');
const sessionDbFile = path.join(__dirname, 'sessions.sqlite3');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bold: '\x1b[1m'
};

function colorLog(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function resetDatabase() {
  try {
    colorLog('bold', '\n🗃️  ALLIANCE SERVER PROMOTER - DATABASE RESET TOOL');
    colorLog('bold', '='.repeat(60));
    
    // Check if databases exist
    const mainDbExists = fs.existsSync(dbFile);
    const sessionDbExists = fs.existsSync(sessionDbFile);
    
    if (!mainDbExists && !sessionDbExists) {
      colorLog('yellow', '⚠️  No databases found. Nothing to reset.');
      return;
    }
    
    colorLog('cyan', '\n📋 Current database status:');
    colorLog('white', `   Main DB (${path.basename(dbFile)}): ${mainDbExists ? '✅ Exists' : '❌ Not found'}`);
    colorLog('white', `   Session DB (${path.basename(sessionDbFile)}): ${sessionDbExists ? '✅ Exists' : '❌ Not found'}`);
    
    // Warning and confirmation
    colorLog('red', '\n⚠️  WARNING: This will permanently delete ALL data!');
    colorLog('yellow', '   This includes:');
    colorLog('white', '   • All users and admin accounts');
    colorLog('white', '   • All servers and server listings');
    colorLog('white', '   • All votes and voting history');
    colorLog('white', '   • All login sessions');
    colorLog('white', '   • All device tracking data');
    colorLog('white', '   • All security events and bot scores');
    colorLog('white', '   • All site settings');
    
    const confirmReset = await askQuestion('\n🤔 Are you sure you want to reset the database? (yes/no): ');
    
    if (confirmReset.toLowerCase() !== 'yes') {
      colorLog('yellow', '🚫 Database reset cancelled.');
      return;
    }
    
    // Ask about creating admin user
    const createAdmin = await askQuestion('\n👤 Would you like to create a new admin user after reset? (yes/no): ');
    
    let adminData = null;
    if (createAdmin.toLowerCase() === 'yes') {
      colorLog('cyan', '\n📝 Admin user details:');
      const username = await askQuestion('   Username: ');
      const email = await askQuestion('   Email: ');
      const password = await askQuestion('   Password: ');
      
      if (username && email && password) {
        adminData = { username, email, password };
      } else {
        colorLog('yellow', '⚠️  Invalid admin details. Skipping admin creation.');
      }
    }
    
    colorLog('blue', '\n🔄 Starting database reset...');
    
    // Delete existing databases
    if (mainDbExists) {
      fs.unlinkSync(dbFile);
      colorLog('green', '✅ Main database deleted');
    }
    
    if (sessionDbExists) {
      fs.unlinkSync(sessionDbFile);
      colorLog('green', '✅ Session database deleted');
    }
    
    // Recreate main database with fresh schema
    const db = new sqlite3.Database(dbFile);
    
    colorLog('blue', '🔧 Creating fresh database schema...');
    
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        // Users table
        db.run(`CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT CHECK(role IN ('user','admin')) NOT NULL DEFAULT 'user',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_login DATETIME
        )`);

        // Servers table
        db.run(`CREATE TABLE IF NOT EXISTS servers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          ip TEXT NOT NULL,
          description TEXT,
          website_url TEXT,
          banner_url TEXT,
          plan TEXT CHECK(plan IN ('free','paid')) NOT NULL DEFAULT 'free',
          votes INTEGER NOT NULL DEFAULT 0,
          owner_id INTEGER,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE SET NULL
        )`);

        // Votes table
        db.run(`CREATE TABLE IF NOT EXISTS votes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER NOT NULL,
          voter_hash TEXT NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          voted_date TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d', CURRENT_TIMESTAMP)),
          UNIQUE(server_id, voter_hash, voted_date),
          FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
        )`);

        // Site settings table
        db.run(`CREATE TABLE IF NOT EXISTS site_settings (
          key TEXT PRIMARY KEY,
          value TEXT,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`);

        // Security events table
        db.run(`CREATE TABLE IF NOT EXISTS security_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ip_address TEXT NOT NULL,
          user_id INTEGER,
          event_type TEXT NOT NULL,
          severity TEXT NOT NULL DEFAULT 'low',
          details TEXT,
          user_agent TEXT,
          endpoint TEXT,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
        )`);

        // IP blacklist table
        db.run(`CREATE TABLE IF NOT EXISTS ip_blacklist (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ip_address TEXT UNIQUE NOT NULL,
          reason TEXT NOT NULL,
          blocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          blocked_until DATETIME,
          created_by INTEGER,
          FOREIGN KEY(created_by) REFERENCES users(id)
        )`);

        // Bot scores table
        db.run(`CREATE TABLE IF NOT EXISTS bot_scores (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ip_address TEXT NOT NULL,
          user_agent TEXT,
          device_fingerprint TEXT,
          bot_score INTEGER NOT NULL DEFAULT 0,
          request_count INTEGER NOT NULL DEFAULT 1,
          suspicious_patterns INTEGER NOT NULL DEFAULT 0,
          last_updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(ip_address, user_agent)
        )`);

        // CAPTCHA challenges table
        db.run(`CREATE TABLE IF NOT EXISTS captcha_challenges (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          challenge_id TEXT UNIQUE NOT NULL,
          ip_address TEXT NOT NULL,
          solution TEXT NOT NULL,
          solved BOOLEAN NOT NULL DEFAULT 0,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME NOT NULL DEFAULT (datetime('now', '+5 minutes'))
        )`);

        // User devices table
        db.run(`CREATE TABLE IF NOT EXISTS user_devices (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          device_fingerprint TEXT NOT NULL,
          user_agent TEXT,
          browser_name TEXT,
          browser_version TEXT,
          os_name TEXT,
          os_version TEXT,
          device_type TEXT,
          device_model TEXT,
          cpu_architecture TEXT,
          screen_resolution TEXT,
          timezone TEXT,
          language TEXT,
          platform TEXT,
          first_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )`);

        // Login history table
        db.run(`CREATE TABLE IF NOT EXISTS login_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          device_id INTEGER,
          ip_address TEXT,
          country TEXT,
          region TEXT,
          city TEXT,
          isp TEXT,
          success BOOLEAN NOT NULL DEFAULT 1,
          login_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY(device_id) REFERENCES user_devices(id) ON DELETE CASCADE
        )`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
    
    colorLog('green', '✅ Database schema created successfully');
    
    // Create admin user if requested
    if (adminData) {
      colorLog('blue', '👤 Creating admin user...');
      
      const hashedPassword = await bcrypt.hash(adminData.password, 10);
      
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
          [adminData.username, adminData.email, hashedPassword, 'admin'],
          function(err) {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      
      colorLog('green', `✅ Admin user '${adminData.username}' created successfully`);
    }
    
    // Insert some default site settings
    colorLog('blue', '⚙️  Adding default site settings...');
    
    const defaultSettings = [
      ['siteTitle', 'Alliance Server Promoter'],
      ['featuredPrice', '$5.99'],
      ['maxServersPerUser', '5'],
      ['voteCooldown', '24'],
      ['enableRegistration', 'true']
    ];
    
    for (const [key, value] of defaultSettings) {
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)',
          [key, value],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }
    
    colorLog('green', '✅ Default settings added');
    
    // Close database connection
    db.close();
    
    // Summary
    colorLog('bold', '\n🎉 DATABASE RESET COMPLETE!');
    colorLog('green', '✅ Fresh database created with clean schema');
    colorLog('green', '✅ All tables recreated');
    colorLog('green', '✅ Default settings configured');
    
    if (adminData) {
      colorLog('green', `✅ Admin user '${adminData.username}' ready to use`);
    }
    
    colorLog('cyan', '\n📋 What\'s next:');
    colorLog('white', '   1. Start your server: node server.js');
    colorLog('white', '   2. Visit: http://localhost:3000');
    if (adminData) {
      colorLog('white', `   3. Login as admin: ${adminData.username}`);
      colorLog('white', '   4. Access admin panel and dashboard');
    } else {
      colorLog('white', '   3. Register a new user or create admin with setup-admin.js');
    }
    
    colorLog('blue', '\n💡 Tip: The sessions database will be recreated automatically when you start the server.');
    
  } catch (error) {
    colorLog('red', `\n❌ Error during database reset: ${error.message}`);
    console.error(error);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  colorLog('yellow', '\n🚫 Database reset cancelled by user.');
  rl.close();
  process.exit(0);
});

// Run the script
resetDatabase().then(() => {
  process.exit(0);
}).catch((error) => {
  colorLog('red', `❌ Fatal error: ${error.message}`);
  process.exit(1);
});