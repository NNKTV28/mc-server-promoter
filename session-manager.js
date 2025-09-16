import net from 'net';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SessionManager {
  constructor(adminShell) {
    this.adminShell = adminShell;
    this.socketPath = path.join(__dirname, 'admin-session.sock');
    this.server = null;
    this.clients = new Set();
    this.isDetached = false;
    this.currentClient = null;
    
    // Clean up any existing socket file
    this.cleanupSocket();
    
    this.setupSessionServer();
  }
  
  cleanupSocket() {
    try {
      if (fs.existsSync(this.socketPath)) {
        fs.unlinkSync(this.socketPath);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }
  
  setupSessionServer() {
    this.server = net.createServer((socket) => {
      console.log(chalk.green('\n🔗 Client attached to admin session'));
      this.clients.add(socket);
      this.currentClient = socket;
      this.isDetached = false;
      
      // Send welcome message
      socket.write(chalk.blue('\n📡 Attached to Alliance Server Promoter admin session\n'));
      socket.write(chalk.gray('Type "detach" to disconnect, "help" for commands\n'));
      
      // Forward input to admin shell
      socket.on('data', (data) => {
        const input = data.toString().trim();
        
        if (input === 'detach') {
          this.handleDetach(socket);
          return;
        }
        
        // Process command through admin shell
        this.adminShell.processCommand(input).then(() => {
          if (!socket.destroyed) {
            socket.write('alliance> ');
          }
        }).catch((error) => {
          if (!socket.destroyed) {
            socket.write(chalk.red(`Error: ${error.message}\n`));
            socket.write('alliance> ');
          }
        });
      });
      
      socket.on('close', () => {
        console.log(chalk.yellow('🔌 Client detached from admin session'));
        this.clients.delete(socket);
        if (this.currentClient === socket) {
          this.currentClient = null;
          this.isDetached = true;
        }
      });
      
      socket.on('error', (error) => {
        console.log(chalk.red('📡 Socket error:', error.message));
        this.clients.delete(socket);
      });
      
      // Send initial prompt
      socket.write('alliance> ');
    });
    
    this.server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.log(chalk.yellow('⚠️  Session server already running'));
      } else {
        console.log(chalk.red('📡 Session server error:', error.message));
      }
    });
  }
  
  start() {
    return new Promise((resolve, reject) => {
      // Use named pipe on Windows instead of Unix socket
      const pipeName = process.platform === 'win32' ? 
        '\\\\.\\pipe\\alliance-admin-session' : 
        this.socketPath;
      
      this.server.listen(pipeName, () => {
        console.log(chalk.green('📡 Admin session server started'));
        console.log(chalk.gray(`Session available at: ${pipeName}`));
        resolve();
      });
      
      this.server.on('error', reject);
    });
  }
  
  handleDetach(socket) {
    socket.write(chalk.yellow('\n🔌 Detaching from admin session...\n'));
    socket.write(chalk.gray('Server continues running in background\n'));
    socket.write(chalk.gray('Use "npm run attach" or "node attach.js" to reconnect\n\n'));
    
    this.isDetached = true;
    this.currentClient = null;
    
    setTimeout(() => {
      socket.end();
    }, 100);
  }
  
  broadcast(message) {
    for (const client of this.clients) {
      if (!client.destroyed) {
        try {
          client.write(message);
        } catch (error) {
          this.clients.delete(client);
        }
      }
    }
  }
  
  isClientConnected() {
    return !this.isDetached && this.currentClient && !this.currentClient.destroyed;
  }
  
  stop() {
    this.clients.forEach(client => {
      if (!client.destroyed) {
        client.end();
      }
    });
    
    if (this.server) {
      this.server.close();
    }
    
    this.cleanupSocket();
  }
}

// Override admin shell methods to work with session manager
export function enhanceShellForSessions(adminShell, sessionManager) {
  // Store original methods
  const originalProcessCommand = adminShell.processCommand.bind(adminShell);
  const originalShowBanner = adminShell.showBanner.bind(adminShell);
  const originalShowHelp = adminShell.showHelp.bind(adminShell);
  
  // Override processCommand to handle session output
  adminShell.processCommand = async function(input) {
    if (!input) {
      return;
    }
    
    const [command, ...args] = input.split(' ');
    const cmd = this.commands[command.toLowerCase()];
    
    if (cmd) {
      try {
        // Capture console output for session clients
        const originalLog = console.log;
        const originalError = console.error;
        
        if (sessionManager.isClientConnected()) {
          console.log = (...args) => {
            const message = args.join(' ') + '\n';
            sessionManager.broadcast(message);
          };
          
          console.error = (...args) => {
            const message = chalk.red(args.join(' ')) + '\n';
            sessionManager.broadcast(message);
          };
        }
        
        await cmd(args);
        
        // Restore console methods
        console.log = originalLog;
        console.error = originalError;
        
      } catch (error) {
        const errorMsg = chalk.red(`❌ Error executing command: ${error.message}\n`);
        if (sessionManager.isClientConnected()) {
          sessionManager.broadcast(errorMsg);
        } else {
          console.log(errorMsg);
        }
      }
    } else {
      const errorMsg = chalk.red(`❌ Unknown command: ${command}\n`) + 
                      chalk.gray('Type "help" for available commands\n');
      if (sessionManager.isClientConnected()) {
        sessionManager.broadcast(errorMsg);
      } else {
        console.log(errorMsg);
      }
    }
  };
  
  // Add detach command
  adminShell.commands.detach = function() {
    if (sessionManager.isClientConnected()) {
      sessionManager.handleDetach(sessionManager.currentClient);
    } else {
      // Handle direct shell usage (not through session client)
      console.log(chalk.yellow('\n🔌 Starting detached mode...'));
      console.log(chalk.gray('The server will continue running in the background.'));
      console.log(chalk.gray('To reattach, use: node attach.js or attach.bat'));
      
      // Start session server if not already running
      if (!sessionManager.server || !sessionManager.server.listening) {
        sessionManager.start().then(() => {
          console.log(chalk.green('📡 Session server ready for connections'));
        }).catch((error) => {
          console.log(chalk.red('⚠️ Session server failed:', error.message));
        });
      }
      
      // Close the direct shell readline interface
      if (adminShell.rl) {
        adminShell.rl.close();
      }
    }
  };
  
  // Override help to include session commands
  adminShell.showHelp = function() {
    const helpText = chalk.bold('\n📋 Available Commands:\n') +
      chalk.gray('━'.repeat(50)) + '\n' +
      [
        ['help', 'Show this help message'],
        ['info', 'Show server information and status'],
        ['users [list|delete|promote] [username]', 'Manage users'],
        ['servers [list|delete] [id]', 'Manage servers'],
        ['logs [access|error|security|uploads] [lines]', 'View log files'],
        ['stats', 'Show database statistics'],
        ['security [events|blacklist|bots]', 'Security information'],
        ['uploads [list|clean]', 'Manage uploaded files'],
        ['clean [users|servers|all]', 'Clean database tables'],
        ['backup', 'Create database backup'],
        ['clear', 'Clear the terminal'],
        ['detach', '🔌 Detach from shell (server keeps running)'],
        ['exit/quit', 'Exit the shell (server keeps running)']
      ].map(([cmd, desc]) => 
        `  ${chalk.cyan(cmd.padEnd(35))} ${chalk.gray(desc)}`
      ).join('\n') + '\n' +
      chalk.gray('━'.repeat(50)) + '\n';
    
    if (sessionManager.isClientConnected()) {
      sessionManager.broadcast(helpText);
    } else {
      console.log(helpText);
    }
  };
  
  return adminShell;
}

export default SessionManager;