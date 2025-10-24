import dotenv from 'dotenv';
dotenv.config();

import twilioAdapter from './utils/twilioAdapter.js';

async function testTwilio() {
  console.log('\n🔍 בדיקת Twilio Configuration...\n');
  
  // 1. בדיקת Environment Variables
  console.log('📋 Environment Variables:');
  console.log('  TWILIO_ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID ? '✅ קיים' : '❌ חסר');
  console.log('  TWILIO_AUTH_TOKEN:', process.env.TWILIO_AUTH_TOKEN ? '✅ קיים' : '❌ חסר');
  console.log('  TWILIO_WHATSAPP_FROM:', process.env.TWILIO_WHATSAPP_FROM || '❌ חסר');
  console.log('  WEBHOOK_URL:', process.env.WEBHOOK_URL || '❌ חסר');
  console.log('  NODE_ENV:', process.env.NODE_ENV || 'לא מוגדר');
  
  // 2. בדיקת Credentials
  console.log('\n🔐 בדיקת Credentials...');
  try {
    const isValid = await twilioAdapter.checkCredentials();
    if (isValid) {
      console.log('✅ Credentials תקינים!');
    } else {
      console.log('❌ Credentials לא תקינים!');
      return;
    }
  } catch (err) {
    console.error('❌ שגיאה בבדיקת credentials:', err.message);
    return;
  }
  
  // 3. בדיקת שליחת הודעת טסט
  console.log('\n📱 שליחת הודעת טסט...');
  console.log('⚠️  הזן מספר טלפון לטסט (או CTRL+C לביטול):');
  
  // קרא מספר מהמשתמש
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  rl.question('מספר טלפון (דוגמה: +972501234567): ', async (phone) => {
    if (!phone || phone.trim() === '') {
      console.log('❌ לא הוזן מספר טלפון');
      rl.close();
      return;
    }
    
    try {
      console.log(`\n📤 שולח הודעה ל-${phone}...`);
      
      const sid = await twilioAdapter.sendWhatsAppMessage(
        phone,
        '🚖 בדיקת מערכת מוניות\n\nזו הודעת טסט מהמערכת.\nאם קיבלת את זה - הכל עובד! ✅'
      );
      
      console.log('\n✅ הודעה נשלחה בהצלחה!');
      console.log('   Message SID:', sid);
      console.log('\n💡 בדוק את הWhatsApp שלך!');
      
    } catch (err) {
      console.error('\n❌ שגיאה בשליחת הודעה:');
      console.error('   שגיאה:', err.message);
      console.error('   קוד:', err.code || 'לא מוגדר');
      console.error('\n🔍 סיבות אפשריות:');
      console.error('   1. הטלפון לא מאושר ב-Twilio Sandbox');
      console.error('   2. הפורמט של הטלפון לא נכון');
      console.error('   3. ה-Account SID/Token לא תקינים');
      console.error('   4. אין יתרה בחשבון Twilio');
    } finally {
      rl.close();
    }
  });
}

testTwilio().catch(err => {
  console.error('💥 שגיאה כללית:', err);
  process.exit(1);
});
