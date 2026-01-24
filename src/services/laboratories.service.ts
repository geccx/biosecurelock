import api, { type ApiResponse } from "../lib/api";

export interface Laboratory {
  id: string;
  name: string;
  location: string;
  capacity: number;
  lockStatus: "locked" | "unlocked";
  currentOccupancy: number;
  lastAccessed?: string;
  assignedSchedules: number;
  deviceId?: string;
}

export interface CreateLaboratoryData {
  name: string;
  location: string;
  capacity?: number;
  deviceId?: string;
}

export interface UpdateLaboratoryData {
  name?: string;
  location?: string;
  capacity?: number;
  deviceId?: string;
}

export const laboratoriesService = {
  /**
   * Get all laboratories
   */
  async getAll(): Promise<ApiResponse<Laboratory[]>> {
    const response = await api.get<ApiResponse<Laboratory[]>>("/laboratories");
    return response.data;
  },

  /**
   * Get a single laboratory by ID
   */
  async getById(labId: number): Promise<ApiResponse<Laboratory>> {
    const response = await api.get<ApiResponse<Laboratory>>(
      `/laboratories/${labId}`
    );
    return response.data;
  },

  /**
   * Create a new laboratory
   */
  async create(data: CreateLaboratoryData): Promise<ApiResponse<Laboratory>> {
    const response = await api.post<ApiResponse<Laboratory>>(
      "/laboratories",
      data
    );
    return response.data;
  },

  /**
   * Update a laboratory
   */
  async update(
    labId: number,
    data: UpdateLaboratoryData
  ): Promise<ApiResponse<void>> {
    const response = await api.put<ApiResponse<void>>(
      `/laboratories/${labId}`,
      data
    );
    return response.data;
  },

  /**
   * Toggle lock status for a laboratory
   */
  async toggleLock(
    labId: number
  ): Promise<ApiResponse<{ id: string; lockStatus: string }>> {
    const response = await api.post<
      ApiResponse<{ id: string; lockStatus: string }>
    >(`/laboratories/${labId}/toggle-lock`);
    return response.data;
  },

  /**
   * Lock all laboratories
   */
  async lockAll(): Promise<ApiResponse<void>> {
    const response = await api.post<ApiResponse<void>>(
      "/laboratories/lock-all"
    );
    return response.data;
  },

  /**
   * Unlock all laboratories
   */
  async unlockAll(): Promise<ApiResponse<void>> {
    const response = await api.post<ApiResponse<void>>(
      "/laboratories/unlock-all"
    );
    return response.data;
  },

  /**
   * Delete a laboratory
   */
  async delete(labId: number): Promise<ApiResponse<void>> {
    const response = await api.delete<ApiResponse<void>>(
      `/laboratories/${labId}`
    );
    return response.data;
  },
};
