import api, { type ApiResponse } from "../lib/api";

export interface LabSchedule {
  id: string;
  labName: string;
  teacherId: string;
  teacherName: string;
  startTime: string;
  endTime: string;
  subject?: string;
  status: "scheduled" | "completed" | "cancelled" | "pending";
  createdBy?: string;
  createdAt: string;
}

export interface CreateLabScheduleData {
  labName: string;
  teacherId: number;
  startTime: string;
  endTime: string;
  subject?: string;
}

export interface UpdateLabScheduleData {
  labName?: string;
  teacherId?: number;
  startTime?: string;
  endTime?: string;
  subject?: string;
  status?: "scheduled" | "completed" | "cancelled";
}

export interface LabScheduleFilters {
  status?: string;
  teacherId?: number;
  labName?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export const labSchedulesService = {
  /**
   * Create a new lab schedule
   */
  async create(data: CreateLabScheduleData): Promise<ApiResponse<LabSchedule>> {
    const response = await api.post<ApiResponse<LabSchedule>>(
      "/lab-schedules",
      data
    );
    return response.data;
  },

  /**
   * Get all lab schedules
   */
  async getAll(
    filters?: LabScheduleFilters
  ): Promise<ApiResponse<LabSchedule[]>> {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      });
    }
    const response = await api.get<ApiResponse<LabSchedule[]>>(
      `/lab-schedules?${params.toString()}`
    );
    return response.data;
  },

  /**
   * Get current user's schedules (for teachers)
   */
  async getMySchedules(): Promise<ApiResponse<LabSchedule[]>> {
    const response = await api.get<ApiResponse<LabSchedule[]>>(
      "/lab-schedules/my-schedules"
    );
    return response.data;
  },

  /**
   * Get schedules for a specific teacher
   */
  async getTeacherSchedules(
    teacherId: number
  ): Promise<ApiResponse<LabSchedule[]>> {
    const response = await api.get<ApiResponse<LabSchedule[]>>(
      `/lab-schedules/teacher/${teacherId}`
    );
    return response.data;
  },

  /**
   * Get a single schedule by ID
   */
  async getById(scheduleId: number): Promise<ApiResponse<LabSchedule>> {
    const response = await api.get<ApiResponse<LabSchedule>>(
      `/lab-schedules/${scheduleId}`
    );
    return response.data;
  },

  /**
   * Update a schedule
   */
  async update(
    scheduleId: number,
    data: UpdateLabScheduleData
  ): Promise<ApiResponse<void>> {
    const response = await api.put<ApiResponse<void>>(
      `/lab-schedules/${scheduleId}`,
      data
    );
    return response.data;
  },

  /**
   * Delete a schedule
   */
  async delete(scheduleId: number): Promise<ApiResponse<void>> {
    const response = await api.delete<ApiResponse<void>>(
      `/lab-schedules/${scheduleId}`
    );
    return response.data;
  },

  /**
   * Approve a pending schedule
   */
  async approve(scheduleId: number): Promise<ApiResponse<void>> {
    const response = await api.post<ApiResponse<void>>(
      `/lab-schedules/${scheduleId}/approve`
    );
    return response.data;
  },

  /**
   * Disapprove/reject a pending schedule
   */
  async disapprove(
    scheduleId: number,
    reason?: string
  ): Promise<ApiResponse<void>> {
    const response = await api.post<ApiResponse<void>>(
      `/lab-schedules/${scheduleId}/disapprove`,
      { reason }
    );
    return response.data;
  },
};
