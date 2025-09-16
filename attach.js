#!/usr/bin/env node

import net from 'net';
import readline from 'readline';
import chalk from 'chalk';

class AttachClient {
  constructor() {
    this.socket = null;
    this.rl = null;
    this.connected = false;
  }
  
  async connect() {
    console.clear();
    console.log(chalk.bold.blue(`
╔═══════════════════════════════════════════════════╗
║          🌍 ALLIANCE SERVER PROMOTER              ║
║              Attaching to Session...              ║
╚═══════════════════════════════════════════════════╝
`));
    
    const pipeName = process.platform === 'win32' ? 
      '\\\\.\\pipe\\alliance-admin-session' : 
      './admin-session.sock';
    
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(pipeName);
      
      this.socket.on('connect', () => {
        console.log(chalk.green('✅ Connected to admin session!'));
        this.connected = true;
        this.setupInput();
        resolve();
      });
      
      this.socket.on('data', (data) => {
        const message = data.toString();
        
        // Don't echo the prompt back immediately
        if (message.trim() === 'alliance>') {
          process.stdout.write(chalk.cyan('alliance> '));
        } else {
          process.stdout.write(message);
        }
      });
      
      this.socket.on('error', (error) => {
        if (error.code === 'ENOENT' || error.code === 'ECONNREFUSED') {
          console.log(chalk.red('❌ Cannot connect to admin session'));
          console.log(chalk.yellow('💡 Make sure the server is running with: node server.js'));
          console.log(chalk.gray('   Or start a new session with: npm start'));
        } else {
          console.log(chalk.red('❌ Connection error:', error.message));
        }
        process.exit(1);
      });
      
      this.socket.on('close', () => {
        if (this.connected) {
          console.log(chalk.yellow('\n🔌 Disconnected from admin session'));
        }
        this.cleanup();
        process.exit(0);
      });
      
      // Handle timeout
      setTimeout(() => {
        if (!this.connected) {
          console.log(chalk.red('❌ Connection timeout'));
          console.log(chalk.yellow('💡 Make sure the server is running'));
          this.socket.destroy();
          process.exit(1);
        }
      }, 5000);
    });
  }
  
  setupInput() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: ''
    });
    
    this.rl.on('line', (input) => {
      if (this.socket && !this.socket.destroyed) {
        this.socket.write(input + '\n');
      }
    });
    
    this.rl.on('SIGINT', () => {
      console.log(chalk.yellow('\n🔌 Use "detach" to disconnect or Ctrl+C again to force quit'));
    });
    
    // Handle Ctrl+C twice to force quit
    let ctrlCCount = 0;
    process.on('SIGINT', () => {
      ctrlCCount++;
      if (ctrlCCount === 1) {
        console.log(chalk.yellow('\n🔌 Press Ctrl+C again to force quit, or type "detach" to disconnect gracefully'));
        setTimeout(() => ctrlCCount = 0, 2000);
      } else {
        console.log(chalk.red('\n🛑 Force quitting...'));
        this.cleanup();
        process.exit(0);
      }
    });
  }
  
  cleanup() {
    if (this.rl) {
      this.rl.close();
    }
    if (this.socket && !this.socket.destroyed) {
      this.socket.end();
    }
  }
}

// Show usage if help requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(chalk.bold('🔗 Alliance Server Promoter - Session Attach'));
  console.log(chalk.gray('Connect to an existing server admin session\n'));
  
  console.log(chalk.blue('Usage:'));
  console.log('  node attach.js          Connect to existing session');
  console.log('  node attach.js --help   Show this help\n');
  
  console.log(chalk.blue('Session Commands:'));
  console.log('  detach                  Disconnect from session (server keeps running)');
  console.log('  help                    Show admin commands');
  console.log('  Ctrl+C twice            Force quit client\n');
  
  console.log(chalk.blue('Examples:'));
  console.log('  node attach.js          # Attach to running server session');
  console.log('  > detach                # Disconnect gracefully');
  console.log('  node attach.js          # Reconnect later\n');
  
  process.exit(0);
}

// Main execution
async function main() {
  const client = new AttachClient();
  
  try {
    await client.connect();
  } catch (error) {
    console.log(chalk.red('❌ Failed to connect:', error.message));
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.log(chalk.red('\n❌ Unexpected error:', error.message));
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.log(chalk.red('\n❌ Unhandled rejection:', reason));
  process.exit(1);
});

main();