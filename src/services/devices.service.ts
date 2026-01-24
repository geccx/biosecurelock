import api, { type ApiResponse } from "../lib/api";

export interface Device {
  id: string;
  deviceName: string;
  type: "lock" | "fingerprint" | "rfid" | "network";
  status: "online" | "offline" | "error";
  lastChecked: string;
  location: string;
  tuyaDeviceId?: string;
  tuyaDetails?: TuyaDeviceDetails | null;
  statusDetails?: Array<{
    code: string;
    value: unknown;
  }>;
  error?: string;
}

export interface TuyaDeviceDetails {
  productName?: string | null;
  productId?: string | null;
  deviceName?: string | null;
  online: boolean;
  activeTime?: number | null;
  timeZone?: string | null;
  ip?: string | null;
  localKey?: string | null;
  category?: string | null;
  model?: string | null;
  uuid?: string | null;
}

export interface CreateDeviceData {
  deviceName: string;
  type: "lock" | "fingerprint" | "rfid" | "network";
  location: string;
  tuyaDeviceId?: string;
}

export interface UpdateDeviceData {
  deviceName?: string;
  type?: "lock" | "fingerprint" | "rfid" | "network";
  status?: "online" | "offline" | "error";
  location?: string;
  tuyaDeviceId?: string;
}

export const devicesService = {
  /**
   * Get all devices
   */
  async getAll(): Promise<ApiResponse<Device[]>> {
    const response = await api.get<ApiResponse<Device[]>>("/devices");
    return response.data;
  },

  /**
   * Get a single device by ID
   */
  async getById(deviceId: number): Promise<ApiResponse<Device>> {
    const response = await api.get<ApiResponse<Device>>(`/devices/${deviceId}`);
    return response.data;
  },

  /**
   * Create a new device
   */
  async create(data: CreateDeviceData): Promise<ApiResponse<Device>> {
    const response = await api.post<ApiResponse<Device>>("/devices", data);
    return response.data;
  },

  /**
   * Update a device
   */
  async update(
    deviceId: number,
    data: UpdateDeviceData
  ): Promise<ApiResponse<void>> {
    const response = await api.put<ApiResponse<void>>(
      `/devices/${deviceId}`,
      data
    );
    return response.data;
  },

  /**
   * Check device health/status
   */
  async checkHealth(
    deviceId: number
  ): Promise<ApiResponse<{ id: string; status: string; lastChecked: string }>> {
    const response = await api.post<
      ApiResponse<{ id: string; status: string; lastChecked: string }>
    >(`/devices/${deviceId}/health-check`);
    return response.data;
  },

  /**
   * Refresh all devices status
   */
  async refreshAll(): Promise<ApiResponse<Device[]>> {
    const response = await api.post<ApiResponse<Device[]>>("/devices/refresh");
    return response.data;
  },

  /**
   * Delete a device
   */
  async delete(deviceId: number): Promise<ApiResponse<void>> {
    const response = await api.delete<ApiResponse<void>>(
      `/devices/${deviceId}`
    );
    return response.data;
  },

  /**
   * Get online smart door locks from Tuya
   */
  async getOnlineDoorLocks(): Promise<ApiResponse<Device[]>> {
    const response = await api.get<ApiResponse<Device[]>>(
      "/devices/online-door-locks"
    );
    return response.data;
  },

  /**
   * Get device status with Tuya details
   */
  async getStatusWithTuya(): Promise<ApiResponse<Device[]>> {
    const response = await api.get<ApiResponse<Device[]>>(
      "/devices/status/tuya"
    );
    return response.data;
  },

  /**
   * Get smart door lock and gateway status using GET /v1.0/devices/{device_id}
   */
  async getLockAndGatewayStatus(): Promise<
    ApiResponse<{
      smartDoorLock: LockAndGatewayStatus | null;
      gateway: LockAndGatewayStatus | null;
    }>
  > {
    const response = await api.get<
      ApiResponse<{
        smartDoorLock: LockAndGatewayStatus | null;
        gateway: LockAndGatewayStatus | null;
      }>
    >("/devices/status/lock-and-gateway");
    return response.data;
  },
};

export interface LockAndGatewayStatus {
  id?: string;
  uuid?: string;
  uid?: string;
  bizType?: number;
  name?: string;
  timeZone?: string;
  ip?: string;
  localKey?: string;
  sub?: boolean;
  model?: string;
  createTime?: number;
  updateTime?: number;
  activeTime?: number;
  status?: Array<{
    code: string;
    value: unknown;
  }>;
  ownerId?: string;
  productId?: string;
  productName?: string;
  category?: string;
  icon?: string;
  online: boolean;
  nodeId?: string;
  lat?: string;
  lon?: string;
  error?: string;
  rawResponse?: unknown;
}

export interface TuyaDeviceLog {
  code: string;
  value: unknown;
  event_time: number;
  event_from: string;
  event_id: number;
  row?: string;
  status: string;
}

export interface TuyaDeviceLogsResponse {
  device_id: string;
  has_next: boolean;
  current_row_key?: string;
  next_row_key?: string;
  logs: TuyaDeviceLog[];
  count?: number;
}

export interface TuyaLogsParams {
  codes?: string;
  type?: string;
  start_time?: number;
  end_time?: number;
  query_type?: number;
  start_row_key?: string;
  last_row_key?: string;
  last_event_time?: number;
  size?: number;
}

export const tuyaLogsService = {
  /**
   * Get Tuya device logs
   */
  async getDeviceLogs(
    params?: TuyaLogsParams
  ): Promise<ApiResponse<TuyaDeviceLogsResponse>> {
    const queryParams = new URLSearchParams();
    if (params?.codes) queryParams.append("codes", params.codes);
    if (params?.type) queryParams.append("type", params.type);
    if (params?.start_time)
      queryParams.append("start_time", params.start_time.toString());
    if (params?.end_time)
      queryParams.append("end_time", params.end_time.toString());
    if (params?.query_type)
      queryParams.append("query_type", params.query_type.toString());
    if (params?.start_row_key)
      queryParams.append("start_row_key", params.start_row_key);
    if (params?.last_row_key)
      queryParams.append("last_row_key", params.last_row_key);
    if (params?.last_event_time)
      queryParams.append("last_event_time", params.last_event_time.toString());
    if (params?.size) queryParams.append("size", params.size.toString());

    const queryString = queryParams.toString();
    const url = `/devices/tuya/device/logs${queryString ? `?${queryString}` : ""}`;
    const response = await api.get<ApiResponse<TuyaDeviceLogsResponse>>(url);
    return response.data;
  },

  /**
   * Get Tuya gateway logs
   */
  async getGatewayLogs(
    params?: TuyaLogsParams
  ): Promise<ApiResponse<TuyaDeviceLogsResponse>> {
    const queryParams = new URLSearchParams();
    if (params?.codes) queryParams.append("codes", params.codes);
    if (params?.type) queryParams.append("type", params.type);
    if (params?.start_time)
      queryParams.append("start_time", params.start_time.toString());
    if (params?.end_time)
      queryParams.append("end_time", params.end_time.toString());
    if (params?.query_type)
      queryParams.append("query_type", params.query_type.toString());
    if (params?.start_row_key)
      queryParams.append("start_row_key", params.start_row_key);
    if (params?.last_row_key)
      queryParams.append("last_row_key", params.last_row_key);
    if (params?.last_event_time)
      queryParams.append("last_event_time", params.last_event_time.toString());
    if (params?.size) queryParams.append("size", params.size.toString());

    const queryString = queryParams.toString();
    const url = `/devices/tuya/gateway/logs${queryString ? `?${queryString}` : ""}`;
    const response = await api.get<ApiResponse<TuyaDeviceLogsResponse>>(url);
    return response.data;
  },
};