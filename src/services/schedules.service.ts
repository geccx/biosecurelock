import api, { type ApiResponse } from "../lib/api";

export interface Schedule {
  id: number;
  userId: number;
  name: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  autoUnlock: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScheduleData {
  name: string;
  daysOfWeek: number[];
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
  autoUnlock?: boolean;
}

export interface UpdateScheduleData {
  name?: string;
  daysOfWeek?: number[];
  startTime?: string;
  endTime?: string;
  autoUnlock?: boolean;
  isActive?: boolean;
}

export const schedulesService = {
  /**
   * Create a new schedule
   */
  async create(data: CreateScheduleData): Promise<ApiResponse<Schedule>> {
    const response = await api.post<ApiResponse<Schedule>>(
      "/access/schedules",
      data
    );
    return response.data;
  },

  /**
   * Get schedules for a user (or current user if no userId)
   */
  async getUserSchedules(userId?: number): Promise<ApiResponse<Schedule[]>> {
    const path = userId ? `/access/schedules/${userId}` : "/access/schedules";
    const response = await api.get<ApiResponse<Schedule[]>>(path);
    return response.data;
  },

  /**
   * Update a schedule
   */
  async update(
    scheduleId: number,
    data: UpdateScheduleData
  ): Promise<ApiResponse<Schedule>> {
    const response = await api.put<ApiResponse<Schedule>>(
      `/access/schedules/${scheduleId}`,
      data
    );
    return response.data;
  },

  /**
   * Delete a schedule
   */
  async delete(scheduleId: number): Promise<ApiResponse<void>> {
    const response = await api.delete<ApiResponse<void>>(
      `/access/schedules/${scheduleId}`
    );
    return response.data;
  },
};
