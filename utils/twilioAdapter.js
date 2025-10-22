import dotenv from 'dotenv';
dotenv.config(); // ⬅️ חובה כדי לטעון את המשתנים מקובץ .env

import twilio from 'twilio';

// 🔐 בדוק שכל ה-credentials קיימים
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM;

// ✅ בדיקה בזמן initialization
if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) {
  console.error('❌ שגיאה: חסרים credentials של Twilio!');
  console.error('   צריך לקבוע:');
  console.error('   - TWILIO_ACCOUNT_SID');
  console.error('   - TWILIO_AUTH_TOKEN');
  console.error('   - TWILIO_WHATSAPP_FROM');
  process.exit(1);
}

// 🌐 יצור client של Twilio
let client;
try {
  client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  console.log('✅ Twilio client initialized');
} catch (err) {
  console.error('❌ שגיאה בהתחברות ל-Twilio:', err.message);
  process.exit(1);
}

// 📞 Regex patterns
const PHONE_REGEX = /^(\+?972|0)?([1-9]\d{1,9})$/;
const MESSAGE_MAX_LENGTH = 4096; // WhatsApp limit
const MESSAGE_MIN_LENGTH = 1;

export default {
  /**
   * שלח הודעה ב-WhatsApp
   * @param {string} toPhone - טלפון היעד
   * @param {string} messageText - תוכן ההודעה
   * @param {number} retryCount - כמה פעמים לנסות שוב
   * @returns {Promise<string>} - SID של ההודעה
   */
  sendWhatsAppMessage: async (toPhone, messageText, retryCount = 3) => {
    try {
      // ✅ בדיקה 1: האם ההודעה קיימת ותקינה
      if (!messageText || typeof messageText !== 'string') {
        throw new Error('❌ ההודעה צריכה להיות טקסט תקין');
      }

      if (messageText.trim().length < MESSAGE_MIN_LENGTH) {
        throw new Error('❌ ההודעה ריקה');
      }

      if (messageText.length > MESSAGE_MAX_LENGTH) {
        throw new Error(`❌ ההודעה ארוכה מדי (מקסימום ${MESSAGE_MAX_LENGTH} תווים)`);
      }

      // ✅ בדיקה 2: התקנת טלפון תקין
      const formattedPhone = formatPhoneNumber(toPhone);
      if (!formattedPhone) {
        throw new Error(`❌ טלפון לא תקין: ${toPhone}`);
      }

      // ✅ בדיקה 3: עיבוד הטלפון ל-WhatsApp format
      let to = formattedPhone;
      if (!to.startsWith('whatsapp:')) {
        to = 'whatsapp:' + to;
      }

      const from = TWILIO_WHATSAPP_FROM;

      console.log(`📞 שולח הודעה ל-${to}`);
      console.log(`   מ-${from}`);
      console.log(`   אורך ההודעה: ${messageText.length} תווים`);

      // 🔄 ניסיון עם retry logic
      let lastError;
      for (let attempt = 1; attempt <= retryCount; attempt++) {
        try {
          const message = await client.messages.create({
            from: from,
            to: to,
            body: messageText
          });

          if (!message.sid) {
            throw new Error('❌ לא קיבלנו SID מ-Twilio');
          }

          console.log(`✅ הודעה נשלחה בהצלחה!`);
          console.log(`   SID: ${message.sid}`);
          console.log(`   סטטוס: ${message.status}`);
          console.log(`   זמן: ${message.dateCreated}`);

          return message.sid;
        } catch (err) {
          lastError = err;
          console.warn(`⚠️  ניסיון ${attempt}/${retryCount} נכשל: ${err.message}`);
          
          // אם זה לא שגיאת חיבור, אל תנסה שוב
          if (err.code && ![20003, 20006, 50003].includes(err.code)) {
            throw err;
          }

          // המתן קצת לפני הנסיון הבא
          if (attempt < retryCount) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }
        }
      }

      throw lastError || new Error('❌ נכשלו כל ניסיונות השליחה');

    } catch (err) {
      console.error(`❌ שגיאה בשליחת הודעה:`);
      console.error(`   שגיאה: ${err.message}`);
      console.error(`   קוד Twilio: ${err.code || 'לא מוגדר'}`);
      console.error(`   סטטוס: ${err.status || 'לא מוגדר'}`);
      
      throw {
        message: err.message,
        code: err.code,
        status: err.status,
        originalError: err
      };
    }
  },

  /**
   * בדוק אם טלפון תקין
   * @param {string} phone - טלפון לבדיקה
   * @returns {boolean}
   */
  isValidPhone: (phone) => {
    if (!phone || typeof phone !== 'string') {
      return false;
    }

    // נקה את הטלפון מתווים לא רלוונטיים
    const cleaned = phone.replace(/[\s\-()]/g, '');

    // בדוק עם regex
    return PHONE_REGEX.test(cleaned);
  },

  /**
   * בדוק את ה-credentials
   * @returns {Promise<boolean>}
   */
  checkCredentials: async () => {
    try {
      console.log('🔍 בדיקת Twilio credentials...');

      if (!TWILIO_ACCOUNT_SID) {
        throw new Error('❌ TWILIO_ACCOUNT_SID לא מוגדר');
      }

      if (!TWILIO_AUTH_TOKEN) {
        throw new Error('❌ TWILIO_AUTH_TOKEN לא מוגדר');
      }

      if (!TWILIO_WHATSAPP_FROM) {
        throw new Error('❌ TWILIO_WHATSAPP_FROM לא מוגדר');
      }

      // בדוק חיבור ל-Twilio
      const account = await client.api.accounts.list({ limit: 1 });
      
      if (account.length === 0) {
        throw new Error('❌ לא יכול להתחבר ל-Twilio');
      }

      console.log('✅ Twilio credentials תקינים!');
      console.log(`   Account: ${account[0].friendlyName}`);
      console.log(`   WhatsApp From: ${TWILIO_WHATSAPP_FROM}`);

      return true;
    } catch (err) {
      console.error('❌ שגיאה בבדיקת credentials:', err.message);
      return false;
    }
  },

  /**
   * שלח הודעה קבוצתית לכמה טלפונים
   * @param {array} phoneList - רשימת טלפונים
   * @param {string} messageText - תוכן ההודעה
   * @returns {Promise<object>} - תוצאות שליחה
   */
  sendBulkMessages: async (phoneList, messageText) => {
    try {
      if (!Array.isArray(phoneList) || phoneList.length === 0) {
        throw new Error('❌ רשימת טלפונים ריקה או לא תקינה');
      }

      console.log(`📢 שליחת הודעה קבוצתית ל-${phoneList.length} מספרים...`);

      const results = {
        success: [],
        failed: []
      };

      for (const phone of phoneList) {
        try {
          const sid = await exports.default.sendWhatsAppMessage(phone, messageText);
          results.success.push({ phone, sid });
        } catch (err) {
          results.failed.push({ 
            phone, 
            error: err.message || err 
          });
        }

        // המתן קצת בין הודעות כדי לא ללחוץ על Twilio
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log(`✅ שליחה הסתיימה: ${results.success.length} בהצלחה, ${results.failed.length} נכשלו`);

      return results;
    } catch (err) {
      console.error('❌ שגיאה בשליחה קבוצתית:', err.message);
      throw err;
    }
  },

  /**
   * קבל אינפורמציה על הודעה
   * @param {string} messageSid - SID של ההודעה
   * @returns {Promise<object>}
   */
  getMessageStatus: async (messageSid) => {
    try {
      if (!messageSid) {
        throw new Error('❌ חסר messageSid');
      }

      const message = await client.messages(messageSid).fetch();

      console.log(`📊 סטטוס הודעה: ${messageSid}`);
      console.log(`   סטטוס: ${message.status}`);
      console.log(`   אל: ${message.to}`);
      console.log(`   מ: ${message.from}`);

      return {
        sid: message.sid,
        status: message.status,
        to: message.to,
        from: message.from,
        body: message.body,
        sentAt: message.dateSent,
        createdAt: message.dateCreated,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage
      };
    } catch (err) {
      console.error('❌ שגיאה בקבלת סטטוס:', err.message);
      throw err;
    }
  },

  /**
   * התחל listener לקבלת הודעות נכנסות (Webhook)
   * @returns {object}
   */
  getWebhookValidator: () => {
    return {
      /**
       * בדוק אם Webhook תקין
       * @param {string} signature - חתימה מ-Twilio
       * @param {string} url - URL של ה-webhook
       * @param {object} params - פרמטרים של ה-request
       * @returns {boolean}
       */
      validateRequest: (signature, url, params) => {
        try {
          return twilio.validateRequest(
            TWILIO_AUTH_TOKEN,
            signature,
            url,
            params
          );
        } catch (err) {
          console.error('❌ שגיאה בבדיקת Webhook:', err.message);
          return false;
        }
      }
    };
  }
};

// 🛠️ Helper Functions
/**
 * עיצוב טלפון לפורמט תקני
 * @param {string} phone - טלפון ברוט
 * @returns {string|null} - טלפון מעוצב או null אם לא תקין
 */
function formatPhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') {
    return null;
  }

  // נקה מתווים לא רלוונטיים
  let cleaned = phone.replace(/[\s\-()]/g, '');

  // אם כבר בפורמט whatsapp:, הסר את זה
  if (cleaned.startsWith('whatsapp:')) {
    cleaned = cleaned.replace('whatsapp:', '');
  }

  // בדוק אם הטלפון תקין
  if (!PHONE_REGEX.test(cleaned)) {
    console.warn(`⚠️ טלפון לא תקין: ${phone}`);
    return null;
  }

  // המיר לפורמט בינלאומי +972
  if (cleaned.startsWith('0')) {
    return '+972' + cleaned.substring(1);
  }

  if (!cleaned.startsWith('+')) {
    return '+' + cleaned;
  }

  return cleaned;
}

// 📋 Export הכל
export { formatPhoneNumber };