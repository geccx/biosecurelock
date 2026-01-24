// src/types/custom.d.ts
// Custom type definitions to fix TypeScript errors

// Fix for Notification type conflict
declare module '*/notificationPreferences.service' {
  export interface Notification {
    id: number;
    user_id: number;
    type: string;
    title: string;
    message: string;
    read: boolean;
    created_at: string;
    user_name?: string;
  }
}

// Fix for Schedule Status
export type ScheduleStatus = 'pending' | 'scheduled' | 'completed' | 'cancelled';

// Fix for Badge variant
export type BadgeVariant = 'default' | 'success' | 'danger' | 'warning' | 'info';

// Fix for LockAndGatewayStatus export
export interface LockAndGatewayStatus {
  lock: {
    online: boolean;
    status: string;
  };
  gateway: {
    online: boolean;
    status: string;
  };
}

// Fix for LogDisplay type
export interface LogDisplay {
  id: string | number;
  userName: string;
  userRole: string | null;
  subject?: string | null;
  laboratory?: string | null;
  labName: string;
  timestamp: Date;
  dateTime?: Date;
  accessMethod: string;
  status: 'granted' | 'denied';
  blockchainHash?: string;
  source: 'system' | 'user';
  code?: string;
  value?: any;
  eventTime?: Date;
  eventFrom?: string;
}

// Fix for ApiResponse type
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
  debug?: any;
  tuyaResponse?: any;
}

// Fix for CreateLabScheduleData
export interface CreateLabScheduleData {
  labName: string;
  teacherId: number;
  teacherName: string;
  startTime: string;
  endTime: string;
  subject?: string;
  status?: ScheduleStatus;
  passwordRequest?: {
    password: string;
    validFrom: string;
    validUntil: string;
    maxUsage: number;
  };
}

// Extend Window for process (Node.js environment variables)
declare global {
  interface Window {
    process?: {
      env: {
        [key: string]: string | undefined;
      };
    };
  }
  
  const process: {
    env: {
      [key: string]: string | undefined;
    };
  };
}