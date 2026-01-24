import api, { type ApiResponse } from "../lib/api";

export interface MoveRequest {
  id: string;
  scheduleId: string;
  teacherId: string;
  teacherName: string;
  labName: string;
  currentStartTime: string;
  currentEndTime: string;
  requestedStartTime: string;
  requestedEndTime: string;
  reason: string;
  status: "pending" | "approved" | "denied";
  requestedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface CreateMoveRequestData {
  scheduleId: number;
  requestedStartTime: string;
  requestedEndTime: string;
  reason: string;
}

export interface MoveRequestFilters {
  status?: string;
  teacherId?: number;
  limit?: number;
  offset?: number;
}

export const moveRequestsService = {
  /**
   * Create a new move request
   */
  async create(data: CreateMoveRequestData): Promise<ApiResponse<MoveRequest>> {
    const response = await api.post<ApiResponse<MoveRequest>>(
      "/move-requests",
      data
    );
    return response.data;
  },

  /**
   * Get all move requests
   */
  async getAll(
    filters?: MoveRequestFilters
  ): Promise<ApiResponse<MoveRequest[]>> {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      });
    }
    const response = await api.get<ApiResponse<MoveRequest[]>>(
      `/move-requests?${params.toString()}`
    );
    return response.data;
  },

  /**
   * Get pending move requests
   */
  async getPending(): Promise<ApiResponse<MoveRequest[]>> {
    const response = await api.get<ApiResponse<MoveRequest[]>>(
      "/move-requests/pending"
    );
    return response.data;
  },

  /**
   * Get current user's move requests
   */
  async getMyRequests(): Promise<ApiResponse<MoveRequest[]>> {
    const response = await api.get<ApiResponse<MoveRequest[]>>(
      "/move-requests/my-requests"
    );
    return response.data;
  },

  /**
   * Approve a move request
   */
  async approve(requestId: number): Promise<ApiResponse<void>> {
    const response = await api.post<ApiResponse<void>>(
      `/move-requests/${requestId}/approve`
    );
    return response.data;
  },

  /**
   * Deny a move request
   */
  async deny(requestId: number, reason?: string): Promise<ApiResponse<void>> {
    const response = await api.post<ApiResponse<void>>(
      `/move-requests/${requestId}/deny`,
      { reason }
    );
    return response.data;
  },
};
