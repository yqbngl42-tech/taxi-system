// ===============================================
// 🚖 TAXI MANAGEMENT SYSTEM - SERVER V2.1
// ===============================================
// Updated with all improvements and fixes
// Date: 2025-10-25

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import cors from "cors";
import twilio from "twilio";
import { v4 as uuidv4 } from 'uuid';

// Models
import Ride from "./models/Ride.js";
import Driver from "./models/Driver.js";
import Payment from "./models/Payment.js";
import WhatsAppGroup from "./models/WhatsAppGroup.js";
import AdminContact from "./models/AdminContact.js";
import Activity from "./models/Activity.js";

// Utils
import twilioAdapter from "./utils/twilioAdapter.js";
import logger from "./utils/logger.js";
import rateLimiter from "./utils/rateLimiter.js";
import rideNumberGenerator from "./utils/rideNumberGenerator.js";
import { ERRORS } from "./utils/errors.js";
import "./utils/logsCleaner.js"; // Auto cleanup old logs

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===============================================
// 🔐 ENVIRONMENT VALIDATION
// ===============================================
console.log('🔍 Validating environment variables...');

const REQUIRED_ENV_VARS = [
  'MONGODB_URI',
  'JWT_SECRET',
  'ADMIN_PASSWORD',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_WHATSAPP_FROM'
];

const missingVars = REQUIRED_ENV_VARS.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingVars.forEach(v => console.error(`   - ${v}`));
  console.error('\n💡 Create a .env file with all required variables');
  process.exit(1);
}

console.log('✅ All environment variables validated');

// ===============================================
// 🚀 APP INITIALIZATION
// ===============================================
const app = express();
const PORT = process.env.PORT || 3000;

// ===============================================
// 🛡️ MIDDLEWARE STACK
// ===============================================

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use(express.static(path.join(__dirname, "public")));

// Request ID middleware (for tracking)
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Request logger
app.use((req, res, next) => {
  const startTime = Date.now();
  
  logger.info('→ Incoming request', {
    id: req.id,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers['user-agent']?.substring(0, 50)
  });
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info('← Response sent', {
      id: req.id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`
    });
  });
  
  next();
});

// CORS Configuration
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5500',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:5500',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'https://taxi-system.onrender.com'
];

if (process.env.NODE_ENV === 'production' && process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked: ${origin}`);
      callback(new Error(`CORS not allowed for origin: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
}));

// Rate Limiting
app.use(rateLimiter.middleware(100, 60000));

// Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// ===============================================
// 🗄️ DATABASE CONNECTION
// ===============================================
console.log('🔄 Connecting to MongoDB...');

mongoose.connect(process.env.MONGODB_URI, {
  maxPoolSize: 10,
  minPoolSize: 2,
  socketTimeoutMS: 45000,
  serverSelectionTimeoutMS: 5000,
})
.then(() => {
  logger.success("✅ Connected to MongoDB!");
  console.log(`   Database: ${mongoose.connection.name}`);
})
.catch(err => {
  logger.error("❌ MongoDB connection failed", err);
  console.error('   Please check MONGODB_URI in .env file');
  process.exit(1);
});

// MongoDB event listeners
mongoose.connection.on('disconnected', () => {
  logger.error('⚠️ MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  logger.success('✅ MongoDB reconnected successfully');
});

mongoose.connection.on('error', (err) => {
  logger.error('❌ MongoDB error:', err);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('\nMongoDB connection closed due to app termination');
  process.exit(0);
});

// ===============================================
// 🔐 AUTHENTICATION MIDDLEWARE
// ===============================================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ 
      ok: false, 
      error: ERRORS.AUTH.NO_TOKEN 
    });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.exp && Date.now() >= decoded.exp * 1000) {
      return res.status(401).json({ 
        ok: false, 
        error: ERRORS.AUTH.EXPIRED_TOKEN 
      });
    }
    
    req.user = decoded;
    next();
  } catch (err) {
    logger.error("Token verification failed", { 
      requestId: req.id, 
      error: err.message 
    });
    return res.status(403).json({ 
      ok: false, 
      error: ERRORS.AUTH.INVALID_TOKEN 
    });
  }
};

// ===============================================
// 🛠️ HELPER FUNCTIONS
// ===============================================

/**
 * Send bulk messages with rate limiting
 */
async function sendBulkMessagesWithRateLimit(phoneNumbers, message, delayMs = 500) {
  const results = {
    success: [],
    failed: []
  };
  
  logger.action(`Starting bulk send to ${phoneNumbers.length} numbers`, { 
    count: phoneNumbers.length 
  });
  
  for (let i = 0; i < phoneNumbers.length; i++) {
    const phone = phoneNumbers[i];
    
    try {
      logger.info(`Sending ${i + 1}/${phoneNumbers.length}`, { phone });
      await twilioAdapter.sendWhatsAppMessage(phone, message);
      results.success.push(phone);
      logger.success(`Sent successfully`, { phone });
    } catch (err) {
      logger.error(`Failed to send`, { 
        phone, 
        error: err.message,
        code: err.code 
      });
      results.failed.push({ phone, error: err.message });
    }
    
    // Rate limiting - wait between messages
    if (i < phoneNumbers.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  logger.action('Bulk send completed', {
    total: phoneNumbers.length,
    success: results.success.length,
    failed: results.failed.length
  });
  
  return results;
}

/**
 * Create group message for new ride
 */
function createGroupMessage(ride) {
  return `🚖 נסיעה חדשה! ${ride.rideNumber}

📍 איסוף: ${ride.pickup}
🎯 יעד: ${ride.destination}
💰 מחיר: ₪${ride.price}
${ride.scheduledTime ? `🕐 שעה: ${new Date(ride.scheduledTime).toLocaleString('he-IL')}` : ''}
${ride.notes ? `📝 הערות: ${ride.notes}` : ''}

💬 לקבלה - כתבו:
ACCEPT ${ride._id}`;
}

/**
 * Create private message for driver who accepted
 */
function createPrivateMessage(ride) {
  return `✅ קיבלת את הנסיעה ${ride.rideNumber}!

📞 לקוח: ${ride.customerName} - ${ride.customerPhone}
📍 איסוף: ${ride.pickup}
🎯 יעד: ${ride.destination}
💰 מחיר: ₪${ride.price}
${ride.notes ? `📝 הערות: ${ride.notes}` : ''}

להצלחה! 🚗`;
}

// ===============================================
// 📍 API ENDPOINTS
// ===============================================

// ========== HEALTH CHECK ==========
app.get("/health", async (req, res) => {
  const health = {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: "2.1.0",
    checks: {
      mongodb: "unknown",
      twilio: "unknown"
    }
  };
  
  // Check MongoDB
  try {
    await mongoose.connection.db.admin().ping();
    health.checks.mongodb = "connected";
  } catch (err) {
    health.checks.mongodb = "disconnected";
    health.status = "error";
    logger.error("Health check: MongoDB disconnected", err);
  }
  
  // Check Twilio (optional - can take time)
  try {
    const isValid = await twilioAdapter.checkCredentials();
    health.checks.twilio = isValid ? "connected" : "error";
  } catch (err) {
    health.checks.twilio = "error";
    health.status = "degraded";
  }
  
  const statusCode = health.status === "ok" ? 200 : 503;
  res.status(statusCode).json(health);
});

// ========== LOGIN ==========
app.post("/api/login", async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ 
        ok: false, 
        error: "נא להזין סיסמה" 
      });
    }
    
    if (password !== process.env.ADMIN_PASSWORD) {
      logger.warn("Failed login attempt", { 
        requestId: req.id,
        ip: req.ip 
      });
      return res.status(401).json({ 
        ok: false, 
        error: ERRORS.AUTH.WRONG_PASSWORD 
      });
    }
    
    const token = jwt.sign(
      { 
        user: "admin", 
        role: "admin",
        loginTime: new Date().toISOString()
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: "24h" }
    );
    
    logger.success("Successful login", { 
      requestId: req.id,
      ip: req.ip 
    });
    
    res.json({ 
      ok: true, 
      token,
      expiresIn: 86400,
      message: "כניסה בהצלחה!"
    });
  } catch (err) {
    logger.error("Login error", { 
      requestId: req.id, 
      error: err.message 
    });
    res.status(500).json({ 
      ok: false, 
      error: ERRORS.SERVER.UNKNOWN 
    });
  }
});

// ========== LOGOUT ==========
app.post("/api/logout", authenticateToken, (req, res) => {
  try {
    logger.action("User logged out", { requestId: req.id });
    res.json({ ok: true, message: "התנתקת בהצלחה" });
  } catch (err) {
    res.status(500).json({ ok: false, error: "שגיאה בהתנתקות" });
  }
});

// ========== CLIENT: GET GROUPS ==========
app.get("/api/client/groups", async (req, res) => {
  try {
    const groups = await WhatsAppGroup.find({ isActive: true })
      .select('name _id')
      .lean();
    
    res.json({ ok: true, groups });
  } catch (err) {
    logger.error("Error getting groups", { 
      requestId: req.id, 
      error: err.message 
    });
    res.status(500).json({ 
      ok: false, 
      error: ERRORS.SERVER.DATABASE 
    });
  }
});

// ========== CLIENT: CREATE RIDE ==========
app.post("/api/client/rides", async (req, res) => {
  try {
    const { 
      customerName, 
      customerPhone, 
      pickup, 
      destination, 
      scheduledTime, 
      notes, 
      sendToGroup
    } = req.body;

    // Validation
    if (!customerName || !customerPhone || !pickup || !destination) {
      return res.status(400).json({ 
        ok: false, 
        error: "שדות חובה: שם, טלפון, איסוף, יעד" 
      });
    }

    const phoneRegex = /^(0|\+972)?5\d{8}$/;
    if (!phoneRegex.test(customerPhone.replace(/[\s\-]/g, ''))) {
      return res.status(400).json({ 
        ok: false, 
        error: ERRORS.VALIDATION.PHONE 
      });
    }

    if (customerName.trim().length < 2) {
      return res.status(400).json({ 
        ok: false, 
        error: ERRORS.VALIDATION.NAME 
      });
    }

    // Generate ride number
    const rideNumber = await rideNumberGenerator.formatRideNumber();
    
    // Default price
    const defaultPrice = 50;

    // Create ride
    const ride = await Ride.create({
      rideNumber,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      pickup: pickup.trim(),
      destination: destination.trim(),
      scheduledTime: scheduledTime || null,
      notes: notes || null,
      price: defaultPrice,
      commissionRate: 0.10,
      commissionAmount: Math.round(defaultPrice * 0.10),
      status: "created",
      rideType: "regular",
      groupChat: "default",
      createdBy: "client",
      history: [{ 
        status: "created", 
        by: "client_website",
        timestamp: new Date(),
        details: "הזמנה מאתר הלקוחות"
      }]
    });

    logger.success("Ride created from client", {
      requestId: req.id,
      rideId: ride._id,
      rideNumber: ride.rideNumber
    });

    // Determine who to send to
    let phonesToSend = [];

    if (sendToGroup) {
      // Send to specific group
      const group = await WhatsAppGroup.findById(sendToGroup);
      if (group && group.isActive && group.phoneNumbers?.length > 0) {
        phonesToSend = group.phoneNumbers;
        logger.action("Sending to specific group", { 
          requestId: req.id,
          groupName: group.name, 
          count: phonesToSend.length,
          rideNumber 
        });
      } else {
        return res.status(400).json({ 
          ok: false, 
          error: ERRORS.GROUP.EMPTY 
        });
      }
    } else {
      // Try default group
      const defaultGroup = await WhatsAppGroup.findOne({ 
        isDefault: true, 
        isActive: true 
      });
      
      if (defaultGroup?.phoneNumbers?.length > 0) {
        phonesToSend = defaultGroup.phoneNumbers;
        logger.action("Sending to default group", { 
          requestId: req.id,
          groupName: defaultGroup.name,
          count: phonesToSend.length,
          rideNumber 
        });
      } else {
        // Fallback to all active drivers
        const drivers = await Driver.find({ 
          isActive: true, 
          phone: { $exists: true, $ne: "" } 
        }, 'phone name');
        
        if (drivers?.length > 0) {
          phonesToSend = drivers.map(d => d.phone);
          logger.action("Sending to all active drivers", { 
            requestId: req.id,
            count: phonesToSend.length,
            rideNumber 
          });
        }
      }
    }

    // Send messages
    let successCount = 0;
    if (phonesToSend.length > 0) {
      const message = createGroupMessage(ride);
      const results = await sendBulkMessagesWithRateLimit(phonesToSend, message);
      successCount = results.success.length;
      
      if (successCount > 0) {
        ride.status = "sent";
        ride.history.push({ 
          status: "sent", 
          by: "system",
          details: `נשלח ל-${successCount} נהגים`,
          timestamp: new Date()
        });
        await ride.save();
      }
    }

    res.json({ 
      ok: true, 
      ride,
      rideNumber: ride.rideNumber,
      sentCount: successCount,
      message: successCount > 0 
        ? `✅ הנסיעה הוזמנה! מספר נסיעה: ${ride.rideNumber}` 
        : "⚠️ נסיעה נוצרה אך לא נשלחה לנהגים"
    });
  } catch (err) {
    logger.error("Error creating ride from client", { 
      requestId: req.id, 
      error: err.message 
    });
    res.status(500).json({ 
      ok: false, 
      error: ERRORS.SERVER.UNKNOWN 
    });
  }
});

// ========== GET RIDES (WITH PAGINATION) ==========
app.get("/api/rides", authenticateToken, async (req, res) => {
  try {
    // Pagination parameters
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;
    
    // Filters
    const filter = {};
    if (req.query.status) {
      filter.status = req.query.status;
    }
    if (req.query.driverPhone) {
      filter.driverPhone = req.query.driverPhone;
    }
    if (req.query.fromDate) {
      filter.createdAt = { $gte: new Date(req.query.fromDate) };
    }
    if (req.query.toDate) {
      filter.createdAt = { 
        ...filter.createdAt, 
        $lte: new Date(req.query.toDate) 
      };
    }
    
    // Query with pagination
    const [rides, total] = await Promise.all([
      Ride.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .select('rideNumber customerName customerPhone pickup destination status price driverPhone createdAt')
        .lean(),
      Ride.countDocuments(filter)
    ]);
    
    logger.action("Rides fetched", { 
      requestId: req.id,
      page, 
      limit, 
      total, 
      resultsCount: rides.length 
    });
    
    res.json({
      ok: true,
      rides,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (err) {
    logger.error("Error fetching rides", { 
      requestId: req.id, 
      error: err.message 
    });
    res.status(500).json({ 
      ok: false, 
      error: ERRORS.SERVER.DATABASE 
    });
  }
});

// ========== CREATE RIDE (ADMIN) ==========
app.post("/api/rides", authenticateToken, async (req, res) => {
  try {
    const { 
      customerName, 
      customerPhone, 
      pickup, 
      destination, 
      scheduledTime, 
      notes, 
      price, 
      commissionRate, 
      sendTo,
      sendToGroup,
      rideType = "regular",
      specialNotes = [],
      groupChat = "default"
    } = req.body;

    // Validation
    if (!customerName || !customerPhone || !pickup || !destination || price === undefined) {
      return res.status(400).json({ 
        ok: false, 
        error: "שדות חובה: שם, טלפון, איסוף, יעד, מחיר" 
      });
    }

    const phoneRegex = /^(0|\+972)?5\d{8}$/;
    if (!phoneRegex.test(customerPhone.replace(/[\s\-]/g, ''))) {
      return res.status(400).json({ 
        ok: false, 
        error: ERRORS.VALIDATION.PHONE 
      });
    }

    if (price < 0) {
      return res.status(400).json({ 
        ok: false, 
        error: ERRORS.VALIDATION.PRICE 
      });
    }

    const commission = Math.round((price || 0) * (commissionRate || 0.10));
    const rideNumber = await rideNumberGenerator.formatRideNumber();
    
    const ride = await Ride.create({
      rideNumber,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      pickup: pickup.trim(),
      destination: destination.trim(),
      scheduledTime: scheduledTime || null,
      notes: notes || null,
      price: price,
      commissionRate: commissionRate || 0.10,
      commissionAmount: commission,
      status: "created",
      rideType,
      specialNotes,
      groupChat,
      createdBy: "admin",
      history: [{ 
        status: "created", 
        by: "admin",
        timestamp: new Date(),
        details: "נסיעה נוצרה מממשק הניהול"
      }]
    });

    logger.success("Ride created by admin", {
      requestId: req.id,
      rideId: ride._id,
      rideNumber: ride.rideNumber
    });

    // Send to drivers
    let phonesToSend = [];
    
    if (sendTo === 'specific' && sendToGroup) {
      const group = await WhatsAppGroup.findById(sendToGroup);
      if (group?.isActive && group.phoneNumbers?.length > 0) {
        phonesToSend = group.phoneNumbers;
      }
    } else {
      const defaultGroup = await WhatsAppGroup.findOne({ isDefault: true, isActive: true });
      if (defaultGroup?.phoneNumbers?.length > 0) {
        phonesToSend = defaultGroup.phoneNumbers;
      } else {
        const drivers = await Driver.find({ isActive: true }, 'phone');
        phonesToSend = drivers.map(d => d.phone);
      }
    }

    let successCount = 0;
    if (phonesToSend.length > 0) {
      const message = createGroupMessage(ride);
      const results = await sendBulkMessagesWithRateLimit(phonesToSend, message);
      successCount = results.success.length;
      
      if (successCount > 0) {
        ride.status = "sent";
        ride.history.push({
          status: "sent",
          by: "system",
          details: `נשלח ל-${successCount} נהגים`,
          timestamp: new Date()
        });
        await ride.save();
      }
    }

    res.json({
      ok: true,
      ride,
      sentCount: successCount
    });
  } catch (err) {
    logger.error("Error creating ride", { 
      requestId: req.id, 
      error: err.message 
    });
    res.status(500).json({ 
      ok: false, 
      error: ERRORS.SERVER.UNKNOWN 
    });
  }
});

// ========== TWILIO WEBHOOK ==========
app.post("/webhook", async (req, res) => {
  try {
    // Validate Twilio signature
    const twilioSignature = req.headers['x-twilio-signature'];
    const url = `${process.env.WEBHOOK_URL || 'https://taxi-system.onrender.com'}/webhook`;
    
    if (twilioSignature) {
      const isValid = twilio.validateRequest(
        process.env.TWILIO_AUTH_TOKEN,
        twilioSignature,
        url,
        req.body
      );
      
      if (!isValid) {
        logger.warn("Invalid Twilio signature", { requestId: req.id });
        return res.sendStatus(403);
      }
    }

    const body = req.body.Body?.trim() || "";
    const from = req.body.From || "";
    
    logger.info("Webhook received", {
      requestId: req.id,
      from,
      body: body.substring(0, 50)
    });

    // Parse command
    const parts = body.split(/\s+/);
    const command = parts[0]?.toUpperCase();
    const rideId = parts[1];

    if (command === "ACCEPT" && rideId) {
      // Driver accepting ride - atomic update to prevent race condition
      const updated = await Ride.findOneAndUpdate(
        { 
          _id: rideId, 
          status: { $in: ["created", "sent"] },
          driverPhone: null  // Ensure no driver has taken it yet
        },
        {
          status: "approved",
          driverPhone: from,
          $push: { 
            history: {
              status: "approved",
              by: from,
              details: "נהג קיבל את הנסיעה",
              timestamp: new Date()
            }
          }
        },
        { new: true }
      );
      
      if (updated) {
        logger.success("Ride accepted", {
          requestId: req.id,
          rideId,
          rideNumber: updated.rideNumber,
          driverPhone: from
        });
        
        // Send private message to driver
        const message = createPrivateMessage(updated);
        await twilioAdapter.sendWhatsAppMessage(from, message);
        
        res.sendStatus(200);
      } else {
        logger.warn("Ride already taken or not found", {
          requestId: req.id,
          rideId,
          from
        });
        
        await twilioAdapter.sendWhatsAppMessage(
          from,
          "⚠️ מצטערים, נסיעה זו כבר נלקחה על ידי נהג אחר"
        );
        
        res.sendStatus(200);
      }
    } else {
      res.sendStatus(200);
    }
  } catch (err) {
    logger.error("Webhook error", { 
      requestId: req.id, 
      error: err.message 
    });
    res.sendStatus(500);
  }
});

// ========== UPDATE RIDE STATUS ==========
app.put("/api/rides/:id/status", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    const validStatuses = ["created", "sent", "approved", "enroute", "arrived", "finished", "commission_paid", "cancelled"];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.RIDE.INVALID_STATUS
      });
    }
    
    const ride = await Ride.findByIdAndUpdate(
      id,
      {
        status,
        $push: {
          history: {
            status,
            by: "admin",
            details: notes || `סטטוס שונה ל-${status}`,
            timestamp: new Date()
          }
        }
      },
      { new: true }
    );
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.RIDE.NOT_FOUND
      });
    }
    
    logger.action("Ride status updated", {
      requestId: req.id,
      rideId: id,
      newStatus: status
    });
    
    res.json({ ok: true, ride });
  } catch (err) {
    logger.error("Error updating ride status", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ========== GET DRIVERS ==========
app.get("/api/drivers", authenticateToken, async (req, res) => {
  try {
    const drivers = await Driver.find()
      .sort({ name: 1 })
      .lean();
    
    res.json({ ok: true, drivers });
  } catch (err) {
    logger.error("Error fetching drivers", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.DATABASE
    });
  }
});

// ========== CREATE DRIVER ==========
app.post("/api/drivers", authenticateToken, async (req, res) => {
  try {
    const { name, phone, licenseNumber } = req.body;
    
    if (!name || !phone) {
      return res.status(400).json({
        ok: false,
        error: "שדות חובה: שם וטלפון"
      });
    }
    
    const phoneRegex = /^(0|\+972)?5\d{8}$/;
    if (!phoneRegex.test(phone.replace(/[\s\-]/g, ''))) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.VALIDATION.PHONE
      });
    }
    
    // Check if phone exists
    const existing = await Driver.findOne({ phone });
    if (existing) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.DRIVER.PHONE_EXISTS
      });
    }
    
    const driver = await Driver.create({
      name: name.trim(),
      phone: phone.trim(),
      licenseNumber: licenseNumber || null,
      isActive: true,
      isBlocked: false
    });
    
    logger.success("Driver created", {
      requestId: req.id,
      driverId: driver._id,
      name: driver.name
    });
    
    res.json({ ok: true, driver });
  } catch (err) {
    logger.error("Error creating driver", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ========== GET GROUPS ==========
app.get("/api/groups", authenticateToken, async (req, res) => {
  try {
    const groups = await WhatsAppGroup.find()
      .sort({ name: 1 })
      .lean();
    
    res.json({ ok: true, groups });
  } catch (err) {
    logger.error("Error fetching groups", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.DATABASE
    });
  }
});

// ========== CREATE GROUP ==========
app.post("/api/groups", authenticateToken, async (req, res) => {
  try {
    const { name, phoneNumbers, isDefault } = req.body;
    
    if (!name || !phoneNumbers || !Array.isArray(phoneNumbers)) {
      return res.status(400).json({
        ok: false,
        error: "שדות חובה: שם ומספרי טלפון"
      });
    }
    
    // Check if name exists
    const existing = await WhatsAppGroup.findOne({ name });
    if (existing) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.GROUP.NAME_EXISTS
      });
    }
    
    // If this should be default, unset other defaults
    if (isDefault) {
      await WhatsAppGroup.updateMany({}, { isDefault: false });
    }
    
    const group = await WhatsAppGroup.create({
      name: name.trim(),
      phoneNumbers,
      isDefault: !!isDefault,
      isActive: true
    });
    
    logger.success("Group created", {
      requestId: req.id,
      groupId: group._id,
      name: group.name
    });
    
    res.json({ ok: true, group });
  } catch (err) {
    logger.error("Error creating group", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ========== ANALYTICS ==========
app.get("/api/analytics", authenticateToken, async (req, res) => {
  try {
    const { period = '7days' } = req.query;
    
    const now = new Date();
    const periods = {
      '24hours': new Date(now - 24 * 60 * 60 * 1000),
      '7days': new Date(now - 7 * 24 * 60 * 60 * 1000),
      '30days': new Date(now - 30 * 24 * 60 * 60 * 1000),
      '90days': new Date(now - 90 * 24 * 60 * 60 * 1000)
    };
    const startDate = periods[period] || periods['7days'];
    
    // Rides by status
    const ridesByStatus = await Ride.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    // Revenue
    const revenue = await Ride.aggregate([
      { 
        $match: { 
          createdAt: { $gte: startDate },
          status: { $in: ['finished', 'commission_paid'] }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$price' },
          totalCommission: { $sum: '$commissionAmount' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Top drivers
    const topDrivers = await Ride.aggregate([
      { 
        $match: { 
          createdAt: { $gte: startDate },
          status: 'finished',
          driverPhone: { $ne: null }
        }
      },
      {
        $group: {
          _id: '$driverPhone',
          ridesCount: { $sum: 1 },
          totalRevenue: { $sum: '$price' }
        }
      },
      { $sort: { ridesCount: -1 } },
      { $limit: 10 }
    ]);
    
    // Add driver names
    for (const driver of topDrivers) {
      const driverDoc = await Driver.findOne({ phone: driver._id });
      driver.name = driverDoc?.name || 'לא ידוע';
    }
    
    res.json({
      ok: true,
      period,
      analytics: {
        ridesByStatus,
        revenue: revenue[0] || { totalRevenue: 0, totalCommission: 0, count: 0 },
        topDrivers
      }
    });
  } catch (err) {
    logger.error("Error getting analytics", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ========== STATISTICS (for dashboard) ==========
app.get("/api/statistics", authenticateToken, async (req, res) => {
  try {
    // Count rides by status
    const ridesCount = await Ride.countDocuments();
    const activeRides = await Ride.countDocuments({ 
      status: { $in: ['sent', 'approved', 'enroute'] } 
    });
    const finishedToday = await Ride.countDocuments({
      status: 'finished',
      createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
    });
    
    // Count drivers
    const driversCount = await Driver.countDocuments();
    const activeDrivers = await Driver.countDocuments({ isActive: true });
    
    // Revenue today
    const revenueToday = await Ride.aggregate([
      {
        $match: {
          status: 'finished',
          createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$price' },
          commission: { $sum: '$commissionAmount' }
        }
      }
    ]);
    
    const todayRevenue = revenueToday[0] || { total: 0, commission: 0 };
    
    res.json({
      ok: true,
      stats: {
        rides: {
          total: ridesCount,
          active: activeRides,
          finishedToday
        },
        drivers: {
          total: driversCount,
          active: activeDrivers
        },
        revenue: {
          today: todayRevenue.total,
          commission: todayRevenue.commission
        }
      }
    });
  } catch (err) {
    logger.error("Error getting statistics", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.DATABASE
    });
  }
});

// ========== ACTIVITIES ==========
app.get("/api/activities", authenticateToken, async (req, res) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    
    const activities = await Activity.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    
    res.json({
      ok: true,
      activities
    });
  } catch (err) {
    logger.error("Error getting activities", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.DATABASE
    });
  }
});

// ========== ADMIN CONTACT ==========
app.get("/api/admin-contact", authenticateToken, async (req, res) => {
  try {
    // Get the first (and should be only) admin contact
    const contact = await AdminContact.findOne().lean();
    
    res.json({
      ok: true,
      contact: contact || null
    });
  } catch (err) {
    logger.error("Error getting admin contact", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.DATABASE
    });
  }
});

app.post("/api/admin-contact", authenticateToken, async (req, res) => {
  try {
    const { adminName, adminPhone, adminEmail, appealMessage } = req.body;
    
    if (!adminName || !adminPhone) {
      return res.status(400).json({
        ok: false,
        error: "שדות חובה: שם וטלפון"
      });
    }
    
    const contact = await AdminContact.create({
      adminName: adminName.trim(),
      adminPhone: adminPhone.trim(),
      adminEmail: adminEmail || null,
      appealMessage: appealMessage || "⚠️ עברתי על התקנות - בקשה להסרת חסימה"
    });
    
    logger.success("Admin contact created", {
      requestId: req.id,
      contactId: contact._id
    });
    
    res.json({
      ok: true,
      contact
    });
  } catch (err) {
    logger.error("Error creating admin contact", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

app.put("/api/admin-contact/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { adminName, adminPhone, adminEmail, appealMessage, isActive } = req.body;
    
    const updateData = {};
    if (adminName !== undefined) updateData.adminName = adminName;
    if (adminPhone !== undefined) updateData.adminPhone = adminPhone;
    if (adminEmail !== undefined) updateData.adminEmail = adminEmail;
    if (appealMessage !== undefined) updateData.appealMessage = appealMessage;
    if (isActive !== undefined) updateData.isActive = isActive;
    updateData.updatedAt = Date.now();
    
    const contact = await AdminContact.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );
    
    if (!contact) {
      return res.status(404).json({
        ok: false,
        error: "איש קשר לא נמצא"
      });
    }
    
    res.json({
      ok: true,
      contact
    });
  } catch (err) {
    logger.error("Error updating admin contact", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

app.delete("/api/admin-contact/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const contact = await AdminContact.findByIdAndDelete(id);
    
    if (!contact) {
      return res.status(404).json({
        ok: false,
        error: "איש קשר לא נמצא"
      });
    }
    
    res.json({
      ok: true,
      message: "איש קשר נמחק בהצלחה"
    });
  } catch (err) {
    logger.error("Error deleting admin contact", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ========== DEFAULT GROUP ==========
app.get("/api/admin/default-group", authenticateToken, async (req, res) => {
  try {
    const defaultGroup = await WhatsAppGroup.findOne({ isDefault: true });
    
    res.json({
      ok: true,
      defaultGroup: defaultGroup || null
    });
  } catch (err) {
    logger.error("Error getting default group", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.DATABASE
    });
  }
});

app.post("/api/admin/default-group", authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.body;
    
    if (!groupId) {
      return res.status(400).json({
        ok: false,
        error: "נדרש מזהה קבוצה"
      });
    }
    
    // Remove default from all groups
    await WhatsAppGroup.updateMany({}, { isDefault: false });
    
    // Set new default
    const group = await WhatsAppGroup.findByIdAndUpdate(
      groupId,
      { isDefault: true },
      { new: true }
    );
    
    if (!group) {
      return res.status(404).json({
        ok: false,
        error: "קבוצה לא נמצאה"
      });
    }
    
    logger.success("Default group updated", {
      requestId: req.id,
      groupId: group._id,
      groupName: group.name
    });
    
    res.json({
      ok: true,
      group
    });
  } catch (err) {
    logger.error("Error setting default group", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ========== UPDATE GROUP ==========
app.put("/api/groups/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phoneNumbers, isDefault, isActive } = req.body;
    
    // If setting as default, unset others
    if (isDefault) {
      await WhatsAppGroup.updateMany(
        { _id: { $ne: id } },
        { isDefault: false }
      );
    }
    
    const group = await WhatsAppGroup.findByIdAndUpdate(
      id,
      { name, phoneNumbers, isDefault, isActive },
      { new: true }
    );
    
    if (!group) {
      return res.status(404).json({
        ok: false,
        error: "קבוצה לא נמצאה"
      });
    }
    
    logger.success("Group updated", {
      requestId: req.id,
      groupId: group._id
    });
    
    res.json({
      ok: true,
      group
    });
  } catch (err) {
    logger.error("Error updating group", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

app.delete("/api/groups/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const group = await WhatsAppGroup.findById(id);
    
    if (!group) {
      return res.status(404).json({
        ok: false,
        error: "קבוצה לא נמצאה"
      });
    }
    
    if (group.isDefault) {
      return res.status(400).json({
        ok: false,
        error: "לא ניתן למחוק את קבוצת ברירת המחדל"
      });
    }
    
    await WhatsAppGroup.findByIdAndDelete(id);
    
    logger.success("Group deleted", {
      requestId: req.id,
      groupId: id
    });
    
    res.json({
      ok: true,
      message: "קבוצה נמחקה בהצלחה"
    });
  } catch (err) {
    logger.error("Error deleting group", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ========== UPDATE DRIVER ==========
app.put("/api/drivers/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, licenseNumber, isActive } = req.body;
    
    const driver = await Driver.findByIdAndUpdate(
      id,
      { name, phone, licenseNumber, isActive },
      { new: true }
    );
    
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: "נהג לא נמצא"
      });
    }
    
    logger.success("Driver updated", {
      requestId: req.id,
      driverId: driver._id
    });
    
    res.json({
      ok: true,
      driver
    });
  } catch (err) {
    logger.error("Error updating driver", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

app.delete("/api/drivers/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if driver has active rides
    const activeRides = await Ride.countDocuments({
      driverPhone: (await Driver.findById(id))?.phone,
      status: { $in: ['approved', 'enroute', 'arrived'] }
    });
    
    if (activeRides > 0) {
      return res.status(400).json({
        ok: false,
        error: "לא ניתן למחוק נהג עם נסיעות פעילות"
      });
    }
    
    await Driver.findByIdAndDelete(id);
    
    logger.success("Driver deleted", {
      requestId: req.id,
      driverId: id
    });
    
    res.json({
      ok: true,
      message: "נהג נמחק בהצלחה"
    });
  } catch (err) {
    logger.error("Error deleting driver", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ========== BLOCK/UNBLOCK DRIVER ==========
app.post("/api/drivers/:id/block", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const driver = await Driver.findById(id);
    
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: "נהג לא נמצא"
      });
    }
    
    driver.isBlocked = true;
    driver.blockReason = reason || 'לא צוין';
    driver.blockedAt = new Date();
    driver.isActive = false;
    await driver.save();
    
    logger.success("Driver blocked", {
      requestId: req.id,
      driverId: id,
      driverName: driver.name,
      reason
    });
    
    res.json({
      ok: true,
      message: "נהג נחסם בהצלחה",
      driver
    });
  } catch (err) {
    logger.error("Error blocking driver", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

app.post("/api/drivers/:id/unblock", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const driver = await Driver.findById(id);
    
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: "נהג לא נמצא"
      });
    }
    
    driver.isBlocked = false;
    driver.blockReason = null;
    driver.blockedAt = null;
    driver.isActive = true;
    await driver.save();
    
    logger.success("Driver unblocked", {
      requestId: req.id,
      driverId: id,
      driverName: driver.name
    });
    
    res.json({
      ok: true,
      message: "חסימת נהג הוסרה",
      driver
    });
  } catch (err) {
    logger.error("Error unblocking driver", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ========== GET SINGLE RIDE ==========
app.get("/api/rides/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const ride = await Ride.findById(id);
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: "נסיעה לא נמצאה"
      });
    }
    
    res.json({
      ok: true,
      ride
    });
  } catch (err) {
    logger.error("Error getting ride", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.DATABASE
    });
  }
});

app.delete("/api/rides/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const ride = await Ride.findById(id);
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: "נסיעה לא נמצאה"
      });
    }
    
    if (!ride.canBeCancelled || !ride.canBeCancelled()) {
      return res.status(400).json({
        ok: false,
        error: "לא ניתן לבטל נסיעה בסטטוס זה"
      });
    }
    
    ride.status = 'cancelled';
    ride.history.push({
      status: 'cancelled',
      by: 'admin',
      details: 'נסיעה בוטלה מממשק הניהול',
      timestamp: new Date()
    });
    await ride.save();
    
    logger.success("Ride cancelled", {
      requestId: req.id,
      rideId: id
    });
    
    res.json({
      ok: true,
      message: "נסיעה בוטלה בהצלחה"
    });
  } catch (err) {
    logger.error("Error cancelling ride", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ===============================================
// 🚫 ERROR HANDLERS
// ===============================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    ok: false, 
    error: "Endpoint לא נמצא",
    path: req.path
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    requestId: req.id,
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  
  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  } else {
    res.status(500).json({
      ok: false,
      error: err.message,
      stack: err.stack
    });
  }
});

// ===============================================
// 🚀 START SERVER
// ===============================================
app.listen(PORT, () => {
  logger.success(`🚀 Server running on port ${PORT}`);
  logger.success(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.success(`📊 Health check: http://localhost:${PORT}/health`);
  console.log('\n✅ Server is ready!\n');
});
