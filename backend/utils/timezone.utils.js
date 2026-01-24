/**
 * Timezone utility functions for Asia/Manila (UTC+8)
 */

const TIMEZONE_OFFSET_MS = 8 * 60 * 60 * 1000; // 8 hours in milliseconds

/**
 * Convert a date string or Date object to Asia/Manila timezone
 * and format as MySQL DATETIME (YYYY-MM-DD HH:MM:SS)
 * @param {string|Date} dateInput - ISO date string or Date object
 * @returns {string} MySQL DATETIME format string in Asia/Manila timezone
 */
function formatDateForMySQLManila(dateInput) {
  if (!dateInput) return null;
  
  let manilaYear, manilaMonth, manilaDay, manilaHours, manilaMinutes, manilaSeconds;
  
  if (typeof dateInput === 'string') {
    // If it's a datetime string without timezone (YYYY-MM-DDTHH:MM:SS), treat it as Manila time
    if (dateInput.includes('T') && !dateInput.includes('Z') && !dateInput.includes('+') && !dateInput.includes('-', 10)) {
      // Format: YYYY-MM-DDTHH:MM:SS (no timezone)
      const [datePart, timePart] = dateInput.split('T');
      const [year, month, day] = datePart.split('-').map(Number);
      const timeParts = timePart.split(':');
      const hours = Number(timeParts[0]);
      const minutes = Number(timeParts[1] || 0);
      const seconds = Number(timeParts[2] || 0);
      
      // Treat this as Manila time directly
      manilaYear = year;
      manilaMonth = month;
      manilaDay = day;
      manilaHours = hours;
      manilaMinutes = minutes;
      manilaSeconds = seconds;
    } else {
      // It's an ISO string with timezone or a Date object
      const date = new Date(dateInput);
      
      if (isNaN(date.getTime())) {
        throw new Error(`Invalid date: ${dateInput}`);
      }
      
      // Convert UTC to Manila time (UTC+8)
      // Get UTC time components
      const utcYear = date.getUTCFullYear();
      const utcMonth = date.getUTCMonth();
      const utcDay = date.getUTCDate();
      const utcHours = date.getUTCHours();
      const utcMinutes = date.getUTCMinutes();
      const utcSeconds = date.getUTCSeconds();
      
      // Create a date in UTC, then add 8 hours for Manila
      const utcTime = Date.UTC(utcYear, utcMonth, utcDay, utcHours, utcMinutes, utcSeconds);
      const manilaTime = new Date(utcTime + TIMEZONE_OFFSET_MS);
      
      manilaYear = manilaTime.getUTCFullYear();
      manilaMonth = manilaTime.getUTCMonth() + 1;
      manilaDay = manilaTime.getUTCDate();
      manilaHours = manilaTime.getUTCHours();
      manilaMinutes = manilaTime.getUTCMinutes();
      manilaSeconds = manilaTime.getUTCSeconds();
    }
  } else if (dateInput instanceof Date) {
    // Date object - convert UTC to Manila time
    const utcTime = Date.UTC(
      dateInput.getUTCFullYear(),
      dateInput.getUTCMonth(),
      dateInput.getUTCDate(),
      dateInput.getUTCHours(),
      dateInput.getUTCMinutes(),
      dateInput.getUTCSeconds()
    );
    const manilaTime = new Date(utcTime + TIMEZONE_OFFSET_MS);
    
    manilaYear = manilaTime.getUTCFullYear();
    manilaMonth = manilaTime.getUTCMonth() + 1;
    manilaDay = manilaTime.getUTCDate();
    manilaHours = manilaTime.getUTCHours();
    manilaMinutes = manilaTime.getUTCMinutes();
    manilaSeconds = manilaTime.getUTCSeconds();
  } else {
    throw new Error(`Invalid date input type: ${typeof dateInput}`);
  }
  
  // Format as YYYY-MM-DD HH:MM:SS
  const year = String(manilaYear).padStart(4, '0');
  const month = String(manilaMonth).padStart(2, '0');
  const day = String(manilaDay).padStart(2, '0');
  const hours = String(manilaHours).padStart(2, '0');
  const minutes = String(manilaMinutes).padStart(2, '0');
  const seconds = String(manilaSeconds).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Convert MySQL DATETIME string to Date object in Asia/Manila timezone
 * @param {string} mysqlDateTime - MySQL DATETIME format string (YYYY-MM-DD HH:MM:SS)
 * @returns {Date} Date object representing the time in Manila timezone
 */
function parseMySQLDateTimeManila(mysqlDateTime) {
  if (!mysqlDateTime) return null;
  
  // Parse MySQL datetime format (YYYY-MM-DD HH:MM:SS)
  const [datePart, timePart] = mysqlDateTime.split(' ');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes, seconds = 0] = timePart.split(':').map(Number);
  
  // Create date in UTC, treating the MySQL datetime as Manila time
  // Subtract 8 hours to convert Manila time to UTC
  const utcTime = Date.UTC(year, month - 1, day, hours, minutes, seconds) - TIMEZONE_OFFSET_MS;
  
  return new Date(utcTime);
}

module.exports = {
  formatDateForMySQLManila,
  parseMySQLDateTimeManila,
  TIMEZONE_OFFSET_MS,
};

