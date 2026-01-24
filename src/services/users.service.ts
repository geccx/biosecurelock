import api, { type ApiResponse } from "../lib/api";

export interface BackendUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status?: string;
  department?: string;
  createdAt: string;
  fingerprint?: string;
  rfid?: string;
  pin?: string;
}

export interface CreateUserData {
  name: string;
  email: string;
  password: string;
  role: "admin" | "teacher" | "techsupport";
  tuya_user_id?: string; // Optional: If not provided, will be created automatically in background
  department?: string;
  sex?: number; // 1=male, 2=female
  birthday?: number; // Unix timestamp in seconds
  height?: number; // Height in cm
  weight?: number; // Weight in g
  back_home_notify_attr?: number; // Automatically set to 1 (enabled) to notify admin and techsupport
}

export interface UpdateUserData {
  name?: string;
  email?: string;
  role?: string;
  status?: string;
}

export interface UpdatePermissionsData {
  permissions: string[];
}

export interface Teacher {
  id: string;
  name: string;
  email: string;
}

export const usersService = {
  /**
   * Get all users (admin only)
   */
  async getAll(): Promise<ApiResponse<BackendUser[]>> {
    const response = await api.get<ApiResponse<BackendUser[]>>("/users");
    return response.data;
  },

  /**
   * Get current user
   */
  async getMe(): Promise<ApiResponse<BackendUser>> {
    const response = await api.get<ApiResponse<BackendUser>>("/users/me");
    return response.data;
  },

  /**
   * Get user by ID
   */
  async getById(userId: number): Promise<ApiResponse<BackendUser>> {
    const response = await api.get<ApiResponse<BackendUser>>(
      `/users/${userId}`
    );
    return response.data;
  },

  /**
   * Create a new user (admin only)
   * Flow: 1) Add device user in Tuya, 2) If successful, create login credentials in system
   * Requires: tuya_user_id (uid from Tuya platform)
   * Only allows: admin, teacher, techsupport roles
   */
  async create(
    data: CreateUserData
  ): Promise<
    ApiResponse<
      BackendUser & { tuyaUserId?: string; tuyaDeviceUserId?: string }
    >
  > {
    const response = await api.post<
      ApiResponse<
        BackendUser & { tuyaUserId?: string; tuyaDeviceUserId?: string }
      >
    >("/users", data);
    return response.data;
  },

  /**
   * Update user (admin only)
   */
  async update(
    userId: number,
    data: UpdateUserData
  ): Promise<ApiResponse<void>> {
    const response = await api.put<ApiResponse<void>>(`/users/${userId}`, data);
    return response.data;
  },

  /**
   * Toggle user status (activate/deactivate)
   */
  async toggleStatus(
    userId: number
  ): Promise<ApiResponse<{ id: string; status: string }>> {
    const response = await api.post<
      ApiResponse<{ id: string; status: string }>
    >(`/users/${userId}/toggle-status`);
    return response.data;
  },

  /**
   * Toggle user status (activate/deactivate) - Tech Support specific
   */
  async toggleStatusTechSupport(
    userId: number
  ): Promise<ApiResponse<{ id: string; status: string }>> {
    const response = await api.post<
      ApiResponse<{ id: string; status: string }>
    >(`/users/techsupport/${userId}/toggle-status`);
    return response.data;
  },

  /**
   * Reset user password (techsupport and admin)
   * Sets password to temporary password "1234567"
   */
  async resetPassword(
    userId: number
  ): Promise<
    ApiResponse<{ id: string; email: string; temporaryPassword: string }>
  > {
    const response = await api.post<
      ApiResponse<{ id: string; email: string; temporaryPassword: string }>
    >(`/users/techsupport/${userId}/reset-password`);
    return response.data;
  },

  /**
   * Delete user (admin only)
   */
  async delete(userId: number): Promise<ApiResponse<void>> {
    const response = await api.delete<ApiResponse<void>>(`/users/${userId}`);
    return response.data;
  },

  /**
   * Update user permissions (admin only)
   */
  async updatePermissions(
    userId: number,
    data: UpdatePermissionsData
  ): Promise<ApiResponse<void>> {
    const response = await api.put<ApiResponse<void>>(
      `/users/${userId}/permissions`,
      data
    );
    return response.data;
  },

  /**
   * Get list of teachers (for schedule dropdowns)
   */
  async getTeachers(): Promise<ApiResponse<Teacher[]>> {
    const response = await api.get<ApiResponse<Teacher[]>>(
      "/users/list/teachers"
    );
    return response.data;
  },

  /**
   * Get users enrolled in Tuya smart lock (admin only)
   * Uses the aggregated method that combines all unlock types
   */
  async getTuyaUsers(): Promise<ApiResponse<TuyaUser[]>> {
    console.log(`[Frontend] Calling Tuya users API (aggregated method)`);

    const response = await api.get<ApiResponse<TuyaUser[]>>(
      "/users/tuya/enrolled"
    );
    return response.data;
  },

  /**
   * Update Tuya device user information
   * @param userId - Tuya user ID (lock_user_id or user_id)
   * @param data - Update data with nick_name, sex, birthday, height, weight
   */
  async updateTuyaDeviceUser(
    userId: string,
    data: {
      nick_name?: string;
      sex: number; // 1=male, 2=female
      birthday?: number;
      height?: number;
      weight?: number;
    }
  ): Promise<ApiResponse<void>> {
    const response = await api.put<ApiResponse<void>>(
      `/users/tuya/user/${userId}`,
      data
    );
    return response.data;
  },

  /**
   * Delete Tuya device user
   * @param userId - Tuya user ID (lock_user_id or user_id)
   */
  async deleteTuyaDeviceUser(userId: string): Promise<ApiResponse<void>> {
    const response = await api.delete<ApiResponse<void>>(
      `/users/tuya/user/${userId}`
    );
    return response.data;
  },

  /**
   * Get detailed Tuya device user information
   * Uses v1.0 endpoint: GET /v1.0/smart-lock/devices/{device_id}/users
   * @param userId - Tuya user ID (lock_user_id or user_id)
   * @param codes - Optional comma-separated unlock method codes
   */
  async getTuyaUserDetails(
    userId: string,
    codes?: string
  ): Promise<ApiResponse<TuyaUser>> {
    const params = codes ? `?codes=${encodeURIComponent(codes)}` : "";
    const response = await api.get<ApiResponse<TuyaUser>>(
      `/users/tuya/user/${userId}/details${params}`
    );
    return response.data;
  },

  /**
   * Add an unlocking method to a Tuya device user (defaults to password)
   * Backend should proxy to Tuya allocate API
   */
  async addTuyaUserUnlockingMethod(
    userId: string,
    unlockSn: number | string
  ): Promise<ApiResponse<{ id: number }>> {
    const payload = {
      unlockSn,
      dpCode: "unlock_password", // Tuya doc: dp_code for password assignment
    };

    const response = await api.post<ApiResponse<{ id: number }>>(
      `/users/tuya/user/${userId}/unlocking-methods`,
      payload
    );
    return response.data;
  },

  /**
   * Create temporary password for a Tuya user
   * Uses the new ticket-based encryption approach
   */
  async createTempPasswordForUser(
    userId: string,
    data: {
      name: string;
      password: string;
      validFrom: string; // ISO8601
      validUntil: string; // ISO8601
      maxUsage?: number;
      phone?: string;
      time_zone?: string;
      schedule_list?: Array<{
        effective_time: number;
        invalid_time: number;
        working_day: number;
      }>;
      relate_dev_list?: string[];
    }
  ): Promise<ApiResponse<{ id: number; tuyaResponse?: unknown }>> {
    const response = await api.post<
      ApiResponse<{ id: number; tuyaResponse?: unknown }>
    >(`/users/tuya/user/${userId}/unlocking-methods`, data);
    return response.data;
  },
};

export interface TuyaUser {
  // Core user fields
  user_id: string;
  lock_user_id: number;
  uid: string;
  nick_name?: string;
  user_contact?: string;
  avatar_url?: string;
  user_type: number; // 10=Admin, 20=Member, 50=Owner
  effective_flag: number; // 1=Active, 0=Inactive
  offline_unlock: boolean;
  back_home_notify_attr: number;

  // User profile fields (for editing)
  sex?: number; // 1=male, 2=female
  birthday?: number; // Unix timestamp
  height?: number; // Height in cm
  weight?: number; // Weight in g

  // Unlock methods (aggregated from all unlock types)
  unlock_detail?: Array<{
    dp_code: string;
    count: number;
    unlock_list: Array<{
      unlock_id?: string;
      unlock_name?: string;
      unlock_sn?: number;
      admin: boolean;
      dev_id: string;
      dp_code: string;
      op_mode_id: number;
      photo_unlock: boolean;
      unlock_attr: number;
      allocate_flag: number;
      user_not_back_home_notify_attr: number;
    }>;
  }>;

  time_schedule_info?: {
    permanent: boolean;
    effective_time: number;
    expired_time: number;
    user_time_set: string;
    schedule_details?: Array<{
      all_day: boolean;
      effective_time: number;
      invalid_time: number;
      time_zone_id: string;
      working_day: number;
    }>;
  };

  // Platform User fields (kept for compatibility)
  tuyaUserId?: string;
  tuyaUserName?: string;
  userNickName?: string;
  countryCode?: string;
  accountType?: string;
  createTime?: number;

  // Local user mapping (from your database)
  localUserId?: string;
  localUserName?: string;
  localUserEmail?: string;
  localUser?: {
    id: string;
    name: string;
    email: string;
  };

  // Computed field for display
  unlockMethods?: Array<{
    type: string;
    unlockName: string;
    unlockSn: number;
    unlockId?: string;
    admin?: boolean;
    photoUnlock?: boolean;
    unlockAttr?: number;
    opModeId?: number;
  }>;
}
