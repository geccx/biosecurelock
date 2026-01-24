import api, { type ApiResponse } from "../lib/api";

export interface PasswordRequest {
  id: number;
  scheduleId: number;
  userId: number;
  tuyaUserId: string | null;
  passwordName: string;
  password: string;
  validFrom: string;
  validUntil: string;
  maxUsage: number;
  phone: string | null;
  timeZone: string | null;
  scheduleList: any[] | null;
  relateDevList: string | null;
  status: "pending" | "approved" | "rejected" | "completed";
  approvedBy: number | null;
  approvedByName: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  tuyaPasswordId: string | null;
  createdAt: string;
  updatedAt: string;
  // Related data
  labName: string;
  scheduleStartTime: string;
  scheduleEndTime: string;
  userName: string;
  userEmail: string;
}

export interface PasswordRequestFilters {
  status?: "pending" | "approved" | "rejected" | "completed";
}

export const passwordRequestsService = {
  /**
   * Get all password requests
   */
  async getAll(
    filters?: PasswordRequestFilters
  ): Promise<ApiResponse<PasswordRequest[]>> {
    const params = new URLSearchParams();
    if (filters?.status) {
      params.append("status", filters.status);
    }
    const queryString = params.toString();
    const url = `/password-requests${queryString ? `?${queryString}` : ""}`;
    const response = await api.get<ApiResponse<PasswordRequest[]>>(url);
    return response.data;
  },

  /**
   * Approve a password request
   */
  async approve(
    requestId: number
  ): Promise<
    ApiResponse<{ requestId: number; tuyaPasswordId: string | null }>
  > {
    const response = await api.post<
      ApiResponse<{ requestId: number; tuyaPasswordId: string | null }>
    >(`/password-requests/${requestId}/approve`);
    return response.data;
  },

  /**
   * Reject a password request
   */
  async reject(requestId: number, reason?: string): Promise<ApiResponse<void>> {
    const response = await api.post<ApiResponse<void>>(
      `/password-requests/${requestId}/reject`,
      { reason }
    );
    return response.data;
  },
};
