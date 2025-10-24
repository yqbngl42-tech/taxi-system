import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.join(__dirname, '..', 'logs');

// יצור תיקייה ל-logs אם לא קיימת
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const getDateStamp = () => new Date().toISOString().split('T')[0];
const getTimeStamp = () => new Date().toISOString();

export default {
  /**
   * רשום לוג של מידע
   */
  info: (message, data = null) => {
    const timestamp = getTimeStamp();
    const logMessage = `[${timestamp}] ℹ️ INFO: ${message}${data ? ' | ' + JSON.stringify(data) : ''}`;
    console.log(logMessage);
    appendToLogFile(logMessage);
  },

  /**
   * רשום לוג של שגיאה
   */
  error: (message, error = null) => {
    const timestamp = getTimeStamp();
    const errorMsg = error?.message || JSON.stringify(error);
    const logMessage = `[${timestamp}] ❌ ERROR: ${message} | ${errorMsg}`;
    console.error(logMessage);
    console.error('Stack trace:', error?.stack || 'N/A'); // הוספת stack trace
    appendToLogFile(logMessage);
  },

  /**
   * רשום לוג של אזהרה
   */
  warn: (message, data = null) => {
    const timestamp = getTimeStamp();
    const logMessage = `[${timestamp}] ⚠️ WARN: ${message}${data ? ' | ' + JSON.stringify(data) : ''}`;
    console.warn(logMessage);
    appendToLogFile(logMessage);
  },

  /**
   * רשום לוג של הצלחה
   */
  success: (message, data = null) => {
    const timestamp = getTimeStamp();
    const logMessage = `[${timestamp}] ✅ SUCCESS: ${message}${data ? ' | ' + JSON.stringify(data) : ''}`;
    console.log(logMessage);
    appendToLogFile(logMessage);
  },

  /**
   * רשום לוג של פעולה
   */
  action: (action, details = null) => {
    const timestamp = getTimeStamp();
    const logMessage = `[${timestamp}] 📌 ACTION: ${action}${details ? ' | ' + JSON.stringify(details) : ''}`;
    console.log(logMessage);
    appendToLogFile(logMessage);
  }
};

/**
 * הוסף שורה לקובץ לוג יומי
 */
function appendToLogFile(message) {
  const dateStamp = getDateStamp();
  const logFile = path.join(logsDir, `${dateStamp}.log`);

  try {
    fs.appendFileSync(logFile, message + '\n');
  } catch (err) {
    console.error('שגיאה בכתיבה לקובץ לוג:', err.message);
  }
}
