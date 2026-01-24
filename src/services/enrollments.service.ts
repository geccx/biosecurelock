import api, { type ApiResponse } from "../lib/api";

export interface Enrollment {
  id: number;
  userId: number;
  enrollmentType: "fingerprint" | "rfid" | "pin";
  status: "pending" | "approved" | "rejected" | "synced";
  enrollmentData: Record<string, unknown>;
  tuyaUnlockId?: string;
  approvedBy?: number;
  approvedAt?: string;
  rejectedReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEnrollmentData {
  userId: number;
  enrollmentType: "fingerprint" | "rfid" | "pin";
  enrollmentData: Record<string, unknown>;
}

export interface RejectEnrollmentData {
  reason?: string;
}

export interface SyncEnrollmentData {
  tuyaUnlockId: string;
}

export const enrollmentsService = {
  /**
   * Request a new enrollment
   */
  async create(data: CreateEnrollmentData): Promise<ApiResponse<Enrollment>> {
    const response = await api.post<ApiResponse<Enrollment>>(
      "/enrollments",
      data
    );
    return response.data;
  },

  /**
   * Get pending enrollments (admin only)
   */
  async getPending(): Promise<ApiResponse<Enrollment[]>> {
    const response = await api.get<ApiResponse<Enrollment[]>>(
      "/enrollments/pending"
    );
    return response.data;
  },

  /**
   * Get enrollments for a specific user
   */
  async getUserEnrollments(userId: number): Promise<ApiResponse<Enrollment[]>> {
    const response = await api.get<ApiResponse<Enrollment[]>>(
      `/enrollments/user/${userId}`
    );
    return response.data;
  },

  /**
   * Approve an enrollment (admin only)
   */
  async approve(enrollmentId: number): Promise<ApiResponse<Enrollment>> {
    const response = await api.post<ApiResponse<Enrollment>>(
      `/enrollments/${enrollmentId}/approve`
    );
    return response.data;
  },

  /**
   * Reject an enrollment (admin only)
   */
  async reject(
    enrollmentId: number,
    data?: RejectEnrollmentData
  ): Promise<ApiResponse<Enrollment>> {
    const response = await api.post<ApiResponse<Enrollment>>(
      `/enrollments/${enrollmentId}/reject`,
      data || {}
    );
    return response.data;
  },

  /**
   * Sync physical enrollment with Tuya device (admin only)
   */
  async sync(
    enrollmentId: number,
    data: SyncEnrollmentData
  ): Promise<ApiResponse<Enrollment>> {
    const response = await api.post<ApiResponse<Enrollment>>(
      `/enrollments/${enrollmentId}/sync`,
      data
    );
    return response.data;
  },

  /**
   * Delete an enrollment
   */
  async delete(enrollmentId: number): Promise<ApiResponse<void>> {
    const response = await api.delete<ApiResponse<void>>(
      `/enrollments/${enrollmentId}`
    );
    return response.data;
  },
};
