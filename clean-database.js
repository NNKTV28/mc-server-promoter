#!/usr/bin/env node

import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbFile = path.join(__dirname, 'data.sqlite3');

console.log('🧹 Cleaning Alliance Server Promoter database...');

const db = new sqlite3.Database(dbFile);

db.serialize(() => {
  console.log('🗑️  Clearing all data...');
  
  // Clear all tables in the correct order (respecting foreign keys)
  db.run('DELETE FROM votes');
  db.run('DELETE FROM login_history');
  db.run('DELETE FROM user_devices');
  db.run('DELETE FROM captcha_challenges');
  db.run('DELETE FROM security_events');
  db.run('DELETE FROM bot_scores');
  db.run('DELETE FROM ip_blacklist');
  db.run('DELETE FROM servers');
  db.run('DELETE FROM users');
  db.run('DELETE FROM site_settings');
  
  // Reset auto-increment counters
  db.run('DELETE FROM sqlite_sequence');
  
  console.log('✅ Database cleaned successfully!');
  console.log('📊 All tables are now empty');
  console.log('🔄 Auto-increment counters reset');
  
  console.log('\n💡 Next steps:');
  console.log('   • Run node setup-admin.js to create an admin user');
  console.log('   • Or register a new user at http://localhost:3000');
  console.log('   • Start adding servers and content');
  
  db.close();
});