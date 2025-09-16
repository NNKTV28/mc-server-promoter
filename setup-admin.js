// setup-admin.js - Script to create initial admin user
import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbFile = path.join(__dirname, 'data.sqlite3');
const db = new sqlite3.Database(dbFile);

async function createAdminUser() {
  const username = 'admin';
  const email = 'admin@alliancepromoter.com';
  const password = 'admin123'; // Change this in production!
  const role = 'admin';

  try {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    db.run(
      `INSERT OR IGNORE INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)`,
      [username, email, hashedPassword, role],
      function(err) {
        if (err) {
          console.error('Error creating admin user:', err.message);
        } else {
          if (this.changes > 0) {
            console.log('✅ Admin user created successfully!');
            console.log('Username: admin');
            console.log('Password: admin123');
            console.log('Please change the password after first login.');
          } else {
            console.log('ℹ️  Admin user already exists.');
          }
        }
        db.close();
      }
    );
  } catch (error) {
    console.error('Error hashing password:', error);
    db.close();
  }
}

createAdminUser();