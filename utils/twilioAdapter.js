import Twilio from "twilio";

// 🔐 התחברות ל-Twilio עם credentials מ-.env
const client = Twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const fromWhatsApp = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+1415238886";

// 📞 ממשק שליחת הודעות WhatsApp
export default {
  /**
   * שלח הודעה ב-WhatsApp
   * @param {string} toPhone - טלפון היעד
   * @param {string} messageText - תוכן ההודעה
   * @returns {Promise<string>} - SID של ההודעה
   */
  sendWhatsAppMessage: async (toPhone, messageText) => {
    try {
      // עיבוד טלפון - הוסף whatsapp: אם חסר
      let to = toPhone;
      if (!to.startsWith("whatsapp:")) {
        to = "whatsapp:" + toPhone;
      }

      // עדכן את המשתמש בתהליך
      console.log("📞 שולח הודעה לטלפון:", to);
      console.log("📝 תוכן ההודעה:", messageText);

      // שלח ההודעה דרך Twilio API
      const message = await client.messages.create({
        from: fromWhatsApp,
        to: to,
        body: messageText
      });

      // בדוק אם נשלחה בהצלחה
      if (message.sid) {
        console.log("✅ הודעה נשלחה בהצלחה!");
        console.log("📌 SID:", message.sid);
        console.log("⏰ זמן שליחה:", message.dateCreated);
        return message.sid;
      } else {
        throw new Error("לא קיבלנו SID מ-Twilio");
      }

    } catch (err) {
      console.error("❌ שגיאה בשליחת הודעה:", err.message);
      console.error("🔍 פרטי שגיאה:", err);
      throw err;
    }
  },

  /**
   * בדוק אם טלפון תקין
   * @param {string} phone - טלפון לבדיקה
   * @returns {boolean}
   */
  isValidPhone: (phone) => {
    const phoneRegex = /^(\+|0)?\d{10,13}$/;
    return phoneRegex.test(phone.replace(/\D/g, ''));
  }
};