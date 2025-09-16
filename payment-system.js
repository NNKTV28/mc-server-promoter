import Stripe from 'stripe';
import { body, validationResult } from 'express-validator';
import moment from 'moment';
import { logInfo, logError, logSecurity } from './logger.js';

// Payment configuration
export const PAYMENT_CONFIG = {
  stripe: {
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_your_stripe_publishable_key_here',
    secretKey: process.env.STRIPE_SECRET_KEY || 'sk_test_your_stripe_secret_key_here',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || 'whsec_your_webhook_secret_here'
  },
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID || 'your_paypal_client_id_here',
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || 'your_paypal_client_secret_here',
    environment: process.env.PAYPAL_ENV || 'sandbox' // 'sandbox' or 'production'
  },
  plans: {
    featured: {
      name: 'Featured Server Plan',
      price: 5.99,
      currency: 'USD',
      duration: 30, // days
      features: [
        'Featured placement above free listings',
        'Enhanced server visibility',
        'Priority in search results',
        'Custom banner support',
        'Analytics dashboard'
      ]
    },
    premium: {
      name: 'Premium Server Plan',
      price: 12.99,
      currency: 'USD',
      duration: 30, // days
      features: [
        'All Featured benefits',
        'Top banner placement',
        'Highlighted server card',
        'Extended description limit',
        'Premium badge',
        'Priority support'
      ]
    },
    enterprise: {
      name: 'Enterprise Server Plan',
      price: 29.99,
      currency: 'USD',
      duration: 30, // days
      features: [
        'All Premium benefits',
        'Multiple server slots',
        'Custom branding',
        'Advanced analytics',
        'API access',
        'Dedicated support'
      ]
    }
  }
};

// Initialize Stripe
export const stripe = new Stripe(PAYMENT_CONFIG.stripe.secretKey);

// Database schema for payment tables
export function initializePaymentTables(db) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Payment plans table
      db.run(`CREATE TABLE IF NOT EXISTS payment_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_key TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        duration_days INTEGER NOT NULL DEFAULT 30,
        features TEXT, -- JSON string of features array
        active BOOLEAN NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);

      // User subscriptions table
      db.run(`CREATE TABLE IF NOT EXISTS user_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        server_id INTEGER,
        plan_key TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'active', 'expired', 'cancelled'
        payment_method TEXT, -- 'stripe', 'paypal', 'card'
        payment_id TEXT, -- External payment ID
        subscription_id TEXT, -- External subscription ID
        amount DECIMAL(10,2) NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        starts_at DATETIME NOT NULL,
        expires_at DATETIME NOT NULL,
        auto_renew BOOLEAN NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE SET NULL
      )`);

      // Payment transactions table
      db.run(`CREATE TABLE IF NOT EXISTS payment_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        subscription_id INTEGER,
        payment_method TEXT NOT NULL, -- 'stripe', 'paypal', 'card'
        payment_provider_id TEXT NOT NULL, -- External transaction ID
        type TEXT NOT NULL, -- 'payment', 'refund', 'chargeback'
        status TEXT NOT NULL, -- 'pending', 'completed', 'failed', 'refunded'
        amount DECIMAL(10,2) NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        description TEXT,
        metadata TEXT, -- JSON string for additional data
        processed_at DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(subscription_id) REFERENCES user_subscriptions(id) ON DELETE SET NULL
      )`);

      // Payment methods table (for saved cards)
      db.run(`CREATE TABLE IF NOT EXISTS payment_methods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL, -- 'stripe_card', 'paypal'
        provider_id TEXT NOT NULL, -- Payment method ID from provider
        last_four TEXT,
        brand TEXT, -- 'visa', 'mastercard', etc.
        exp_month INTEGER,
        exp_year INTEGER,
        is_default BOOLEAN NOT NULL DEFAULT 0,
        active BOOLEAN NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      )`);

      // Insert default payment plans
      const insertPlan = (planKey, planData) => {
        db.run(`INSERT OR IGNORE INTO payment_plans 
          (plan_key, name, price, currency, duration_days, features) 
          VALUES (?, ?, ?, ?, ?, ?)`,
          [
            planKey,
            planData.name,
            planData.price,
            planData.currency,
            planData.duration,
            JSON.stringify(planData.features)
          ]
        );
      };

      Object.entries(PAYMENT_CONFIG.plans).forEach(([key, plan]) => {
        insertPlan(key, plan);
      });

      // Add payment-related columns to servers table if they don't exist
      db.all("PRAGMA table_info(servers)", (err, columns) => {
        if (err) {
          console.error('Error checking servers table:', err);
          return;
        }

        const columnNames = columns.map(col => col.name);
        
        if (!columnNames.includes('subscription_id')) {
          db.run(`ALTER TABLE servers ADD COLUMN subscription_id INTEGER REFERENCES user_subscriptions(id)`);
        }
        if (!columnNames.includes('plan_expires_at')) {
          db.run(`ALTER TABLE servers ADD COLUMN plan_expires_at DATETIME`);
        }
        if (!columnNames.includes('auto_renew')) {
          db.run(`ALTER TABLE servers ADD COLUMN auto_renew BOOLEAN DEFAULT 0`);
        }
      });

      logInfo('Payment system database tables initialized');
      resolve();
    });
  });
}

// Validation middleware
export const validatePayment = [
  body('plan_key').isIn(Object.keys(PAYMENT_CONFIG.plans)).withMessage('Invalid plan selected'),
  body('server_id').isInt({ min: 1 }).withMessage('Invalid server ID'),
  body('payment_method').isIn(['stripe', 'paypal']).withMessage('Invalid payment method'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }
    next();
  }
];

// Utility functions
export function calculatePlanExpiry(durationDays, startDate = new Date()) {
  return moment(startDate).add(durationDays, 'days').toDate();
}

export function isPlanExpired(expiryDate) {
  return moment().isAfter(moment(expiryDate));
}

export function formatPrice(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  }).format(amount);
}

export function getPlanByKey(planKey) {
  return PAYMENT_CONFIG.plans[planKey] || null;
}

// Subscription management functions
export async function createSubscription(db, userId, serverId, planKey, paymentData) {
  const plan = getPlanByKey(planKey);
  if (!plan) {
    throw new Error('Invalid plan');
  }

  const startDate = new Date();
  const expiryDate = calculatePlanExpiry(plan.duration, startDate);

  return new Promise((resolve, reject) => {
    db.run(`INSERT INTO user_subscriptions 
      (user_id, server_id, plan_key, status, payment_method, payment_id, amount, currency, starts_at, expires_at, auto_renew)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        serverId,
        planKey,
        'pending',
        paymentData.method,
        paymentData.paymentId,
        plan.price,
        plan.currency,
        startDate.toISOString(),
        expiryDate.toISOString(),
        paymentData.autoRenew || 0
      ],
      function(err) {
        if (err) {
          logError('Failed to create subscription', err, { userId, serverId, planKey });
          reject(err);
        } else {
          logInfo('Subscription created', { 
            subscriptionId: this.lastID, 
            userId, 
            serverId, 
            planKey,
            amount: plan.price
          });
          resolve(this.lastID);
        }
      }
    );
  });
}

export async function activateSubscription(db, subscriptionId, paymentProviderId) {
  return new Promise((resolve, reject) => {
    // Update subscription status
    db.run(`UPDATE user_subscriptions 
      SET status = 'active', payment_id = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?`,
      [paymentProviderId, subscriptionId],
      function(err) {
        if (err) {
          logError('Failed to activate subscription', err, { subscriptionId });
          reject(err);
        } else {
          // Update server plan
          db.run(`UPDATE servers 
            SET plan = (
              SELECT CASE 
                WHEN us.plan_key = 'featured' THEN 'paid'
                WHEN us.plan_key = 'premium' THEN 'premium'  
                WHEN us.plan_key = 'enterprise' THEN 'enterprise'
                ELSE 'free'
              END
            ),
            subscription_id = ?,
            plan_expires_at = (SELECT expires_at FROM user_subscriptions WHERE id = ?)
            FROM user_subscriptions us 
            WHERE servers.id = us.server_id AND us.id = ?`,
            [subscriptionId, subscriptionId, subscriptionId],
            (err2) => {
              if (err2) {
                logError('Failed to update server plan', err2, { subscriptionId });
                reject(err2);
              } else {
                logInfo('Subscription activated', { subscriptionId, paymentProviderId });
                resolve();
              }
            }
          );
        }
      }
    );
  });
}

export async function expireOldSubscriptions(db) {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    
    // Find expired subscriptions
    db.all(`SELECT id, server_id FROM user_subscriptions 
      WHERE status = 'active' AND expires_at <= ? AND auto_renew = 0`,
      [now],
      (err, expiredSubs) => {
        if (err) {
          reject(err);
          return;
        }

        if (expiredSubs.length === 0) {
          resolve([]);
          return;
        }

        // Update expired subscriptions
        db.run(`UPDATE user_subscriptions 
          SET status = 'expired', updated_at = CURRENT_TIMESTAMP 
          WHERE status = 'active' AND expires_at <= ? AND auto_renew = 0`,
          [now],
          (err2) => {
            if (err2) {
              reject(err2);
              return;
            }

            // Revert servers to free plan
            const serverIds = expiredSubs.map(sub => sub.server_id).filter(id => id);
            if (serverIds.length > 0) {
              const placeholders = serverIds.map(() => '?').join(',');
              db.run(`UPDATE servers 
                SET plan = 'free', subscription_id = NULL, plan_expires_at = NULL 
                WHERE id IN (${placeholders})`,
                serverIds,
                (err3) => {
                  if (err3) {
                    reject(err3);
                  } else {
                    logInfo('Expired subscriptions processed', { 
                      count: expiredSubs.length,
                      serverIds 
                    });
                    resolve(expiredSubs);
                  }
                }
              );
            } else {
              resolve(expiredSubs);
            }
          }
        );
      }
    );
  });
}

export default {
  PAYMENT_CONFIG,
  stripe,
  initializePaymentTables,
  validatePayment,
  calculatePlanExpiry,
  isPlanExpired,
  formatPrice,
  getPlanByKey,
  createSubscription,
  activateSubscription,
  expireOldSubscriptions
};