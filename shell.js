import readline from 'readline';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AdminShell {
  constructor(db) {
    this.db = db;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.cyan('alliance> ')
    });
    
    this.commands = {
      help: this.showHelp.bind(this),
      info: this.showServerInfo.bind(this),
      users: this.manageUsers.bind(this),
      servers: this.manageServers.bind(this),
      logs: this.manageLogs.bind(this),
      stats: this.showStats.bind(this),
      security: this.manageSecurity.bind(this),
      uploads: this.manageUploads.bind(this),
      clean: this.cleanDatabase.bind(this),
      backup: this.backupDatabase.bind(this),
      exit: this.exit.bind(this),
      quit: this.exit.bind(this),
      clear: this.clear.bind(this)
    };
    
    this.setupEventListeners();
  }
  
  start() {
    console.clear();
    this.showBanner();
    this.showHelp();
    this.rl.prompt();
  }
  
  showBanner() {
    console.log(chalk.bold.blue(`
╔═══════════════════════════════════════════════════╗
║          🌍 ALLIANCE SERVER PROMOTER              ║
║             Admin Interactive Shell               ║
║                                                   ║
║  Server running on port ${process.env.PORT || 3000}                      ║
║  Type 'help' for available commands               ║
╚═══════════════════════════════════════════════════╝
`));
  }
  
  setupEventListeners() {
    this.rl.on('line', (input) => {
      this.processCommand(input.trim());
    });
    
    this.rl.on('close', () => {
      console.log(chalk.yellow('\n👋 Goodbye! Server is still running...'));
      process.exit(0);
    });
    
    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n🛑 Use "exit" to quit or Ctrl+C again to force quit.'));
      this.rl.prompt();
    });
  }
  
  async processCommand(input) {
    if (!input) {
      this.rl.prompt();
      return;
    }
    
    const [command, ...args] = input.split(' ');
    const cmd = this.commands[command.toLowerCase()];
    
    if (cmd) {
      try {
        await cmd(args);
      } catch (error) {
        console.log(chalk.red(`❌ Error executing command: ${error.message}`));
      }
    } else {
      console.log(chalk.red(`❌ Unknown command: ${command}`));
      console.log(chalk.gray('Type "help" for available commands'));
    }
    
    this.rl.prompt();
  }
  
  showHelp() {
    console.log(chalk.bold('\n📋 Available Commands:'));
    console.log(chalk.gray('━'.repeat(50)));
    
    const commands = [
      ['help', 'Show this help message'],
      ['info', 'Show server information and status'],
      ['users [list|delete|promote] [username]', 'Manage users'],
      ['servers [list|delete] [id]', 'Manage servers'],
      ['logs [access|error|security|uploads] [lines]', 'View log files'],
      ['stats', 'Show database statistics'],
      ['security [events|blacklist|bots]', 'Security information'],
      ['uploads [list|clean]', 'Manage uploaded files'],
      ['clean [users|servers|all]', 'Clean database tables (servers includes banners)'],
      ['backup', 'Create database backup'],
      ['clear', 'Clear the terminal'],
      ['exit/quit', 'Exit the shell (server keeps running)']
    ];
    
    commands.forEach(([cmd, desc]) => {
      console.log(`  ${chalk.cyan(cmd.padEnd(35))} ${chalk.gray(desc)}`);
    });
    
    console.log(chalk.gray('━'.repeat(50)));
  }
  
  async showServerInfo() {
    console.log(chalk.bold('\n🖥️  Server Information:'));
    console.log(chalk.gray('━'.repeat(50)));
    
    // Database info
    const dbPath = path.join(__dirname, 'data.sqlite3');
    const dbStats = fs.statSync(dbPath);
    
    console.log(`${chalk.blue('Database:')} ${dbPath}`);
    console.log(`${chalk.blue('Database size:')} ${(dbStats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`${chalk.blue('Last modified:')} ${dbStats.mtime.toLocaleString()}`);
    
    // Server status
    console.log(`${chalk.blue('Process ID:')} ${process.pid}`);
    console.log(`${chalk.blue('Node version:')} ${process.version}`);
    console.log(`${chalk.blue('Uptime:')} ${Math.floor(process.uptime())} seconds`);
    console.log(`${chalk.blue('Memory usage:')} ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`);
    
    // Port and environment
    console.log(`${chalk.blue('Port:')} ${process.env.PORT || 3000}`);
    console.log(`${chalk.blue('Environment:')} ${process.env.NODE_ENV || 'development'}`);
    
    // Logs directory
    const logsDir = path.join(__dirname, 'logs');
    if (fs.existsSync(logsDir)) {
      const logFiles = fs.readdirSync(logsDir);
      console.log(`${chalk.blue('Log files:')} ${logFiles.length} files in logs/`);
    }
    
    // Uploads directory
    const uploadsDir = path.join(__dirname, 'public', 'uploads');
    if (fs.existsSync(uploadsDir)) {
      const uploadFiles = fs.readdirSync(uploadsDir);
      console.log(`${chalk.blue('Uploaded files:')} ${uploadFiles.length} files in public/uploads/`);
    }
  }
  
  async manageUsers(args) {
    const [action, username] = args;
    
    if (!action || action === 'list') {
      return this.listUsers();
    }
    
    switch (action) {
      case 'delete':
        if (!username) {
          console.log(chalk.red('❌ Please provide a username to delete'));
          return;
        }
        return this.deleteUser(username);
        
      case 'promote':
        if (!username) {
          console.log(chalk.red('❌ Please provide a username to promote'));
          return;
        }
        return this.promoteUser(username);
        
      case 'demote':
        if (!username) {
          console.log(chalk.red('❌ Please provide a username to demote'));
          return;
        }
        return this.demoteUser(username);
        
      default:
        console.log(chalk.red(`❌ Unknown users action: ${action}`));
        console.log(chalk.gray('Available actions: list, delete, promote, demote'));
    }
  }
  
  async listUsers() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT id, username, email, role, created_at, last_login FROM users ORDER BY created_at DESC', (err, users) => {
        if (err) {
          console.log(chalk.red('❌ Database error:', err.message));
          reject(err);
          return;
        }
        
        console.log(chalk.bold(`\n👥 Users (${users.length}):`));
        console.log(chalk.gray('━'.repeat(80)));
        
        if (users.length === 0) {
          console.log(chalk.gray('No users found'));
          resolve();
          return;
        }
        
        users.forEach(user => {
          const roleColor = user.role === 'admin' ? chalk.red : chalk.blue;
          const lastLogin = user.last_login ? new Date(user.last_login).toLocaleString() : 'Never';
          
          console.log(`${chalk.yellow(`#${user.id}`)} ${chalk.bold(user.username)} ${roleColor(`[${user.role}]`)}`);
          console.log(`    Email: ${user.email}`);
          console.log(`    Created: ${new Date(user.created_at).toLocaleString()}`);
          console.log(`    Last login: ${lastLogin}`);
          console.log();
        });
        
        resolve();
      });
    });
  }
  
  async deleteUser(username) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT id, username, role FROM users WHERE username = ?', [username], (err, user) => {
        if (err) {
          console.log(chalk.red('❌ Database error:', err.message));
          reject(err);
          return;
        }
        
        if (!user) {
          console.log(chalk.red(`❌ User not found: ${username}`));
          resolve();
          return;
        }
        
        this.db.run('DELETE FROM users WHERE id = ?', [user.id], function(err) {
          if (err) {
            console.log(chalk.red('❌ Error deleting user:', err.message));
            reject(err);
            return;
          }
          
          console.log(chalk.green(`✅ Deleted user: ${user.username} [${user.role}]`));
          resolve();
        });
      });
    });
  }
  
  async promoteUser(username) {
    return new Promise((resolve, reject) => {
      this.db.run('UPDATE users SET role = ? WHERE username = ?', ['admin', username], function(err) {
        if (err) {
          console.log(chalk.red('❌ Error promoting user:', err.message));
          reject(err);
          return;
        }
        
        if (this.changes === 0) {
          console.log(chalk.red(`❌ User not found: ${username}`));
        } else {
          console.log(chalk.green(`✅ Promoted ${username} to admin`));
        }
        resolve();
      });
    });
  }
  
  async demoteUser(username) {
    return new Promise((resolve, reject) => {
      this.db.run('UPDATE users SET role = ? WHERE username = ?', ['user', username], function(err) {
        if (err) {
          console.log(chalk.red('❌ Error demoting user:', err.message));
          reject(err);
          return;
        }
        
        if (this.changes === 0) {
          console.log(chalk.red(`❌ User not found: ${username}`));
        } else {
          console.log(chalk.green(`✅ Demoted ${username} to user`));
        }
        resolve();
      });
    });
  }
  
  async manageServers(args) {
    const [action, id] = args;
    
    if (!action || action === 'list') {
      return this.listServers();
    }
    
    switch (action) {
      case 'delete':
        if (!id) {
          console.log(chalk.red('❌ Please provide a server ID to delete'));
          return;
        }
        return this.deleteServer(parseInt(id));
        
      default:
        console.log(chalk.red(`❌ Unknown servers action: ${action}`));
        console.log(chalk.gray('Available actions: list, delete'));
    }
  }
  
  async listServers() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT s.*, u.username as owner_username 
        FROM servers s 
        LEFT JOIN users u ON s.owner_id = u.id 
        ORDER BY s.created_at DESC
      `;
      
      this.db.all(sql, (err, servers) => {
        if (err) {
          console.log(chalk.red('❌ Database error:', err.message));
          reject(err);
          return;
        }
        
        console.log(chalk.bold(`\n🖥️  Servers (${servers.length}):`));
        console.log(chalk.gray('━'.repeat(80)));
        
        if (servers.length === 0) {
          console.log(chalk.gray('No servers found'));
          resolve();
          return;
        }
        
        servers.forEach(server => {
          const planColor = server.plan === 'paid' ? chalk.yellow : chalk.gray;
          
          console.log(`${chalk.yellow(`#${server.id}`)} ${chalk.bold(server.name)} ${planColor(`[${server.plan}]`)}`);
          console.log(`    IP: ${server.ip}`);
          console.log(`    Owner: ${server.owner_username || 'None'}`);
          console.log(`    Votes: ${server.votes}`);
          console.log(`    Created: ${new Date(server.created_at).toLocaleString()}`);
          if (server.description) {
            console.log(`    Description: ${server.description.substring(0, 50)}${server.description.length > 50 ? '...' : ''}`);
          }
          console.log();
        });
        
        resolve();
      });
    });
  }
  
  async deleteServer(id) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT id, name, banner_url FROM servers WHERE id = ?', [id], (err, server) => {
        if (err) {
          console.log(chalk.red('❌ Database error:', err.message));
          reject(err);
          return;
        }
        
        if (!server) {
          console.log(chalk.red(`❌ Server not found: ID ${id}`));
          resolve();
          return;
        }
        
        // Delete banner file if it exists
        if (server.banner_url) {
          const uploadsDir = path.join(__dirname, 'public', 'uploads');
          const filename = path.basename(server.banner_url);
          const filePath = path.join(uploadsDir, filename);
          
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              console.log(chalk.green(`✅ Removed banner file: ${filename}`));
            }
          } catch (fileErr) {
            console.log(chalk.yellow(`⚠️  Could not delete banner: ${filename}`));
          }
        }
        
        this.db.run('DELETE FROM servers WHERE id = ?', [id], function(err) {
          if (err) {
            console.log(chalk.red('❌ Error deleting server:', err.message));
            reject(err);
            return;
          }
          
          console.log(chalk.green(`✅ Deleted server: ${server.name} (ID: ${server.id})`));
          resolve();
        });
      });
    });
  }
  
  async manageLogs(args) {
    const [logType, lines = '20'] = args;
    const logsDir = path.join(__dirname, 'logs');
    
    if (!fs.existsSync(logsDir)) {
      console.log(chalk.red('❌ Logs directory not found'));
      return;
    }
    
    const logFiles = {
      access: 'access.log',
      error: 'error.log',
      security: 'security.log',
      uploads: 'uploads.log',
      combined: 'combined.log'
    };
    
    if (!logType) {
      console.log(chalk.bold('\n📝 Available log files:'));
      const files = fs.readdirSync(logsDir);
      files.forEach(file => {
        const stats = fs.statSync(path.join(logsDir, file));
        console.log(`  ${chalk.cyan(file)} - ${(stats.size / 1024).toFixed(1)} KB - ${stats.mtime.toLocaleString()}`);
      });
      return;
    }
    
    const logFile = logFiles[logType];
    if (!logFile) {
      console.log(chalk.red(`❌ Unknown log type: ${logType}`));
      console.log(chalk.gray('Available types: access, error, security, uploads, combined'));
      return;
    }
    
    const logPath = path.join(logsDir, logFile);
    if (!fs.existsSync(logPath)) {
      console.log(chalk.red(`❌ Log file not found: ${logFile}`));
      return;
    }
    
    try {
      const content = fs.readFileSync(logPath, 'utf8');
      const logLines = content.split('\n').filter(line => line.trim());
      const lastLines = logLines.slice(-parseInt(lines));
      
      console.log(chalk.bold(`\n📝 Last ${lastLines.length} lines from ${logFile}:`));
      console.log(chalk.gray('━'.repeat(80)));
      
      lastLines.forEach(line => {
        if (line.includes('error') || line.includes('ERROR')) {
          console.log(chalk.red(line));
        } else if (line.includes('warn') || line.includes('WARN')) {
          console.log(chalk.yellow(line));
        } else {
          console.log(chalk.gray(line));
        }
      });
      
    } catch (error) {
      console.log(chalk.red(`❌ Error reading log file: ${error.message}`));
    }
  }
  
  async showStats() {
    const queries = {
      users: 'SELECT COUNT(*) as count FROM users',
      admins: 'SELECT COUNT(*) as count FROM users WHERE role = "admin"',
      servers: 'SELECT COUNT(*) as count FROM servers',
      votes: 'SELECT COUNT(*) as count FROM votes',
      uploads: 'SELECT COUNT(*) as count FROM sqlite_master WHERE type="table" AND name="user_devices"'
    };
    
    console.log(chalk.bold('\n📊 Database Statistics:'));
    console.log(chalk.gray('━'.repeat(40)));
    
    for (const [key, query] of Object.entries(queries)) {
      try {
        const result = await new Promise((resolve, reject) => {
          this.db.get(query, (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });
        
        console.log(`${chalk.blue(key.padEnd(15))}: ${chalk.bold(result.count || 0)}`);
      } catch (error) {
        console.log(`${chalk.blue(key.padEnd(15))}: ${chalk.red('Error')}`);
      }
    }
  }
  
  async manageUploads(args) {
    const [action] = args;
    const uploadsDir = path.join(__dirname, 'public', 'uploads');
    
    if (!fs.existsSync(uploadsDir)) {
      console.log(chalk.red('❌ Uploads directory not found'));
      return;
    }
    
    switch (action) {
      case 'list':
        return this.listUploads();
      case 'clean':
        return this.cleanUploads();
      default:
        console.log(chalk.gray('Available upload actions: list, clean'));
    }
  }
  
  async listUploads() {
    const uploadsDir = path.join(__dirname, 'public', 'uploads');
    
    try {
      const files = fs.readdirSync(uploadsDir);
      
      console.log(chalk.bold(`\n📁 Uploaded Files (${files.length}):`));
      console.log(chalk.gray('━'.repeat(80)));
      
      if (files.length === 0) {
        console.log(chalk.gray('No uploaded files found'));
        return;
      }
      
      files.forEach(file => {
        const filePath = path.join(uploadsDir, file);
        const stats = fs.statSync(filePath);
        const sizeKB = (stats.size / 1024).toFixed(1);
        
        console.log(`${chalk.yellow(file)}`);
        console.log(`    Size: ${sizeKB} KB`);
        console.log(`    Modified: ${stats.mtime.toLocaleString()}`);
        console.log();
      });
    } catch (error) {
      console.log(chalk.red('❌ Error reading uploads directory:', error.message));
    }
  }
  
  async cleanUploads() {
    const uploadsDir = path.join(__dirname, 'public', 'uploads');
    
    try {
      const files = fs.readdirSync(uploadsDir);
      let deletedCount = 0;
      
      files.forEach(file => {
        const filePath = path.join(uploadsDir, file);
        fs.unlinkSync(filePath);
        deletedCount++;
      });
      
      console.log(chalk.green(`✅ Cleaned ${deletedCount} uploaded files`));
    } catch (error) {
      console.log(chalk.red('❌ Error cleaning uploads:', error.message));
    }
  }
  
  async manageSecurity(args) {
    const [action] = args;
    
    switch (action) {
      case 'events':
        return this.showSecurityEvents();
      case 'blacklist':
        return this.showBlacklist();
      case 'bots':
        return this.showBotScores();
      default:
        console.log(chalk.gray('Available security actions: events, blacklist, bots'));
    }
  }
  
  async showSecurityEvents() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM security_events ORDER BY created_at DESC LIMIT 10';
      this.db.all(sql, (err, events) => {
        if (err) {
          console.log(chalk.red('❌ Database error:', err.message));
          reject(err);
          return;
        }
        
        console.log(chalk.bold(`\n🛡️  Recent Security Events (${events.length}):`));
        console.log(chalk.gray('━'.repeat(80)));
        
        if (events.length === 0) {
          console.log(chalk.green('✅ No security events found'));
          resolve();
          return;
        }
        
        events.forEach(event => {
          const severityColor = event.severity === 'critical' ? chalk.red : 
                               event.severity === 'high' ? chalk.yellow : chalk.gray;
          
          console.log(`${chalk.yellow(new Date(event.created_at).toLocaleString())} ${severityColor(`[${event.severity}]`)}`);
          console.log(`  Event: ${event.event_type}`);
          console.log(`  IP: ${event.ip_address}`);
          if (event.details) console.log(`  Details: ${event.details}`);
          console.log();
        });
        
        resolve();
      });
    });
  }
  
  async cleanDatabase(args) {
    const [target] = args;
    
    switch (target) {
      case 'users':
        return this.cleanUsers();
      case 'servers':
        return this.cleanServers();
      case 'all':
        return this.cleanAll();
      default:
        console.log(chalk.gray('Available clean targets: users, servers, all'));
    }
  }
  
  async cleanUsers() {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM users WHERE role != "admin"', function(err) {
        if (err) {
          console.log(chalk.red('❌ Error cleaning users:', err.message));
          reject(err);
          return;
        }
        
        console.log(chalk.green(`✅ Cleaned ${this.changes} non-admin users`));
        resolve();
      });
    });
  }
  
  async cleanServers() {
    return new Promise((resolve, reject) => {
      // First get all servers with banners to clean up files
      this.db.all('SELECT banner_url FROM servers WHERE banner_url IS NOT NULL', (err, servers) => {
        if (err) {
          console.log(chalk.red('❌ Error fetching server banners:', err.message));
          reject(err);
          return;
        }
        
        // Delete banner files
        let deletedFiles = 0;
        const uploadsDir = path.join(__dirname, 'public', 'uploads');
        
        servers.forEach(server => {
          if (server.banner_url) {
            const filename = path.basename(server.banner_url);
            const filePath = path.join(uploadsDir, filename);
            
            try {
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                deletedFiles++;
              }
            } catch (fileErr) {
              console.log(chalk.yellow(`⚠️  Could not delete banner: ${filename}`));
            }
          }
        });
        
        // Now delete server records
        this.db.run('DELETE FROM servers', function(err) {
          if (err) {
            console.log(chalk.red('❌ Error cleaning servers:', err.message));
            reject(err);
            return;
          }
          
          console.log(chalk.green(`✅ Cleaned ${this.changes} servers`));
          if (deletedFiles > 0) {
            console.log(chalk.green(`✅ Removed ${deletedFiles} banner files`));
          }
          resolve();
        });
      });
    });
  }
  
  async cleanAll() {
    console.log(chalk.yellow('⚠️  This will delete ALL data except admin users!'));
    console.log(chalk.yellow('This includes: servers, votes, uploaded banners, security events, logs'));
    console.log(chalk.red('This action cannot be undone!\n'));
    
    // Ask for confirmation
    const answer = await new Promise((resolve) => {
      this.rl.question(chalk.bold('Type "YES" to confirm complete cleanup: '), (input) => {
        resolve(input.trim());
      });
    });
    
    if (answer !== 'YES') {
      console.log(chalk.gray('Cleanup cancelled.'));
      return;
    }
    
    try {
      // Clean servers (includes banner cleanup)
      await this.cleanServers();
      
      // Clean non-admin users
      await this.cleanUsers();
      
      // Clean other tables
      await this.cleanVotes();
      await this.cleanSecurityEvents();
      
      // Clean all uploaded files
      await this.cleanUploads();
      
      console.log(chalk.green('\n✅ Complete cleanup finished!'));
      console.log(chalk.gray('Database has been reset to initial state with admin users preserved.'));
      
    } catch (error) {
      console.log(chalk.red(`❌ Cleanup failed: ${error.message}`));
    }
  }
  
  async cleanVotes() {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM votes', function(err) {
        if (err) {
          console.log(chalk.red('❌ Error cleaning votes:', err.message));
          reject(err);
          return;
        }
        
        console.log(chalk.green(`✅ Cleaned ${this.changes} votes`));
        resolve();
      });
    });
  }
  
  async cleanSecurityEvents() {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM security_events', function(err) {
        if (err) {
          // Table might not exist yet, that's okay
          if (err.message.includes('no such table')) {
            console.log(chalk.gray('No security events table found'));
            resolve();
            return;
          }
          console.log(chalk.red('❌ Error cleaning security events:', err.message));
          reject(err);
          return;
        }
        
        console.log(chalk.green(`✅ Cleaned ${this.changes} security events`));
        resolve();
      });
    });
  }
  
  async backupDatabase() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(__dirname, `backup-${timestamp}.sqlite3`);
    const dbPath = path.join(__dirname, 'data.sqlite3');
    
    try {
      fs.copyFileSync(dbPath, backupPath);
      console.log(chalk.green(`✅ Database backed up to: ${backupPath}`));
    } catch (error) {
      console.log(chalk.red(`❌ Backup failed: ${error.message}`));
    }
  }
  
  clear() {
    console.clear();
    this.showBanner();
  }
  
  exit() {
    console.log(chalk.yellow('\n👋 Exiting admin shell...'));
    console.log(chalk.gray('Server will continue running in the background.'));
    this.rl.close();
  }
}

export default AdminShell;