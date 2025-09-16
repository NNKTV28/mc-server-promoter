// info.js - Script to view comprehensive user device and login information
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

function displayUserInfo(username) {
  const userSQL = `
    SELECT 
      u.*,
      COUNT(DISTINCT ud.id) as device_count,
      COUNT(lh.id) as total_logins,
      COUNT(CASE WHEN lh.success = 0 THEN 1 END) as failed_logins,
      MAX(lh.login_time) as last_activity
    FROM users u
    LEFT JOIN user_devices ud ON u.id = ud.user_id
    LEFT JOIN login_history lh ON u.id = lh.user_id
    WHERE u.username = ?
    GROUP BY u.id
  `;

  db.get(userSQL, [username], (err, user) => {
    if (err) {
      console.error('Database error:', err);
      db.close();
      return;
    }

    if (!user) {
      console.log(`❌ User '${username}' not found.`);
      db.close();
      return;
    }

    console.log('\n' + '='.repeat(80));
    console.log(`👤 USER INFORMATION: ${user.username.toUpperCase()}`);
    console.log('='.repeat(80));
    console.log(`📧 Email:          ${user.email}`);
    console.log(`🔐 Role:           ${user.role.toUpperCase()}`);
    console.log(`📅 Account Created: ${formatDate(user.created_at)}`);
    console.log(`🔑 Last Login:     ${formatDate(user.last_login)}`);
    console.log(`📱 Total Devices:  ${user.device_count || 0}`);
    console.log(`🔢 Total Logins:   ${user.total_logins || 0}`);
    console.log(`❌ Failed Logins:  ${user.failed_logins || 0}`);
    console.log(`⏰ Last Activity:  ${formatDate(user.last_activity)}`);

    // Get device information
    const deviceSQL = `
      SELECT 
        ud.*,
        COUNT(lh.id) as device_logins,
        COUNT(CASE WHEN lh.success = 0 THEN 1 END) as device_failed_logins,
        MAX(lh.login_time) as device_last_login,
        MIN(lh.login_time) as device_first_login
      FROM user_devices ud
      LEFT JOIN login_history lh ON ud.id = lh.device_id
      WHERE ud.user_id = ?
      GROUP BY ud.id
      ORDER BY ud.last_seen DESC
    `;

    db.all(deviceSQL, [user.id], (err2, devices) => {
      if (err2) {
        console.error('Database error:', err2);
        db.close();
        return;
      }

      if (devices.length > 0) {
        console.log('\n' + '='.repeat(80));
        console.log('📱 REGISTERED DEVICES');
        console.log('='.repeat(80));

        devices.forEach((device, index) => {
          console.log(`\n🔸 Device #${index + 1}`);
          console.log('  ─'.repeat(40));
          console.log(`  🌐 Browser:        ${device.browser_name || 'Unknown'} ${device.browser_version || ''}`);
          console.log(`  💻 Operating System: ${device.os_name || 'Unknown'} ${device.os_version || ''}`);
          console.log(`  📱 Device Type:    ${device.device_type || 'Unknown'}`);
          console.log(`  🏷️  Device Model:   ${device.device_model || 'Unknown'}`);
          console.log(`  ⚙️  CPU Architecture: ${device.cpu_architecture || 'Unknown'}`);
          console.log(`  🖥️  Platform:       ${device.platform || 'Unknown'}`);
          console.log(`  🔍 User Agent:     ${device.user_agent ? device.user_agent.substring(0, 60) + '...' : 'Unknown'}`);
          console.log(`  🆔 Device ID:      ${device.device_fingerprint}`);
          console.log(`  📅 First Seen:     ${formatDate(device.first_seen)}`);
          console.log(`  ⏰ Last Seen:      ${formatDate(device.last_seen)}`);
          console.log(`  🔢 Logins:         ${device.device_logins || 0}`);
          console.log(`  ❌ Failed Logins:  ${device.device_failed_logins || 0}`);
          console.log(`  🔑 Last Login:     ${formatDate(device.device_last_login)}`);
          console.log(`  🎯 First Login:    ${formatDate(device.device_first_login)}`);
        });
      }

      // Get recent login history
      const historySQL = `
        SELECT 
          lh.*,
          ud.browser_name,
          ud.os_name,
          ud.device_type,
          ud.device_model
        FROM login_history lh
        JOIN user_devices ud ON lh.device_id = ud.id
        WHERE lh.user_id = ?
        ORDER BY lh.login_time DESC
        LIMIT 20
      `;

      db.all(historySQL, [user.id], (err3, loginHistory) => {
        if (err3) {
          console.error('Database error:', err3);
          db.close();
          return;
        }

        if (loginHistory.length > 0) {
          console.log('\n' + '='.repeat(80));
          console.log('📊 RECENT LOGIN HISTORY (Last 20 attempts)');
          console.log('='.repeat(80));

          loginHistory.forEach((login, index) => {
            const status = login.success ? '✅ Success' : '❌ Failed';
            const deviceInfo = `${login.browser_name || 'Unknown'} on ${login.os_name || 'Unknown'}`;
            
            console.log(`${String(index + 1).padStart(2, '0')}. ${status} | ${formatDate(login.login_time)}`);
            console.log(`    📍 Location: ${login.city || 'Unknown'}, ${login.region || 'Unknown'}, ${login.country || 'Unknown'}`);
            console.log(`    🌐 IP Address: ${login.ip_address || 'Unknown'}`);
            console.log(`    🏢 ISP: ${login.isp || 'Unknown'}`);
            console.log(`    💻 Device: ${deviceInfo}`);
            console.log('    ─'.repeat(50));
          });
        }

        // Get location statistics
        const locationSQL = `
          SELECT 
            country,
            region,
            city,
            COUNT(*) as login_count,
            COUNT(CASE WHEN success = 1 THEN 1 END) as successful_logins,
            COUNT(CASE WHEN success = 0 THEN 1 END) as failed_logins,
            MAX(login_time) as last_login_from_location
          FROM login_history lh
          WHERE lh.user_id = ?
          GROUP BY country, region, city
          ORDER BY login_count DESC
          LIMIT 10
        `;

        db.all(locationSQL, [user.id], (err4, locations) => {
          if (err4) {
            console.error('Database error:', err4);
            db.close();
            return;
          }

          if (locations.length > 0) {
            console.log('\n' + '='.repeat(80));
            console.log('🌍 LOGIN LOCATIONS (Top 10)');
            console.log('='.repeat(80));

            locations.forEach((location, index) => {
              console.log(`${String(index + 1).padStart(2, '0')}. ${location.city || 'Unknown'}, ${location.region || 'Unknown'}, ${location.country || 'Unknown'}`);
              console.log(`    📊 Total: ${location.login_count} | ✅ Success: ${location.successful_logins} | ❌ Failed: ${location.failed_logins}`);
              console.log(`    ⏰ Last Login: ${formatDate(location.last_login_from_location)}`);
              console.log('    ─'.repeat(50));
            });
          }

          // Get security insights
          const securitySQL = `
            SELECT 
              COUNT(DISTINCT ip_address) as unique_ips,
              COUNT(DISTINCT country) as unique_countries,
              COUNT(CASE WHEN success = 0 THEN 1 END) as total_failed_attempts,
              COUNT(CASE WHEN success = 0 AND login_time > datetime('now', '-7 days') THEN 1 END) as recent_failed_attempts,
              MAX(login_time) as last_login_attempt,
              MIN(login_time) as first_login_attempt
            FROM login_history
            WHERE user_id = ?
          `;

          db.get(securitySQL, [user.id], (err5, security) => {
            if (err5) {
              console.error('Database error:', err5);
              db.close();
              return;
            }

            if (security) {
              console.log('\n' + '='.repeat(80));
              console.log('🔒 SECURITY OVERVIEW');
              console.log('='.repeat(80));
              console.log(`🌐 Unique IP Addresses:     ${security.unique_ips || 0}`);
              console.log(`🌍 Countries Accessed From: ${security.unique_countries || 0}`);
              console.log(`❌ Total Failed Attempts:   ${security.total_failed_attempts || 0}`);
              console.log(`⚠️  Recent Failed (7 days):  ${security.recent_failed_attempts || 0}`);
              console.log(`⏰ Account Active Period:   ${formatDate(security.first_login_attempt)} - ${formatDate(security.last_login_attempt)}`);
              
              // Security risk assessment
              console.log('\n🛡️ SECURITY ASSESSMENT:');
              if (security.recent_failed_attempts > 5) {
                console.log('   🚨 HIGH RISK: Many recent failed login attempts detected!');
              } else if (security.unique_ips > 10) {
                console.log('   ⚠️  MEDIUM RISK: Account accessed from many different IP addresses');
              } else if (security.unique_countries > 3) {
                console.log('   ⚠️  MEDIUM RISK: Account accessed from multiple countries');
              } else {
                console.log('   ✅ LOW RISK: Normal usage pattern detected');
              }
            }

            console.log('\n' + '='.repeat(80));
            console.log('✅ Report generated successfully!');
            console.log('='.repeat(80) + '\n');
            
            db.close();
          });
        });
      });
    });
  });
}

// Check command line arguments
const args = process.argv.slice(2);
if (args.length !== 1) {
  console.log('Usage: node info.js <username>');
  console.log('Example: node info.js admin');
  process.exit(1);
}

const username = args[0];
displayUserInfo(username);