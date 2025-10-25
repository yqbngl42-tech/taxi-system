// ===============================================
// ⚙️ CONFIGURATION - CENTRALIZED CONFIG
// ===============================================

import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // ========== APP ==========
  app: {
    name: 'Taxi Management System',
    version: '2.1.0',
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT) || 3000,
    isDevelopment: (process.env.NODE_ENV || 'development') === 'development',
    isProduction: process.env.NODE_ENV === 'production'
  },
  
  // ========== DATABASE ==========
  db: {
    uri: process.env.MONGODB_URI,
    options: {
      maxPoolSize: 10,
      minPoolSize: 2,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 5000
    }
  },
  
  // ========== JWT ==========
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: '24h',
    algorithm: 'HS256'
  },
  
  // ========== AUTHENTICATION ==========
  auth: {
    adminPassword: process.env.ADMIN_PASSWORD,
    maxLoginAttempts: 5,
    lockoutDuration: 15 * 60 * 1000 // 15 minutes
  },
  
  // ========== TWILIO ==========
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    whatsappFrom: process.env.TWILIO_WHATSAPP_FROM,
    webhookUrl: process.env.WEBHOOK_URL || 'https://taxi-system.onrender.com',
    maxRetries: 3,
    retryDelay: 1000,
    rateLimit: {
      maxMessagesPerMinute: 100,
      delayBetweenMessages: 500 // ms
    }
  },
  
  // ========== RATE LIMITING ==========
  rateLimit: {
    windowMs: 60000, // 1 minute
    maxRequests: 100,
    message: 'יותר מדי בקשות - נסה שוב בעוד דקה'
  },
  
  // ========== CORS ==========
  cors: {
    origins: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5500',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:5500',
      'http://localhost:8080',
      'http://127.0.0.1:8080',
      'https://taxi-system.onrender.com',
      process.env.FRONTEND_URL
    ].filter(Boolean), // Remove undefined values
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
  },
  
  // ========== PAGINATION ==========
  pagination: {
    defaultLimit: 50,
    maxLimit: 200,
    minLimit: 1
  },
  
  // ========== LOGS ==========
  logs: {
    level: process.env.LOG_LEVEL || 'info',
    retentionDays: 30,
    cleanupTime: '02:00' // 2 AM
  },
  
  // ========== RIDE ==========
  ride: {
    defaultPrice: 50,
    defaultCommissionRate: 0.10,
    statuses: [
      'created', 
      'sent', 
      'approved', 
      'enroute', 
      'arrived', 
      'finished', 
      'commission_paid', 
      'cancelled'
    ],
    types: ['regular', 'vip', 'delivery']
  },
  
  // ========== PAYMENT (OPTIONAL) ==========
  payment: {
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY,
      publicKey: process.env.STRIPE_PUBLIC_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET
    },
    bitLink: process.env.BIT_LINK || 'https://bit.ly/taxi-payment',
    methods: ['cash', 'card', 'bank_transfer', 'other']
  },
  
  // ========== MAPS (OPTIONAL) ==========
  maps: {
    googleApiKey: process.env.GOOGLE_MAPS_API_KEY,
    defaultLocation: {
      lat: 32.0853,
      lng: 34.7818,
      name: 'Tel Aviv'
    }
  },
  
  // ========== ANALYTICS (OPTIONAL) ==========
  analytics: {
    gaTrackingId: process.env.GA_TRACKING_ID
  },
  
  // ========== FEATURES ==========
  features: {
    socketIo: false,
    gpsTracking: false,
    onlinePayments: !!process.env.STRIPE_SECRET_KEY,
    twoFactorAuth: false,
    smsNotifications: false,
    emailNotifications: false
  },
  
  // ========== VALIDATION ==========
  validation: {
    phoneRegex: /^(0|\+972)?5\d{8}$/,
    nameMinLength: 2,
    nameMaxLength: 100,
    priceMin: 0,
    priceMax: 9999,
    commissionMin: 0,
    commissionMax: 1
  }
};

/**
 * Validate required environment variables
 * @throws {Error} if required variables are missing
 */
export function validateConfig() {
  const required = [
    'MONGODB_URI',
    'JWT_SECRET',
    'ADMIN_PASSWORD',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_WHATSAPP_FROM'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  // Validate JWT_SECRET strength
  if (process.env.JWT_SECRET.length < 32) {
    console.warn('⚠️  WARNING: JWT_SECRET is too short. Use at least 32 characters for security.');
  }
  
  // Validate ADMIN_PASSWORD strength
  if (process.env.ADMIN_PASSWORD.length < 8) {
    console.warn('⚠️  WARNING: ADMIN_PASSWORD is too short. Use at least 8 characters for security.');
  }
  
  return true;
}

/**
 * Get config value by path
 * @param {string} path - Dot-separated path (e.g., 'db.uri')
 * @returns {*}
 */
export function get(path) {
  return path.split('.').reduce((obj, key) => obj?.[key], config);
}

/**
 * Check if feature is enabled
 * @param {string} featureName 
 * @returns {boolean}
 */
export function isFeatureEnabled(featureName) {
  return !!config.features[featureName];
}

/**
 * Get all config (for debugging)
 * @returns {object}
 */
export function getAll() {
  // Return config without sensitive data
  const sanitized = JSON.parse(JSON.stringify(config));
  
  // Remove sensitive fields
  if (sanitized.jwt) sanitized.jwt.secret = '***';
  if (sanitized.auth) sanitized.auth.adminPassword = '***';
  if (sanitized.twilio) {
    sanitized.twilio.accountSid = '***';
    sanitized.twilio.authToken = '***';
  }
  if (sanitized.payment?.stripe) {
    sanitized.payment.stripe.secretKey = '***';
    sanitized.payment.stripe.webhookSecret = '***';
  }
  
  return sanitized;
}

export default config;
