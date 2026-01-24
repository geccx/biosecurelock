// Note: Backend uses "admin" | "user" | "visitor" for roles
// Frontend uses "admin" | "teacher" | "techsupport" for display
export type UserRole = "admin" | "teacher" | "techsupport" | "user" | "visitor";

export type UserStatus = "active" | "inactive" | "pending";

export type ScheduleStatus = "scheduled" | "completed" | "cancelled";

export type MoveRequestStatus = "pending" | "approved" | "denied";

export type AccessMethod = "fingerprint" | "rfid" | "pin" | "remote" | "auto_schedule" | "key" | "temporary_password" | "dynamic_password";

export type AccessStatus = "granted" | "denied";

export type LockStatus = "locked" | "unlocked";

export type EnrollmentStatus = "pending" | "approved" | "rejected" | "synced";

export type EnrollmentType = "fingerprint" | "rfid" | "pin";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  fingerprint?: string;
  rfid?: string;
  pin?: string;
  createdAt: Date;
  fabricIdentity?: string;
}

// In your types.ts file
export interface Schedule {
  id: number;
  labName: string;
  teacherId: number;
  teacherName?: string;
  startTime: Date | string; // Can be Date for one-time or string (HH:MM) for weekly
  endTime: Date | string;   // Can be Date for one-time or string (HH:MM) for weekly
  subject?: string;
  status: "pending" | "scheduled" | "completed" | "cancelled";
  recurrenceType?: "one-time" | "weekly";
  daysOfWeek?: string[]; // Array of day names: ["Monday", "Tuesday", etc.]
  recurrenceEndDate?: string; // ISO date string
  createdBy?: string;
  createdAt: Date;
}

export interface LabSchedule {
  id: number;
  labName: string;
  teacherId: number;
  teacherName?: string;
  startTime: string;
  endTime: string;
  subject?: string;
  status: "pending" | "scheduled" | "completed" | "cancelled";
  recurrenceType?: "one-time" | "weekly";
  daysOfWeek?: string[];
  recurrenceEndDate?: string;
  createdBy?: number;
  createdAt: string;
}

export interface ScheduleMoveRequest {
  id: string;
  scheduleId: string;
  teacherId: string;
  teacherName: string;
  labName: string;
  currentStartTime: Date;
  currentEndTime: Date;
  requestedStartTime: Date;
  requestedEndTime: Date;
  reason: string;
  status: MoveRequestStatus;
  requestedAt: Date;
  reviewedBy?: string;
  reviewedAt?: Date;
}

export interface AccessLog {
  id: string;
  userId: string;
  userName: string;
  timestamp: Date;
  method: AccessMethod;
  status: AccessStatus;
  labName: string;
  blockchainHash: string;
  ipAddress?: string;
}

export interface SystemConfig {
  lockStatus: "locked" | "unlocked";
  autoLockEnabled: boolean;
  maxAccessAttempts: number;
  sessionTimeout: number;
  notificationsEnabled: boolean;
  blockchainEnabled: boolean;
}

export interface DeviceStatus {
  id: string;
  deviceName: string;
  type: "lock" | "fingerprint" | "rfid" | "network";
  status: "online" | "offline" | "error";
  lastChecked: Date;
  location: string;
}

export interface Laboratory {
  id: string;
  name: string;
  location: string;
  capacity: number;
  lockStatus: LockStatus;
  currentOccupancy: number;
  lastAccessed?: Date;
  assignedSchedules: number;
}

// Enrollment interface for user biometric/access enrollments
export interface Enrollment {
  id: string;
  userId: string;
  userName?: string;
  enrollmentType: EnrollmentType;
  status: EnrollmentStatus;
  enrollmentData?: Record<string, unknown>;
  tuyaUnlockId?: string;
  approvedBy?: string;
  approvedAt?: Date;
  rejectedReason?: string;
  createdAt: Date;
  updatedAt?: Date;
}

// Backend health status
export interface SystemHealth {
  status: "ok" | "error";
  timestamp: Date;
  services: {
    fabric: "connected" | "disconnected";
    scheduler: "running" | "stopped";
  };
}
