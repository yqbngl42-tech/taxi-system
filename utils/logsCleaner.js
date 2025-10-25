// ===============================================
// 🗑️ LOGS CLEANER - AUTO CLEANUP OLD LOGS
// ===============================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.join(__dirname, '..', 'logs');

/**
 * Clean old log files
 * @param {number} daysToKeep - Number of days to keep logs (default: 30)
 */
export function cleanOldLogs(daysToKeep = 30) {
  try {
    if (!fs.existsSync(logsDir)) {
      console.log('📁 Logs directory does not exist');
      return;
    }
    
    const files = fs.readdirSync(logsDir);
    const now = Date.now();
    let deletedCount = 0;
    let totalSize = 0;
    
    for (const file of files) {
      if (!file.endsWith('.log')) continue;
      
      const filePath = path.join(logsDir, file);
      
      try {
        const stats = fs.statSync(filePath);
        const ageInDays = (now - stats.mtimeMs) / (1000 * 60 * 60 * 24);
        
        if (ageInDays > daysToKeep) {
          totalSize += stats.size;
          fs.unlinkSync(filePath);
          deletedCount++;
          console.log(`🗑️  Deleted old log: ${file} (${Math.round(ageInDays)} days old)`);
        }
      } catch (err) {
        console.error(`Error processing log file ${file}:`, err.message);
      }
    }
    
    if (deletedCount > 0) {
      const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);
      logger.info(`Cleaned ${deletedCount} old log files (${sizeMB} MB freed)`, {
        deletedCount,
        freedSpace: `${sizeMB}MB`,
        daysToKeep
      });
      console.log(`✅ Cleaned ${deletedCount} log files, freed ${sizeMB} MB`);
    } else {
      console.log('✅ No old logs to clean');
    }
  } catch (err) {
    logger.error('Error cleaning old logs', err);
    console.error('❌ Error cleaning logs:', err.message);
  }
}

/**
 * Get logs directory info
 * @returns {object}
 */
export function getLogsInfo() {
  try {
    if (!fs.existsSync(logsDir)) {
      return {
        exists: false,
        totalFiles: 0,
        totalSize: 0
      };
    }
    
    const files = fs.readdirSync(logsDir);
    let totalSize = 0;
    let logFiles = 0;
    
    for (const file of files) {
      if (file.endsWith('.log')) {
        const filePath = path.join(logsDir, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
        logFiles++;
      }
    }
    
    return {
      exists: true,
      totalFiles: logFiles,
      totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2)
    };
  } catch (err) {
    console.error('Error getting logs info:', err.message);
    return null;
  }
}

// ===============================================
// 🔄 AUTO-RUN ON STARTUP
// ===============================================
console.log('🗑️  Logs cleaner initialized');
cleanOldLogs(30);

// ===============================================
// ⏰ SCHEDULE DAILY CLEANUP (2 AM)
// ===============================================
setInterval(() => {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  
  // Run at 2:00 AM
  if (hour === 2 && minute === 0) {
    console.log('⏰ Running scheduled log cleanup...');
    cleanOldLogs(30);
  }
}, 60 * 1000); // Check every minute

console.log('✅ Logs cleaner scheduled (runs daily at 2:00 AM)');

export default {
  cleanOldLogs,
  getLogsInfo
};
