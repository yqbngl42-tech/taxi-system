import dotenv from 'dotenv';
dotenv.config();

console.log('\n═══════════════════════════════════════════');
console.log('🔍 בדיקה מהירה - Taxi System Configuration');
console.log('═══════════════════════════════════════════\n');

let hasErrors = false;

// 1. MongoDB
console.log('📊 MongoDB:');
if (process.env.MONGODB_URI) {
  console.log('   ✅ MONGODB_URI קיים');
  if (process.env.MONGODB_URI.includes('mongodb+srv://')) {
    console.log('   ✅ פורמט נכון (mongodb+srv://)');
  } else {
    console.log('   ⚠️  אולי לא פורמט נכון?');
  }
} else {
  console.log('   ❌ MONGODB_URI חסר!');
  hasErrors = true;
}

// 2. Twilio
console.log('\n📞 Twilio:');
if (process.env.TWILIO_ACCOUNT_SID) {
  if (process.env.TWILIO_ACCOUNT_SID.startsWith('AC')) {
    console.log('   ✅ TWILIO_ACCOUNT_SID קיים ותקין');
  } else {
    console.log('   ⚠️  TWILIO_ACCOUNT_SID לא מתחיל ב-AC');
    hasErrors = true;
  }
} else {
  console.log('   ❌ TWILIO_ACCOUNT_SID חסר!');
  hasErrors = true;
}

if (process.env.TWILIO_AUTH_TOKEN) {
  if (process.env.TWILIO_AUTH_TOKEN.length === 32) {
    console.log('   ✅ TWILIO_AUTH_TOKEN קיים ותקין');
  } else {
    console.log(`   ⚠️  TWILIO_AUTH_TOKEN אורך לא תקין (${process.env.TWILIO_AUTH_TOKEN.length} במקום 32)`);
    hasErrors = true;
  }
} else {
  console.log('   ❌ TWILIO_AUTH_TOKEN חסר!');
  hasErrors = true;
}

if (process.env.TWILIO_WHATSAPP_FROM) {
  console.log(`   ✅ TWILIO_WHATSAPP_FROM: ${process.env.TWILIO_WHATSAPP_FROM}`);
  if (!process.env.TWILIO_WHATSAPP_FROM.startsWith('whatsapp:')) {
    console.log('   ⚠️  צריך להתחיל ב-whatsapp:');
  }
} else {
  console.log('   ❌ TWILIO_WHATSAPP_FROM חסר!');
  hasErrors = true;
}

// 3. Webhook
console.log('\n🌍 Webhook:');
if (process.env.WEBHOOK_URL) {
  console.log(`   ✅ WEBHOOK_URL: ${process.env.WEBHOOK_URL}`);
  
  if (process.env.WEBHOOK_URL.includes('localhost') && 
      process.env.NODE_ENV === 'production') {
    console.log('   ❌ שגיאה קריטית: WEBHOOK_URL מוגדר ל-localhost אבל NODE_ENV=production!');
    console.log('   💡 פתרון: שנה WEBHOOK_URL ל-URL האמיתי של Render');
    hasErrors = true;
  }
  
  if (process.env.WEBHOOK_URL.includes('localhost')) {
    console.log('   ⚠️  משתמש ב-localhost - לא יעבוד ב-Render!');
  }
} else {
  console.log('   ❌ WEBHOOK_URL חסר!');
  hasErrors = true;
}

// 4. Admin
console.log('\n🔐 Admin:');
if (process.env.ADMIN_PASSWORD) {
  console.log(`   ✅ ADMIN_PASSWORD קיים (${process.env.ADMIN_PASSWORD.length} תווים)`);
} else {
  console.log('   ❌ ADMIN_PASSWORD חסר!');
  hasErrors = true;
}

if (process.env.JWT_SECRET) {
  console.log(`   ✅ JWT_SECRET קיים (${process.env.JWT_SECRET.length} תווים)`);
  if (process.env.JWT_SECRET.length < 20) {
    console.log('   ⚠️  JWT_SECRET קצר מדי (מומלץ 32+ תווים)');
  }
} else {
  console.log('   ❌ JWT_SECRET חסר!');
  hasErrors = true;
}

// 5. Environment
console.log('\n🔧 Environment:');
console.log(`   NODE_ENV: ${process.env.NODE_ENV || '⚠️ לא מוגדר (ברירת מחדל: development)'}`);
console.log(`   PORT: ${process.env.PORT || '⚠️ לא מוגדר (ברירת מחדל: 3000)'}`);

// 6. אופציונלי
console.log('\n💳 אופציונלי:');
console.log(`   BIT_LINK: ${process.env.BIT_LINK || '⚠️ לא מוגדר'}`);
console.log(`   VERIFY_TOKEN: ${process.env.VERIFY_TOKEN || '⚠️ לא מוגדר'}`);

// סיכום
console.log('\n═══════════════════════════════════════════');
if (hasErrors) {
  console.log('❌ יש שגיאות בהגדרות!');
  console.log('\n📋 פתרון:');
  console.log('1. ערוך את קובץ .env');
  console.log('2. או הוסף את המשתנים ב-Render Dashboard → Environment');
  console.log('3. אתחל מחדש את השרת');
  console.log('\n📖 למדריך מלא: ראה FIX-WHATSAPP-GUIDE.md');
  process.exit(1);
} else {
  console.log('✅ כל ההגדרות נראות תקינות!');
  console.log('\n💡 השלבים הבאים:');
  console.log('1. ודא שהטלפון שלך מחובר ל-Twilio Sandbox');
  console.log('   (שלח "join <code>" ל-+1 415 523 8886)');
  console.log('2. הרץ: node test-twilio.js לבדיקה מלאה');
  console.log('3. נסה ליצור נסיעה מאתר הלקוחות');
}
console.log('═══════════════════════════════════════════\n');
