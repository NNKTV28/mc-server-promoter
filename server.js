import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';
import session from 'express-session';
import { v4 as uuidv4 } from 'uuid';
import SQLiteStore from 'connect-sqlite3';
import { UAParser } from 'ua-parser-js';
import geoip from 'geoip-lite';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import helmet from 'helmet';
import multer from 'multer';
import { logInfo, logError, logWarn, logAccess, logUpload, logSecurity, consoleLog } from './logger.js';
import AdminShell from './shell.js';
import SessionManager, { enhanceShellForSessions } from './session-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize SQLite session store
const SQLiteStoreSession = SQLiteStore(session);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for development
  crossOriginEmbedderPolicy: false
}));

// Rate limiting for general requests
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: 15 * 60
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Strict rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs for auth
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: 15 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true // Don't count successful requests
});

// Rate limiting for voting
const voteLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // limit each IP to 3 votes per minute
  message: {
    error: 'Too many vote attempts, please slow down.',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Progressive delay for repeated requests
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 10, // allow 10 requests per windowMs without delay
  delayMs: (used, req) => {
    const delayAfter = req.slowDown.limit;
    return (used - delayAfter) * 500; // add 500ms delay for each request after the 10th
  }
});

app.use(generalLimiter);
app.use(speedLimiter);
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// Session configuration with logging
const sessionConfig = {
  store: new SQLiteStoreSession({
    db: 'sessions.sqlite3',
    dir: __dirname
  }),
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, 
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    httpOnly: true
  },
  name: 'alliance.sid'
};

logInfo('Session configuration initialized', {
  store: 'SQLiteStore',
  db: 'sessions.sqlite3',
  cookieName: sessionConfig.name,
  maxAge: sessionConfig.cookie.maxAge,
  secure: sessionConfig.cookie.secure,
  httpOnly: sessionConfig.cookie.httpOnly
});

app.use(session(sessionConfig));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  logInfo('Created uploads directory', { directory: uploadsDir });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp and random string
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 8);
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `banner-${timestamp}-${randomString}${ext}`;
    cb(null, filename);
  }
});

// File filter for images only
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedTypes.includes(file.mimetype) && allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 1 // Only one file at a time
  }
});

logInfo('File upload configured', {
  directory: uploadsDir,
  maxSize: '5MB',
  allowedTypes: 'JPEG, PNG, GIF, WebP'
});

app.use(express.static(path.join(__dirname, 'public')));

// --- SQLite setup ---
sqlite3.verbose();
const dbFile = path.join(__dirname, 'data.sqlite3');
const db = new sqlite3.Database(dbFile);

// init tables
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT CHECK(role IN ('user','admin')) NOT NULL DEFAULT 'user',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  )`);

  // Update servers table to include owner_id
  db.run(`CREATE TABLE IF NOT EXISTS servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    ip TEXT NOT NULL,
    description TEXT,
    website_url TEXT,
    banner_url TEXT,
    plan TEXT CHECK(plan IN ('free','paid')) NOT NULL DEFAULT 'free',
    votes INTEGER NOT NULL DEFAULT 0,
    owner_id INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE SET NULL
  )`);

  // Check if owner_id column exists in servers table, add if not
  db.all(`PRAGMA table_info(servers)`, (err, columns) => {
    if (!err && !columns.some(col => col.name === 'owner_id')) {
      db.run(`ALTER TABLE servers ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    voter_hash TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    voted_date TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d', CURRENT_TIMESTAMP)),
    UNIQUE(server_id, voter_hash, voted_date),
    FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
  )`);

  // Site settings table for admin configuration
  db.run(`CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  // Bot detection and security tables
  db.run(`CREATE TABLE IF NOT EXISTS security_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address TEXT NOT NULL,
    user_id INTEGER,
    event_type TEXT NOT NULL, -- 'bot_detected', 'rate_limit', 'suspicious_behavior', 'blocked_request'
    severity TEXT NOT NULL DEFAULT 'low', -- 'low', 'medium', 'high', 'critical'
    details TEXT,
    user_agent TEXT,
    endpoint TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS ip_blacklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address TEXT UNIQUE NOT NULL,
    reason TEXT NOT NULL,
    blocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    blocked_until DATETIME,
    created_by INTEGER,
    FOREIGN KEY(created_by) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS bot_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address TEXT NOT NULL,
    user_agent TEXT,
    device_fingerprint TEXT,
    bot_score INTEGER NOT NULL DEFAULT 0, -- 0-100, higher = more likely bot
    request_count INTEGER NOT NULL DEFAULT 1,
    suspicious_patterns INTEGER NOT NULL DEFAULT 0,
    last_updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ip_address, user_agent)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS captcha_challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenge_id TEXT UNIQUE NOT NULL,
    ip_address TEXT NOT NULL,
    solution TEXT NOT NULL,
    solved BOOLEAN NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL DEFAULT (datetime('now', '+5 minutes'))
  )`);

  // Device tracking table
  db.run(`CREATE TABLE IF NOT EXISTS user_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    device_fingerprint TEXT NOT NULL,
    user_agent TEXT,
    browser_name TEXT,
    browser_version TEXT,
    os_name TEXT,
    os_version TEXT,
    device_type TEXT,
    device_model TEXT,
    cpu_architecture TEXT,
    screen_resolution TEXT,
    timezone TEXT,
    language TEXT,
    platform TEXT,
    first_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  // Login history table
  db.run(`CREATE TABLE IF NOT EXISTS login_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    device_id INTEGER,
    ip_address TEXT,
    country TEXT,
    region TEXT,
    city TEXT,
    isp TEXT,
    success BOOLEAN NOT NULL DEFAULT 1,
    login_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(device_id) REFERENCES user_devices(id) ON DELETE CASCADE
  )`);
});

// helper to hash ip+ua lightly (not cryptographically secure but good enough for demo)
function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}

// Authentication middleware
function requireAuth(req, res, next) {
  console.log('🔐 [AUTH] requireAuth middleware called');
  console.log('🔐 [AUTH] Session ID:', req.sessionID);
  console.log('🔐 [AUTH] Session userId:', req.session.userId);
  console.log('🔐 [AUTH] Session userRole:', req.session.userRole);
  console.log('🔐 [AUTH] Session data:', JSON.stringify(req.session, null, 2));
  console.log('🔐 [AUTH] Request URL:', req.url);
  console.log('🔐 [AUTH] Request method:', req.method);
  
  if (!req.session.userId) {
    console.log('❌ [AUTH] No userId in session - authentication required');
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Set user info for downstream middleware
  req.user = {
    id: req.session.userId,
    username: req.session.username,
    role: req.session.userRole
  };
  
  console.log('✅ [AUTH] Authentication successful, user:', req.user);
  next();
}

function requireAdmin(req, res, next) {
  console.log('🔑 [ADMIN] requireAdmin middleware called');
  console.log('🔑 [ADMIN] Session ID:', req.sessionID);
  console.log('🔑 [ADMIN] Session userId:', req.session.userId);
  console.log('🔑 [ADMIN] Session userRole:', req.session.userRole);
  console.log('🔑 [ADMIN] Request URL:', req.url);
  console.log('🔑 [ADMIN] Request method:', req.method);
  
  if (!req.session.userId) {
    console.log('❌ [ADMIN] No userId in session - authentication required');
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (req.session.userRole !== 'admin') {
    console.log('❌ [ADMIN] User role is not admin:', req.session.userRole);
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  // Set user info for downstream middleware
  req.user = {
    id: req.session.userId,
    username: req.session.username,
    role: req.session.userRole
  };
  
  console.log('✅ [ADMIN] Admin authentication successful, user:', req.user);
  next();
}

// Bot detection and security functions
function logSecurityEvent(ip, userId, eventType, severity, details, userAgent, endpoint) {
  db.run(
    'INSERT INTO security_events (ip_address, user_id, event_type, severity, details, user_agent, endpoint) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [ip, userId, eventType, severity, details, userAgent, endpoint],
    (err) => {
      if (err) console.error('Failed to log security event:', err);
    }
  );
}

function isBlacklisted(ip) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM ip_blacklist WHERE ip_address = ? AND (blocked_until IS NULL OR blocked_until > datetime("now"))',
      [ip],
      (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      }
    );
  });
}

function calculateBotScore(req) {
  let score = 0;
  const userAgent = req.get('user-agent') || '';
  const accept = req.get('accept') || '';
  const acceptLanguage = req.get('accept-language') || '';
  const acceptEncoding = req.get('accept-encoding') || '';
  const connection = req.get('connection') || '';
  
  // Check for bot patterns in User-Agent
  const botPatterns = [
    /bot/i, /crawler/i, /spider/i, /scraper/i, /curl/i, /wget/i,
    /python/i, /java/i, /apache/i, /http/i, /libwww/i, /perl/i,
    /php/i, /ruby/i, /go-http/i, /node/i, /axios/i, /requests/i
  ];
  
  for (const pattern of botPatterns) {
    if (pattern.test(userAgent)) {
      score += 30;
      break;
    }
  }
  
  // Check for missing common headers
  if (!accept || accept === '*/*') score += 10;
  if (!acceptLanguage) score += 15;
  if (!acceptEncoding) score += 10;
  if (!userAgent) score += 25;
  
  // Check for suspicious header patterns
  if (userAgent.length < 20) score += 20;
  if (!/Mozilla|Chrome|Safari|Firefox|Edge/i.test(userAgent) && userAgent) score += 15;
  
  // Check for automated request patterns
  if (!req.get('referer') && req.path !== '/') score += 5;
  if (connection.toLowerCase() === 'close') score += 5;
  
  // Check for missing JavaScript execution indicators
  if (!req.get('x-requested-with') && req.method === 'POST') score += 5;
  
  return Math.min(score, 100);
}

function updateBotScore(req) {
  const ip = req.ip;
  const userAgent = req.get('user-agent') || '';
  const deviceInfo = parseDeviceInfo(req);
  const fingerprint = generateDeviceFingerprint(req, deviceInfo);
  const botScore = calculateBotScore(req);
  
  db.run(
    `INSERT OR REPLACE INTO bot_scores 
     (ip_address, user_agent, device_fingerprint, bot_score, request_count, suspicious_patterns, last_updated)
     VALUES (?, ?, ?, ?, 
       COALESCE((SELECT request_count FROM bot_scores WHERE ip_address = ? AND user_agent = ?), 0) + 1,
       COALESCE((SELECT suspicious_patterns FROM bot_scores WHERE ip_address = ? AND user_agent = ?), 0) + ?,
       CURRENT_TIMESTAMP)`,
    [ip, userAgent, fingerprint, botScore, ip, userAgent, ip, userAgent, botScore > 50 ? 1 : 0],
    (err) => {
      if (err) console.error('Failed to update bot score:', err);
    }
  );
  
  return botScore;
}

function generateSimpleCaptcha() {
  const num1 = Math.floor(Math.random() * 20) + 1;
  const num2 = Math.floor(Math.random() * 20) + 1;
  const operation = Math.random() > 0.5 ? '+' : '-';
  
  const question = `${num1} ${operation} ${num2}`;
  const answer = operation === '+' ? num1 + num2 : num1 - num2;
  
  return { question, answer };
}

function createCaptchaChallenge(ip) {
  return new Promise((resolve, reject) => {
    const challengeId = uuidv4();
    const { question, answer } = generateSimpleCaptcha();
    
    db.run(
      'INSERT INTO captcha_challenges (challenge_id, ip_address, solution) VALUES (?, ?, ?)',
      [challengeId, ip, answer.toString()],
      function(err) {
        if (err) reject(err);
        else resolve({ challengeId, question });
      }
    );
  });
}

function verifyCaptcha(challengeId, solution) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM captcha_challenges WHERE challenge_id = ? AND expires_at > datetime("now") AND solved = 0',
      [challengeId],
      (err, challenge) => {
        if (err) reject(err);
        else if (!challenge) resolve(false);
        else {
          const isCorrect = challenge.solution === solution.toString();
          if (isCorrect) {
            db.run('UPDATE captcha_challenges SET solved = 1 WHERE id = ?', [challenge.id]);
          }
          resolve(isCorrect);
        }
      }
    );
  });
}

// Middleware for bot detection
function botDetectionMiddleware(req, res, next) {
  const ip = req.ip;
  
  // Check if IP is blacklisted
  isBlacklisted(ip).then(blacklisted => {
    if (blacklisted) {
      logSecurityEvent(ip, null, 'blocked_request', 'high', 'Blacklisted IP attempted access', req.get('user-agent'), req.path);
      return res.status(403).json({ error: 'Access denied', code: 'IP_BLACKLISTED' });
    }
    
    // Calculate and update bot score
    const botScore = updateBotScore(req);
    
    // If bot score is very high, require CAPTCHA or block
    if (botScore >= 80) {
      logSecurityEvent(ip, null, 'bot_detected', 'high', `High bot score: ${botScore}`, req.get('user-agent'), req.path);
      return res.status(429).json({ 
        error: 'Suspicious activity detected. Please complete CAPTCHA verification.',
        code: 'CAPTCHA_REQUIRED',
        botScore
      });
    } else if (botScore >= 60) {
      logSecurityEvent(ip, null, 'suspicious_behavior', 'medium', `Medium bot score: ${botScore}`, req.get('user-agent'), req.path);
      req.suspiciousActivity = true;
    }
    
    req.botScore = botScore;
    next();
  }).catch(err => {
    console.error('Bot detection error:', err);
    next(); // Continue on error
  });
}

// Helper to get current user
function getCurrentUser(req, res, next) {
  if (req.session.userId) {
    db.get('SELECT id, username, email, role FROM users WHERE id = ?', [req.session.userId], (err, user) => {
      if (!err && user) {
        req.user = user;
      }
      next();
    });
  } else {
    next();
  }
}

// Device fingerprinting and tracking functions
function generateDeviceFingerprint(req, deviceInfo) {
  const fingerprint = simpleHash(
    (deviceInfo.ua || '') + '|' +
    (req.ip || '') + '|' +
    (deviceInfo.browser.name || '') + '|' +
    (deviceInfo.os.name || '') + '|' +
    (req.get('accept-language') || '')
  );
  return fingerprint;
}

function parseDeviceInfo(req) {
  const parser = new UAParser();
  const ua = req.get('user-agent') || '';
  parser.setUA(ua);
  const result = parser.getResult();
  
  return {
    ua: ua,
    browser: result.browser,
    os: result.os,
    device: result.device,
    cpu: result.cpu
  };
}

function getLocationInfo(ip) {
  if (!ip || ip === '::1' || ip === '127.0.0.1') {
    return {
      country: 'Local',
      region: 'Local',
      city: 'Local',
      isp: 'Local'
    };
  }
  
  const geo = geoip.lookup(ip);
  if (!geo) {
    return {
      country: 'Unknown',
      region: 'Unknown', 
      city: 'Unknown',
      isp: 'Unknown'
    };
  }
  
  return {
    country: geo.country || 'Unknown',
    region: geo.region || 'Unknown',
    city: geo.city || 'Unknown',
    isp: geo.org || 'Unknown'
  };
}

async function trackDeviceAndLogin(userId, req, success = true) {
  const deviceInfo = parseDeviceInfo(req);
  const fingerprint = generateDeviceFingerprint(req, deviceInfo);
  const location = getLocationInfo(req.ip);
  
  // Parse additional device fingerprint from client
  let clientFingerprint = {};
  try {
    const fingerprintHeader = req.get('X-Device-Fingerprint');
    if (fingerprintHeader) {
      clientFingerprint = JSON.parse(fingerprintHeader);
    }
  } catch (e) {
    // Ignore parsing errors
  }
  
  return new Promise((resolve, reject) => {
    // First, check if device exists
    db.get(
      'SELECT id FROM user_devices WHERE device_fingerprint = ? AND user_id = ?',
      [fingerprint, userId],
      (err, existingDevice) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (existingDevice) {
          // Update last seen
          db.run(
            'UPDATE user_devices SET last_seen = CURRENT_TIMESTAMP WHERE id = ?',
            [existingDevice.id],
            (updateErr) => {
              if (updateErr) {
                reject(updateErr);
                return;
              }
              
              // Record login history
              db.run(
                `INSERT INTO login_history (user_id, device_id, ip_address, country, region, city, isp, success)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [userId, existingDevice.id, req.ip, location.country, location.region, location.city, location.isp, success],
                function(loginErr) {
                  if (loginErr) reject(loginErr);
                  else resolve({ deviceId: existingDevice.id, loginId: this.lastID });
                }
              );
            }
          );
        } else {
          // Create new device record
          db.run(
            `INSERT INTO user_devices (
              user_id, device_fingerprint, user_agent, browser_name, browser_version,
              os_name, os_version, device_type, device_model, cpu_architecture,
              platform, screen_resolution, timezone, language
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              userId, fingerprint, deviceInfo.ua,
              deviceInfo.browser.name, deviceInfo.browser.version,
              deviceInfo.os.name, deviceInfo.os.version,
              deviceInfo.device.type, deviceInfo.device.model,
              deviceInfo.cpu.architecture,
              req.get('sec-ch-ua-platform') || deviceInfo.os.name,
              clientFingerprint.screen_resolution,
              clientFingerprint.timezone,
              clientFingerprint.language
            ],
            function(deviceErr) {
              if (deviceErr) {
                reject(deviceErr);
                return;
              }
              
              const deviceId = this.lastID;
              
              // Record login history
              db.run(
                `INSERT INTO login_history (user_id, device_id, ip_address, country, region, city, isp, success)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [userId, deviceId, req.ip, location.country, location.region, location.city, location.isp, success],
                function(loginErr) {
                  if (loginErr) reject(loginErr);
                  else resolve({ deviceId: deviceId, loginId: this.lastID });
                }
              );
            }
          );
        }
      }
    );
  });
}

// --- CAPTCHA and Security API routes ---

// Generate CAPTCHA challenge
app.get('/api/security/captcha', async (req, res) => {
  try {
    const challenge = await createCaptchaChallenge(req.ip);
    res.json(challenge);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create CAPTCHA challenge' });
  }
});

// Verify CAPTCHA solution
app.post('/api/security/captcha/verify', async (req, res) => {
  const { challengeId, solution } = req.body;
  
  if (!challengeId || !solution) {
    return res.status(400).json({ error: 'Challenge ID and solution are required' });
  }
  
  try {
    const isValid = await verifyCaptcha(challengeId, solution);
    if (isValid) {
      // Temporarily reduce bot score for this IP
      db.run(
        'UPDATE bot_scores SET bot_score = CASE WHEN bot_score > 30 THEN bot_score - 30 ELSE 0 END WHERE ip_address = ?',
        [req.ip]
      );
      res.json({ valid: true, message: 'CAPTCHA verified successfully' });
    } else {
      res.status(400).json({ valid: false, error: 'Invalid CAPTCHA solution' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify CAPTCHA' });
  }
});

// Get bot score for debugging (admin only)
app.get('/api/security/bot-score', requireAdmin, (req, res) => {
  const { ip } = req.query;
  const targetIp = ip || req.ip;
  
  db.get('SELECT * FROM bot_scores WHERE ip_address = ?', [targetIp], (err, score) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    
    const currentScore = calculateBotScore(req);
    res.json({ 
      ip: targetIp,
      storedScore: score || null,
      currentRequestScore: currentScore
    });
  });
});

// Blacklist IP (admin only)
app.post('/api/security/blacklist', requireAdmin, (req, res) => {
  const { ip, reason, duration } = req.body;
  
  if (!ip || !reason) {
    return res.status(400).json({ error: 'IP address and reason are required' });
  }
  
  const blockedUntil = duration ? new Date(Date.now() + duration * 60000).toISOString() : null;
  
  db.run(
    'INSERT OR REPLACE INTO ip_blacklist (ip_address, reason, blocked_until, created_by) VALUES (?, ?, ?, ?)',
    [ip, reason, blockedUntil, req.session.userId],
    function(err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      
      logSecurityEvent(ip, req.session.userId, 'ip_blacklisted', 'high', reason, req.get('user-agent'), req.path);
      res.json({ message: 'IP address blacklisted successfully' });
    }
  );
});

// Get security events (admin only)
app.get('/api/security/events', requireAdmin, (req, res) => {
  const { limit = 50 } = req.query;
  
  db.all(
    'SELECT * FROM security_events ORDER BY created_at DESC LIMIT ?',
    [parseInt(limit)],
    (err, events) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(events);
    }
  );
});

// --- Authentication API routes ---

// Register new user
app.post('/api/auth/register', authLimiter, botDetectionMiddleware, async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required' });
  }

  try {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    const sql = `INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)`;
    db.run(sql, [username, email, hashedPassword], function(err) {
      if (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          return res.status(409).json({ error: 'Username or email already exists' });
        }
        return res.status(500).json({ error: 'Database error', details: err.message });
      }
      
      // Auto-login after registration
      req.session.userId = this.lastID;
      req.session.userRole = 'user';
      
      // Track device for new user
      const userId = this.lastID;
      trackDeviceAndLogin(userId, req, true).then(() => {
        db.get('SELECT id, username, email, role FROM users WHERE id = ?', [userId], (err2, user) => {
          if (err2) return res.status(500).json({ error: 'Database error' });
          res.status(201).json({ user, message: 'Account created successfully' });
        });
      }).catch((trackErr) => {
        console.error('Failed to track device for new user:', trackErr);
        db.get('SELECT id, username, email, role FROM users WHERE id = ?', [userId], (err2, user) => {
          if (err2) return res.status(500).json({ error: 'Database error' });
          res.status(201).json({ user, message: 'Account created successfully' });
        });
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Login user
app.post('/api/auth/login', authLimiter, botDetectionMiddleware, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  db.get('SELECT * FROM users WHERE username = ? OR email = ?', [username, username], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!user) {
      // Track failed login attempt if user exists by username/email
      db.get('SELECT id FROM users WHERE username = ? OR email = ?', [username, username], async (err2, userForFail) => {
        if (!err2 && userForFail) {
          try {
            await trackDeviceAndLogin(userForFail.id, req, false);
          } catch (trackErr) {
            console.error('Failed to track failed login:', trackErr);
          }
        }
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    try {
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        // Track failed login attempt
        try {
          await trackDeviceAndLogin(user.id, req, false);
        } catch (trackErr) {
          console.error('Failed to track failed login:', trackErr);
        }
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Update last login
      db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
      
      // Track successful login and device
      try {
        await trackDeviceAndLogin(user.id, req, true);
      } catch (trackErr) {
        console.error('Failed to track successful login:', trackErr);
      }
      
      req.session.userId = user.id;
      req.session.userRole = user.role;
      
      res.json({ 
        user: { id: user.id, username: user.username, email: user.email, role: user.role },
        message: 'Logged in successfully'
      });
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  });
});

// Logout user
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Failed to logout' });
    res.json({ message: 'Logged out successfully' });
  });
});

// Get current user profile
app.get('/api/auth/profile', getCurrentUser, (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({ user: req.user });
});

// Update user profile
app.put('/api/auth/profile', requireAuth, (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  db.run('UPDATE users SET email = ? WHERE id = ?', [email, req.session.userId], function(err) {
    if (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'Email already exists' });
      }
      return res.status(500).json({ error: 'Database error' });
    }
    
    db.get('SELECT id, username, email, role FROM users WHERE id = ?', [req.session.userId], (err2, user) => {
      if (err2) return res.status(500).json({ error: 'Database error' });
      res.json({ user, message: 'Profile updated successfully' });
    });
  });
});

// Change password
app.put('/api/auth/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }

  try {
    db.get('SELECT password_hash FROM users WHERE id = ?', [req.session.userId], async (err, user) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!user) return res.status(404).json({ error: 'User not found' });

      const isValid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isValid) return res.status(401).json({ error: 'Current password is incorrect' });

      const saltRounds = 10;
      const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);
      
      db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashedNewPassword, req.session.userId], (err2) => {
        if (err2) return res.status(500).json({ error: 'Database error' });
        res.json({ message: 'Password changed successfully' });
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// --- File Upload API ---

// Upload banner image
app.post('/api/upload/banner', requireAuth, (req, res) => {
  logInfo('Banner upload request received', { userId: req.user?.id });
  
  upload.single('banner')(req, res, (err) => {
    if (err) {
      logError('Upload error', err, { userId: req.user?.id });
      
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
      }
      
      if (err.message.includes('Invalid file type')) {
        return res.status(400).json({ error: err.message });
      }
      
      return res.status(500).json({ error: 'Upload failed', details: err.message });
    }
    
    if (!req.file) {
      logError('No file received in upload request', null, { userId: req.user?.id });
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Return the URL path to the uploaded file
    const fileUrl = `/uploads/${req.file.filename}`;
    
    // Log successful upload
    logUpload(
      req.file.filename,
      req.file.originalname,
      req.file.size,
      req.user,
      true
    );
    
    res.json({
      success: true,
      message: 'File uploaded successfully',
      url: fileUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size
    });
  });
});

// Delete uploaded file (optional - for cleanup)
app.delete('/api/upload/banner/:filename', requireAuth, (req, res) => {
  const filename = req.params.filename;
  
  // Basic security: only allow deleting banner files with correct format
  if (!filename.startsWith('banner-') || !/^banner-\d+-[a-z0-9]+\.[a-zA-Z]+$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename format' });
  }
  
  const filePath = path.join(uploadsDir, filename);
  
  fs.unlink(filePath, (err) => {
    if (err) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: 'File not found' });
      }
      logError('File deletion error', err, { filename, userId: req.user?.id });
      return res.status(500).json({ error: 'Failed to delete file' });
    }
    
    logInfo('File deleted successfully', { filename, userId: req.user?.id });
    res.json({ message: 'File deleted successfully' });
  });
});

// --- Admin API routes ---

// Get all users (admin only)
app.get('/api/admin/users', requireAdmin, (req, res) => {
  db.all('SELECT id, username, email, role, created_at, last_login FROM users ORDER BY created_at DESC', (err, users) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(users);
  });
});

// Update user role (admin only)
app.put('/api/admin/users/:id/role', requireAdmin, (req, res) => {
  const { role } = req.body;
  const userId = parseInt(req.params.id, 10);
  
  if (!role || !['user', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Valid role (user or admin) is required' });
  }
  
  if (userId === req.session.userId) {
    return res.status(400).json({ error: 'Cannot change your own role' });
  }

  db.run('UPDATE users SET role = ? WHERE id = ?', [role, userId], function(err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (this.changes === 0) return res.status(404).json({ error: 'User not found' });
    
    db.get('SELECT id, username, email, role FROM users WHERE id = ?', [userId], (err2, user) => {
      if (err2) return res.status(500).json({ error: 'Database error' });
      res.json({ user, message: 'User role updated successfully' });
    });
  });
});

// Delete user (admin only)
app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const userId = parseInt(req.params.id, 10);
  
  if (userId === req.session.userId) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  db.run('DELETE FROM users WHERE id = ?', [userId], function(err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (this.changes === 0) return res.status(404).json({ error: 'User not found' });
    
    res.json({ message: 'User deleted successfully' });
  });
});

// Get all servers with owner info (admin only)
app.get('/api/admin/servers', requireAdmin, (req, res) => {
  const sql = `
    SELECT s.*, u.username as owner_username, u.email as owner_email
    FROM servers s
    LEFT JOIN users u ON s.owner_id = u.id
    ORDER BY s.created_at DESC
  `;
  
  db.all(sql, (err, servers) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(servers);
  });
});

// Delete any server (admin only)
app.delete('/api/admin/servers/:id', requireAdmin, (req, res) => {
  const serverId = parseInt(req.params.id, 10);
  
  db.run('DELETE FROM servers WHERE id = ?', [serverId], function(err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (this.changes === 0) return res.status(404).json({ error: 'Server not found' });
    
    res.json({ message: 'Server deleted successfully' });
  });
});

// Update server plan (admin only)
app.put('/api/admin/servers/:id/plan', requireAdmin, (req, res) => {
  const { plan } = req.body;
  const serverId = parseInt(req.params.id, 10);
  
  if (!plan || !['free', 'paid'].includes(plan)) {
    return res.status(400).json({ error: 'Valid plan (free or paid) is required' });
  }

  db.run('UPDATE servers SET plan = ? WHERE id = ?', [plan, serverId], function(err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (this.changes === 0) return res.status(404).json({ error: 'Server not found' });
    
    db.get('SELECT * FROM servers WHERE id = ?', [serverId], (err2, server) => {
      if (err2) return res.status(500).json({ error: 'Database error' });
      res.json({ server, message: 'Server plan updated successfully' });
    });
  });
});

// Get site settings (admin only)
app.get('/api/admin/settings', requireAdmin, (req, res) => {
  db.all('SELECT * FROM site_settings', (err, settings) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    
    // Convert to object format
    const settingsObj = {};
    settings.forEach(setting => {
      settingsObj[setting.key] = setting.value;
    });
    
    res.json(settingsObj);
  });
});

// Update site settings (admin only)
app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const settings = req.body;
  
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'Settings object is required' });
  }
  
  const promises = Object.entries(settings).map(([key, value]) => {
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT OR REPLACE INTO site_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
        [key, value],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  });
  
  Promise.all(promises)
    .then(() => {
      res.json({ message: 'Settings updated successfully' });
    })
    .catch((err) => {
      res.status(500).json({ error: 'Database error', details: err.message });
    });
});

// Get user device information (admin only)
app.get('/api/admin/user-devices/:username', requireAdmin, (req, res) => {
  const username = req.params.username;
  
  const sql = `
    SELECT 
      u.username,
      u.email,
      u.role,
      u.created_at as user_created_at,
      u.last_login,
      ud.*,
      COUNT(lh.id) as total_logins,
      MAX(lh.login_time) as last_login_time,
      COUNT(CASE WHEN lh.success = 0 THEN 1 END) as failed_logins
    FROM users u
    LEFT JOIN user_devices ud ON u.id = ud.user_id
    LEFT JOIN login_history lh ON ud.id = lh.device_id
    WHERE u.username = ?
    GROUP BY ud.id
    ORDER BY ud.last_seen DESC
  `;
  
  db.all(sql, [username], (err, devices) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    
    if (!devices.length) {
      return res.status(404).json({ error: 'User not found or no devices registered' });
    }
    
    // Get login history for this user
    const historySQL = `
      SELECT 
        lh.*,
        ud.browser_name,
        ud.os_name,
        ud.device_type
      FROM login_history lh
      JOIN user_devices ud ON lh.device_id = ud.id
      JOIN users u ON lh.user_id = u.id
      WHERE u.username = ?
      ORDER BY lh.login_time DESC
      LIMIT 50
    `;
    
    db.all(historySQL, [username], (err2, loginHistory) => {
      if (err2) return res.status(500).json({ error: 'Database error' });
      
      res.json({
        user: devices[0] ? {
          username: devices[0].username,
          email: devices[0].email,
          role: devices[0].role,
          created_at: devices[0].user_created_at,
          last_login: devices[0].last_login
        } : null,
        devices: devices.filter(d => d.id), // Remove null devices
        loginHistory: loginHistory
      });
    });
  });
});

// Get all users with device counts (admin only)
app.get('/api/admin/users-devices', requireAdmin, (req, res) => {
  const sql = `
    SELECT 
      u.id,
      u.username,
      u.email,
      u.role,
      u.created_at,
      u.last_login,
      COUNT(DISTINCT ud.id) as device_count,
      COUNT(lh.id) as total_logins,
      COUNT(CASE WHEN lh.success = 0 THEN 1 END) as failed_logins,
      MAX(lh.login_time) as last_activity
    FROM users u
    LEFT JOIN user_devices ud ON u.id = ud.user_id
    LEFT JOIN login_history lh ON u.id = lh.user_id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `;
  
  db.all(sql, (err, users) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(users);
  });
});

// Get comprehensive dashboard data for admin
app.get('/api/admin/dashboard', requireAdmin, (req, res) => {
  console.log('🔍 [DASHBOARD] Admin dashboard endpoint accessed');
  console.log('🔍 [DASHBOARD] Request user:', req.user ? req.user.username : 'undefined');
  console.log('🔍 [DASHBOARD] User role:', req.user ? req.user.role : 'undefined');
  console.log('🔍 [DASHBOARD] Request IP:', req.ip || req.connection.remoteAddress);
  console.log('🔍 [DASHBOARD] Request headers:', JSON.stringify(req.headers, null, 2));
  
  const promises = {
    // User statistics
    userStats: new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_users,
          COUNT(CASE WHEN created_at > datetime('now', '-7 days') THEN 1 END) as new_users_week,
          COUNT(CASE WHEN created_at > datetime('now', '-30 days') THEN 1 END) as new_users_month,
          COUNT(CASE WHEN last_login > datetime('now', '-24 hours') THEN 1 END) as active_24h,
          COUNT(CASE WHEN last_login > datetime('now', '-7 days') THEN 1 END) as active_week
        FROM users
      `;
      db.get(sql, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    }),

    // Server statistics
    serverStats: new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(*) as total_servers,
          COUNT(CASE WHEN plan = 'paid' THEN 1 END) as paid_servers,
          COUNT(CASE WHEN created_at > datetime('now', '-7 days') THEN 1 END) as new_servers_week,
          COUNT(CASE WHEN created_at > datetime('now', '-30 days') THEN 1 END) as new_servers_month,
          SUM(votes) as total_votes,
          AVG(votes) as avg_votes
        FROM servers
      `;
      db.get(sql, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    }),

    // Security statistics
    securityStats: new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(*) as total_events,
          COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_severity,
          COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_events,
          COUNT(CASE WHEN event_type = 'bot_detected' THEN 1 END) as bot_detections,
          COUNT(CASE WHEN created_at > datetime('now', '-24 hours') THEN 1 END) as events_24h,
          COUNT(DISTINCT ip_address) as unique_ips
        FROM security_events
      `;
      db.get(sql, (err, result) => {
        if (err) {
          // If table doesn't exist, return zeros
          resolve({
            total_events: 0,
            high_severity: 0,
            critical_events: 0,
            bot_detections: 0,
            events_24h: 0,
            unique_ips: 0
          });
        } else {
          resolve(result || {
            total_events: 0,
            high_severity: 0,
            critical_events: 0,
            bot_detections: 0,
            events_24h: 0,
            unique_ips: 0
          });
        }
      });
    }),

    // Device statistics
    deviceStats: new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(*) as total_devices,
          COUNT(CASE WHEN last_seen > datetime('now', '-24 hours') THEN 1 END) as active_devices_24h,
          COUNT(CASE WHEN last_seen > datetime('now', '-7 days') THEN 1 END) as active_devices_week,
          COUNT(DISTINCT browser_name) as unique_browsers,
          COUNT(DISTINCT os_name) as unique_os
        FROM user_devices
      `;
      db.get(sql, (err, result) => {
        if (err) {
          resolve({
            total_devices: 0,
            active_devices_24h: 0,
            active_devices_week: 0,
            unique_browsers: 0,
            unique_os: 0
          });
        } else {
          resolve(result || {
            total_devices: 0,
            active_devices_24h: 0,
            active_devices_week: 0,
            unique_browsers: 0,
            unique_os: 0
          });
        }
      });
    }),

    // Login statistics
    loginStats: new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(*) as total_logins,
          COUNT(CASE WHEN success = 0 THEN 1 END) as failed_logins,
          COUNT(CASE WHEN login_time > datetime('now', '-24 hours') THEN 1 END) as logins_24h,
          COUNT(CASE WHEN login_time > datetime('now', '-7 days') THEN 1 END) as logins_week,
          COUNT(DISTINCT country) as unique_countries
        FROM login_history
      `;
      db.get(sql, (err, result) => {
        if (err) {
          resolve({
            total_logins: 0,
            failed_logins: 0,
            logins_24h: 0,
            logins_week: 0,
            unique_countries: 0
          });
        } else {
          resolve(result || {
            total_logins: 0,
            failed_logins: 0,
            logins_24h: 0,
            logins_week: 0,
            unique_countries: 0
          });
        }
      });
    }),

    // Top countries
    topCountries: new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          country,
          COUNT(*) as login_count,
          COUNT(DISTINCT user_id) as unique_users
        FROM login_history
        WHERE country IS NOT NULL AND country != 'Local'
        GROUP BY country
        ORDER BY login_count DESC
        LIMIT 10
      `;
      db.all(sql, (err, result) => {
        if (err) resolve([]);
        else resolve(result || []);
      });
    }),

    // Recent activity
    recentActivity: new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          'user_registered' as type,
          username as detail,
          created_at as timestamp
        FROM users
        WHERE created_at > datetime('now', '-7 days')
        UNION ALL
        SELECT 
          'server_created' as type,
          name as detail,
          created_at as timestamp
        FROM servers
        WHERE created_at > datetime('now', '-7 days')
        ORDER BY timestamp DESC
        LIMIT 15
      `;
      db.all(sql, (err, result) => {
        if (err) resolve([]);
        else resolve(result || []);
      });
    }),

    // Bot detection overview
    botOverview: new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(*) as total_tracked_ips,
          COUNT(CASE WHEN bot_score > 80 THEN 1 END) as high_risk,
          COUNT(CASE WHEN bot_score > 60 AND bot_score <= 80 THEN 1 END) as medium_risk,
          COUNT(CASE WHEN bot_score > 30 AND bot_score <= 60 THEN 1 END) as low_risk,
          AVG(bot_score) as avg_score,
          MAX(bot_score) as max_score
        FROM bot_scores
      `;
      db.get(sql, (err, result) => {
        if (err) {
          resolve({
            total_tracked_ips: 0,
            high_risk: 0,
            medium_risk: 0,
            low_risk: 0,
            avg_score: 0,
            max_score: 0
          });
        } else {
          resolve(result || {
            total_tracked_ips: 0,
            high_risk: 0,
            medium_risk: 0,
            low_risk: 0,
            avg_score: 0,
            max_score: 0
          });
        }
      });
    })
  };

  console.log('🔍 [DASHBOARD] Starting Promise.all execution...');
  
  Promise.all([
    promises.userStats,
    promises.serverStats,
    promises.securityStats,
    promises.deviceStats,
    promises.loginStats,
    promises.topCountries,
    promises.recentActivity,
    promises.botOverview
  ])
    .then(([userStats, serverStats, securityStats, deviceStats, loginStats, topCountries, recentActivity, botOverview]) => {
      console.log('🔍 [DASHBOARD] All promises resolved successfully');
      console.log('🔍 [DASHBOARD] UserStats:', userStats);
      console.log('🔍 [DASHBOARD] ServerStats:', serverStats);
      console.log('🔍 [DASHBOARD] SecurityStats:', securityStats);
      console.log('🔍 [DASHBOARD] DeviceStats:', deviceStats);
      console.log('🔍 [DASHBOARD] LoginStats:', loginStats);
      console.log('🔍 [DASHBOARD] TopCountries:', topCountries);
      console.log('🔍 [DASHBOARD] RecentActivity:', recentActivity);
      console.log('🔍 [DASHBOARD] BotOverview:', botOverview);
      
      const responseData = {
        userStats: userStats || {},
        serverStats: serverStats || {},
        securityStats: securityStats || {},
        deviceStats: deviceStats || {},
        loginStats: loginStats || {},
        topCountries: topCountries || [],
        recentActivity: recentActivity || [],
        botOverview: botOverview || {},
        timestamp: new Date().toISOString()
      };
      
      console.log('🔍 [DASHBOARD] Sending response:', JSON.stringify(responseData, null, 2));
      res.json(responseData);
    })
    .catch((error) => {
      console.error('❌ [DASHBOARD] Promise.all failed:', error);
      console.error('❌ [DASHBOARD] Error stack:', error.stack);
      res.status(500).json({ error: 'Failed to load dashboard data', details: error.message });
    });
});

// Get admin dashboard stats
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const queries = {
    totalUsers: 'SELECT COUNT(*) as count FROM users',
    totalServers: 'SELECT COUNT(*) as count FROM servers',
    totalVotes: 'SELECT COUNT(*) as count FROM votes',
    paidServers: 'SELECT COUNT(*) as count FROM servers WHERE plan = "paid"',
    recentUsers: 'SELECT COUNT(*) as count FROM users WHERE created_at >= datetime("now", "-7 days")',
    recentServers: 'SELECT COUNT(*) as count FROM servers WHERE created_at >= datetime("now", "-7 days")'
  };
  
  const stats = {};
  const promises = Object.entries(queries).map(([key, query]) => {
    return new Promise((resolve, reject) => {
      db.get(query, (err, result) => {
        if (err) reject(err);
        else {
          stats[key] = result.count;
          resolve();
        }
      });
    });
  });
  
  Promise.all(promises)
    .then(() => {
      res.json(stats);
    })
    .catch((err) => {
      res.status(500).json({ error: 'Database error', details: err.message });
    });
});

// --- Server API routes ---

// list servers (paid first), with simple search and sort
app.get('/api/servers', (req, res) => {
  const { q = '', sort = 'rank' } = req.query;
  const params = [];
  let where = '';
  if (q) {
    where = `WHERE s.name LIKE ? OR s.ip LIKE ? OR s.description LIKE ?`;
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  let orderBy = `CASE WHEN s.plan='paid' THEN 0 ELSE 1 END, s.votes DESC, s.created_at DESC`;
  if (sort === 'new') orderBy = `CASE WHEN s.plan='paid' THEN 0 ELSE 1 END, s.created_at DESC`;
  if (sort === 'votes') orderBy = `CASE WHEN s.plan='paid' THEN 0 ELSE 1 END, s.votes DESC`;

  const sql = `SELECT s.id, s.name, s.ip, s.description, s.website_url, s.banner_url, s.plan, s.votes, s.created_at, u.username as owner_username
               FROM servers s
               LEFT JOIN users u ON s.owner_id = u.id
               ${where}
               ORDER BY ${orderBy}`;
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error', details: err.message });
    res.json(rows);
  });
});

// create server listing (requires authentication)
app.post('/api/servers', botDetectionMiddleware, requireAuth, (req, res) => {
  const { name, ip, description = '', website_url = '', banner_url = '', plan = 'free' } = req.body;
  if (!name || !ip) return res.status(400).json({ error: 'name and ip are required' });
  
  // Only admins can create paid listings
  const p = (plan === 'paid' && req.session.userRole === 'admin') ? 'paid' : 'free';

  const sql = `INSERT INTO servers (name, ip, description, website_url, banner_url, plan, owner_id)
               VALUES (?, ?, ?, ?, ?, ?, ?)`;
  db.run(sql, [name, ip, description, website_url, banner_url, p, req.session.userId], function(err) {
    if (err) return res.status(500).json({ error: 'DB error', details: err.message });
    db.get(`SELECT s.*, u.username as owner_username FROM servers s LEFT JOIN users u ON s.owner_id = u.id WHERE s.id = ?`, [this.lastID], (err2, row) => {
      if (err2) return res.status(500).json({ error: 'DB error', details: err2.message });
      res.status(201).json(row);
    });
  });
});

// Get user's own servers
app.get('/api/user/servers', requireAuth, (req, res) => {
  const sql = `SELECT * FROM servers WHERE owner_id = ? ORDER BY created_at DESC`;
  db.all(sql, [req.session.userId], (err, servers) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(servers);
  });
});

// Get single server by ID (user's own only)
app.get('/api/user/servers/:id', requireAuth, (req, res) => {
  const serverId = parseInt(req.params.id, 10);
  
  db.get('SELECT * FROM servers WHERE id = ? AND owner_id = ?', [serverId, req.session.userId], (err, server) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!server) return res.status(404).json({ error: 'Server not found or access denied' });
    
    res.json(server);
  });
});

// Update user's own server
app.put('/api/user/servers/:id', requireAuth, (req, res) => {
  const serverId = parseInt(req.params.id, 10);
  const { name, ip, description, website_url, banner_url } = req.body;
  
  if (!name || !ip) {
    return res.status(400).json({ error: 'Name and IP are required' });
  }

  // First check if user owns this server
  db.get('SELECT * FROM servers WHERE id = ? AND owner_id = ?', [serverId, req.session.userId], (err, server) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!server) return res.status(404).json({ error: 'Server not found or access denied' });
    
    const sql = `UPDATE servers SET name = ?, ip = ?, description = ?, website_url = ?, banner_url = ? WHERE id = ?`;
    db.run(sql, [name, ip, description || '', website_url || '', banner_url || '', serverId], function(err2) {
      if (err2) return res.status(500).json({ error: 'Database error' });
      
      db.get('SELECT * FROM servers WHERE id = ?', [serverId], (err3, updatedServer) => {
        if (err3) return res.status(500).json({ error: 'Database error' });
        res.json({ server: updatedServer, message: 'Server updated successfully' });
      });
    });
  });
});

// Delete user's own server
app.delete('/api/user/servers/:id', requireAuth, (req, res) => {
  const serverId = parseInt(req.params.id, 10);
  
  db.run('DELETE FROM servers WHERE id = ? AND owner_id = ?', [serverId, req.session.userId], function(err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (this.changes === 0) return res.status(404).json({ error: 'Server not found or access denied' });
    
    res.json({ message: 'Server deleted successfully' });
  });
});

// vote for a server (limit 1 per day per ip/ua)
app.post('/api/servers/:id/vote', voteLimiter, botDetectionMiddleware, (req, res) => {
  const serverId = parseInt(req.params.id, 10);
  if (Number.isNaN(serverId)) return res.status(400).json({ error: 'Invalid server id' });

  const voterFingerprint = simpleHash((req.ip || '') + '|' + (req.get('user-agent') || ''));
  const insertVote = `INSERT OR IGNORE INTO votes (server_id, voter_hash, voted_date) VALUES (?, ?, strftime('%Y-%m-%d', CURRENT_TIMESTAMP))`;
  db.run(insertVote, [serverId, voterFingerprint], function(err) {
    if (err) return res.status(500).json({ error: 'DB error', details: err.message });
    if (this.changes === 0) {
      return res.status(429).json({ error: 'You can only vote once per day for this server from this device.' });
    }
    // increment votes
    db.run(`UPDATE servers SET votes = votes + 1 WHERE id = ?`, [serverId], function(err2) {
      if (err2) return res.status(500).json({ error: 'DB error', details: err2.message });
      db.get(`SELECT id, votes FROM servers WHERE id = ?`, [serverId], (err3, row) => {
        if (err3) return res.status(500).json({ error: 'DB error', details: err3.message });
        res.json({ success: true, server_id: serverId, votes: row?.votes ?? null });
      });
    });
  });
});

// health
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Add request timing and logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  // Log response when finished
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    logAccess(req, res, responseTime);
    
    // Log errors to separate error log
    if (res.statusCode >= 400) {
      logError(`HTTP ${res.statusCode} - ${req.method} ${req.url}`, null, {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        userId: req.session?.userId,
        responseTime
      });
    }
    
    // Log security-sensitive endpoints
    if (req.url.includes('/auth/') || req.url.includes('/admin/')) {
      logSecurity(`${req.method} ${req.url}`, 'info', {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        userId: req.session?.userId,
        statusCode: res.statusCode,
        responseTime
      });
    }
  });
  
  next();
});

// fallback to index.html for root
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global references for shell and session management
let adminShell;
let sessionManager;

app.listen(PORT, async () => {
  logInfo('Alliance Server Promoter started', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    pid: process.pid,
    nodeVersion: process.version
  });
  
  // Initialize admin shell
  adminShell = new AdminShell(db);
  
  // Initialize session manager
  sessionManager = new SessionManager(adminShell);
  
  // Enhance shell with session capabilities
  enhanceShellForSessions(adminShell, sessionManager);
  
  // Set session manager in shell for proper detach handling
  adminShell.sessionManager = sessionManager;
  
  // Show startup message
  consoleLog('\n🎆 =================================');
  consoleLog('🎆 Alliance Server Promoter STARTED');
  consoleLog(`🎆 Port: ${PORT}`);
  consoleLog(`🎆 URL: http://localhost:${PORT}`);
  consoleLog('🎆 =================================');
  consoleLog('📝 Real-time logging to files/logs/');
  consoleLog('🔑 Admin endpoints require admin role');
  consoleLog('🔐 Auth endpoints require authentication');
  consoleLog('🤖 Bot detection is active');
  consoleLog('📊 Dashboard and admin panel available');
  consoleLog('💫 Drag & drop banner uploads enabled');
  consoleLog('📡 Session management enabled (detach/attach)');
  
  try {
    // Start session server
    await sessionManager.start();
    consoleLog('📡 Session server started - you can detach/attach');
  } catch (error) {
    consoleLog('⚠️ Session server failed to start:', error.message);
  }
  
  consoleLog('\n🚀 Starting interactive admin shell...');
  
  // Start interactive shell after a brief delay
  setTimeout(() => {
    adminShell.start();
  }, 1000);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  consoleLog('\n🔄 Received SIGTERM, shutting down gracefully...');
  if (sessionManager) {
    sessionManager.stop();
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  if (adminShell && adminShell.rl) {
    // Let the shell handle Ctrl+C
    return;
  }
  
  consoleLog('\n🔄 Received SIGINT, shutting down...');
  if (sessionManager) {
    sessionManager.stop();
  }
  process.exit(0);
});
