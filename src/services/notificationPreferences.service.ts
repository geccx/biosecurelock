import api, { type ApiResponse } from "../lib/api";

export interface NotificationPreferences {
  id: number;
  user_id: number;
  schedule_approved: boolean;
  schedule_disapproved: boolean;
  new_user_added: boolean;
  device_error: boolean;
  enrollment_approved: boolean;
  enrollment_rejected: boolean;
  move_request_approved: boolean;
  move_request_denied: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpdateNotificationPreferencesData {
  schedule_approved?: boolean;
  schedule_disapproved?: boolean;
  new_user_added?: boolean;
  device_error?: boolean;
  enrollment_approved?: boolean;
  enrollment_rejected?: boolean;
  move_request_approved?: boolean;
  move_request_denied?: boolean;
}

export interface Notification {
  id: number;
  user_id: number;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  user_name?: string;
  user_email?: string;
}

export interface NotificationListResponse {
  data: Notification[];
  total: number;
}

export const notificationPreferencesService = {
  /**
   * Get current user's notification preferences
   */
  async getPreferences(): Promise<ApiResponse<NotificationPreferences>> {
    const response = await api.get<ApiResponse<NotificationPreferences>>(
      "/notifications/preferences"
    );
    return response.data;
  },

  /**
   * Update current user's notification preferences
   */
  async updatePreferences(
    data: UpdateNotificationPreferencesData
  ): Promise<ApiResponse<NotificationPreferences>> {
    const response = await api.put<ApiResponse<NotificationPreferences>>(
      "/notifications/preferences",
      data
    );
    return response.data;
  },

  /**
   * Get current user's notifications
   */
  async getNotifications(params?: {
    limit?: number;
    offset?: number;
    unread_only?: boolean;
  }): Promise<ApiResponse<NotificationListResponse>> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append("limit", params.limit.toString());
    if (params?.offset) queryParams.append("offset", params.offset.toString());
    if (params?.unread_only !== undefined)
      queryParams.append("unread_only", params.unread_only.toString());

    const response = await api.get<ApiResponse<NotificationListResponse>>(
      `/notifications/notifications?${queryParams.toString()}`
    );
    return response.data;
  },

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: number): Promise<ApiResponse<void>> {
    const response = await api.post<ApiResponse<void>>(
      `/notifications/notifications/${notificationId}/read`
    );
    return response.data;
  },

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(): Promise<ApiResponse<void>> {
    const response = await api.post<ApiResponse<void>>(
      "/notifications/notifications/read-all"
    );
    return response.data;
  },

  /**
   * Get all notifications (admin and techsupport only)
   */
  async getAllNotifications(params?: {
    limit?: number;
    offset?: number;
    unread_only?: boolean;
    user_id?: number;
  }): Promise<ApiResponse<NotificationListResponse>> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append("limit", params.limit.toString());
    if (params?.offset) queryParams.append("offset", params.offset.toString());
    if (params?.unread_only !== undefined)
      queryParams.append("unread_only", params.unread_only.toString());
    if (params?.user_id) queryParams.append("user_id", params.user_id.toString());

    const response = await api.get<ApiResponse<NotificationListResponse>>(
      `/notifications/notifications/all?${queryParams.toString()}`
    );
    return response.data;
  },

  /**
   * Delete notification (admin only)
   */
  async deleteNotification(notificationId: number): Promise<ApiResponse<void>> {
    const response = await api.delete<ApiResponse<void>>(
      `/notifications/notifications/${notificationId}`
    );
    return response.data;
  },

  /**
   * Delete all notifications (admin only)
   */
  async deleteAllNotifications(userId?: number): Promise<ApiResponse<void>> {
    const queryParams = new URLSearchParams();
    if (userId) queryParams.append("user_id", userId.toString());
    
    const response = await api.delete<ApiResponse<void>>(
      `/notifications/notifications${queryParams.toString() ? `?${queryParams.toString()}` : ""}`
    );
    return response.data;
  },

  /**
   * Mark notification as read (admin can mark any, others only their own)
   */
  async markNotificationAsRead(notificationId: number): Promise<ApiResponse<void>> {
    const response = await api.post<ApiResponse<void>>(
      `/notifications/notifications/${notificationId}/read-admin`
    );
    return response.data;
  },
};

