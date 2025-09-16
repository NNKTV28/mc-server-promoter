import express from 'express';
import { 
  PAYMENT_CONFIG, 
  stripe, 
  validatePayment,
  getPlanByKey,
  createSubscription,
  activateSubscription,
  formatPrice
} from './payment-system.js';
import { logInfo, logError, logSecurity } from './logger.js';

const router = express.Router();

// Get available payment plans
router.get('/plans', (req, res) => {
  try {
    const plans = Object.entries(PAYMENT_CONFIG.plans).map(([key, plan]) => ({
      key,
      name: plan.name,
      price: plan.price,
      formattedPrice: formatPrice(plan.price, plan.currency),
      currency: plan.currency,
      duration: plan.duration,
      features: plan.features
    }));

    res.json({ plans });
  } catch (error) {
    logError('Failed to fetch payment plans', error);
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

// Get user's subscriptions
router.get('/subscriptions', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const sql = `
    SELECT 
      us.*,
      s.name as server_name,
      pp.name as plan_name,
      pp.features
    FROM user_subscriptions us
    LEFT JOIN servers s ON us.server_id = s.id
    LEFT JOIN payment_plans pp ON us.plan_key = pp.plan_key
    WHERE us.user_id = ?
    ORDER BY us.created_at DESC
  `;

  req.db.all(sql, [req.session.userId], (err, subscriptions) => {
    if (err) {
      logError('Failed to fetch user subscriptions', err, { userId: req.session.userId });
      return res.status(500).json({ error: 'Database error' });
    }

    // Parse features JSON
    const formattedSubs = subscriptions.map(sub => ({
      ...sub,
      features: sub.features ? JSON.parse(sub.features) : [],
      formattedAmount: formatPrice(sub.amount, sub.currency),
      isExpired: new Date() > new Date(sub.expires_at)
    }));

    res.json({ subscriptions: formattedSubs });
  });
});

// Create Stripe payment intent
router.post('/stripe/payment-intent', validatePayment, async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const { plan_key, server_id } = req.body;
    const plan = getPlanByKey(plan_key);

    if (!plan) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    // Verify server ownership
    const server = await new Promise((resolve, reject) => {
      req.db.get(
        'SELECT id, name FROM servers WHERE id = ? AND owner_id = ?',
        [server_id, req.session.userId],
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });

    if (!server) {
      return res.status(403).json({ error: 'Server not found or access denied' });
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(plan.price * 100), // Convert to cents
      currency: plan.currency.toLowerCase(),
      metadata: {
        user_id: req.session.userId.toString(),
        server_id: server_id.toString(),
        plan_key: plan_key,
        server_name: server.name
      }
    });

    // Create subscription record (pending)
    const subscriptionId = await createSubscription(
      req.db,
      req.session.userId,
      server_id,
      plan_key,
      {
        method: 'stripe',
        paymentId: paymentIntent.id,
        autoRenew: false
      }
    );

    logSecurity('Payment intent created', 'info', {
      userId: req.session.userId,
      serverId: server_id,
      planKey: plan_key,
      amount: plan.price,
      paymentIntentId: paymentIntent.id
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      subscriptionId: subscriptionId,
      plan: {
        name: plan.name,
        price: plan.price,
        formattedPrice: formatPrice(plan.price, plan.currency)
      }
    });

  } catch (error) {
    logError('Failed to create Stripe payment intent', error, {
      userId: req.session.userId,
      planKey: req.body.plan_key
    });
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
});

// PayPal create order
router.post('/paypal/create-order', validatePayment, async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const { plan_key, server_id } = req.body;
    const plan = getPlanByKey(plan_key);

    if (!plan) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    // Verify server ownership
    const server = await new Promise((resolve, reject) => {
      req.db.get(
        'SELECT id, name FROM servers WHERE id = ? AND owner_id = ?',
        [server_id, req.session.userId],
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });

    if (!server) {
      return res.status(403).json({ error: 'Server not found or access denied' });
    }

    // Create PayPal order (this would typically use PayPal's API)
    // For now, we'll return the configuration for frontend PayPal integration
    const orderData = {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: plan.currency,
          value: plan.price.toFixed(2)
        },
        description: `${plan.name} for ${server.name}`,
        custom_id: `${req.session.userId}-${server_id}-${plan_key}`
      }],
      application_context: {
        return_url: `${req.protocol}://${req.get('host')}/payment/paypal/success`,
        cancel_url: `${req.protocol}://${req.get('host')}/payment/paypal/cancel`
      }
    };

    // Create subscription record (pending)
    const subscriptionId = await createSubscription(
      req.db,
      req.session.userId,
      server_id,
      plan_key,
      {
        method: 'paypal',
        paymentId: 'pending',
        autoRenew: false
      }
    );

    logSecurity('PayPal order created', 'info', {
      userId: req.session.userId,
      serverId: server_id,
      planKey: plan_key,
      amount: plan.price
    });

    res.json({
      orderData,
      subscriptionId,
      paypalClientId: PAYMENT_CONFIG.paypal.clientId,
      plan: {
        name: plan.name,
        price: plan.price,
        formattedPrice: formatPrice(plan.price, plan.currency)
      }
    });

  } catch (error) {
    logError('Failed to create PayPal order', error, {
      userId: req.session.userId,
      planKey: req.body.plan_key
    });
    res.status(500).json({ error: 'Failed to create PayPal order' });
  }
});

// Stripe webhook handler
router.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, PAYMENT_CONFIG.stripe.webhookSecret);
  } catch (err) {
    logError('Stripe webhook signature verification failed', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        const { user_id, server_id, plan_key } = paymentIntent.metadata;

        // Find the subscription and activate it
        req.db.get(
          'SELECT id FROM user_subscriptions WHERE user_id = ? AND server_id = ? AND plan_key = ? AND status = "pending" ORDER BY created_at DESC LIMIT 1',
          [user_id, server_id, plan_key],
          async (err, subscription) => {
            if (err) {
              logError('Failed to find subscription for payment', err, { paymentIntentId: paymentIntent.id });
              return;
            }

            if (subscription) {
              try {
                await activateSubscription(req.db, subscription.id, paymentIntent.id);
                
                // Record transaction
                req.db.run(
                  `INSERT INTO payment_transactions 
                   (user_id, subscription_id, payment_method, payment_provider_id, type, status, amount, currency, description, processed_at)
                   VALUES (?, ?, 'stripe', ?, 'payment', 'completed', ?, ?, ?, CURRENT_TIMESTAMP)`,
                  [
                    user_id,
                    subscription.id,
                    paymentIntent.id,
                    paymentIntent.amount / 100,
                    paymentIntent.currency.toUpperCase(),
                    `Payment for ${plan_key} plan`
                  ]
                );

                logInfo('Stripe payment completed and subscription activated', {
                  userId: user_id,
                  subscriptionId: subscription.id,
                  paymentIntentId: paymentIntent.id,
                  amount: paymentIntent.amount / 100
                });
              } catch (activationError) {
                logError('Failed to activate subscription after payment', activationError, {
                  subscriptionId: subscription.id,
                  paymentIntentId: paymentIntent.id
                });
              }
            }
          }
        );
        break;

      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object;
        logError('Stripe payment failed', null, {
          paymentIntentId: failedPayment.id,
          lastPaymentError: failedPayment.last_payment_error
        });
        break;

      default:
        logInfo('Unhandled Stripe webhook event', { eventType: event.type });
    }

    res.json({ received: true });
  } catch (error) {
    logError('Error processing Stripe webhook', error, { eventType: event.type });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// PayPal webhook handler
router.post('/paypal/webhook', express.json(), async (req, res) => {
  try {
    const { event_type, resource } = req.body;

    switch (event_type) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        // Handle successful PayPal payment
        const customId = resource.custom_id;
        const [userId, serverId, planKey] = customId.split('-');

        // Find and activate subscription
        req.db.get(
          'SELECT id FROM user_subscriptions WHERE user_id = ? AND server_id = ? AND plan_key = ? AND status = "pending" ORDER BY created_at DESC LIMIT 1',
          [userId, serverId, planKey],
          async (err, subscription) => {
            if (err) {
              logError('Failed to find subscription for PayPal payment', err, { customId });
              return;
            }

            if (subscription) {
              try {
                await activateSubscription(req.db, subscription.id, resource.id);
                
                // Record transaction
                req.db.run(
                  `INSERT INTO payment_transactions 
                   (user_id, subscription_id, payment_method, payment_provider_id, type, status, amount, currency, description, processed_at)
                   VALUES (?, ?, 'paypal', ?, 'payment', 'completed', ?, ?, ?, CURRENT_TIMESTAMP)`,
                  [
                    userId,
                    subscription.id,
                    resource.id,
                    parseFloat(resource.amount.value),
                    resource.amount.currency_code,
                    `PayPal payment for ${planKey} plan`
                  ]
                );

                logInfo('PayPal payment completed and subscription activated', {
                  userId,
                  subscriptionId: subscription.id,
                  paypalPaymentId: resource.id,
                  amount: resource.amount.value
                });
              } catch (activationError) {
                logError('Failed to activate subscription after PayPal payment', activationError, {
                  subscriptionId: subscription.id,
                  paypalPaymentId: resource.id
                });
              }
            }
          }
        );
        break;

      default:
        logInfo('Unhandled PayPal webhook event', { eventType: event_type });
    }

    res.json({ received: true });
  } catch (error) {
    logError('Error processing PayPal webhook', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Cancel subscription
router.post('/subscriptions/:id/cancel', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const subscriptionId = parseInt(req.params.id);

  req.db.run(
    'UPDATE user_subscriptions SET status = "cancelled", updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
    [subscriptionId, req.session.userId],
    function(err) {
      if (err) {
        logError('Failed to cancel subscription', err, { subscriptionId, userId: req.session.userId });
        return res.status(500).json({ error: 'Database error' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Subscription not found' });
      }

      logInfo('Subscription cancelled', { subscriptionId, userId: req.session.userId });
      res.json({ message: 'Subscription cancelled successfully' });
    }
  );
});

// Get payment methods
router.get('/payment-methods', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  req.db.all(
    'SELECT id, type, last_four, brand, exp_month, exp_year, is_default, created_at FROM payment_methods WHERE user_id = ? AND active = 1',
    [req.session.userId],
    (err, methods) => {
      if (err) {
        logError('Failed to fetch payment methods', err, { userId: req.session.userId });
        return res.status(500).json({ error: 'Database error' });
      }

      res.json({ paymentMethods: methods });
    }
  );
});

// Get subscription analytics (admin only)
router.get('/admin/analytics', (req, res) => {
  if (!req.session.userId || req.session.userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const queries = {
    totalRevenue: `
      SELECT 
        SUM(amount) as total,
        COUNT(*) as transactions
      FROM payment_transactions 
      WHERE status = 'completed' AND type = 'payment'
    `,
    revenueByPlan: `
      SELECT 
        us.plan_key,
        COUNT(*) as subscriptions,
        SUM(us.amount) as revenue
      FROM user_subscriptions us
      WHERE us.status IN ('active', 'expired')
      GROUP BY us.plan_key
    `,
    revenueByMonth: `
      SELECT 
        strftime('%Y-%m', pt.processed_at) as month,
        SUM(pt.amount) as revenue,
        COUNT(*) as transactions
      FROM payment_transactions pt
      WHERE pt.status = 'completed' AND pt.type = 'payment'
        AND pt.processed_at >= datetime('now', '-12 months')
      GROUP BY month
      ORDER BY month DESC
    `,
    activeSubscriptions: `
      SELECT 
        COUNT(*) as count
      FROM user_subscriptions
      WHERE status = 'active' AND expires_at > datetime('now')
    `,
    expiringSubscriptions: `
      SELECT 
        COUNT(*) as count
      FROM user_subscriptions
      WHERE status = 'active' AND expires_at <= datetime('now', '+7 days')
    `
  };

  const results = {};
  const promises = Object.entries(queries).map(([key, sql]) => {
    return new Promise((resolve, reject) => {
      if (key === 'revenueByPlan' || key === 'revenueByMonth') {
        req.db.all(sql, (err, rows) => {
          if (err) reject(err);
          else {
            results[key] = rows;
            resolve();
          }
        });
      } else {
        req.db.get(sql, (err, row) => {
          if (err) reject(err);
          else {
            results[key] = row;
            resolve();
          }
        });
      }
    });
  });

  Promise.all(promises)
    .then(() => {
      res.json(results);
    })
    .catch((error) => {
      logError('Failed to fetch payment analytics', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    });
});

export default router;