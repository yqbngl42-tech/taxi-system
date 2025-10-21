import Twilio from "twilio";

// 🔐 התחברות ל-Twilio
const client = Twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const fromWhatsApp = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+13156311617";

export default {
  // 📞 שליחת הודעה ב-WhatsApp
  sendWhatsAppMessage: async (toPhone, messageText) => {
    try {
      // 🔧 ניקוי ועיבוד מספר הטלפון
      let to = toPhone.trim();

      // אם המספר מתחיל ב-whatsapp: נוריד את זה זמנית כדי לבדוק את הפורמט
      if (to.startsWith("whatsapp:")) {
        to = to.slice(9);
      }

      // אם המספר מתחיל ב-0 (למשל 054...) – נהפוך אותו לקידומת בינלאומית
      if (to.startsWith("0")) {
        to = "+972" + to.slice(1);
      }

      // אם המספר לא מתחיל ב-+ נוסיף אותו
      if (!to.startsWith("+")) {
        to = "+" + to;
      }

      // עכשיו נוסיף את whatsapp: בצורה תקינה
      to = "whatsapp:" + to;

      console.log("📞 שולח לטלפון:", to);
      console.log("📝 הודעה:", messageText);

      // 🚀 שלח ההודעה
      const message = await client.messages.create({
        from: fromWhatsApp,
        to: to,
        body: messageText
      });

      console.log("✅ הודעה נשלחה בהצלחה! SID:", message.sid);
      return message.sid;
    } catch (err) {
      console.error("❌ שגיאה בשליחה:", err.message);
      throw err;
    }
  }
};