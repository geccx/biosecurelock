import api, { type ApiResponse } from "../lib/api";

export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  activeSchedules: number;
  pendingApprovals: number;
  accessLogsToday: number;
  pendingEnrollments: number;
  totalTuyaUsers?: number;
  localUsers?: number;
  activeLocalUsers?: number;
  activeTuyaUsers?: number;
}

export interface SystemStatus {
  blockchain: {
    status: "connected" | "disconnected";
    network: string;
  };
  locks: {
    locked: number;
    unlocked: number;
  };
  devices: {
    online: number;
    offline: number;
    error: number;
  };
  timestamp: string;
}

export interface RecentAccessLog {
  id: string;
  userId: string;
  userName: string;
  userRole?: string | null;
  labName: string;
  timestamp: string;
  method: string;
  status: "granted" | "denied";
  blockchainHash?: string;
  ipAddress?: string;
}

export interface PendingApproval {
  id: string;
  type: "schedule" | "move_request";
  scheduleId: string;
  teacherId: string;
  teacherName: string;
  labName: string;
  // For schedules
  startTime?: string;
  endTime?: string;
  subject?: string;
  createdAt?: string;
  // For move requests
  currentStartTime?: string;
  currentEndTime?: string;
  requestedStartTime?: string;
  requestedEndTime?: string;
  reason?: string;
  requestedAt?: string;
  // Common
  status: string;
  timestamp: string;
}

export const dashboardService = {
  /**
   * Get dashboard statistics
   */
  async getStats(): Promise<ApiResponse<DashboardStats>> {
    const response = await api.get<ApiResponse<DashboardStats>>(
      "/dashboard/stats"
    );
    return response.data;
  },

  /**
   * Get system status
   */
  async getSystemStatus(): Promise<ApiResponse<SystemStatus>> {
    const response = await api.get<ApiResponse<SystemStatus>>(
      "/dashboard/system-status"
    );
    return response.data;
  },

  /**
   * Get recent access logs
   */
  async getRecentLogs(limit?: number): Promise<ApiResponse<RecentAccessLog[]>> {
    const params = limit ? `?limit=${limit}` : "";
    const response = await api.get<ApiResponse<RecentAccessLog[]>>(
      `/dashboard/recent-logs${params}`
    );
    return response.data;
  },

  /**
   * Get pending approvals
   */
  async getPendingApprovals(
    limit?: number
  ): Promise<ApiResponse<PendingApproval[]>> {
    const params = limit ? `?limit=${limit}` : "";
    const response = await api.get<ApiResponse<PendingApproval[]>>(
      `/dashboard/pending-approvals${params}`
    );
    return response.data;
  },
};
