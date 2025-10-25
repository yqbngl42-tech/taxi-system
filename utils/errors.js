// ===============================================
// 🚫 ERROR MESSAGES - CENTRALIZED
// ===============================================
// All error messages in Hebrew for better UX

export const ERRORS = {
  // Validation errors
  VALIDATION: {
    PHONE: "מספר טלפון לא תקין. נא להזין בפורמט: 050-1234567",
    NAME: "שם חייב להכיל לפחות 2 תווים",
    NAME_TOO_LONG: "שם ארוך מדי (מקסימום 100 תווים)",
    PICKUP: "נא להזין מיקום איסוף תקין",
    DESTINATION: "נא להזין יעד תקין",
    PRICE: "מחיר חייב להיות מספר חיובי",
    PRICE_TOO_HIGH: "מחיר גבוה מדי (מקסימום ₪9999)",
    COMMISSION_RATE: "אחוז קומיסיה חייב להיות בין 0 ל-100",
    DATE_INVALID: "תאריך לא תקין",
    DATE_PAST: "לא ניתן להזמין נסיעה בעבר",
    REQUIRED_FIELDS: "נא למלא את כל השדות החובה",
    EMAIL_INVALID: "כתובת אימייל לא תקינה"
  },
  
  // Authentication errors
  AUTH: {
    NO_TOKEN: "נדרשת התחברות למערכת",
    INVALID_TOKEN: "טוקן לא תקין. נא להתחבר מחדש",
    EXPIRED_TOKEN: "הטוקן פג תוקף. נא להתחבר מחדש",
    WRONG_PASSWORD: "סיסמה שגויה. נסה שוב",
    TOO_MANY_ATTEMPTS: "יותר מדי ניסיונות כושלים. נסה שוב בעוד 15 דקות",
    UNAUTHORIZED: "אין לך הרשאה לבצע פעולה זו"
  },
  
  // Ride errors
  RIDE: {
    NOT_FOUND: "נסיעה לא נמצאה",
    ALREADY_TAKEN: "נסיעה זו כבר נלקחה על ידי נהג אחר",
    ALREADY_CANCELLED: "נסיעה זו כבר בוטלה",
    CANNOT_CANCEL: "לא ניתן לבטל נסיעה בסטטוס זה",
    INVALID_STATUS: "סטטוס נסיעה לא תקין",
    NO_DRIVERS_AVAILABLE: "אין נהגים זמינים כרגע",
    ALREADY_FINISHED: "נסיעה זו כבר הסתיימה"
  },
  
  // Driver errors
  DRIVER: {
    NOT_FOUND: "נהג לא נמצא",
    BLOCKED: "נהג זה חסום במערכת",
    INACTIVE: "נהג זה לא פעיל",
    PHONE_EXISTS: "מספר טלפון זה כבר קיים במערכת",
    CANNOT_DELETE: "לא ניתן למחוק נהג עם נסיעות פעילות",
    INVALID_RATING: "דירוג חייב להיות בין 1-5"
  },
  
  // Group errors
  GROUP: {
    NOT_FOUND: "קבוצה לא נמצאה",
    EMPTY: "הקבוצה ריקה - אין נהגים",
    INACTIVE: "הקבוצה לא פעילה",
    NAME_EXISTS: "שם קבוצה זה כבר קיים",
    CANNOT_DELETE_DEFAULT: "לא ניתן למחוק את קבוצת ברירת המחדל",
    AT_LEAST_ONE_DRIVER: "קבוצה חייבת להכיל לפחות נהג אחד"
  },
  
  // Payment errors
  PAYMENT: {
    FAILED: "התשלום נכשל. נסה שוב",
    ALREADY_PAID: "נסיעה זו כבר שולמה",
    INVALID_AMOUNT: "סכום תשלום לא תקין",
    CARD_DECLINED: "הכרטיס נדחה. בדוק את הפרטים",
    INSUFFICIENT_FUNDS: "אין מספיק יתרה בכרטיס"
  },
  
  // Server errors
  SERVER: {
    DATABASE: "שגיאה בחיבור למסד נתונים. נסה שוב",
    TWILIO: "שגיאה בשליחת הודעה. נסה שוב",
    NETWORK: "בעיית רשת. בדוק את החיבור שלך",
    UNKNOWN: "שגיאה לא צפויה. צוות התמיכה קיבל התראה",
    MAINTENANCE: "המערכת בתחזוקה. נסה שוב בעוד מספר דקות",
    RATE_LIMIT: "יותר מדי בקשות. נסה שוב בעוד דקה"
  },
  
  // File/Upload errors
  UPLOAD: {
    FILE_TOO_LARGE: "קובץ גדול מדי (מקסימום 10MB)",
    INVALID_FORMAT: "פורמט קובץ לא נתמך",
    UPLOAD_FAILED: "העלאת הקובץ נכשלה"
  }
};

/**
 * Get error message with dynamic values
 * @param {string} category - Error category (e.g., 'VALIDATION')
 * @param {string} type - Error type (e.g., 'PHONE')
 * @param {object} customDetails - Custom values to replace in message
 * @returns {string} - Formatted error message
 */
export function getErrorMessage(category, type, customDetails = {}) {
  const message = ERRORS[category]?.[type] || ERRORS.SERVER.UNKNOWN;
  
  // Replace placeholders like {fieldName} with actual values
  let finalMessage = message;
  Object.keys(customDetails).forEach(key => {
    finalMessage = finalMessage.replace(`{${key}}`, customDetails[key]);
  });
  
  return finalMessage;
}

/**
 * Create standardized error response
 * @param {string} category 
 * @param {string} type 
 * @param {object} additionalData 
 * @returns {object}
 */
export function createErrorResponse(category, type, additionalData = {}) {
  return {
    ok: false,
    error: getErrorMessage(category, type),
    errorCode: `${category}_${type}`,
    ...additionalData
  };
}

export default ERRORS;
