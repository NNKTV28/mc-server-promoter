// promote-user.js - Script to manage user roles (promote to admin or demote to user)
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbFile = path.join(__dirname, 'data.sqlite3');
const db = new sqlite3.Database(dbFile);

function formatDate(dateString) {
  if (!dateString) return 'Never';
  return new Date(dateString).toLocaleString();
}

function showUsage() {
  console.log('Usage: node promote-user.js <command> <username>');
  console.log('');
  console.log('Commands:');
  console.log('  promote <username>    - Make user an admin');
  console.log('  demote <username>     - Make admin a regular user');
  console.log('  info <username>       - Show user information');
  console.log('  list                  - List all users with their roles');
  console.log('  list-admins           - List only admin users');
  console.log('');
  console.log('Examples:');
  console.log('  node promote-user.js promote john123');
  console.log('  node promote-user.js demote admin');
  console.log('  node promote-user.js info alice');
  console.log('  node promote-user.js list');
}

function promoteUser(username) {
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) {
      console.error('❌ Database error:', err);
      db.close();
      return;
    }

    if (!user) {
      console.log(`❌ User '${username}' not found.`);
      db.close();
      return;
    }

    if (user.role === 'admin') {
      console.log(`ℹ️  User '${username}' is already an admin.`);
      console.log(`📧 Email: ${user.email}`);
      console.log(`📅 Account Created: ${formatDate(user.created_at)}`);
      console.log(`🔑 Last Login: ${formatDate(user.last_login)}`);
      db.close();
      return;
    }

    db.run('UPDATE users SET role = ? WHERE username = ?', ['admin', username], function(updateErr) {
      if (updateErr) {
        console.error('❌ Failed to promote user:', updateErr);
        db.close();
        return;
      }

      console.log('✅ Successfully promoted user to admin!');
      console.log('');
      console.log('👤 User Information:');
      console.log(`   Username: ${user.username}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Previous Role: ${user.role}`);
      console.log(`   New Role: admin`);
      console.log(`   Account Created: ${formatDate(user.created_at)}`);
      console.log(`   Last Login: ${formatDate(user.last_login)}`);
      console.log('');
      console.log('🔧 Admin Privileges:');
      console.log('   ✅ Access to admin panel');
      console.log('   ✅ Manage all users');
      console.log('   ✅ Manage all servers');
      console.log('   ✅ Create featured/paid listings');
      console.log('   ✅ View security events');
      console.log('   ✅ Blacklist IP addresses');
      console.log('   ✅ Configure site settings');

      db.close();
    });
  });
}

function demoteUser(username) {
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) {
      console.error('❌ Database error:', err);
      db.close();
      return;
    }

    if (!user) {
      console.log(`❌ User '${username}' not found.`);
      db.close();
      return;
    }

    if (user.role !== 'admin') {
      console.log(`ℹ️  User '${username}' is already a regular user.`);
      console.log(`📧 Email: ${user.email}`);
      console.log(`📅 Account Created: ${formatDate(user.created_at)}`);
      console.log(`🔑 Last Login: ${formatDate(user.last_login)}`);
      db.close();
      return;
    }

    // Check if this is the only admin
    db.get('SELECT COUNT(*) as admin_count FROM users WHERE role = ?', ['admin'], (countErr, result) => {
      if (countErr) {
        console.error('❌ Database error:', countErr);
        db.close();
        return;
      }

      if (result.admin_count <= 1) {
        console.log('⚠️  Cannot demote the last admin user!');
        console.log('   Please promote another user to admin first.');
        db.close();
        return;
      }

      db.run('UPDATE users SET role = ? WHERE username = ?', ['user', username], function(updateErr) {
        if (updateErr) {
          console.error('❌ Failed to demote user:', updateErr);
          db.close();
          return;
        }

        console.log('✅ Successfully demoted admin to regular user!');
        console.log('');
        console.log('👤 User Information:');
        console.log(`   Username: ${user.username}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Previous Role: ${user.role}`);
        console.log(`   New Role: user`);
        console.log(`   Account Created: ${formatDate(user.created_at)}`);
        console.log(`   Last Login: ${formatDate(user.last_login)}`);
        console.log('');
        console.log('⚠️  Removed Admin Privileges:');
        console.log('   ❌ No access to admin panel');
        console.log('   ❌ Cannot manage other users');
        console.log('   ❌ Cannot manage all servers');
        console.log('   ❌ Cannot create featured/paid listings');
        console.log('   ❌ Cannot view security events');
        console.log('   ❌ Cannot blacklist IP addresses');
        console.log('   ❌ Cannot configure site settings');

        db.close();
      });
    });
  });
}

function showUserInfo(username) {
  const userSQL = `
    SELECT 
      u.*,
      COUNT(DISTINCT s.id) as server_count,
      COUNT(DISTINCT ud.id) as device_count,
      COUNT(lh.id) as total_logins,
      COUNT(CASE WHEN lh.success = 0 THEN 1 END) as failed_logins,
      MAX(lh.login_time) as last_activity
    FROM users u
    LEFT JOIN servers s ON u.id = s.owner_id
    LEFT JOIN user_devices ud ON u.id = ud.user_id
    LEFT JOIN login_history lh ON u.id = lh.user_id
    WHERE u.username = ?
    GROUP BY u.id
  `;

  db.get(userSQL, [username], (err, user) => {
    if (err) {
      console.error('❌ Database error:', err);
      db.close();
      return;
    }

    if (!user) {
      console.log(`❌ User '${username}' not found.`);
      db.close();
      return;
    }

    const roleEmoji = user.role === 'admin' ? '👑' : '👤';
    const roleColor = user.role === 'admin' ? 'ADMIN' : 'USER';

    console.log('\n' + '='.repeat(60));
    console.log(`${roleEmoji} USER INFORMATION: ${user.username.toUpperCase()}`);
    console.log('='.repeat(60));
    console.log(`📧 Email:           ${user.email}`);
    console.log(`🔐 Role:            ${roleColor}`);
    console.log(`📅 Account Created:  ${formatDate(user.created_at)}`);
    console.log(`🔑 Last Login:      ${formatDate(user.last_login)}`);
    console.log(`⏰ Last Activity:   ${formatDate(user.last_activity)}`);
    console.log(`🖥️  Servers Owned:   ${user.server_count || 0}`);
    console.log(`📱 Registered Devices: ${user.device_count || 0}`);
    console.log(`🔢 Total Logins:    ${user.total_logins || 0}`);
    console.log(`❌ Failed Logins:   ${user.failed_logins || 0}`);

    if (user.role === 'admin') {
      console.log('\n👑 ADMIN PRIVILEGES:');
      console.log('   ✅ Full admin panel access');
      console.log('   ✅ User management');
      console.log('   ✅ Server management');
      console.log('   ✅ Security monitoring');
      console.log('   ✅ Site configuration');
    } else {
      console.log('\n👤 USER PERMISSIONS:');
      console.log('   ✅ Create and manage own servers');
      console.log('   ✅ Vote on servers');
      console.log('   ✅ Update profile');
      console.log('   ❌ Admin panel access');
    }

    console.log('\n' + '='.repeat(60) + '\n');
    db.close();
  });
}

function listUsers(adminsOnly = false) {
  const whereClause = adminsOnly ? "WHERE role = 'admin'" : '';
  const title = adminsOnly ? 'ADMIN USERS' : 'ALL USERS';
  
  const sql = `
    SELECT 
      u.*,
      COUNT(DISTINCT s.id) as server_count,
      COUNT(DISTINCT ud.id) as device_count,
      MAX(lh.login_time) as last_activity
    FROM users u
    LEFT JOIN servers s ON u.id = s.owner_id
    LEFT JOIN user_devices ud ON u.id = ud.user_id
    LEFT JOIN login_history lh ON u.id = lh.user_id
    ${whereClause}
    GROUP BY u.id
    ORDER BY u.role DESC, u.created_at DESC
  `;

  db.all(sql, (err, users) => {
    if (err) {
      console.error('❌ Database error:', err);
      db.close();
      return;
    }

    console.log('\n' + '='.repeat(80));
    console.log(`📋 ${title} (${users.length} total)`);
    console.log('='.repeat(80));

    if (!users.length) {
      console.log('No users found.');
      db.close();
      return;
    }

    users.forEach((user, index) => {
      const roleEmoji = user.role === 'admin' ? '👑' : '👤';
      const roleBadge = user.role === 'admin' ? '[ADMIN]' : '[USER] ';
      
      console.log(`${String(index + 1).padStart(2, '0')}. ${roleEmoji} ${user.username} ${roleBadge}`);
      console.log(`    📧 Email: ${user.email}`);
      console.log(`    📅 Created: ${formatDate(user.created_at)}`);
      console.log(`    🔑 Last Login: ${formatDate(user.last_login)}`);
      console.log(`    ⏰ Last Activity: ${formatDate(user.last_activity)}`);
      console.log(`    🖥️  Servers: ${user.server_count || 0} | 📱 Devices: ${user.device_count || 0}`);
      console.log('    ' + '─'.repeat(60));
    });

    const adminCount = users.filter(u => u.role === 'admin').length;
    const userCount = users.filter(u => u.role === 'user').length;

    if (!adminsOnly) {
      console.log('\n📊 SUMMARY:');
      console.log(`   👑 Admins: ${adminCount}`);
      console.log(`   👤 Users: ${userCount}`);
      console.log(`   📈 Total: ${users.length}`);
    }

    console.log('\n' + '='.repeat(80) + '\n');
    db.close();
  });
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  showUsage();
  process.exit(1);
}

const command = args[0].toLowerCase();
const username = args[1];

switch (command) {
  case 'promote':
    if (!username) {
      console.log('❌ Username is required for promote command.');
      showUsage();
      process.exit(1);
    }
    promoteUser(username);
    break;

  case 'demote':
    if (!username) {
      console.log('❌ Username is required for demote command.');
      showUsage();
      process.exit(1);
    }
    demoteUser(username);
    break;

  case 'info':
    if (!username) {
      console.log('❌ Username is required for info command.');
      showUsage();
      process.exit(1);
    }
    showUserInfo(username);
    break;

  case 'list':
    listUsers(false);
    break;

  case 'list-admins':
    listUsers(true);
    break;

  default:
    console.log(`❌ Unknown command: ${command}`);
    showUsage();
    process.exit(1);
}