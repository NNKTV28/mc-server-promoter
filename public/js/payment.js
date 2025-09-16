// Payment system frontend integration
class PaymentSystem {
  constructor() {
    this.stripe = null;
    this.paypalLoaded = false;
    this.currentPlan = null;
    this.currentServer = null;
    
    this.initializeStripe();
    this.loadPaymentPlans();
    this.setupEventListeners();
  }

  async initializeStripe() {
    try {
      // Initialize Stripe (you'll need to include Stripe.js in your HTML)
      if (typeof Stripe !== 'undefined') {
        // Replace with your publishable key
        this.stripe = Stripe('pk_test_your_publishable_key_here');
      }
    } catch (error) {
      console.error('Failed to initialize Stripe:', error);
    }
  }

  async loadPaymentPlans() {
    try {
      const response = await fetch('/api/payment/plans');
      const data = await response.json();
      
      if (data.plans) {
        this.displayPlans(data.plans);
      }
    } catch (error) {
      console.error('Failed to load payment plans:', error);
      this.showError('Failed to load payment plans');
    }
  }

  displayPlans(plans) {
    const container = document.getElementById('payment-plans');
    if (!container) return;

    container.innerHTML = plans.map(plan => `
      <div class="plan-card" data-plan="${plan.key}">
        <div class="plan-header">
          <h3 class="plan-name">${plan.name}</h3>
          <div class="plan-price">${plan.formattedPrice}</div>
          <div class="plan-duration">per ${plan.duration}</div>
        </div>
        <div class="plan-features">
          <ul>
            ${plan.features.map(feature => `<li>${feature}</li>`).join('')}
          </ul>
        </div>
        <button class="btn btn-primary select-plan-btn" data-plan="${plan.key}">
          Select Plan
        </button>
      </div>
    `).join('');
  }

  setupEventListeners() {
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('select-plan-btn')) {
        const planKey = e.target.getAttribute('data-plan');
        this.selectPlan(planKey);
      }
      
      if (e.target.id === 'pay-with-stripe') {
        this.processStripePayment();
      }
      
      if (e.target.id === 'pay-with-paypal') {
        this.processPayPalPayment();
      }
      
      if (e.target.classList.contains('cancel-subscription-btn')) {
        const subscriptionId = e.target.getAttribute('data-subscription');
        this.cancelSubscription(subscriptionId);
      }
    });

    // Server selection
    const serverSelect = document.getElementById('server-select');
    if (serverSelect) {
      serverSelect.addEventListener('change', (e) => {
        this.currentServer = e.target.value;
      });
    }
  }

  selectPlan(planKey) {
    this.currentPlan = planKey;
    this.showPaymentModal(planKey);
  }

  showPaymentModal(planKey) {
    const modal = document.getElementById('payment-modal');
    if (!modal) {
      this.createPaymentModal(planKey);
      return;
    }

    // Update modal content for the selected plan
    const planInfo = document.getElementById('modal-plan-info');
    if (planInfo) {
      planInfo.innerHTML = `Selected plan: ${planKey}`;
    }

    modal.style.display = 'block';
  }

  createPaymentModal(planKey) {
    const modalHTML = `
      <div id="payment-modal" class="modal">
        <div class="modal-content">
          <div class="modal-header">
            <h2>Complete Payment</h2>
            <span class="close">&times;</span>
          </div>
          <div class="modal-body">
            <div id="modal-plan-info">Selected plan: ${planKey}</div>
            
            <div class="server-selection">
              <label for="modal-server-select">Select Server:</label>
              <select id="modal-server-select" required>
                <option value="">Choose a server...</option>
              </select>
            </div>

            <div class="payment-methods">
              <h3>Payment Method</h3>
              
              <div class="payment-option">
                <button id="pay-with-stripe" class="btn btn-payment stripe-btn">
                  <i class="fab fa-cc-stripe"></i>
                  Pay with Card (Stripe)
                </button>
              </div>
              
              <div class="payment-option">
                <button id="pay-with-paypal" class="btn btn-payment paypal-btn">
                  <i class="fab fa-paypal"></i>
                  Pay with PayPal
                </button>
              </div>
            </div>

            <div id="stripe-card-element" style="display: none;">
              <!-- Stripe Elements will create form elements here -->
            </div>

            <div id="paypal-button-container" style="display: none;">
              <!-- PayPal button will be rendered here -->
            </div>

            <div id="payment-messages" role="alert"></div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Setup modal close functionality
    const modal = document.getElementById('payment-modal');
    const closeBtn = modal.querySelector('.close');
    
    closeBtn.addEventListener('click', () => {
      modal.style.display = 'none';
    });
    
    window.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });

    // Load user's servers
    this.loadUserServers();
    
    modal.style.display = 'block';
  }

  async loadUserServers() {
    try {
      const response = await fetch('/api/servers');
      const data = await response.json();
      
      const select = document.getElementById('modal-server-select');
      if (select && data.servers) {
        select.innerHTML = '<option value="">Choose a server...</option>' +
          data.servers.map(server => 
            `<option value="${server.id}">${server.name}</option>`
          ).join('');
      }
    } catch (error) {
      console.error('Failed to load servers:', error);
    }
  }

  async processStripePayment() {
    if (!this.stripe) {
      this.showError('Stripe is not initialized');
      return;
    }

    const serverId = document.getElementById('modal-server-select').value;
    if (!serverId) {
      this.showError('Please select a server');
      return;
    }

    try {
      this.showLoading('Creating payment...');

      // Create payment intent
      const response = await fetch('/api/payment/stripe/payment-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plan_key: this.currentPlan,
          server_id: serverId
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Payment creation failed');
      }

      // Show Stripe card element
      await this.showStripeCardForm(data.clientSecret);
      
    } catch (error) {
      console.error('Stripe payment error:', error);
      this.showError(error.message || 'Payment failed');
    } finally {
      this.hideLoading();
    }
  }

  async showStripeCardForm(clientSecret) {
    const cardContainer = document.getElementById('stripe-card-element');
    cardContainer.style.display = 'block';

    // Create card element
    const elements = this.stripe.elements();
    const cardElement = elements.create('card', {
      style: {
        base: {
          fontSize: '16px',
          color: '#424770',
          '::placeholder': {
            color: '#aab7c4',
          },
        },
      },
    });

    cardElement.mount('#stripe-card-element');

    // Create confirm button
    if (!document.getElementById('confirm-stripe-payment')) {
      cardContainer.insertAdjacentHTML('afterend', `
        <button id="confirm-stripe-payment" class="btn btn-primary" style="margin-top: 20px;">
          Confirm Payment
        </button>
      `);

      document.getElementById('confirm-stripe-payment').addEventListener('click', async () => {
        await this.confirmStripePayment(cardElement, clientSecret);
      });
    }
  }

  async confirmStripePayment(cardElement, clientSecret) {
    try {
      this.showLoading('Processing payment...');

      const { error, paymentIntent } = await this.stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (paymentIntent.status === 'succeeded') {
        this.showSuccess('Payment successful! Your subscription has been activated.');
        setTimeout(() => {
          document.getElementById('payment-modal').style.display = 'none';
          this.loadUserSubscriptions(); // Refresh subscriptions
        }, 2000);
      }

    } catch (error) {
      console.error('Payment confirmation error:', error);
      this.showError(error.message || 'Payment confirmation failed');
    } finally {
      this.hideLoading();
    }
  }

  async processPayPalPayment() {
    const serverId = document.getElementById('modal-server-select').value;
    if (!serverId) {
      this.showError('Please select a server');
      return;
    }

    try {
      this.showLoading('Preparing PayPal payment...');

      const response = await fetch('/api/payment/paypal/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plan_key: this.currentPlan,
          server_id: serverId
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'PayPal order creation failed');
      }

      await this.renderPayPalButton(data);
      
    } catch (error) {
      console.error('PayPal payment error:', error);
      this.showError(error.message || 'PayPal payment failed');
    } finally {
      this.hideLoading();
    }
  }

  async renderPayPalButton(orderData) {
    if (!window.paypal) {
      await this.loadPayPalSDK(orderData.paypalClientId);
    }

    const container = document.getElementById('paypal-button-container');
    container.style.display = 'block';
    container.innerHTML = ''; // Clear previous buttons

    paypal.Buttons({
      createOrder: () => {
        return orderData.orderData;
      },
      onApprove: async (data) => {
        try {
          this.showLoading('Completing payment...');
          // PayPal will handle the payment completion via webhook
          this.showSuccess('Payment completed successfully!');
          setTimeout(() => {
            document.getElementById('payment-modal').style.display = 'none';
            this.loadUserSubscriptions();
          }, 2000);
        } catch (error) {
          this.showError('Payment completion failed');
        } finally {
          this.hideLoading();
        }
      },
      onError: (err) => {
        console.error('PayPal payment error:', err);
        this.showError('PayPal payment failed');
      }
    }).render('#paypal-button-container');
  }

  async loadPayPalSDK(clientId) {
    return new Promise((resolve, reject) => {
      if (window.paypal) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD`;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async loadUserSubscriptions() {
    try {
      const response = await fetch('/api/payment/subscriptions');
      const data = await response.json();
      
      if (data.subscriptions) {
        this.displaySubscriptions(data.subscriptions);
      }
    } catch (error) {
      console.error('Failed to load subscriptions:', error);
    }
  }

  displaySubscriptions(subscriptions) {
    const container = document.getElementById('user-subscriptions');
    if (!container) return;

    if (subscriptions.length === 0) {
      container.innerHTML = '<p>No active subscriptions</p>';
      return;
    }

    container.innerHTML = subscriptions.map(sub => `
      <div class="subscription-card ${sub.isExpired ? 'expired' : 'active'}">
        <div class="subscription-header">
          <h4>${sub.plan_name || sub.plan_key}</h4>
          <span class="subscription-status status-${sub.status}">${sub.status}</span>
        </div>
        <div class="subscription-details">
          <p><strong>Server:</strong> ${sub.server_name}</p>
          <p><strong>Amount:</strong> ${sub.formattedAmount}</p>
          <p><strong>Expires:</strong> ${new Date(sub.expires_at).toLocaleDateString()}</p>
          <p><strong>Status:</strong> ${sub.isExpired ? 'Expired' : 'Active'}</p>
        </div>
        <div class="subscription-actions">
          ${sub.status === 'active' && !sub.isExpired ? 
            `<button class="btn btn-danger cancel-subscription-btn" data-subscription="${sub.id}">
              Cancel Subscription
            </button>` : 
            ''
          }
        </div>
      </div>
    `).join('');
  }

  async cancelSubscription(subscriptionId) {
    if (!confirm('Are you sure you want to cancel this subscription?')) {
      return;
    }

    try {
      this.showLoading('Cancelling subscription...');

      const response = await fetch(`/api/payment/subscriptions/${subscriptionId}/cancel`, {
        method: 'POST'
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Cancellation failed');
      }

      this.showSuccess('Subscription cancelled successfully');
      this.loadUserSubscriptions(); // Refresh the list

    } catch (error) {
      console.error('Cancellation error:', error);
      this.showError(error.message || 'Failed to cancel subscription');
    } finally {
      this.hideLoading();
    }
  }

  showLoading(message) {
    this.showMessage(message, 'loading');
  }

  hideLoading() {
    const messages = document.getElementById('payment-messages');
    if (messages) {
      const loadingMsg = messages.querySelector('.loading');
      if (loadingMsg) {
        loadingMsg.remove();
      }
    }
  }

  showError(message) {
    this.showMessage(message, 'error');
  }

  showSuccess(message) {
    this.showMessage(message, 'success');
  }

  showMessage(message, type) {
    const container = document.getElementById('payment-messages');
    if (!container) return;

    const messageEl = document.createElement('div');
    messageEl.className = `message ${type}`;
    messageEl.textContent = message;

    // Remove previous messages of the same type
    const existing = container.querySelector(`.${type}`);
    if (existing) {
      existing.remove();
    }

    container.appendChild(messageEl);

    // Auto-remove success/error messages after 5 seconds
    if (type !== 'loading') {
      setTimeout(() => {
        if (messageEl.parentNode) {
          messageEl.remove();
        }
      }, 5000);
    }
  }
}

// Initialize payment system when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.paymentSystem = new PaymentSystem();
});

// CSS styles (add to your stylesheet)
const styles = `
.modal {
  display: none;
  position: fixed;
  z-index: 1000;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0,0,0,0.5);
}

.modal-content {
  background-color: #fefefe;
  margin: 5% auto;
  padding: 0;
  border: none;
  border-radius: 8px;
  width: 90%;
  max-width: 600px;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
}

.modal-header {
  background-color: #f8f9fa;
  padding: 20px;
  border-bottom: 1px solid #dee2e6;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-radius: 8px 8px 0 0;
}

.modal-body {
  padding: 20px;
}

.close {
  color: #aaa;
  font-size: 28px;
  font-weight: bold;
  cursor: pointer;
}

.close:hover,
.close:focus {
  color: #000;
  text-decoration: none;
}

.plan-card {
  border: 2px solid #e9ecef;
  border-radius: 8px;
  padding: 20px;
  margin: 15px;
  transition: all 0.3s ease;
}

.plan-card:hover {
  border-color: #007bff;
  box-shadow: 0 4px 8px rgba(0,123,255,0.15);
}

.plan-header {
  text-align: center;
  margin-bottom: 20px;
}

.plan-name {
  font-size: 24px;
  font-weight: bold;
  color: #343a40;
  margin-bottom: 10px;
}

.plan-price {
  font-size: 32px;
  font-weight: bold;
  color: #007bff;
}

.plan-duration {
  color: #6c757d;
  font-size: 14px;
}

.plan-features ul {
  list-style: none;
  padding: 0;
}

.plan-features li {
  padding: 5px 0;
  border-bottom: 1px solid #f8f9fa;
}

.plan-features li:before {
  content: "✓";
  color: #28a745;
  font-weight: bold;
  margin-right: 10px;
}

.payment-option {
  margin: 15px 0;
}

.btn-payment {
  width: 100%;
  padding: 15px;
  font-size: 16px;
  font-weight: bold;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.stripe-btn {
  background-color: #635bff;
  color: white;
}

.stripe-btn:hover {
  background-color: #5a52ff;
}

.paypal-btn {
  background-color: #0070ba;
  color: white;
}

.paypal-btn:hover {
  background-color: #005ea6;
}

.subscription-card {
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 20px;
  margin: 15px 0;
}

.subscription-card.expired {
  border-color: #dc3545;
  background-color: #f8f9fa;
}

.subscription-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.subscription-status {
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: bold;
  text-transform: uppercase;
}

.status-active {
  background-color: #d4edda;
  color: #155724;
}

.status-expired {
  background-color: #f8d7da;
  color: #721c24;
}

.status-cancelled {
  background-color: #d1ecf1;
  color: #0c5460;
}

.message {
  padding: 12px;
  border-radius: 4px;
  margin: 10px 0;
}

.message.error {
  background-color: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.message.success {
  background-color: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.message.loading {
  background-color: #d1ecf1;
  color: #0c5460;
  border: 1px solid #bee5eb;
}

.server-selection {
  margin: 20px 0;
}

.server-selection label {
  display: block;
  font-weight: bold;
  margin-bottom: 5px;
}

.server-selection select {
  width: 100%;
  padding: 10px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 16px;
}

#stripe-card-element {
  padding: 15px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  margin-top: 20px;
}
`;

// Inject styles
const styleSheet = document.createElement('style');
styleSheet.textContent = styles;
document.head.appendChild(styleSheet);