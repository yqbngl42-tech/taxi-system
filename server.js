import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import Ride from "./models/Ride.js";
import Driver from "./models/Driver.js";
import Payment from "./models/Payment.js";
import twilioAdapter from "./utils/twilioAdapter.js";
import cors from "cors";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ מחובר ל-MongoDB!");
  } catch (err) {
    console.error("❌ בעיה בחיבור ל-MongoDB:", err);
    process.exit(1);
  }

  // ============================================
  // 📍 API 1: יצירת נסיעה חדשה
  // אבא יוצר נסיעה - ונשלח לנהגים ב-WhatsApp
  // ============================================
  app.post("/api/rides", async (req, res) => {
    try {
      const { customerName, customerPhone, pickup, destination, scheduledTime, notes, price, commissionRate, sendTo } = req.body;

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
        history: [{ status: "created", by: "admin" }]
      });

      // 📞 שלח הודעות לנהגים דרך Twilio
      if (sendTo && sendTo.length > 0) {
        for (const phone of sendTo) {
          try {
            const msgBody = createRideMessage(ride);
            await twilioAdapter.sendWhatsAppMessage(phone, msgBody);
          } catch (err) {
            console.error("שגיאה בשליחה ל-", phone, err);
          }
        }
        ride.status = "sent";
        ride.history.push({ status: "sent", by: "system" });
        await ride.save();
      }

      res.json({ ok: true, ride });
    } catch (err) {
      console.error("שגיאה:", err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ============================================
  // 📍 API 2: קבלת כל הנסיעות
  // אבא רוצה לראות את הטבלה בדאשבורד
  // ============================================
  app.get("/api/rides", async (req, res) => {
    try {
      const rides = await Ride.find().sort({ createdAt: -1 }).limit(200);
      res.json(rides);
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ============================================
  // 📍 WEBHOOK: קבלת הודעות מ-Twilio
  // 🚕 הנהג כתב בWhatsApp - קיבלנו את ההודעה כאן!
  // ============================================
  app.post("/webhook", async (req, res) => {
    try {
      const body = req.body;
      const from = body.From; // מי שלח (הנהג)
      const messageBody = body.Body?.trim(); // מה הוא כתב

      console.log("📞 קיבלנו הודעה:", messageBody, "מ-", from);

      // ============================================
      // עיבוד: ACCEPT - נהג קיבל נסיעה
      // ============================================
      if (messageBody && messageBody.startsWith("ACCEPT")) {
        const parts = messageBody.split(" ");
        const rideId = parts[1];

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
          // ✅ הנסיעה אושרה!
          await twilioAdapter.sendWhatsAppMessage(
            from,
            `✅ תודה! הנסיעה אושרה!\n📍 ${updated.pickup} → ${updated.destination}\n💰 עמלה: ₪${updated.commissionAmount}`
          );
          console.log("✅ נהג קיבל את הנסיעה!");
        } else {
          // ❌ הנסיעה כבר נלקחה על ידי נהג אחר
          await twilioAdapter.sendWhatsAppMessage(
            from,
            "❌ מצטערים - הנסיעה כבר נלקחה על ידי נהג אחר"
          );
          console.log("❌ נסיעה כבר נלקחה!");
        }
      }

      // ============================================
      // עיבוד: ENROUTE - נהג בדרך
      // ============================================
      if (messageBody && messageBody.startsWith("ENROUTE")) {
        const parts = messageBody.split(" ");
        const rideId = parts[1];
        await Ride.findByIdAndUpdate(rideId, {
          status: "enroute",
          $push: { history: { status: "enroute", by: from } }
        });
        await twilioAdapter.sendWhatsAppMessage(from, "✓ סטטוס עדכן: בדרך 🚗");
        console.log("🚗 נהג בדרך!");
      }

      // ============================================
      // עיבוד: ARRIVED - נהג הגיע
      // ============================================
      if (messageBody && messageBody.startsWith("ARRIVED")) {
        const parts = messageBody.split(" ");
        const rideId = parts[1];
        await Ride.findByIdAndUpdate(rideId, {
          status: "arrived",
          $push: { history: { status: "arrived", by: from } }
        });
        await twilioAdapter.sendWhatsAppMessage(from, "✓ סטטוס עדכן: הגעתי 📍");
        console.log("📍 נהג הגיע!");
      }

      // ============================================
      // עיבוד: FINISH - נסיעה סגורה
      // ============================================
      if (messageBody && messageBody.startsWith("FINISH")) {
        const parts = messageBody.split(" ");
        const rideId = parts[1];
        const ride = await Ride.findByIdAndUpdate(rideId, {
          status: "finished",
          $push: { history: { status: "finished", by: from } }
        });

        const paymentLink = process.env.BIT_LINK || "https://bit.ly/taxi-payment";
        await twilioAdapter.sendWhatsAppMessage(
          from,
          `💳 נסיעה סיימה!\n\nעמלה: ₪${ride?.commissionAmount}\n\n🔗 לחץ לשלם:\n${paymentLink}`
        );
        console.log("🏁 נסיעה סגורה!");
      }

      res.sendStatus(200);
    } catch (err) {
      console.error("webhook error", err);
      res.sendStatus(500);
    }
  });

  // ============================================
  // 📍 API 3: דיווח תשלום
  // נהג משלם - אנחנו משמרים את זה
  // ============================================
  app.post("/api/rides/:id/report-paid", async (req, res) => {
    try {
      const { method, amount, driverPhone } = req.body;
      const ride = await Ride.findById(req.params.id);

      if (!ride) return res.status(404).json({ ok: false });

      ride.status = "commission_paid";
      ride.history.push({ status: "commission_paid", by: driverPhone, meta: { method, amount } });
      await ride.save();

      await Payment.create({ rideId: ride._id, driverPhone, amount, method, paidAt: new Date() });

      res.json({ ok: true, message: "תשלום נשמר!" });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.listen(PORT, () => {
    console.log(`🚀 השרת רץ על: http://localhost:${PORT}`);
    console.log(`📊 דאשבורד: http://localhost:${PORT}`);
    console.log(`📞 Webhook ל-Twilio: http://localhost:${PORT}/webhook`);
  });
}

// ============================================
// 🎬 יצירת הודעת נסיעה
// זה מה שהנהג מקבל בWhatsApp
// ============================================
function createRideMessage(ride) {
  const payLink = process.env.BIT_LINK || "https://bit.ly/taxi-payment";
  return `🚖 נסיעה חדשה!
  
📍 איסוף: ${ride.pickup}
🎯 יעד: ${ride.destination}
🕐 שעה: ${ride.scheduledTime || "עכשיו"}
💰 מחיר: ₪${ride.price || "?"}
💼 עמלה: ₪${ride.commissionAmount}

לקבלת הנסיעה - כתבו בWhatsApp:
ACCEPT ${ride._id}

🔗 קישור לתשלום:
${payLink}`;
}

start().catch(err => console.error("❌ שגיאה:", err));