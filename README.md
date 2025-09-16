# Minecraft Server Promoter 🎮

A comprehensive full-stack platform built with **Node.js + Express + SQLite3** to promote Minecraft servers with advanced features including **payment processing**, user management, and server analytics. Features both free listings and premium paid plans with enhanced visibility and exclusive benefits.

## ✨ Key Highlights

🚀 **Modern Payment System**: Integrated Stripe & PayPal processing  
💎 **Premium Plans**: Featured, Premium, and Enterprise tiers  
🛡️ **Security-First**: PCI-compliant payments with encrypted data  
📊 **Analytics Dashboard**: Comprehensive revenue and subscription tracking  
🎯 **Enhanced Visibility**: Premium servers get priority placement  
🔧 **Admin Control**: Complete management tools and real-time monitoring  
📱 **Mobile-Responsive**: Beautiful UI that works on all devices  
⚡ **Real-time Updates**: Instant payment confirmations via webhooks  

## 🎪 Features Overview

### 🎮 Core Server Features
- **Server Listings**: Create detailed listings with name, IP, description, banners, and social links
- **Multi-Tier Plans**: Free listings plus 3 premium tiers (Featured, Premium, Enterprise)
- **Smart Search & Filtering**: Advanced search with gamemode, popularity, and premium filters
- **Vote System**: Community voting with anti-spam protection (1 vote/day/device)
- **Priority Ranking**: Premium servers automatically ranked above free listings
- **Rich Media Support**: Upload banners, screenshots, and promotional content

### 💳 Advanced Payment System
- **Multiple Payment Methods**: 
  - Credit/Debit Cards via Stripe (Visa, MasterCard, Amex)
  - PayPal integration with one-click checkout
  - Secure tokenized payment storage
- **Subscription Management**: 
  - Automated billing and renewal cycles
  - User-controlled cancellations
  - Grace periods and expiration handling
  - Email notifications for renewals/expirations
- **Premium Plan Benefits**:
  - **Featured ($9.99/month)**: Priority listing + featured badge
  - **Premium ($19.99/month)**: Everything in Featured + enhanced visibility + social media promotion
  - **Enterprise ($49.99/month)**: Everything in Premium + analytics dashboard + custom branding + priority support

### 👥 User Management System
- **Secure Authentication**: bcrypt password hashing with session management
- **User Profiles**: Comprehensive profile management with avatar support
- **Server Ownership**: Users can only manage their own servers (unless admin)
- **Role-Based Access**: Regular users, moderators, and administrators
- **Account Recovery**: Password reset and email verification
- **Activity Tracking**: User login history and server management logs

### 🛡️ Admin Panel & Analytics
- **Revenue Dashboard**: 
  - Real-time revenue tracking
  - Subscription analytics by plan type
  - Monthly/yearly revenue reports
  - Payment failure tracking
- **User Management**: 
  - Promote/demote user roles
  - View user payment history
  - Account suspension/activation
  - Bulk user operations
- **Server Management**: 
  - Change any server's plan type
  - Moderate server content
  - View server performance metrics
  - Premium feature toggles
- **Payment Administration**:
  - View all transactions
  - Handle refund requests
  - Manage subscription disputes
  - Export financial reports

### 🎛️ Interactive Shell System
- **Real-time Management**: Interactive command-line interface
- **Live Monitoring**: View server stats, active users, and system health
- **Database Management**: Clean tables, backup data, view logs
- **Security Tools**: Monitor failed payments, blacklist management
- **Quick Operations**: User promotion, server management, analytics viewing

### 📊 Logging & Monitoring
- **Comprehensive Logging**: Winston-powered logging system
- **Multiple Log Types**: 
  - Error logs (critical issues)
  - Access logs (user activity)
  - Security logs (payment attempts, auth failures)
  - Upload logs (file management)
  - Combined logs (general activity)
- **Log Rotation**: Automatic log file management with size limits
- **Real-time Monitoring**: Live log streaming in admin panel

## 🚀 Tech Stack

### Backend Architecture
- **Runtime**: Node.js 18+ with ES modules
- **Framework**: Express.js with middleware architecture
- **Database**: SQLite3 (file-based, zero configuration)
- **Authentication**: express-session with bcrypt password hashing
- **Payment Processing**: 
  - Stripe SDK for card payments
  - PayPal SDK for PayPal transactions
- **Logging**: Winston with multiple transports and log rotation
- **Validation**: express-validator for input sanitization
- **Security**: Helmet.js, CORS protection, rate limiting

### Frontend Technologies
- **Core**: Vanilla JavaScript with ES6+ features
- **UI Framework**: Bootstrap 5 with custom SCSS
- **Icons**: Font Awesome 6
- **Payment UI**: 
  - Stripe Elements for card forms
  - PayPal JavaScript SDK
- **Architecture**: Modular component-based design
- **Responsive**: Mobile-first responsive design

### Development Tools
- **Package Manager**: npm
- **Module System**: ES6 imports/exports
- **Environment**: dotenv for configuration
- **Database Migrations**: Automatic table creation
- **Hot Reload**: nodemon for development

## 🛠️ Installation & Setup

### Prerequisites
- **Node.js**: Version 18.0 or higher
- **npm**: Comes with Node.js
- **Git**: For cloning the repository
- **Payment Accounts**: 
  - Stripe account (for card payments)
  - PayPal Business account (for PayPal payments)

### Quick Start

```bash
# 1) Clone the repository
git clone https://github.com/NNKTV28/Minecraft-Server-Promoter-.git
cd mc-server-promoter

# 2) Install all dependencies
npm install

# 3) Install additional payment dependencies
npm install stripe @paypal/paypal-js express-validator moment

# 4) Create initial admin user (recommended)
node setup-admin.js

# 5) Start the development server
npm run start

# 6) Launch interactive shell (optional)
node shell.js

# 7) Open in your browser
# http://localhost:3000
```

### Payment Configuration

1. **Set up Stripe**:
   ```bash
   # Get your keys from https://dashboard.stripe.com/
   # Update PAYMENT_CONFIG in payment-system.js:
   stripe: {
     publishableKey: 'pk_test_your_key_here',
     secretKey: 'sk_test_your_key_here',
     webhookSecret: 'whsec_your_webhook_secret'
   }
   ```

2. **Set up PayPal**:
   ```bash
   # Get your credentials from https://developer.paypal.com/
   # Update PAYMENT_CONFIG in payment-system.js:
   paypal: {
     clientId: 'your_paypal_client_id',
     clientSecret: 'your_paypal_client_secret'
   }
   ```

3. **Configure Webhooks**:
   - **Stripe webhook endpoint**: `https://yourdomain.com/api/payment/stripe/webhook`
   - **PayPal webhook endpoint**: `https://yourdomain.com/api/payment/paypal/webhook`

### Environment Variables (Optional)

Create a `.env` file for production configuration:

```env
# Server Configuration
PORT=3000
NODE_ENV=production
SESSION_SECRET=your-super-secret-session-key

# Database
DATABASE_PATH=./data/minecraft-servers.db

# Stripe Configuration
STRIPE_PUBLISHABLE_KEY=pk_live_your_live_key
STRIPE_SECRET_KEY=sk_live_your_live_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# PayPal Configuration
PAYPAL_CLIENT_ID=your_live_paypal_client_id
PAYPAL_CLIENT_SECRET=your_live_paypal_client_secret
PAYPAL_MODE=live

# Logging
LOG_LEVEL=info
LOG_MAX_SIZE=10485760
LOG_MAX_FILES=5
```

### Default Admin Account
After running `node setup-admin.js`:
- **Username:** admin
- **Password:** admin123
- **Access:** Full admin panel access

⚠️ **Important:** Change the admin password immediately after first login!

## 📡 Complete API Documentation

### Public Endpoints
- `GET /api/servers?q=&sort=rank|votes|new` - List servers with search/sort
- `POST /api/servers/:id/vote` - Vote for a server (1/day/device limit)
- `GET /api/payment/plans` - Get available payment plans

### Authentication Endpoints
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/check` - Check authentication status
- `GET /api/auth/profile` - Get current user profile
- `PUT /api/auth/profile` - Update user profile
- `PUT /api/auth/password` - Change password

### User Server Management (Authenticated)
- `POST /api/servers` - Create server listing (requires login)
- `GET /api/user/servers` - Get user's own servers
- `PUT /api/user/servers/:id` - Update own server
- `DELETE /api/user/servers/:id` - Delete own server

### Payment & Subscription Endpoints (Authenticated)
- `GET /api/payment/subscriptions` - Get user's subscriptions
- `POST /api/payment/stripe/payment-intent` - Create Stripe payment intent
- `POST /api/payment/paypal/create-order` - Create PayPal order
- `POST /api/payment/subscriptions/:id/cancel` - Cancel subscription
- `GET /api/payment/payment-methods` - Get saved payment methods
- `POST /api/payment/stripe/webhook` - Stripe webhook handler
- `POST /api/payment/paypal/webhook` - PayPal webhook handler

### Admin Management (Admin Only)
- `GET /api/admin/users` - List all users with payment info
- `PUT /api/admin/users/:id/role` - Change user role
- `DELETE /api/admin/users/:id` - Delete user
- `GET /api/admin/servers` - List all servers with owner info
- `DELETE /api/admin/servers/:id` - Delete any server
- `PUT /api/admin/servers/:id/plan` - Change server plan
- `GET /api/admin/stats` - Get comprehensive site statistics
- `GET /api/admin/settings` - Get site settings
- `PUT /api/admin/settings` - Update site settings
- `GET /api/payment/admin/analytics` - Get payment analytics and revenue data

## 👥 User Roles & Permissions

### Regular Users
- ✅ Register/login and manage their profile
- ✅ Submit and manage their own servers
- ✅ Create **Free** listings (unlimited)
- ✅ Purchase **Premium** subscriptions for enhanced visibility
- ✅ Vote on any server (once per day per device)
- ✅ View their subscription history and payment methods
- ✅ Cancel subscriptions and manage payment preferences

### Admin Users  
- ✅ Full access to admin panel with comprehensive statistics
- ✅ Manage all users (promote, demote, delete, view payment history)
- ✅ Manage all servers (edit, delete, change plans, moderate content)
- ✅ Access payment analytics and revenue dashboard
- ✅ Handle refund requests and subscription disputes
- ✅ Configure site settings and payment plan pricing
- ✅ Export financial reports and user data
- ✅ Monitor system logs and security events

## 🗺️ Database Schema

The application uses **SQLite3** with comprehensive database structure:

### Core Tables
- `users` - User accounts with roles and authentication data
- `servers` - Server listings with ownership tracking and premium status
- `votes` - Vote tracking with daily limits and spam prevention
- `site_settings` - Admin-configurable site settings

### Payment System Tables
- `payment_plans` - Available subscription plans with pricing and features
- `user_subscriptions` - Active and historical user subscriptions
- `payment_transactions` - Complete payment transaction history
- `payment_methods` - Saved user payment methods (tokenized)

### Logging & Security Tables
- `security_events` - Authentication failures and security incidents
- `access_logs` - User activity and API access tracking
- `upload_logs` - File upload activity and moderation

### Interactive Shell Commands

```bash
# Launch the interactive shell
node shell.js

# Available commands:
- info          # Show server information
- users         # List all users
- servers       # List all servers
- stats         # Show site statistics
- logs          # View recent logs
- clean         # Clean database tables
- backup        # Create database backup
- security      # View security events
- payments      # View payment statistics
- help          # Show all commands
- exit          # Close shell
```

## 🚀 Production Deployment

### Server Requirements
- **OS**: Linux (Ubuntu 20.04+ recommended) or Windows Server
- **Memory**: 1GB RAM minimum (2GB+ recommended for high traffic)
- **Storage**: 10GB+ SSD space
- **Node.js**: Version 18.0 or higher
- **SSL Certificate**: Required for payment processing

### Production Setup

```bash
# 1) Clone and install on production server
git clone [<repository-url>](https://github.com/NNKTV28/Minecraft-Server-Promoter-.git)
cd mc-server-promoter
npm install --production

# 2) Set up environment variables
cp .env.example .env
# Edit .env with production values

# 3) Set up SSL with Let's Encrypt (recommended)
sudo apt install certbot
sudo certbot --nginx -d yourdomain.com

# 4) Set up process manager (PM2)
npm install -g pm2
pm2 start server.js --name "minecraft-promoter"
pm2 startup
pm2 save

# 5) Set up nginx reverse proxy
# Configure nginx to proxy requests to your Node.js app
```

### Security Checklist

- ☑️ Change default admin password
- ☑️ Use strong session secret
- ☑️ Enable HTTPS for all traffic
- ☑️ Configure production Stripe/PayPal keys
- ☑️ Set up webhook endpoints with SSL
- ☑️ Enable log rotation and monitoring
- ☑️ Regular database backups
- ☑️ Set up firewall rules
- ☑️ Monitor payment transactions
- ☑️ Configure rate limiting

## 📊 System Features

### Performance & Scalability
- ⚡ **Fast**: SQLite3 file-based database for quick queries
- 💾 **Lightweight**: Minimal server requirements
- 🔄 **Auto-scaling**: Handles growing user base efficiently
- 📊 **Analytics**: Built-in performance monitoring

### Security & Compliance
- 🔒 **PCI Compliance**: Secure payment processing
- 🛑 **Data Protection**: Encrypted sensitive information
- 🔍 **Audit Trail**: Comprehensive logging system
- ⚠️ **Rate Limiting**: Anti-spam and abuse prevention

### Monitoring & Maintenance
- 📊 **Real-time Dashboard**: Live system statistics
- 📄 **Comprehensive Logs**: Multiple log levels and rotation
- 🕧 **Automated Tasks**: Subscription management and cleanup
- 📱 **Mobile Admin**: Responsive admin panel for mobile management

## 🔧 Development & Customization

### Adding Custom Features
- **Payment Plans**: Modify `PAYMENT_CONFIG` in `payment-system.js`
- **Server Fields**: Extend database schema and forms
- **Admin Features**: Add new routes in admin panel
- **UI Themes**: Customize Bootstrap variables and CSS

### Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 🆘 Support & Documentation

- 📧 **Email Support**: [support@yoursite.com]
- 📚 **Wiki**: Detailed documentation and tutorials
- 🐛 **Issues**: Report bugs on GitHub
- ❓ **FAQ**: Common questions and solutions

---

🎆 **Ready to promote your Minecraft server?** Start with our free tier and upgrade to premium when you're ready to reach more players!

⭐ **Star this project** if you find it useful!
