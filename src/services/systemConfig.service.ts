import api, { type ApiResponse } from "../lib/api";

export interface SystemConfig {
  lockStatus: "locked" | "unlocked";
  autoLockEnabled: boolean;
  maxAccessAttempts: number;
  sessionTimeout: number;
  notificationsEnabled: boolean;
  blockchainEnabled: boolean;
}

export interface UpdateConfigData {
  lockStatus?: "locked" | "unlocked";
  autoLockEnabled?: boolean;
  maxAccessAttempts?: number;
  sessionTimeout?: number;
  notificationsEnabled?: boolean;
  blockchainEnabled?: boolean;
}

export interface BlockchainStats {
  totalBlocks: number;
  networkStatus: string;
  lastBlockTime: string | null;
}

export interface DeviceStatus {
  deviceId: string;
  tuyaDeviceId: string;
  deviceName: string;
  location: string;
  status: "online" | "offline" | "error";
  tuyaStatus?: any;
  deviceDetails?: any;
  lastChecked: string;
}

export interface DeviceDetails {
  deviceId: string;
  tuyaDeviceId: string;
  deviceName: string;
  location: string;
  deviceDetails?: {
    id?: string;
    name?: string;
    uid?: string;
    category?: string;
    product_id?: string;
    product_name?: string;
    sub?: boolean;
    uuid?: string;
    owner_id?: string;
    online?: boolean;
    status?: Array<{
      code: string;
      value: any;
      type?: string;
    }>;
    active_time?: number;
    biz_type?: number;
    icon?: string;
    ip?: string;
    time_zone?: string;
    create_time?: number;
    update_time?: number;
  };
  lastChecked: string;
}

export interface UnlockDeviceResponse {
  deviceId: string;
  tuyaDeviceId: string;
  deviceName: string;
  timestamp: string;
  fabricTxId?: string | null;
  tuyaResponse?: any;
}

export const systemConfigService = {
  /**
   * Get system configuration
   */
  async getConfig(): Promise<ApiResponse<SystemConfig>> {
    const response = await api.get<ApiResponse<SystemConfig>>("/config");
    return response.data;
  },

  /**
   * Update system configuration
   */
  async updateConfig(data: UpdateConfigData): Promise<ApiResponse<void>> {
    const response = await api.put<ApiResponse<void>>("/config", data);
    return response.data;
  },

  /**
   * Get blockchain statistics
   */
  async getBlockchainStats(): Promise<ApiResponse<BlockchainStats>> {
    const response = await api.get<ApiResponse<BlockchainStats>>(
      "/config/blockchain-stats"
    );
    return response.data;
  },

  /**
   * Get device status (online/offline)
   */
  async getDeviceStatus(deviceId: string): Promise<ApiResponse<DeviceStatus>> {
    const response = await api.get<ApiResponse<DeviceStatus>>(
      `/config/device/${deviceId}/status`
    );
    return response.data;
  },

  /**
   * Get device from .env file
   */
  async getDeviceFromEnv(): Promise<ApiResponse<any>> {
    const response = await api.get<ApiResponse<any>>(
      `/config/device/env`
    );
    return response.data;
  },

  /**
   * Get device details using GET /v1.0/devices/{device_id}
   */
  async getDeviceDetails(
    deviceId: string
  ): Promise<ApiResponse<DeviceDetails>> {
    const response = await api.get<ApiResponse<DeviceDetails>>(
      `/config/device/${deviceId}/details`
    );
    return response.data;
  },

  /**
   * Unlock device without password (Admin and TechSupport only)
   */
  async unlockDevice(
    deviceId: string
  ): Promise<ApiResponse<UnlockDeviceResponse>> {
    const response = await api.post<ApiResponse<UnlockDeviceResponse>>(
      `/config/device/${deviceId}/unlock`
    );
    return response.data;
  },

  /**
   * Lock device (Admin and TechSupport only)
   */
  async lockDevice(
    deviceId: string
  ): Promise<ApiResponse<UnlockDeviceResponse>> {
    const response = await api.post<ApiResponse<UnlockDeviceResponse>>(
      `/config/device/${deviceId}/lock`
    );
    return response.data;
  },
};
