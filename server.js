import dotenv from "dotenv";
dotenv.config(); // ⬅️ חייב להיות לפני כל שימוש ב־process.env

import express from "express";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import Ride from "./models/Ride.js";
import Driver from "./models/Driver.js";
import Payment from "./models/Payment.js";
import twilioAdapter from "./utils/twilioAdapter.js";
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
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));
app.use(express.static(path.join(__dirname, "public")));

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
    
    // בדוק אם התוקן לא פקע
    if (decoded.exp && Date.now() >= decoded.exp * 1000) {
      return res.status(401).json({ ok: false, error: "הטוקן פקע - נדרשת כניסה חדשה" });
    }
    
    req.user = decoded;
    next();
  } catch (err) {
    console.error("🔴 שגיאת טוקן:", err.message);
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
    
    // בדוק סיסמה
    if (password !== process.env.ADMIN_PASSWORD) {
      console.warn("⚠️ ניסיון כניסה עם סיסמה שגויה");
      return res.status(401).json({ ok: false, error: "סיסמה לא נכונה" });
    }
    
    // צור טוקן עם תוקף של 24 שעות
    const token = jwt.sign(
      { 
        user: "admin", 
        role: "admin",
        loginTime: new Date().toISOString()
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: "24h" }
    );
    
    console.log("✅ כניסה בהצלחה!");
    res.json({ 
      ok: true, 
      token,
      expiresIn: 86400, // 24 שעות בשניות
      message: "כניסה בהצלחה!"
    });
  } catch (err) {
    console.error("❌ שגיאה בlogin:", err);
    res.status(500).json({ ok: false, error: "שגיאה בשרת" });
  }
});

// 📍 API 2: LOGOUT - יציאה
app.post("/api/logout", authenticateToken, (req, res) => {
  try {
    console.log("👋 משתמש התנתק");
    res.json({ ok: true, message: "התנתקת בהצלחה" });
  } catch (err) {
    res.status(500).json({ ok: false, error: "שגיאה בהתנתקות" });
  }
});

// 📍 API 3: יצירת נסיעה
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

    const ride = await Ride.create({
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

    // שלח הודעות לנהגים
    if (sendTo && sendTo.length > 0) {
      for (const phone of sendTo) {
        try {
          const msgBody = createGroupMessage(ride);
          await twilioAdapter.sendWhatsAppMessage(phone, msgBody);
          successCount++;
        } catch (err) {
          console.error("❌ שגיאה בשליחה ל-", phone, err.message);
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
      }
    }

    console.log(`✅ נסיעה נוצרה: ${ride._id} - נשלח ל-${successCount} נהגים`);

    res.json({ 
      ok: true, 
      ride,
      sentCount: successCount,
      failedCount: failedPhones.length,
      message: successCount > 0 ? "✅ הנסיעה נשלחה!" : "⚠️ לא נשלחה לנהגים"
    });
  } catch (err) {
    console.error("❌ שגיאה בעת יצירת נסיעה:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 📍 API 4: קבלת כל הנסיעות
app.get("/api/rides", authenticateToken, async (req, res) => {
  try {
    const { status, limit = 200, skip = 0 } = req.query;
    
    const query = {};
    if (status) query.status = status;
    
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
    console.error("❌ שגיאה בקבלת נסיעות:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 📍 API 5: קבלת כל הנהגים
app.get("/api/drivers", authenticateToken, async (req, res) => {
  try {
    const drivers = await Driver.find().select('-blockedReason');
    res.json({ ok: true, drivers, count: drivers.length });
  } catch (err) {
    console.error("❌ שגיאה בקבלת נהגים:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 📍 API 6: חסימת נהג
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

    console.log(`🚫 נהג חסום: ${driver.name}`);
    res.json({ ok: true, driver, message: "נהג חסום בהצלחה" });
  } catch (err) {
    console.error("❌ שגיאה בחסימה:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 📍 API 7: הסרת חסימה
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

    console.log(`🔓 חסימה הוסרה: ${driver.name}`);
    res.json({ ok: true, driver, message: "חסימה הוסרה בהצלחה" });
  } catch (err) {
    console.error("❌ שגיאה בהסרת חסימה:", err);
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

    res.json({ ok: true, ride, message: "סטטוס עודכן" });
  } catch (err) {
    console.error("❌ שגיאה בעדכון סטטוס:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 🔗 WEBHOOK: קבלת הודעות מ-Twilio
app.post("/webhook", async (req, res) => {
  try {
    // ✅ בדיקת חתימה של Twilio (Security!)
    const twilioSignature = req.headers['x-twilio-signature'] || '';
    const url = `${process.env.WEBHOOK_URL}/webhook`;
    
    // תוקפות בדיקה בלבד אם יש את ה-token
    if (process.env.TWILIO_AUTH_TOKEN && process.env.NODE_ENV === 'production') {
      if (!twilio.validateRequest(
        process.env.TWILIO_AUTH_TOKEN,
        twilioSignature,
        url,
        req.body
      )) {
        console.warn("⚠️ חתימה של Twilio לא תקינה!");
        return res.sendStatus(403);
      }
    }

    const body = req.body;
    const from = body.From;
    const messageBody = body.Body?.trim();

    console.log("📞 הודעה מ-Twilio:", messageBody, "מ-", from);

    // בדוק אם הנהג חסום
    const driver = await Driver.findOne({ phone: from.replace("whatsapp:", "") });
    
    if (driver && driver.isBlocked) {
      await twilioAdapter.sendWhatsAppMessage(
        from,
        `🚫 אתה חסום מלקחת נסיעות.\n\nסיבה: ${driver.blockedReason}\n\nלפתרון אנא פנה למנהל התחנה.`
      );
      return res.sendStatus(200);
    }

    // קבלת נסיעה
    if (messageBody && messageBody.startsWith("ACCEPT")) {
      const parts = messageBody.split(" ");
      const rideId = parts[1];

      if (!rideId) {
        await twilioAdapter.sendWhatsAppMessage(from, "❌ שגיאה: ID נסיעה לא תקין");
        return res.sendStatus(200);
      }

      const updated = await Ride.findOneAndUpdate(
        { _id: rideId, status: { $in: ["created", "sent"] } },
        {
          status: "approved",
          driverPhone: from.replace("whatsapp:", ""),
          $push: { history: { status: "approved", by: from, timestamp: new Date() } }
        },
        { new: true }
      );

      if (updated) {
        await twilioAdapter.sendWhatsAppMessage(
          from,
          createPrivateMessage(updated)
        );
        console.log("✅ נהג קיבל את הנסיעה!");
      } else {
        await twilioAdapter.sendWhatsAppMessage(
          from,
          "❌ מצטערים - הנסיעה כבר נלקחה על ידי נהג אחר או לא קיימת"
        );
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ שגיאה בWebhook:", err);
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
    const totalEarnings = await Ride.aggregate([
      { $group: { _id: null, total: { $sum: "$price" } } }
    ]);

    res.json({
      ok: true,
      statistics: {
        totalRides,
        completedRides,
        completionRate: totalRides > 0 ? ((completedRides / totalRides) * 100).toFixed(2) + '%' : '0%',
        activeDrivers,
        totalEarnings: totalEarnings[0]?.total || 0
      }
    });
  } catch (err) {
    console.error("❌ שגיאה בסטטיסטיקה:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 🌍 404 Handler
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Endpoint לא נמצא" });
});

// 📢 Error Handler
app.use((err, req, res, next) => {
  console.error("❌ שגיאה:", err);
  res.status(500).json({ 
    ok: false, 
    error: "שגיאה בשרת",
    message: process.env.NODE_ENV === 'development' ? err.message : 'אנא נסה שוב'
  });
});

// 🚀 START SERVER
async function start() {
  try {
    console.log("🔄 התחלת חיבור ל-MongoDB...");
    
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000
    });
    
    console.log("✅ מחובר ל-MongoDB!");
    
    app.listen(PORT, () => {
      console.log(`\n🚀 השרת רץ על: http://localhost:${PORT}`);
      console.log(`🔐 כניסה: http://localhost:${PORT}/login.html`);
      console.log(`❤️  Health: http://localhost:${PORT}/api/health`);
      console.log(`📊 סטטיסטיקה: http://localhost:${PORT}/api/statistics\n`);
    });
  } catch (err) {
    console.error("\n❌ בעיה בחיבור ל-MongoDB:");
    console.error("   קוד שגיאה:", err.code);
    console.error("   הודעה:", err.message);
    console.error("\n💡 בדוק:");
    console.error("   1. IP Whitelist ב-MongoDB Atlas");
    console.error("   2. MONGODB_URI בקובץ .env");
    console.error("   3. Credentials (username/password)\n");
    process.exit(1);
  }
}

start();

// ✨ Helper Functions
function createGroupMessage(ride) {
  return `🚖 נסיעה חדשה!

📍 איסוף: ${ride.pickup}
🎯 יעד: ${ride.destination}
🕐 שעה: ${ride.scheduledTime || 'עכשיו'}
💰 מחיר: ₪${ride.price}
${ride.rideType !== "regular" ? `🎫 סוג: ${ride.rideType}` : ""}
${ride.specialNotes?.length > 0 ? `📝 הערות: ${ride.specialNotes.join(", ")}` : ""}

💬 לקבלה - כתבו בפרטי:
ACCEPT ${ride._id}`;
}

function createPrivateMessage(ride) {
  const payLink = process.env.BIT_LINK || "https://bit.ly/taxi-payment";
  
  return `✅ נסיעה אושרה!

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