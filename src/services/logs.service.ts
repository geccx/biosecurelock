import api, { type ApiResponse } from "../lib/api";

export interface AccessLogEntry {
  id: number;
  userId: number;
  userName: string;
  username?: string; // Keep for backward compatibility
  role?: string;
  subject?: string;
  laboratory?: string;
  timestamp: string;
  dateTime?: string; // Alias for timestamp
  accessMethod: string;
  accessMethodRaw?: string; // Original method value for filtering
  result?: "Granted" | "Denied";
  success: boolean;
  reasonForDenial?: string;
  blockchainHash?: string;
  ipAddress?: string;
  laboratoryId?: number;
  email?: string;
  details?: Record<string, unknown>;
  deviceResponse?: Record<string, unknown>;
}

export interface SystemLogEntry {
  id: number;
  eventType: string;
  userId?: number;
  username?: string;
  role?: string;
  details: Record<string, unknown>;
  timestamp: string;
}

export interface LogFilters {
  userId?: number;
  startDate?: string;
  endDate?: string;
  accessMethod?: string;
  eventType?: string;
  success?: boolean;
  limit?: number;
  offset?: number;
}

export interface LogStats {
  totalAccesses: number;
  successfulAccesses: number;
  failedAccesses: number;
  methodBreakdown: Record<string, number>;
  hourlyDistribution: number[];
}

export interface TuyaUnlockingHistoryEntry {
  avatar?: string;
  media_infos?: Array<{
    file_key: string;
    file_url: string;
    media_url?: string;
    media_key?: string;
  }>;
  nick_name: string;
  status: {
    code: string;
    value: string | number | object; // Can be string, number, or object per API docs
  };
  unlock_name: string;
  update_time: number; // Timestamp in milliseconds
  user_id: string;
}

export const logsService = {
  /**
   * Get access logs with filtering
   */
  async getAccessLogs(
    filters?: LogFilters
  ): Promise<ApiResponse<AccessLogEntry[]>> {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      });
    }
    const response = await api.get<ApiResponse<AccessLogEntry[]>>(
      `/logs/access?${params.toString()}`
    );
    return response.data;
  },

  /**
   * Get single access log by ID
   */
  async getAccessLogById(logId: number): Promise<ApiResponse<AccessLogEntry>> {
    const response = await api.get<ApiResponse<AccessLogEntry>>(
      `/logs/access/${logId}`
    );
    return response.data;
  },

  /**
   * Get system activity logs (admin only)
   */
  async getSystemLogs(
    filters?: LogFilters
  ): Promise<ApiResponse<SystemLogEntry[]>> {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      });
    }
    const response = await api.get<ApiResponse<SystemLogEntry[]>>(
      `/logs/system?${params.toString()}`
    );
    return response.data;
  },

  /**
   * Get access statistics
   */
  async getStats(
    userId?: number,
    period?: string
  ): Promise<ApiResponse<LogStats>> {
    const params = new URLSearchParams();
    if (userId) params.append("userId", String(userId));
    if (period) params.append("period", period);
    const response = await api.get<ApiResponse<LogStats>>(
      `/logs/stats?${params.toString()}`
    );
    return response.data;
  },

  /**
   * Export logs (admin only)
   */
  async exportLogs(
    format?: "json" | "csv",
    startDate?: string,
    endDate?: string
  ): Promise<Blob> {
    const params = new URLSearchParams();
    if (format) params.append("format", format);
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);

    const response = await api.get(`/logs/export?${params.toString()}`, {
      responseType: "blob",
    });
    return response.data;
  },

  /**
   * Generate Admin Report
   */
  async generateAdminReport(
    format: "pdf" | "csv" = "pdf",
    filters?: {
      startDate?: string;
      endDate?: string;
      userId?: number;
      accessMethod?: string;
      success?: boolean;
    }
  ): Promise<Blob> {
    const params = new URLSearchParams();
    params.append("format", format);
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      });
    }
    const response = await api.get(`/logs/reports/admin?${params.toString()}`, {
      responseType: "blob",
    });
    return response.data;
  },

  /**
   * Generate Teacher Report
   */
  async generateTeacherReport(
    format: "pdf" | "csv" = "pdf",
    filters?: {
      startDate?: string;
      endDate?: string;
      accessMethod?: string;
      success?: boolean;
    }
  ): Promise<Blob> {
    const params = new URLSearchParams();
    params.append("format", format);
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      });
    }
    const response = await api.get(
      `/logs/reports/teacher?${params.toString()}`,
      {
        responseType: "blob",
      }
    );
    return response.data;
  },

  /**
   * Generate Tech Support Report
   */
  async generateTechSupportReport(
    format: "pdf" | "csv" = "pdf",
    filters?: {
      startDate?: string;
      endDate?: string;
      userId?: number;
      accessMethod?: string;
      success?: boolean;
    }
  ): Promise<Blob> {
    const params = new URLSearchParams();
    params.append("format", format);
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      });
    }
    const response = await api.get(
      `/logs/reports/techsupport?${params.toString()}`,
      {
        responseType: "blob",
      }
    );
    return response.data;
  },

  /**
   * Generate User Report
   */
  async generateUserReport(
    format: "pdf" | "csv" = "pdf",
    filters?: {
      startDate?: string;
      endDate?: string;
      accessMethod?: string;
      success?: boolean;
    }
  ): Promise<Blob> {
    const params = new URLSearchParams();
    params.append("format", format);
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      });
    }
    const response = await api.get(`/logs/reports/user?${params.toString()}`, {
      responseType: "blob",
    });
    return response.data;
  },

  /**
   * Generate Visitor Report
   */
  async generateVisitorReport(
    format: "pdf" | "csv" = "pdf",
    filters?: {
      startDate?: string;
      endDate?: string;
    }
  ): Promise<Blob> {
    const params = new URLSearchParams();
    params.append("format", format);
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      });
    }
    const response = await api.get(
      `/logs/reports/visitor?${params.toString()}`,
      {
        responseType: "blob",
      }
    );
    return response.data;
  },

  /**
   * Get Tuya unlocking history (new v1.1 API)
   * Reference: https://developer.tuya.com/en/docs/cloud/doorlock-api-record?id=Kbe2o4dci8roa#title-1-Query%20unlocking%20history%20(new)
   */
  async getTuyaUnlockingHistory(filters?: {
    page_no?: number;
    page_size?: number;
    start_time?: number | string; // Timestamp in milliseconds or ISO date string
    end_time?: number | string; // Timestamp in milliseconds or ISO date string
    showMediaInfo?: boolean;
  }): Promise<ApiResponse<TuyaUnlockingHistoryEntry[]>> {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      });
    }
    const response = await api.get<ApiResponse<TuyaUnlockingHistoryEntry[]>>(
      `/logs/tuya/unlocking-history?${params.toString()}`
    );
    return response.data;
  },
};
