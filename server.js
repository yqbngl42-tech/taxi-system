import dotenv from "dotenv";
dotenv.config();

import express from "express";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import Ride from "./models/Ride.js";
import Driver from "./models/Driver.js";
import Payment from "./models/Payment.js";
import WhatsAppGroup from "./models/WhatsAppGroup.js";
import AdminContact from "./models/AdminContact.js";
import twilioAdapter from "./utils/twilioAdapter.js";
import logger from "./utils/logger.js";
import rateLimiter from "./utils/rateLimiter.js";
import rideNumberGenerator from "./utils/rideNumberGenerator.js";
import cors from "cors";
import twilio from "twilio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// 🔐 MIDDLEWARE SECURITY
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors({
  origin: function(origin, callback) {
    // allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000', 
      'http://localhost:3001',
      'http://localhost:5500',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:5500'
    ];
    
    if (process.env.NODE_ENV === 'production') {
      // בפרודקשן - אתר הלקוחות שלך
      allowedOrigins.push(process.env.FRONTEND_URL || 'https://your-client-domain.com');
    }
    
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.static(path.join(__dirname, "public")));

// 🛡️ Rate Limiting - 100 requests per minute (חכם יותר)
app.use(rateLimiter.middleware(100, 60000));

// 🛡️ Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// 🔐 AUTHENTICATION MIDDLEWARE
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ ok: false, error: "אין טוקן - נדרשת כניסה" });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.exp && Date.now() >= decoded.exp * 1000) {
      return res.status(401).json({ ok: false, error: "הטוקן פקע - נדרשת כניסה חדשה" });
    }
    
    req.user = decoded;
    next();
  } catch (err) {
    logger.error("שגיאת טוקן", err);
    return res.status(403).json({ ok: false, error: "טוקן לא תקין או פקע" });
  }
};

// 📍 API 1: LOGIN - כניסה לממשק
app.post("/api/login", async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ ok: false, error: "צריך הזן סיסמה" });
    }
    
    if (password !== process.env.ADMIN_PASSWORD) {
      logger.warn("ניסיון כניסה עם סיסמה שגויה");
      return res.status(401).json({ ok: false, error: "סיסמה לא נכונה" });
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
    
    logger.success("כניסה בהצלחה");
    res.json({ 
      ok: true, 
      token,
      expiresIn: 86400,
      message: "כניסה בהצלחה!"
    });
  } catch (err) {
    logger.error("שגיאה בlogin", err);
    res.status(500).json({ ok: false, error: "שגיאה בשרת" });
  }
});

// 📍 API 2B: יציאה
app.post("/api/logout", authenticateToken, (req, res) => {
  try {
    logger.action("משתמש התנתק");
    res.json({ ok: true, message: "התנתקת בהצלחה" });
  } catch (err) {
    res.status(500).json({ ok: false, error: "שגיאה בהתנתקות" });
  }
});

// 📍 API 2C: קבלת רשימת קבוצות WhatsApp (ללקוחות - ללא auth)
app.get("/api/client/groups", async (req, res) => {
  try {
    const groups = await WhatsAppGroup.find({ isActive: true }, 'name _id');
    res.json({ ok: true, groups });
  } catch (err) {
    logger.error("שגיאה בקבלת קבוצות", err);
    res.status(500).json({ ok: false, error: "שגיאה בשרת" });
  }
});

// 📍 API 2D: יצירת נסיעה מאתר הלקוחות (ללא auth)
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

    // ✅ בדיקה שכל השדות חובה קיימים
    if (!customerName || !customerPhone || !pickup || !destination) {
      return res.status(400).json({ 
        ok: false, 
        error: "שדות חובה: שם, טלפון, איסוף, יעד" 
      });
    }

    // ✅ בדיקה שהטלפון בן 10 ספרות
    const phoneRegex = /^(0|\+972)?5\d{8}$/;
    if (!phoneRegex.test(customerPhone.replace(/[\s\-]/g, ''))) {
      return res.status(400).json({ ok: false, error: "טלפון לא תקין" });
    }

    // ✅ בדיקה שהשם לא ריק
    if (customerName.trim().length < 2) {
      return res.status(400).json({ ok: false, error: "שם קצר מדי" });
    }

    // קבל מספר סידורי
    const rideNumber = await rideNumberGenerator.formatRideNumber();
    
    // מחיר ברירת מחדל ללקוח (יוכל להיות מחושב מהמערכת)
    const defaultPrice = 50; // ניתן לחשב לפי מרחק בהמשך

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

    let successCount = 0;
    const failedPhones = [];
    let phonesToSend = [];

    // אם בחרו קבוצה
    if (sendToGroup) {
      try {
        const group = await WhatsAppGroup.findById(sendToGroup);
        if (group && group.isActive && group.phoneNumbers && group.phoneNumbers.length > 0) {
          phonesToSend = group.phoneNumbers;
          logger.action("שליחה לקבוצה מאתר לקוחות", { 
            groupName: group.name, 
            count: phonesToSend.length,
            rideNumber 
          });
        } else {
          return res.status(400).json({ 
            ok: false, 
            error: "קבוצה לא קיימת או ריקה" 
          });
        }
      } catch (err) {
        logger.error("שגיאה בחיפוש קבוצה", err);
        return res.status(400).json({ ok: false, error: "קבוצה לא תקינה" });
      }
    } else {
      // אם לא בחרו - שלח לקבוצה ברירת מחדל
      try {
        const defaultGroup = await WhatsAppGroup.findOne({ isDefault: true, isActive: true });
        if (defaultGroup && defaultGroup.phoneNumbers && defaultGroup.phoneNumbers.length > 0) {
          phonesToSend = defaultGroup.phoneNumbers;
          logger.action("שליחה לקבוצה ברירת מחדל", { 
            groupName: defaultGroup.name,
            count: phonesToSend.length,
            rideNumber 
          });
        }
      } catch (err) {
        logger.error("שגיאה בקבלת קבוצה ברירת מחדל", err);
      }
    }

    // שלח הודעות לנהגים בקבוצה
    if (phonesToSend.length > 0) {
      for (const phone of phonesToSend) {
        try {
          const msgBody = createGroupMessage(ride);
          await twilioAdapter.sendWhatsAppMessage(phone, msgBody);
          successCount++;
        } catch (err) {
          logger.warn("שגיאה בשליחה לטלפון", { phone, error: err.message });
          failedPhones.push(phone);
        }
      }
      
      if (successCount > 0) {
        ride.status = "sent";
        ride.history.push({ 
          status: "sent", 
          by: "system",
          details: `נשלח ל-${successCount} נהגים בקבוצה`,
          timestamp: new Date()
        });
        await ride.save();
        logger.success("נסיעה נשלחה מאתר לקוחות", { 
          rideId: ride._id, 
          rideNumber, 
          sentCount: successCount 
        });
      }
    }

    res.json({ 
      ok: true, 
      ride,
      rideNumber: ride.rideNumber,
      sentCount: successCount,
      failedCount: failedPhones.length,
      message: successCount > 0 
        ? `✅ הנסיעה הזומנה! מספר נסיעה: ${ride.rideNumber}` 
        : "⚠️ נסיעה נוצרה אך לא נשלחה לנהגים"
    });
  } catch (err) {
    logger.error("שגיאה בעת יצירת נסיעה מאתר לקוחות", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 📍 API 3: יצירת נסיעה חדשה
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

    // ✅ בדיקה שכל השדות קיימים
    if (!customerName || !customerPhone || !pickup || !destination || price === undefined) {
      return res.status(400).json({ 
        ok: false, 
        error: "שדות חובה: שם, טלפון, איסוף, יעד, מחיר" 
      });
    }

    // ✅ בדיקה שהטלפון בן 9-10 ספרות
    const phoneRegex = /^(0|\+972)?5\d{8}$/;
    if (!phoneRegex.test(customerPhone.replace(/[\s\-]/g, ''))) {
      return res.status(400).json({ ok: false, error: "טלפון לא תקין" });
    }

    // ✅ בדיקה שהמחיר חיובי
    if (price < 0) {
      return res.status(400).json({ ok: false, error: "המחיר צריך להיות חיובי" });
    }

    const commission = Math.round((price || 0) * (commissionRate || 0.10));
    
    // קבל מספר סידורי
    const rideNumber = await rideNumberGenerator.formatRideNumber();

    const ride = await Ride.create({
      rideNumber,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      pickup: pickup.trim(),
      destination: destination.trim(),
      scheduledTime: scheduledTime || null,
      notes: notes || null,
      price,
      commissionRate: commissionRate || 0.10,
      commissionAmount: commission,
      status: "created",
      rideType,
      specialNotes: specialNotes.filter(s => s),
      groupChat,
      createdBy: req.user.user,
      history: [{ 
        status: "created", 
        by: req.user.user,
        timestamp: new Date()
      }]
    });

    let successCount = 0;
    const failedPhones = [];
    let phonesToSend = [];

    // אם בחרו קבוצה
    if (sendToGroup) {
      try {
        const group = await WhatsAppGroup.findById(sendToGroup);
        if (group && group.isActive) {
          phonesToSend = group.phoneNumbers;
          logger.action("ניסיון שליחה לקבוצה", { groupName: group.name, count: phonesToSend.length });
        }
      } catch (err) {
        logger.error("שגיאה בחיפוש קבוצה", err);
      }
    }
    
    // או טלפונים בודדים
    if (sendTo && sendTo.length > 0 && phonesToSend.length === 0) {
      phonesToSend = sendTo;
    }

    // שלח הודעות לנהגים
    if (phonesToSend.length > 0) {
      for (const phone of phonesToSend) {
        try {
          const msgBody = createGroupMessage(ride);
          await twilioAdapter.sendWhatsAppMessage(phone, msgBody);
          successCount++;
        } catch (err) {
          logger.warn("שגיאה בשליחה לטלפון", { phone, error: err.message });
          failedPhones.push(phone);
        }
      }
      
      if (successCount > 0) {
        ride.status = "sent";
        ride.history.push({ 
          status: "sent", 
          by: "system",
          details: `נשלח ל-${successCount} נהגים`,
          timestamp: new Date()
        });
        await ride.save();
        logger.success("נסיעה נשלחה", { rideId: ride._id, rideNumber, sentCount: successCount });
      }
    }

    res.json({ 
      ok: true, 
      ride,
      sentCount: successCount,
      failedCount: failedPhones.length,
      message: successCount > 0 ? "✅ הנסיעה נשלחה!" : "⚠️ לא נשלחה לנהגים"
    });
  } catch (err) {
    logger.error("שגיאה בעת יצירת נסיעה", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 📍 API 4: קבלת כל הנסיעות (עם חיפוש מתקדם)
app.get("/api/rides", authenticateToken, async (req, res) => {
  try {
    const { 
      status, 
      limit = 200, 
      skip = 0,
      search,
      rideType,
      startDate,
      endDate,
      driverPhone
    } = req.query;
    
    const query = {};
    
    if (status) query.status = status;
    if (rideType) query.rideType = rideType;
    if (driverPhone) query.driverPhone = driverPhone;
    
    // חיפוש בשם או טלפון לקוח
    if (search) {
      query.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { customerPhone: { $regex: search, $options: 'i' } },
        { pickup: { $regex: search, $options: 'i' } },
        { destination: { $regex: search, $options: 'i' } },
        { rideNumber: { $regex: search, $options: 'i' } }
      ];
    }
    
    // חיפוש לפי תאריך
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    const rides = await Ride.find(query)
      .sort({ createdAt: -1 })
      .skip(parseInt(skip))
      .limit(Math.min(parseInt(limit), 500));

    const total = await Ride.countDocuments(query);

    res.json({ 
      ok: true,
      rides, 
      total,
      count: rides.length
    });
  } catch (err) {
    logger.error("שגיאה בקבלת נסיעות", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 📍 API 5: חסימת נהג
app.post("/api/drivers/:id/block", authenticateToken, async (req, res) => {
  try {
    const { reason } = req.body;
    
    if (!reason || reason.length < 3) {
      return res.status(400).json({ ok: false, error: "צריך סיבה תקינה (3 תווים לפחות)" });
    }

    const driver = await Driver.findByIdAndUpdate(
      req.params.id,
      {
        isBlocked: true,
        blockedReason: reason,
        blockedAt: new Date(),
        blockedBy: req.user.user
      },
      { new: true }
    );

    if (!driver) {
      return res.status(404).json({ ok: false, error: "נהג לא נמצא" });
    }

    logger.action("נהג חסום", { driverName: driver.name, reason });
    res.json({ ok: true, driver, message: "נהג חסום בהצלחה" });
  } catch (err) {
    logger.error("שגיאה בחסימה", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 📍 API 6: הסרת חסימה
app.post("/api/drivers/:id/unblock", authenticateToken, async (req, res) => {
  try {
    const driver = await Driver.findByIdAndUpdate(
      req.params.id,
      {
        isBlocked: false,
        blockedReason: null,
        blockedAt: null,
        blockedBy: null
      },
      { new: true }
    );

    if (!driver) {
      return res.status(404).json({ ok: false, error: "נהג לא נמצא" });
    }

    logger.action("חסימה הוסרה", { driverName: driver.name });
    res.json({ ok: true, driver, message: "חסימה הוסרה בהצלחה" });
  } catch (err) {
    logger.error("שגיאה בהסרת חסימה", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 📍 API 8: עדכון סטטוס נסיעה
app.patch("/api/rides/:id/status", authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;
    
    const validStatuses = ["created", "sent", "approved", "enroute", "arrived", "finished", "commission_paid", "cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ ok: false, error: "סטטוס לא תקין" });
    }

    const ride = await Ride.findByIdAndUpdate(
      req.params.id,
      {
        status,
        $push: { 
          history: { 
            status, 
            by: req.user.user,
            timestamp: new Date()
          } 
        }
      },
      { new: true }
    );

    if (!ride) {
      return res.status(404).json({ ok: false, error: "נסיעה לא נמצאה" });
    }

    logger.action("סטטוס עודכן", { rideNumber: ride.rideNumber, newStatus: status });
    res.json({ ok: true, ride, message: "סטטוס עודכן" });
  } catch (err) {
    logger.error("שגיאה בעדכון סטטוס", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============ API: ניהול קבוצות WhatsApp ============

// 📍 API 9: קבלת כל הקבוצות
app.get("/api/groups", authenticateToken, async (req, res) => {
  try {
    const groups = await WhatsAppGroup.find().sort({ name: 1 });
    res.json({ ok: true, groups, count: groups.length });
  } catch (err) {
    logger.error("שגיאה בקבלת קבוצות", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 📍 API 10: יצירת קבוצה חדשה
app.post("/api/groups", authenticateToken, async (req, res) => {
  try {
    const { name, description, phoneNumbers } = req.body;
    
    if (!name || !phoneNumbers || phoneNumbers.length === 0) {
      return res.status(400).json({ ok: false, error: "צריך שם וטלפונים" });
    }

    // בדוק שהשם ייחודי
    const existing = await WhatsAppGroup.findOne({ name });
    if (existing) {
      return res.status(400).json({ ok: false, error: "קבוצה בשם זה כבר קיימת" });
    }

    const group = await WhatsAppGroup.create({
      name: name.trim(),
      description: description || null,
      phoneNumbers,
      membersCount: phoneNumbers.length,
      createdBy: req.user.user
    });

    logger.action("קבוצה חדשה נוצרה", { groupName: name, membersCount: phoneNumbers.length });
    res.json({ ok: true, group, message: "קבוצה נוצרה בהצלחה" });
  } catch (err) {
    logger.error("שגיאה ביצירת קבוצה", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 📍 API 11: עדכון קבוצה
app.patch("/api/groups/:id", authenticateToken, async (req, res) => {
  try {
    const { name, description, phoneNumbers, isActive } = req.body;

    const group = await WhatsAppGroup.findByIdAndUpdate(
      req.params.id,
      {
        name: name ? name.trim() : undefined,
        description: description || undefined,
        phoneNumbers: phoneNumbers || undefined,
        membersCount: phoneNumbers ? phoneNumbers.length : undefined,
        isActive: isActive !== undefined ? isActive : undefined,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!group) {
      return res.status(404).json({ ok: false, error: "קבוצה לא נמצאה" });
    }

    logger.action("קבוצה עודכנה", { groupName: group.name });
    res.json({ ok: true, group, message: "קבוצה עודכנה בהצלחה" });
  } catch (err) {
    logger.error("שגיאה בעדכון קבוצה", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 📍 API 12: מחיקת קבוצה
app.delete("/api/groups/:id", authenticateToken, async (req, res) => {
  try {
    const group = await WhatsAppGroup.findByIdAndDelete(req.params.id);

    if (!group) {
      return res.status(404).json({ ok: false, error: "קבוצה לא נמצאה" });
    }

    logger.action("קבוצה נמחקה", { groupName: group.name });
    res.json({ ok: true, message: "קבוצה נמחקה בהצלחה" });
  } catch (err) {
    logger.error("שגיאה במחיקת קבוצה", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 📍 API 13: הוספת טלפון לקבוצה
app.post("/api/groups/:id/add-phone", authenticateToken, async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ ok: false, error: "חסר טלפון" });
    }

    const group = await WhatsAppGroup.findByIdAndUpdate(
      req.params.id,
      {
        $addToSet: { phoneNumbers: phone },
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!group) {
      return res.status(404).json({ ok: false, error: "קבוצה לא נמצאה" });
    }

    group.membersCount = group.phoneNumbers.length;
    await group.save();

    logger.action("טלפון נוסף לקבוצה", { groupName: group.name, phone });
    res.json({ ok: true, group, message: "טלפון נוסף בהצלחה" });
  } catch (err) {
    logger.error("שגיאה בהוספת טלפון", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 📍 API 14: הסרת טלפון מקבוצה
app.post("/api/groups/:id/remove-phone", authenticateToken, async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ ok: false, error: "חסר טלפון" });
    }

    const group = await WhatsAppGroup.findByIdAndUpdate(
      req.params.id,
      {
        $pull: { phoneNumbers: phone },
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!group) {
      return res.status(404).json({ ok: false, error: "קבוצה לא נמצאה" });
    }

    group.membersCount = group.phoneNumbers.length;
    await group.save();

    logger.action("טלפון הוסר מקבוצה", { groupName: group.name, phone });
    res.json({ ok: true, group, message: "טלפון הוסר בהצלחה" });
  } catch (err) {
    logger.error("שגיאה בהסרת טלפון", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============ API: ניהול נהגים (CRUD) ============

// 📍 API 12: קבלת כל הנהגים (עם חיפוש וסינון)
app.get("/api/drivers", authenticateToken, async (req, res) => {
  try {
    const { search, isActive, isBlocked, limit = 100, skip = 0 } = req.query;
    
    const query = {};
    
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (isBlocked !== undefined) query.isBlocked = isBlocked === 'true';
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    
    const drivers = await Driver.find(query).limit(parseInt(limit)).skip(parseInt(skip)).sort({ createdAt: -1 });
    const total = await Driver.countDocuments(query);
    
    logger.action("קבלת רשימת נהגים", { total, returned: drivers.length });
    res.json({ ok: true, drivers, total, count: drivers.length });
  } catch (err) {
    logger.error("שגיאה בקבלת רשימת נהגים", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 📍 API 13: הוספת נהג חדש
app.post("/api/drivers", authenticateToken, async (req, res) => {
  try {
    const { name, phone } = req.body;
    
    // ✅ Validation
    if (!name || !phone) {
      return res.status(400).json({ ok: false, error: "חובה: שם וטלפון" });
    }
    
    if (name.trim().length < 2) {
      return res.status(400).json({ ok: false, error: "השם צריך להיות בן 2 תווים לפחות" });
    }
    
    const phoneRegex = /^(0|\+972)?5\d{8}$/;
    if (!phoneRegex.test(phone.replace(/[\s\-]/g, ''))) {
      return res.status(400).json({ ok: false, error: "טלפון לא תקין" });
    }
    
    // בדוק אם הנהג קיים
    const existingDriver = await Driver.findOne({ phone: phone.trim() });
    if (existingDriver) {
      return res.status(409).json({ ok: false, error: "נהג עם טלפון זה קיים כבר" });
    }
    
    const driver = await Driver.create({
      name: name.trim(),
      phone: phone.trim(),
      isActive: true,
      rating: 5,
      totalRides: 0,
      totalEarnings: 0,
      commissionPaid: 0
    });
    
    logger.success("נהג חדש נוסף", { driverName: driver.name, phone: driver.phone });
    res.status(201).json({ ok: true, driver, message: "נהג הוסף בהצלחה ✅" });
  } catch (err) {
    logger.error("שגיאה בהוספת נהג", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 📍 API 14: עדכון נהג
app.patch("/api/drivers/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, isActive, isBlocked, blockedReason } = req.body;
    
    if (!id) {
      return res.status(400).json({ ok: false, error: "חסר ID של נהג" });
    }
    
    const updates = {};
    if (name) updates.name = name.trim();
    if (isActive !== undefined) updates.isActive = isActive;
    if (isBlocked !== undefined) {
      updates.isBlocked = isBlocked;
      if (isBlocked) {
        updates.blockedAt = new Date();
        updates.blockedReason = blockedReason || "חסום על ידי מנהל";
        updates.blockedBy = req.user.user;
      } else {
        updates.blockedAt = null;
        updates.blockedReason = null;
      }
    }
    updates.updatedAt = new Date();
    
    const driver = await Driver.findByIdAndUpdate(id, updates, { new: true });
    
    if (!driver) {
      return res.status(404).json({ ok: false, error: "נהג לא נמצא" });
    }
    
    logger.action("נהג עודכן", { driverName: driver.name, id });
    res.json({ ok: true, driver, message: "נהג עודכן בהצלחה ✅" });
  } catch (err) {
    logger.error("שגיאה בעדכון נהג", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 📍 API 15: מחיקת נהג
app.delete("/api/drivers/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ ok: false, error: "חסר ID של נהג" });
    }
    
    // בדוק אם לנהג זה יש נסיעות פעילות
    const activeRides = await Ride.countDocuments({ 
      driverPhone: { $exists: true, $ne: null },
      status: { $in: ["sent", "approved", "enroute", "arrived"] }
    });
    
    if (activeRides > 0) {
      return res.status(409).json({ 
        ok: false, 
        error: `לא יכול למחוק נהג עם נסיעות פעילות (${activeRides} נסיעות)` 
      });
    }
    
    const driver = await Driver.findByIdAndDelete(id);
    
    if (!driver) {
      return res.status(404).json({ ok: false, error: "נהג לא נמצא" });
    }
    
    logger.success("נהג נמחק", { driverName: driver.name, id });
    res.json({ ok: true, message: `נהג "${driver.name}" נמחק בהצלחה ✅` });
  } catch (err) {
    logger.error("שגיאה במחיקת נהג", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============ API: ניהול פרטי אדמין ============

// 📍 API 16: קבלת פרטי אדמין
app.get("/api/admin-contact", authenticateToken, async (req, res) => {
  try {
    let contact = await AdminContact.findOne();
    
    if (!contact) {
      contact = await AdminContact.create({
        adminName: "מנהל התחנה",
        adminPhone: "+972500000000"
      });
    }

    res.json({ ok: true, contact });
  } catch (err) {
    logger.error("שגיאה בקבלת פרטי אדמין", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 📍 API 17: עדכון פרטי אדמין
app.patch("/api/admin-contact", authenticateToken, async (req, res) => {
  try {
    const { adminName, adminPhone, adminEmail, appealMessage } = req.body;

    let contact = await AdminContact.findOne();
    
    if (!contact) {
      contact = await AdminContact.create({
        adminName: adminName || "מנהל התחנה",
        adminPhone: adminPhone || "+972500000000"
      });
    } else {
      if (adminName) contact.adminName = adminName;
      if (adminPhone) contact.adminPhone = adminPhone;
      if (adminEmail) contact.adminEmail = adminEmail;
      if (appealMessage) contact.appealMessage = appealMessage;
      contact.updatedAt = new Date();
      await contact.save();
    }

    logger.action("פרטי אדמין עודכנו", { adminName: contact.adminName });
    res.json({ ok: true, contact, message: "פרטים עודכנו בהצלחה" });
  } catch (err) {
    logger.error("שגיאה בעדכון פרטי אדמין", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 🔗 WEBHOOK: קבלת הודעות מ-Twilio (משודרג עם כל ה-statusים)
app.post("/webhook", async (req, res) => {
  try {
    const twilioSignature = req.headers['x-twilio-signature'] || '';
    const url = `${process.env.WEBHOOK_URL}/webhook`;
    
    if (process.env.TWILIO_AUTH_TOKEN && process.env.NODE_ENV === 'production') {
      if (!twilio.validateRequest(
        process.env.TWILIO_AUTH_TOKEN,
        twilioSignature,
        url,
        req.body
      )) {
        logger.warn("חתימת Twilio לא תקינה");
        return res.sendStatus(403);
      }
    }

    const body = req.body;
    const from = body.From;
    const messageBody = body.Body?.trim();

    logger.info("הודעה מ-Twilio", { from, message: messageBody });

    // בדוק אם הנהג חסום
    const driver = await Driver.findOne({ phone: from.replace("whatsapp:", "") });
    
    if (driver && driver.isBlocked) {
      const adminContact = await AdminContact.findOne();
      const appealMsg = adminContact?.appealMessage || "⚠️ עברתי על התקנות - בקשה להסרת חסימה";
      
      await twilioAdapter.sendWhatsAppMessage(
        from,
        `🚫 אתה חסום מלקחת נסיעות.\n\nסיבה: ${driver.blockedReason}\n\nלערעור: ${adminContact?.adminPhone}\n\n${appealMsg}`
      );
      return res.sendStatus(200);
    }

    // ============ קבלת נסיעה (ACCEPT) ============
    if (messageBody && messageBody.startsWith("ACCEPT")) {
      const parts = messageBody.split(" ");
      const rideId = parts[1];

      if (!rideId) {
        await twilioAdapter.sendWhatsAppMessage(from, "❌ שגיאה: ID נסיעה לא תקין");
        return res.sendStatus(200);
      }

      try {
        // 🛡️ Race Condition Protection - atomic update
        const updated = await Ride.findOneAndUpdate(
          { 
            _id: rideId, 
            status: { $in: ["created", "sent"] },
            driverPhone: { $in: [null, undefined] }  // וודא שלא יש נהג
          },
          {
            status: "approved",
            driverPhone: from.replace("whatsapp:", ""),
            $push: { history: { status: "approved", by: from, timestamp: new Date() } }
          },
          { new: true }
        );

        if (updated) {
          // שלח פרטים מלאים בפרטי
          await twilioAdapter.sendWhatsAppMessage(
            from,
            createPrivateMessage(updated)
          );
          
          logger.action("נהג קיבל נסיעה", { rideNumber: updated.rideNumber, driverPhone: from });
        } else {
          await twilioAdapter.sendWhatsAppMessage(
            from,
            "❌ מצטערים - הנסיעה כבר נלקחה על ידי נהג אחר או לא קיימת"
          );
        }
      } catch (err) {
        logger.error("שגיאה בקבלת נסיעה", err);
        await twilioAdapter.sendWhatsAppMessage(from, "❌ שגיאה בעדכון הנסיעה");
      }
    }

    // ============ נהג בדרך (ENROUTE) ============
    if (messageBody && messageBody.startsWith("ENROUTE")) {
      const parts = messageBody.split(" ");
      const rideId = parts[1];

      if (!rideId) {
        await twilioAdapter.sendWhatsAppMessage(from, "❌ שגיאה: ID נסיעה לא תקין");
        return res.sendStatus(200);
      }

      try {
        const updated = await Ride.findByIdAndUpdate(
          rideId,
          {
            status: "enroute",
            $push: { history: { status: "enroute", by: from, timestamp: new Date(), details: "בדרך לאיסוף" } }
          },
          { new: true }
        );

        if (updated) {
          await twilioAdapter.sendWhatsAppMessage(
            from,
            `✅ סטטוס עודכן: בדרך! 🚗\n\n📍 אל: ${updated.destination}`
          );
          logger.action("נהג בדרך", { rideNumber: updated.rideNumber, driverPhone: from });
        } else {
          await twilioAdapter.sendWhatsAppMessage(from, "❌ נסיעה לא נמצאה");
        }
      } catch (err) {
        logger.error("שגיאה בעדכון ENROUTE", err);
        await twilioAdapter.sendWhatsAppMessage(from, "❌ שגיאה בעדכון הנסיעה");
      }
    }

    // ============ נהג הגיע (ARRIVED) ============
    if (messageBody && messageBody.startsWith("ARRIVED")) {
      const parts = messageBody.split(" ");
      const rideId = parts[1];

      if (!rideId) {
        await twilioAdapter.sendWhatsAppMessage(from, "❌ שגיאה: ID נסיעה לא תקין");
        return res.sendStatus(200);
      }

      try {
        const updated = await Ride.findByIdAndUpdate(
          rideId,
          {
            status: "arrived",
            $push: { history: { status: "arrived", by: from, timestamp: new Date(), details: "הגיע ליעד" } }
          },
          { new: true }
        );

        if (updated) {
          await twilioAdapter.sendWhatsAppMessage(
            from,
            `✅ סטטוס עודכן: הגעתי! 📍\n\n👤 לקוח: ${updated.customerName}`
          );
          logger.action("נהג הגיע", { rideNumber: updated.rideNumber, driverPhone: from });
        } else {
          await twilioAdapter.sendWhatsAppMessage(from, "❌ נסיעה לא נמצאה");
        }
      } catch (err) {
        logger.error("שגיאה בעדכון ARRIVED", err);
        await twilioAdapter.sendWhatsAppMessage(from, "❌ שגיאה בעדכון הנסיעה");
      }
    }

    // ============ סיום נסיעה (FINISH) ============
    if (messageBody && messageBody.startsWith("FINISH")) {
      const parts = messageBody.split(" ");
      const rideId = parts[1];

      if (!rideId) {
        await twilioAdapter.sendWhatsAppMessage(from, "❌ שגיאה: ID נסיעה לא תקין");
        return res.sendStatus(200);
      }

      try {
        const ride = await Ride.findByIdAndUpdate(
          rideId,
          {
            status: "finished",
            $push: { history: { status: "finished", by: from, timestamp: new Date(), details: "סיימנו את הנסיעה" } }
          },
          { new: true }
        );

        if (ride) {
          const paymentLink = process.env.BIT_LINK || "https://bit.ly/taxi-payment";
          await twilioAdapter.sendWhatsAppMessage(
            from,
            `✅ נסיעה סיימה! 🎉\n\n📍 מיקום: ${ride.destination}\n💳 עמלה: ₪${ride.commissionAmount}\n\n🔗 לתשלום:\n${paymentLink}\n\nתודה! 🙏`
          );
          logger.action("סיום נסיעה", { rideNumber: ride.rideNumber, commission: ride.commissionAmount });
        } else {
          await twilioAdapter.sendWhatsAppMessage(from, "❌ נסיעה לא נמצאה");
        }
      } catch (err) {
        logger.error("שגיאה בסיום נסיעה", err);
        await twilioAdapter.sendWhatsAppMessage(from, "❌ שגיאה בעדכון הנסיעה");
      }
    }

    // ============ סימון עמלה כשולמה (PAID) ============
    if (messageBody && messageBody.startsWith("PAID")) {
      const parts = messageBody.split(" ");
      const rideId = parts[1];

      if (!rideId) {
        await twilioAdapter.sendWhatsAppMessage(from, "❌ שגיאה: ID נסיעה לא תקין");
        return res.sendStatus(200);
      }

      try {
        const ride = await Ride.findByIdAndUpdate(
          rideId,
          {
            status: "commission_paid",
            $push: { history: { status: "commission_paid", by: from, timestamp: new Date(), details: "עמלה שולמה" } }
          },
          { new: true }
        );

        if (ride) {
          await twilioAdapter.sendWhatsAppMessage(
            from,
            `✅ תודה על התשלום! 💰\n\nעמלה שולמה: ₪${ride.commissionAmount}\n\nהצלחה בנסיעות הבאות! 🚗`
          );
          
          // עדכן את דוח הנהג
          if (driver) {
            driver.commissionPaid += ride.commissionAmount;
            driver.totalRides += 1;
            driver.totalEarnings += ride.price;
            await driver.save();
          }
          
          logger.success("עמלה סומנה כשולמה", { rideNumber: ride.rideNumber, amount: ride.commissionAmount });
        } else {
          await twilioAdapter.sendWhatsAppMessage(from, "❌ נסיעה לא נמצאה");
        }
      } catch (err) {
        logger.error("שגיאה בסימון עמלה", err);
        await twilioAdapter.sendWhatsAppMessage(from, "❌ שגיאה בעדכון התשלום");
      }
    }

    // ============ ביטול נסיעה (CANCEL) ============
    if (messageBody && messageBody.startsWith("CANCEL")) {
      const parts = messageBody.split(" ");
      const rideId = parts[1];

      if (!rideId) {
        await twilioAdapter.sendWhatsAppMessage(from, "❌ שגיאה: ID נסיעה לא תקין");
        return res.sendStatus(200);
      }

      try {
        const ride = await Ride.findByIdAndUpdate(
          rideId,
          {
            status: "cancelled",
            driverPhone: null,
            $push: { history: { status: "cancelled", by: from, timestamp: new Date(), details: "ביטול על ידי נהג" } }
          },
          { new: true }
        );

        if (ride) {
          await twilioAdapter.sendWhatsAppMessage(
            from,
            `⚠️ הנסיעה בוטלה בהצלחה\n\nמצטערים שזה לא עבד! 😔`
          );
          logger.warn("נסיעה בוטלה על ידי נהג", { rideNumber: ride.rideNumber });
        } else {
          await twilioAdapter.sendWhatsAppMessage(from, "❌ נסיעה לא נמצאה");
        }
      } catch (err) {
        logger.error("שגיאה בביטול נסיעה", err);
        await twilioAdapter.sendWhatsAppMessage(from, "❌ שגיאה בביטול הנסיעה");
      }
    }

    res.sendStatus(200);
  } catch (err) {
    logger.error("שגיאה בWebhook", err);
    res.sendStatus(500);
  }
});

// ❤️ Health Check
app.get("/api/health", (req, res) => {
  res.json({ 
    ok: true, 
    timestamp: new Date().toISOString(),
    status: "Server is running 🚀"
  });
});

// 📊 Get Statistics
app.get("/api/statistics", authenticateToken, async (req, res) => {
  try {
    const totalRides = await Ride.countDocuments();
    const completedRides = await Ride.countDocuments({ status: "finished" });
    const activeDrivers = await Driver.countDocuments({ isActive: true, isBlocked: false });
    const blockedDrivers = await Driver.countDocuments({ isBlocked: true });
    const totalGroups = await WhatsAppGroup.countDocuments({ isActive: true });
    
    const totalEarnings = await Ride.aggregate([
      { $group: { _id: null, total: { $sum: "$price" } } }
    ]);

    const totalCommission = await Ride.aggregate([
      { $group: { _id: null, total: { $sum: "$commissionAmount" } } }
    ]);

    const ridesByType = await Ride.aggregate([
      { $group: { _id: "$rideType", count: { $sum: 1 } } }
    ]);

    res.json({
      ok: true,
      statistics: {
        totalRides,
        completedRides,
        completionRate: totalRides > 0 ? ((completedRides / totalRides) * 100).toFixed(2) + '%' : '0%',
        activeDrivers,
        blockedDrivers,
        totalEarnings: totalEarnings[0]?.total || 0,
        totalCommission: totalCommission[0]?.total || 0,
        totalGroups,
        ridesByType
      }
    });
  } catch (err) {
    logger.error("שגיאה בסטטיסטיקה", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 🌍 404 Handler
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Endpoint לא נמצא" });
});

// 📢 Error Handler
app.use((err, req, res, next) => {
  logger.error("שגיאה לא צפויה", err);
  res.status(500).json({ 
    ok: false, 
    error: "שגיאה בשרת",
    message: process.env.NODE_ENV === 'development' ? err.message : 'אנא נסה שוב'
  });
});

// 🚀 START SERVER
async function start() {
  try {
    logger.info("התחלת חיבור ל-MongoDB...");

    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000
    });

    logger.success("מחובר ל-MongoDB!");

    const BASE_URL = process.env.WEBHOOK_URL || `http://localhost:${PORT}`;
    const ENV = process.env.NODE_ENV || 'development';

    app.listen(PORT, () => {
      console.log(`\n🌍 מצב סביבתי: ${ENV}`);
      console.log(`🚀 השרת רץ על: ${BASE_URL}`);
      console.log(`🔐 כניסה: ${BASE_URL}/login.html`);
      console.log(`❤️  Health: ${BASE_URL}/api/health`);
      console.log(`📊 סטטיסטיקה: ${BASE_URL}/api/statistics\n`);
    });
  } catch (err) {
    logger.error("בעיה בחיבור ל-MongoDB", err);
    process.exit(1);
  }
}

start();

// ✨ Helper Functions
function createGroupMessage(ride) {
  return `🚖 נסיעה חדשה! ${ride.rideNumber}

📍 איסוף: ${ride.pickup}
🎯 יעד: ${ride.destination}
🕐 שעה: ${ride.scheduledTime || 'עכשיו'}
💰 מחיר: ₪${ride.price}
${ride.rideType !== "regular" ? `🎫 סוג: ${ride.rideType}` : ""}

💬 לקבלה - כתבו בפרטי:
ACCEPT ${ride._id}`;
}

function createPrivateMessage(ride) {
  const payLink = process.env.BIT_LINK || "https://bit.ly/taxi-payment";
  
  return `✅ נסיעה אושרה! ${ride.rideNumber}

👤 לקוח: ${ride.customerName}
📞 טלפון: ${ride.customerPhone}

📍 איסוף: ${ride.pickup}
🎯 יעד: ${ride.destination}
🕐 שעה: ${ride.scheduledTime || 'עכשיו'}

💰 מחיר: ₪${ride.price}
💼 עמלה: ₪${ride.commissionAmount}

${ride.specialNotes?.length > 0 ? `📝 הערות: ${ride.specialNotes.join(", ")}` : ""}

🔗 לתשלום:
${payLink}`;
}