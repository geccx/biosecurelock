import api, { type ApiResponse } from "../lib/api";

export interface UnlockRequest {
  method?: "pin" | "passwordFree";
  password?: string;
}

export interface EmergencyUnlockRequest {
  reason: string;
  deviceId?: string;
  labName?: string;
}

export interface TempPasswordRequest {
  name: string;
  password: string;
  validFrom: string; // ISO8601
  validUntil: string; // ISO8601
  maxUsage?: number;
  targetUserId?: number;
}

export interface AccessLog {
  id: number;
  userId: number;
  username: string;
  timestamp: string;
  accessMethod: string;
  success: boolean;
  labName?: string;
  blockchainHash?: string;
  ipAddress?: string;
}

export interface AccessStats {
  totalAccesses: number;
  successfulAccesses: number;
  failedAccesses: number;
  methodBreakdown: Record<string, number>;
  hourlyDistribution: number[];
}

export interface AccessLogFilters {
  userId?: number;
  startDate?: string;
  endDate?: string;
  accessMethod?: string;
  success?: boolean;
  limit?: number;
  offset?: number;
}

export const accessService = {
  /**
   * Remote unlock the door
   */
  async unlockDoor(
    data?: UnlockRequest
  ): Promise<ApiResponse<{ message: string }>> {
    const response = await api.post<ApiResponse<{ message: string }>>(
      "/access/unlock",
      data || {}
    );
    return response.data;
  },

  /**
   * Emergency unlock the door (Admin/TechSupport override)
   * Bypasses all schedule checks and access rules
   * Requires EMERGENCY_OVERRIDE permission
   * Must provide a reason for the emergency unlock
   */
  async emergencyUnlock(
    data: EmergencyUnlockRequest
  ): Promise<ApiResponse<{ message: string; data: { timestamp: string; reason: string; deviceId?: string; fabricTxId?: string } }>> {
    const response = await api.post<ApiResponse<{ message: string; data: { timestamp: string; reason: string; deviceId?: string; fabricTxId?: string } }>>(
      "/access/emergency-unlock",
      data
    );
    return response.data;
  },

  /**
   * Get dynamic password for door access
   */
  async getDynamicPassword(): Promise<
    ApiResponse<{ password: string; expiresAt: string }>
  > {
    const response = await api.get<
      ApiResponse<{ password: string; expiresAt: string }>
    >("/access/dynamic-password");
    return response.data;
  },

  /**
   * Create temporary password (admin only)
   * 
   * The backend automatically handles the ticket-based encryption:
   * 1. Gets a password ticket (ticket_id and encrypted ticket_key)
   * 2. Decrypts ticket_key using Access Secret
   * 3. Encrypts the plain password using the decrypted ticket_key
   * 4. Creates the temporary password with ticket_id and encrypted password
   * 
   * @param data - Temporary password request data
   * @param data.name - Password name
   * @param data.password - Plain password (6-7 digits, will be encrypted by backend)
   * @param data.validFrom - Start date/time (ISO8601)
   * @param data.validUntil - End date/time (ISO8601)
   * @param data.maxUsage - Maximum number of uses (optional, default: 1)
   * @param data.targetUserId - Target user ID (optional)
   */
  async createTempPassword(
    data: TempPasswordRequest
  ): Promise<ApiResponse<{ id: number; tuyaResponse?: any }>> {
    console.log("=".repeat(80));
    console.log(
      "%c[Tuya API] Create Temporary Password - START",
      "color: #2196F3; font-weight: bold; font-size: 16px; background: #E3F2FD; padding: 4px 8px;"
    );
    console.log("=".repeat(80));

    // Log the request being sent
    console.log(
      "%c[1] Frontend Request Data:",
      "color: #2196F3; font-weight: bold; font-size: 14px;"
    );
    const requestLog = {
      name: data.name,
      password: "***REDACTED***", // Don't log plain password
      password_type: "ticket",
      effective_time: new Date(data.validFrom).getTime() / 1000,
      invalid_time: new Date(data.validUntil).getTime() / 1000,
      maxUsage: data.maxUsage,
      targetUserId: data.targetUserId,
    };
    console.log("Request data:", requestLog);
    console.log("Full request object:", { ...data, password: "***REDACTED***" });
    console.log("");

    try {
      const response = await api.post<
        ApiResponse<{ id: number; tuyaResponse?: any; debug?: any }>
      >("/access/temp-password", data);

      console.log(
        "%c[2] Backend API Response Received:",
        "color: #9C27B0; font-weight: bold; font-size: 14px;"
      );
      console.log("Full response:", response.data);
      console.log("");

      // Log the request payload sent to Tuya (from backend)
      if (response.data.debug?.requestPayload) {
        console.log(
          "%c[3] Request Payload Sent to Tuya API:",
          "color: #FF9800; font-weight: bold; font-size: 14px;"
        );
        console.log(JSON.stringify(response.data.debug.requestPayload, null, 2));
        console.log("Request payload object:", response.data.debug.requestPayload);
        console.log("");
      } else {
        console.warn(
          "%c[3] Request Payload:",
          "color: #FF9800; font-weight: bold;",
          "Not found in response.debug.requestPayload"
        );
        console.log("Available debug keys:", response.data.debug ? Object.keys(response.data.debug) : "No debug object");
      }

      // Log the full Tuya API response to browser console
      if (response.data.tuyaResponse) {
        console.log(
          "%c[4] Tuya API Response:",
          "color: #4CAF50; font-weight: bold; font-size: 14px;"
        );
        console.log(JSON.stringify(response.data.tuyaResponse, null, 2));
        console.log("Full response object:", response.data.tuyaResponse);
        console.log("");
      } else {
        console.warn(
          "%c[4] Tuya API Response:",
          "color: #4CAF50; font-weight: bold;",
          "Not found in response.tuyaResponse"
        );
        console.log("Available response keys:", Object.keys(response.data));
      }

      // Log debug info if available
      if (response.data.debug) {
        console.log(
          "%c[5] Additional Debug Information:",
          "color: #9C27B0; font-weight: bold; font-size: 14px;"
        );
        console.log("Device ID:", response.data.debug.deviceId);
        console.log("Request data:", response.data.debug.requestData);
        console.log("");
      }

      console.log("=".repeat(80));
      console.log(
        "%c[Tuya API] Create Temporary Password - END",
        "color: #4CAF50; font-weight: bold; font-size: 16px; background: #E8F5E9; padding: 4px 8px;"
      );
      console.log("=".repeat(80));

      return response.data;
    } catch (error: any) {
      console.error(
        "%c[ERROR] Failed to create temporary password:",
        "color: #F44336; font-weight: bold; font-size: 14px;"
      );
      console.error("Error:", error);
      console.error("Error response:", error.response?.data);
      throw error;
    }
  },

  /**
   * Get access logs with optional filters
   */
  async getAccessLogs(
    filters?: AccessLogFilters
  ): Promise<ApiResponse<AccessLog[]>> {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      });
    }
    const response = await api.get<ApiResponse<AccessLog[]>>(
      `/access/logs?${params.toString()}`
    );
    return response.data;
  },

  /**
   * Get system logs (admin only)
   */
  async getSystemLogs(
    filters?: AccessLogFilters
  ): Promise<ApiResponse<AccessLog[]>> {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      });
    }
    const response = await api.get<ApiResponse<AccessLog[]>>(
      `/access/system-logs?${params.toString()}`
    );
    return response.data;
  },

  /**
   * Get access statistics
   */
  async getStats(
    userId?: number,
    period?: string
  ): Promise<ApiResponse<AccessStats>> {
    const params = new URLSearchParams();
    if (userId) params.append("userId", String(userId));
    if (period) params.append("period", period);
    const response = await api.get<ApiResponse<AccessStats>>(
      `/access/stats?${params.toString()}`
    );
    return response.data;
  },
};
