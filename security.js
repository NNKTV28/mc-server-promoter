// security.js - Script to monitor security events and bot activity
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

function showSecurityOverview() {
  console.log('\n' + '='.repeat(80));
  console.log('🛡️ ALLIANCE SERVER PROMOTER - SECURITY OVERVIEW');
  console.log('='.repeat(80));

  // Get security statistics
  const statsSQL = `
    SELECT 
      COUNT(*) as total_events,
      COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_severity,
      COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_severity,
      COUNT(CASE WHEN event_type = 'bot_detected' THEN 1 END) as bot_detections,
      COUNT(CASE WHEN event_type = 'rate_limit' THEN 1 END) as rate_limits,
      COUNT(CASE WHEN created_at > datetime('now', '-24 hours') THEN 1 END) as last_24h,
      MAX(created_at) as latest_event
    FROM security_events
  `;

  db.get(statsSQL, (err, stats) => {
    if (err) {
      console.error('Database error:', err);
      return;
    }

    console.log(`📊 Total Security Events: ${stats.total_events || 0}`);
    console.log(`🚨 High Severity Events: ${stats.high_severity || 0}`);
    console.log(`💀 Critical Events: ${stats.critical_severity || 0}`);
    console.log(`🤖 Bot Detections: ${stats.bot_detections || 0}`);
    console.log(`⏱️  Rate Limit Hits: ${stats.rate_limits || 0}`);
    console.log(`📅 Events (Last 24h): ${stats.last_24h || 0}`);
    console.log(`🕐 Latest Event: ${formatDate(stats.latest_event)}`);

    // Get top suspicious IPs
    const topIPsSQL = `
      SELECT 
        ip_address,
        COUNT(*) as event_count,
        MAX(created_at) as last_seen,
        GROUP_CONCAT(DISTINCT event_type) as event_types
      FROM security_events
      GROUP BY ip_address
      ORDER BY event_count DESC
      LIMIT 10
    `;

    db.all(topIPsSQL, (err2, topIPs) => {
      if (err2) {
        console.error('Database error:', err2);
        return;
      }

      if (topIPs.length > 0) {
        console.log('\n' + '='.repeat(80));
        console.log('🎯 TOP SUSPICIOUS IP ADDRESSES');
        console.log('='.repeat(80));

        topIPs.forEach((ip, index) => {
          console.log(`${String(index + 1).padStart(2, '0')}. ${ip.ip_address}`);
          console.log(`    📊 Events: ${ip.event_count} | Last Seen: ${formatDate(ip.last_seen)}`);
          console.log(`    🏷️  Types: ${ip.event_types}`);
          console.log('    ─'.repeat(60));
        });
      }

      // Get blacklisted IPs
      const blacklistSQL = `
        SELECT 
          ip_address,
          reason,
          blocked_at,
          blocked_until,
          CASE 
            WHEN blocked_until IS NULL THEN 'Permanent'
            WHEN blocked_until > datetime('now') THEN 'Active'
            ELSE 'Expired'
          END as status
        FROM ip_blacklist
        ORDER BY blocked_at DESC
      `;

      db.all(blacklistSQL, (err3, blacklist) => {
        if (err3) {
          console.error('Database error:', err3);
          return;
        }

        if (blacklist.length > 0) {
          console.log('\n' + '='.repeat(80));
          console.log('🚫 BLACKLISTED IP ADDRESSES');
          console.log('='.repeat(80));

          blacklist.forEach((entry, index) => {
            const statusEmoji = entry.status === 'Active' ? '🔴' : entry.status === 'Expired' ? '🟡' : '⚫';
            console.log(`${String(index + 1).padStart(2, '0')}. ${entry.ip_address} ${statusEmoji} ${entry.status}`);
            console.log(`    📝 Reason: ${entry.reason}`);
            console.log(`    📅 Blocked: ${formatDate(entry.blocked_at)}`);
            console.log(`    ⏰ Until: ${entry.blocked_until ? formatDate(entry.blocked_until) : 'Permanent'}`);
            console.log('    ─'.repeat(60));
          });
        }

        // Get recent bot scores
        const botScoresSQL = `
          SELECT 
            ip_address,
            bot_score,
            request_count,
            suspicious_patterns,
            last_updated
          FROM bot_scores
          WHERE bot_score > 0
          ORDER BY bot_score DESC, last_updated DESC
          LIMIT 15
        `;

        db.all(botScoresSQL, (err4, botScores) => {
          if (err4) {
            console.error('Database error:', err4);
            return;
          }

          if (botScores.length > 0) {
            console.log('\n' + '='.repeat(80));
            console.log('🤖 BOT DETECTION SCORES');
            console.log('='.repeat(80));

            botScores.forEach((score, index) => {
              const riskLevel = score.bot_score >= 80 ? '🔴 HIGH' : 
                               score.bot_score >= 60 ? '🟡 MEDIUM' : 
                               score.bot_score >= 30 ? '🟠 LOW' : '🟢 MINIMAL';
              
              console.log(`${String(index + 1).padStart(2, '0')}. ${score.ip_address} | Score: ${score.bot_score}/100 | ${riskLevel}`);
              console.log(`    📊 Requests: ${score.request_count} | Suspicious: ${score.suspicious_patterns}`);
              console.log(`    ⏰ Last Updated: ${formatDate(score.last_updated)}`);
              console.log('    ─'.repeat(60));
            });
          }

          // Get recent security events
          const recentEventsSQL = `
            SELECT 
              ip_address,
              event_type,
              severity,
              details,
              endpoint,
              created_at
            FROM security_events
            ORDER BY created_at DESC
            LIMIT 20
          `;

          db.all(recentEventsSQL, (err5, events) => {
            if (err5) {
              console.error('Database error:', err5);
              return;
            }

            if (events.length > 0) {
              console.log('\n' + '='.repeat(80));
              console.log('📋 RECENT SECURITY EVENTS (Last 20)');
              console.log('='.repeat(80));

              events.forEach((event, index) => {
                const severityEmoji = event.severity === 'critical' ? '💀' :
                                    event.severity === 'high' ? '🚨' :
                                    event.severity === 'medium' ? '⚠️' : 'ℹ️';
                
                console.log(`${String(index + 1).padStart(2, '0')}. ${severityEmoji} ${event.event_type.toUpperCase()} | ${formatDate(event.created_at)}`);
                console.log(`    🌐 IP: ${event.ip_address} | Endpoint: ${event.endpoint || 'N/A'}`);
                console.log(`    📝 Details: ${event.details || 'No details'}`);
                console.log('    ─'.repeat(60));
              });
            }

            console.log('\n' + '='.repeat(80));
            console.log('✅ Security report generated successfully!');
            console.log('='.repeat(80) + '\n');
            
            db.close();
          });
        });
      });
    });
  });
}

// Check command line arguments for specific IP lookup
const args = process.argv.slice(2);
if (args.length === 1 && args[0].startsWith('--ip=')) {
  const targetIP = args[0].replace('--ip=', '');
  console.log(`\n🔍 Security information for IP: ${targetIP}`);
  console.log('='.repeat(60));
  
  const ipSQL = `
    SELECT 
      event_type,
      severity,
      details,
      endpoint,
      created_at
    FROM security_events
    WHERE ip_address = ?
    ORDER BY created_at DESC
    LIMIT 50
  `;
  
  db.all(ipSQL, [targetIP], (err, events) => {
    if (err) {
      console.error('Database error:', err);
      db.close();
      return;
    }
    
    if (events.length === 0) {
      console.log('No security events found for this IP address.');
    } else {
      events.forEach((event, index) => {
        console.log(`${index + 1}. ${event.event_type} (${event.severity}) - ${formatDate(event.created_at)}`);
        console.log(`   Endpoint: ${event.endpoint || 'N/A'}`);
        console.log(`   Details: ${event.details || 'No details'}`);
        console.log('   ─'.repeat(50));
      });
    }
    
    db.close();
  });
} else if (args.length > 0) {
  console.log('Usage: node security.js [--ip=IP_ADDRESS]');
  console.log('Examples:');
  console.log('  node security.js              # Show general security overview');
  console.log('  node security.js --ip=1.2.3.4 # Show events for specific IP');
  process.exit(1);
} else {
  showSecurityOverview();
}