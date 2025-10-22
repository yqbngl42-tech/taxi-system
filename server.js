import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import Ride from "./models/Ride.js";
import Driver from "./models/Driver.js";
import Payment from "./models/Payment.js";
import twilioAdapter from "./utils/twilioAdapter.js";
import cors from "cors";
import twilio from "twilio";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

// 🔐 AUTHENTICATION MIDDLEWARE
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ ok: false, error: "אין טוקן" });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ ok: false, error: "טוקן לא תקין" });
  }
};

// 📍 API 1: LOGIN
app.post("/api/login", async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ ok: false, error: "צריך סיסמה" });
    }
    
    if (password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ ok: false, error: "סיסמה לא נכונה" });
    }
    
    const token = jwt.sign({ user: "admin", role: "admin" }, process.env.JWT_SECRET, { expiresIn: "24h" });
    
    res.json({ ok: true, token });
  } catch (err) {
    console.error("שגיאה בlogin:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 📍 API 2: יצירת נסיעה
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

    if (!customerName || !customerPhone || !pickup || !destination || price === undefined) {
      return res.status(400).json({ 
        ok: false, 
        error: "שדות חובה: customerName, customerPhone, pickup, destination, price" 
      });
    }

    const commission = Math.round((price || 0) * (commissionRate || 0.10));

    const ride = await Ride.create({
      customerName,
      customerPhone,
      pickup,
      destination,
      scheduledTime,
      notes,
      price,
      commissionRate: commissionRate || 0.10,
      commissionAmount: commission,
      status: "created",
      rideType,
      specialNotes,
      groupChat,
      history: [{ status: "created", by: req.user.user }]
    });

    const failedPhones = [];
    const successPhones = [];

    if (sendTo && sendTo.length > 0) {
      for (const phone of sendTo) {
        try {
          const msgBody = createRideMessage(ride, true);
          await twilioAdapter.sendWhatsAppMessage(phone, msgBody);
          successPhones.push(phone);
        } catch (err) {
          console.error("❌ שגיאה בשליחה ל-", phone, err.message);
          failedPhones.push({ phone, error: err.message });
        }
      }
      
      if (successPhones.length > 0) {
        ride.status = "sent";
        ride.history.push({ status: "sent", by: "system", meta: { sentTo: successPhones } });
      }
      
      await ride.save();

      if (failedPhones.length > 0) {
        console.warn("⚠️  חלק מהשליחה נכשלה:", failedPhones);
        return res.json({ 
          ok: true, 
          ride,
          warning: `הנסיעה נוצרה אבל שליחה נכשלה ל-${failedPhones.length} טלפונים`,
          failedPhones
        });
      }
    }

    res.json({ ok: true, ride });
  } catch (err) {
    console.error("שגיאה בעת יצירת נסיעה:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 📍 API 3: קבלת כל הנסיעות
app.get("/api/rides", authenticateToken, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 200, 500);
    const rides = await Ride.find().sort({ createdAt: -1 }).limit(limit);
    res.json(rides);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 📍 API 4: קבלת כל הנהגים
app.get("/api/drivers", authenticateToken, async (req, res) => {
  try {
    const drivers = await Driver.find();
    res.json(drivers);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 📍 API 5: חסימת נהג
app.post("/api/drivers/:id/block", authenticateToken, async (req, res) => {
  try {
    const { reason } = req.body;
    
    if (!reason) {
      return res.status(400).json({ ok: false, error: "צריך סיבה לחסימה" });
    }

    const driver = await Driver.findByIdAndUpdate(
      req.params.id,
      {
        isBlocked: true,
        blockedReason: reason,
        blockedAt: new Date()
      },
      { new: true }
    );

    if (!driver) {
      return res.status(404).json({ ok: false, error: "נהג לא נמצא" });
    }

    res.json({ ok: true, driver });
  } catch (err) {
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
        blockedAt: null
      },
      { new: true }
    );

    if (!driver) {
      return res.status(404).json({ ok: false, error: "נהג לא נמצא" });
    }

    res.json({ ok: true, driver });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 🔗 WEBHOOK: קבלת הודעות מ-Twilio
app.post("/webhook", async (req, res) => {
  try {
    const twilioSignature = req.headers['x-twilio-signature'] || '';
    const url = `${process.env.WEBHOOK_URL || 'http://localhost:3000'}/webhook`;
    
    if (process.env.TWILIO_AUTH_TOKEN && !twilio.validateRequest(
      process.env.TWILIO_AUTH_TOKEN,
      twilioSignature,
      url,
      req.body
    )) {
      console.warn("⚠️  חתימה של Twilio לא תקינה!");
    }

    const body = req.body;
    const from = body.From;
    const messageBody = body.Body?.trim();

    console.log("📞 קיבלנו הודעה:", messageBody, "מ-", from);

    const driver = await Driver.findOne({ phone: from.replace("whatsapp:", "") });
    
    if (driver && driver.isBlocked) {
      await twilioAdapter.sendWhatsAppMessage(
        from,
        `🚫 אתה חסום מלקחת נסיעות.\nסיבה: ${driver.blockedReason}\nלפתרון אנא פנה למנהל התחנה.`
      );
      return res.sendStatus(200);
    }

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
          $push: { history: { status: "approved", by: from } }
        },
        { new: true }
      );

      if (updated) {
        await twilioAdapter.sendWhatsAppMessage(
          from,
          createRideMessage(updated, false)
        );
        console.log("✅ נהג קיבל את הנסיעה!");
      } else {
        await twilioAdapter.sendWhatsAppMessage(
          from,
          "❌ מצטערים - הנסיעה כבר נלקחה על ידי נהג אחר או לא קיימת"
        );
      }
    }

    if (messageBody && messageBody.startsWith("ENROUTE")) {
      const parts = messageBody.split(" ");
      const rideId = parts[1];
      
      if (rideId) {
        await Ride.findByIdAndUpdate(rideId, {
          status: "enroute",
          $push: { history: { status: "enroute", by: from } }
        });
        await twilioAdapter.sendWhatsAppMessage(from, "✓ סטטוס עדכן: בדרך 🚗");
      }
    }

    if (messageBody && messageBody.startsWith("ARRIVED")) {
      const parts = messageBody.split(" ");
      const rideId = parts[1];
      
      if (rideId) {
        await Ride.findByIdAndUpdate(rideId, {
          status: "arrived",
          $push: { history: { status: "arrived", by: from } }
        });
        await twilioAdapter.sendWhatsAppMessage(from, "✓ סטטוס עדכן: הגעתי 📍");
      }
    }

    if (messageBody && messageBody.startsWith("FINISH")) {
      const parts = messageBody.split(" ");
      const rideId = parts[1];
      
      if (rideId) {
        const ride = await Ride.findByIdAndUpdate(rideId, {
          status: "finished",
          $push: { history: { status: "finished", by: from } }
        }, { new: true });

        if (ride) {
          const paymentLink = process.env.BIT_LINK || "https://bit.ly/taxi-payment";
          await twilioAdapter.sendWhatsAppMessage(
            from,
            `💳 נסיעה סיימה!\n\nעמלה: ₪${ride.commissionAmount}\n\n🔗 לחץ לשלם:\n${paymentLink}`
          );
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ webhook error", err);
    res.sendStatus(500);
  }
});

// ✨ Health check endpoint
app.get("/health", (req, res) => {
  res.json({ ok: true, timestamp: new Date() });
});

async function start() {
  try {
    console.log("🔄 התחלת חיבור ל-MongoDB...");
    console.log("📍 כתובת DB:", process.env.MONGODB_URI?.substring(0, 50) + "...");
    
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000
    });
    
    console.log("✅ מחובר ל-MongoDB!");
  } catch (err) {
    console.error("❌ בעיה בחיבור ל-MongoDB:");
    console.error("   קוד שגיאה:", err.code);
    console.error("   הודעה:", err.message);
    console.error("");
    console.error("💡 בדוק:");
    console.error("   1. IP Whitelist ב-MongoDB Atlas");
    console.error("   2. MONGODB_URI בקובץ .env");
    console.error("   3. Credentials (username/password)");
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`🚀 השרת רץ על: http://localhost:${PORT}`);
    console.log(`🔐 כניסה: http://localhost:${PORT}/login.html`);
    console.log(`❤️  Health check: http://localhost:${PORT}/health`);
    console.log("");
    console.log("💡 Webhook URL (עדכן ב-Twilio):");
    console.log(`   POST http://your-server.com/webhook`);
  });
}

function createRideMessage(ride, isGroupMessage = false) {
  const payLink = process.env.BIT_LINK || "https://bit.ly/taxi-payment";
  
  if (isGroupMessage) {
    return `🚖 נסיעה חדשה!
  
📍 איסוף: ${ride.pickup}
🎯 יעד: ${ride.destination}
🕐 שעה: ${ride.scheduledTime || "עכשיו"}
💰 מחיר: ₪${ride.price || "?"}
${ride.rideType !== "regular" ? `🎫 סוג: ${ride.rideType}` : ""}
${ride.specialNotes?.length > 0 ? `📝 הערות: ${ride.specialNotes.join(", ")}` : ""}

💬 לקבלה - כתבו בפרטי:
ACCEPT ${ride._id}`;
  } else {
    return `✅ נסיעה אושרה!

👤 לקוח: ${ride.customerName}
📞 טלפון: ${ride.customerPhone}

📍 איסוף: ${ride.pickup}
🎯 יעד: ${ride.destination}
🕐 שעה: ${ride.scheduledTime || "עכשיו"}

💰 מחיר: ₪${ride.price}
💼 עמלה: ₪${ride.commissionAmount}

${ride.specialNotes?.length > 0 ? `📝 הערות: ${ride.specialNotes.join(", ")}` : ""}

🔗 לתשלום עמלה:
${payLink}`;
  }
}

start().catch(err => {
  console.error("❌ שגיאה קריטית:", err);
  process.exit(1);
});