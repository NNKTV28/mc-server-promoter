// Integration file for adding payment system to your server
// Add these imports to your main server file

import paymentRoutes from './payment-routes.js';
import { 
  initializePaymentTables, 
  expireOldSubscriptions,
  PAYMENT_CONFIG 
} from './payment-system.js';

// Example integration for your main server file (server.js or app.js)
export function integratePaymentSystem(app, db) {
  
  // Initialize payment tables on server start
  initializePaymentTables(db);
  
  // Add payment routes to your Express app
  app.use('/api/payment', paymentRoutes);
  
  // Set up scheduled tasks
  setupPaymentScheduledTasks(db);
  
  // Add middleware to check subscription status
  app.use('/api/servers', checkServerSubscription);
  
  console.log('Payment system integrated successfully');
  console.log('Available plans:', Object.keys(PAYMENT_CONFIG.plans));
}

// Scheduled tasks for payment system maintenance
function setupPaymentScheduledTasks(db) {
  
  // Run subscription expiration check every hour
  setInterval(async () => {
    try {
      await expireOldSubscriptions(db);
      console.log('Subscription expiration check completed');
    } catch (error) {
      console.error('Error during subscription expiration check:', error);
    }
  }, 60 * 60 * 1000); // 1 hour
  
  // Weekly analytics update (optional)
  setInterval(() => {
    generatePaymentAnalytics(db);
  }, 7 * 24 * 60 * 60 * 1000); // 1 week
  
  // Daily reminder for expiring subscriptions (optional)
  setInterval(() => {
    sendExpirationReminders(db);
  }, 24 * 60 * 60 * 1000); // 1 day
}

// Middleware to check if server has active subscription
function checkServerSubscription(req, res, next) {
  // Skip subscription check for GET requests or if not authenticated
  if (req.method === 'GET' || !req.session.userId) {
    return next();
  }
  
  // For POST/PUT/DELETE operations, check if server has active subscription
  const serverId = req.body.serverId || req.params.id;
  
  if (!serverId) {
    return next();
  }
  
  const sql = `
    SELECT COUNT(*) as count 
    FROM user_subscriptions 
    WHERE server_id = ? 
      AND status = 'active' 
      AND expires_at > datetime('now')
  `;
  
  req.db.get(sql, [serverId], (err, result) => {
    if (err) {
      console.error('Error checking subscription status:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    req.hasActiveSubscription = result.count > 0;
    next();
  });
}

// Analytics generation function
function generatePaymentAnalytics(db) {
  const analytics = {
    totalRevenue: 0,
    activeSubscriptions: 0,
    expiringSubscriptions: 0,
    popularPlan: null
  };
  
  // Calculate total revenue
  db.get(`
    SELECT SUM(amount) as total 
    FROM payment_transactions 
    WHERE status = 'completed' AND type = 'payment'
  `, (err, row) => {
    if (!err && row) {
      analytics.totalRevenue = row.total || 0;
    }
  });
  
  // Count active subscriptions
  db.get(`
    SELECT COUNT(*) as count 
    FROM user_subscriptions 
    WHERE status = 'active' AND expires_at > datetime('now')
  `, (err, row) => {
    if (!err && row) {
      analytics.activeSubscriptions = row.count || 0;
    }
  });
  
  // Count expiring subscriptions (next 7 days)
  db.get(`
    SELECT COUNT(*) as count 
    FROM user_subscriptions 
    WHERE status = 'active' 
      AND expires_at <= datetime('now', '+7 days') 
      AND expires_at > datetime('now')
  `, (err, row) => {
    if (!err && row) {
      analytics.expiringSubscriptions = row.count || 0;
    }
  });
  
  // Find most popular plan
  db.get(`
    SELECT plan_key, COUNT(*) as count 
    FROM user_subscriptions 
    WHERE status IN ('active', 'expired')
    GROUP BY plan_key 
    ORDER BY count DESC 
    LIMIT 1
  `, (err, row) => {
    if (!err && row) {
      analytics.popularPlan = row.plan_key;
    }
  });
  
  console.log('Payment Analytics:', analytics);
  
  // You could save these analytics to a file or database table
  // for historical tracking and reporting
}

// Function to send expiration reminders (placeholder)
function sendExpirationReminders(db) {
  const sql = `
    SELECT 
      us.*,
      u.email,
      u.username,
      s.name as server_name
    FROM user_subscriptions us
    JOIN users u ON us.user_id = u.id
    JOIN servers s ON us.server_id = s.id
    WHERE us.status = 'active' 
      AND us.expires_at <= datetime('now', '+7 days') 
      AND us.expires_at > datetime('now')
      AND us.reminder_sent = 0
  `;
  
  db.all(sql, (err, subscriptions) => {
    if (err) {
      console.error('Error fetching expiring subscriptions:', err);
      return;
    }
    
    subscriptions.forEach(sub => {
      // Here you would integrate with your email service
      // to send expiration reminder emails
      console.log(`Subscription expiring for ${sub.username} - Server: ${sub.server_name}`);
      
      // Mark reminder as sent
      db.run(
        'UPDATE user_subscriptions SET reminder_sent = 1 WHERE id = ?',
        [sub.id]
      );
    });
  });
}

// Helper function to check if user has premium features
export function userHasPremiumFeatures(req, serverId) {
  return new Promise((resolve) => {
    if (!req.session.userId || !serverId) {
      return resolve(false);
    }
    
    const sql = `
      SELECT plan_key 
      FROM user_subscriptions 
      WHERE user_id = ? 
        AND server_id = ? 
        AND status = 'active' 
        AND expires_at > datetime('now')
      ORDER BY created_at DESC 
      LIMIT 1
    `;
    
    req.db.get(sql, [req.session.userId, serverId], (err, subscription) => {
      if (err || !subscription) {
        return resolve(false);
      }
      
      // Return the subscription plan or true for any active subscription
      resolve(subscription.plan_key);
    });
  });
}

// Enhanced server listing function that includes premium status
export function getEnhancedServerList(db, options = {}) {
  return new Promise((resolve, reject) => {
    let sql = `
      SELECT 
        s.*,
        u.username as owner_name,
        CASE 
          WHEN us.status = 'active' AND us.expires_at > datetime('now') 
          THEN us.plan_key 
          ELSE NULL 
        END as premium_plan,
        CASE 
          WHEN us.status = 'active' AND us.expires_at > datetime('now') 
          THEN 1 
          ELSE 0 
        END as is_premium
      FROM servers s
      LEFT JOIN users u ON s.owner_id = u.id
      LEFT JOIN user_subscriptions us ON s.id = us.server_id 
        AND us.status = 'active' 
        AND us.expires_at > datetime('now')
    `;
    
    const conditions = [];
    const params = [];
    
    if (options.search) {
      conditions.push('(s.name LIKE ? OR s.description LIKE ?)');
      params.push(`%${options.search}%`, `%${options.search}%`);
    }
    
    if (options.gamemode) {
      conditions.push('s.gamemode = ?');
      params.push(options.gamemode);
    }
    
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    
    // Sort premium servers first, then by other criteria
    sql += ' ORDER BY is_premium DESC, s.votes DESC, s.created_at DESC';
    
    if (options.limit) {
      sql += ` LIMIT ${parseInt(options.limit)}`;
    }
    
    db.all(sql, params, (err, servers) => {
      if (err) {
        reject(err);
      } else {
        resolve(servers);
      }
    });
  });
}

// Example usage in your main server file:

/*
// In your main server file (server.js or app.js):

import express from 'express';
import sqlite3 from 'sqlite3';
import { integratePaymentSystem, userHasPremiumFeatures, getEnhancedServerList } from './payment-integration.js';

const app = express();
const db = new sqlite3.Database('minecraft-servers.db');

// Initialize payment system
integratePaymentSystem(app, db);

// Enhanced server listing endpoint
app.get('/api/servers', async (req, res) => {
  try {
    const options = {
      search: req.query.search,
      gamemode: req.query.gamemode,
      limit: req.query.limit
    };
    
    const servers = await getEnhancedServerList(db, options);
    res.json({ servers });
  } catch (error) {
    console.error('Error fetching servers:', error);
    res.status(500).json({ error: 'Failed to fetch servers' });
  }
});

// Example of checking premium features in other routes
app.post('/api/servers/:id/vote', async (req, res) => {
  const serverId = req.params.id;
  const hasPremium = await userHasPremiumFeatures(req, serverId);
  
  // Give bonus votes or other benefits for premium users
  const voteValue = hasPremium ? 2 : 1;
  
  // ... rest of your vote logic
});

*/

export default integratePaymentSystem;