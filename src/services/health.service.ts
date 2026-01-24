import api from "../lib/api";

export interface HealthStatus {
  status: "ok" | "error";
  timestamp: string;
  services: {
    fabric: "connected" | "disconnected";
    scheduler: "running" | "stopped";
  };
}

export const healthService = {
  /**
   * Check the health of the backend server
   */
  async check(): Promise<HealthStatus> {
    const response = await api.get<HealthStatus>("/health");
    return response.data;
  },
};

