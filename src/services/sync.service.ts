import api, { type ApiResponse } from "../lib/api";

export interface DeviceSyncStatus {
  id: number;
  deviceName: string;
  tuyaDeviceId: string;
  status: "online" | "offline" | "error";
  connectivityStatus: "online" | "offline" | "unknown";
  lastChecked: string | null;
  lastHeartbeat: string | null;
  lastSuccessfulSync: string | null;
  lastCredentialSync: string | null;
  lastScheduleSync: string | null;
  lastLogRetrieval: string | null;
  pendingCredentials: number;
  pendingSchedules: number;
  lastError: string | null;
}

export interface SyncQueueItem {
  id: number;
  queueType: string;
  entityType: string;
  entityId: number;
  deviceId: number;
  deviceName: string;
  priority: number;
  status: "pending" | "processing" | "completed" | "failed";
  retryCount: number;
  maxRetries: number;
  lastAttemptAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface LogGap {
  id: number;
  deviceId: number;
  tuyaDeviceId: string;
  gapStart: string;
  gapEnd: string;
  status: string;
}

export interface CredentialSyncStatusItem {
  deviceId: number;
  deviceName: string;
  syncStatus: string;
  syncedAt: string | null;
  lastAttemptAt: string | null;
  retryCount: number;
  errorMessage: string | null;
}

export const syncService = {
  /** Get all device sync statuses */
  async getDevicesStatus(): Promise<ApiResponse<DeviceSyncStatus[]>> {
    const response =
      await api.get<ApiResponse<DeviceSyncStatus[]>>("/devices/status");
    return response.data;
  },

  /** Get single device sync status */
  async getDeviceStatus(
    deviceId: number,
  ): Promise<ApiResponse<DeviceSyncStatus>> {
    const response = await api.get<ApiResponse<DeviceSyncStatus>>(
      `/devices/${deviceId}/status`,
    );
    return response.data;
  },

  /** Ping device (check connectivity) */
  async pingDevice(
    deviceId: number,
  ): Promise<
    ApiResponse<{ online: boolean; deviceId: number; tuyaDeviceId: string }>
  > {
    const response = await api.post<
      ApiResponse<{ online: boolean; deviceId: number; tuyaDeviceId: string }>
    >(`/devices/${deviceId}/ping`);
    return response.data;
  },

  /** Get sync queue (pending by default) */
  async getSyncQueue(
    status = "pending",
  ): Promise<ApiResponse<SyncQueueItem[]>> {
    const response = await api.get<ApiResponse<SyncQueueItem[]>>(
      `/sync/queue?status=${status}`,
    );
    return response.data;
  },

  /** Retry failed sync by queue id */
  async retrySync(
    queueId: number,
  ): Promise<ApiResponse<{ status: string; retry_count: number }>> {
    const response = await api.post<
      ApiResponse<{ status: string; retry_count: number }>
    >(`/sync/retry/${queueId}`);
    return response.data;
  },

  /** Get sync audit history */
  async getSyncHistory(
    limit = 50,
  ): Promise<ApiResponse<Array<Record<string, unknown>>>> {
    const response = await api.get<ApiResponse<Array<Record<string, unknown>>>>(
      `/sync/history?limit=${limit}`,
    );
    return response.data;
  },

  /** Sync credential to device(s) */
  async syncCredential(data: {
    credentialType: "enrollment" | "temporary_password";
    credentialId: number;
    deviceIds?: number[];
  }): Promise<ApiResponse<{ queueIds: number[]; deviceCount: number }>> {
    const response = await api.post<
      ApiResponse<{ queueIds: number[]; deviceCount: number }>
    >("/sync/credentials/sync", data);
    return response.data;
  },

  /** Get credential sync status */
  async getCredentialSyncStatus(
    credentialId: number,
    type: "enrollment" | "temporary_password" = "enrollment",
  ): Promise<ApiResponse<CredentialSyncStatusItem[]>> {
    const response = await api.get<ApiResponse<CredentialSyncStatusItem[]>>(
      `/sync/credentials/sync-status/${credentialId}?type=${type}`,
    );
    return response.data;
  },

  /** Force immediate sync of all credentials (admin) */
  async forceSyncCredentials(): Promise<
    ApiResponse<{ synced: number; errors: unknown[] }>
  > {
    const response = await api.post<
      ApiResponse<{ synced: number; errors: unknown[] }>
    >("/sync/credentials/force-sync");
    return response.data;
  },

  /** Retrieve buffered logs from devices */
  async retrieveLogs(
    deviceId?: number,
  ): Promise<
    ApiResponse<{
      inserted?: number;
      duplicates?: number;
      devices?: Record<string, { inserted: number; duplicates: number }>;
    }>
  > {
    const url =
      deviceId != null
        ? `/logs/retrieve?deviceId=${deviceId}`
        : "/logs/retrieve";
    const response = await api.get<ApiResponse<Record<string, unknown>>>(url);
    return response.data;
  },

  /** Get missing log periods (gaps) */
  async getLogGaps(deviceId?: number): Promise<ApiResponse<LogGap[]>> {
    const url =
      deviceId != null ? `/logs/gaps?deviceId=${deviceId}` : "/logs/gaps";
    const response = await api.get<ApiResponse<LogGap[]>>(url);
    return response.data;
  },
};
