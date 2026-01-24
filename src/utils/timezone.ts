/**
 * Timezone utility functions for Asia/Manila (UTC+8)
 */

/**
 * Format a date to ISO string in Asia/Manila timezone
 * @param date - Date object
 * @param timeString - Time string in HH:MM format
 * @returns ISO string in format YYYY-MM-DDTHH:MM:SS
 */
export function formatDateTimeManila(date: string, timeString: string): string {
  // Combine date and time: YYYY-MM-DDTHH:MM:SS
  return `${date}T${timeString}:00`;
}

/**
 * Convert a date and time to ISO string for Asia/Manila timezone
 * This creates a datetime string that will be interpreted as Manila time
 * @param dateString - Date string in YYYY-MM-DD format
 * @param timeString - Time string in HH:MM format
 * @returns ISO string that represents the time in Manila timezone
 */
export function createManilaDateTime(dateString: string, timeString: string): string {
  // Create the datetime string in format: YYYY-MM-DDTHH:MM:SS
  // This will be treated as local time (Manila) by the backend
  const dateTimeString = `${dateString}T${timeString}:00`;
  
  // Parse it as a local date and convert to ISO string
  // But we need to ensure it's treated as Manila time (UTC+8)
  const [datePart, timePart] = dateTimeString.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  
  // Create a date object treating the input as Manila time
  // Manila is UTC+8, so we subtract 8 hours to get UTC
  const manilaDate = new Date(year, month - 1, day, hours, minutes, 0);
  
  // Get the timezone offset for the current browser timezone
  const localOffset = manilaDate.getTimezoneOffset() * 60 * 1000; // in milliseconds
  const manilaOffset = 8 * 60 * 60 * 1000; // Manila is UTC+8
  
  // Adjust the date to represent Manila time correctly
  const utcTime = manilaDate.getTime() - localOffset + manilaOffset;
  const adjustedDate = new Date(utcTime);
  
  return adjustedDate.toISOString();
}

/**
 * Simple version: just format as YYYY-MM-DDTHH:MM:SS
 * The backend will interpret this as Manila time
 */
export function formatForManila(dateString: string, timeString: string): string {
  return `${dateString}T${timeString}:00`;
}

/**
 * Extract date and time components from a Date object in Asia/Manila timezone (UTC+8)
 * @param date - Date object (can be in any timezone)
 * @returns Object with date (YYYY-MM-DD) and time (HH:MM) strings in Manila timezone
 */
export function extractManilaDateTime(date: Date): { date: string; time: string } {
  // Manila is UTC+8, so we add 8 hours to UTC to get Manila time
  const manilaOffset = 8 * 60 * 60 * 1000; // 8 hours in milliseconds
  const utcTime = date.getTime();
  const manilaTime = new Date(utcTime + manilaOffset);
  
  // Extract UTC components (which now represent Manila time)
  const year = manilaTime.getUTCFullYear();
  const month = String(manilaTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(manilaTime.getUTCDate()).padStart(2, '0');
  const hours = String(manilaTime.getUTCHours()).padStart(2, '0');
  const minutes = String(manilaTime.getUTCMinutes()).padStart(2, '0');
  
  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`,
  };
}

