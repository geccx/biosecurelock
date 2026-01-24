import api, { type ApiResponse } from "../lib/api";

export interface RolePrivilege {
  role: "teacher" | "techsupport";
  permissions: string[];
}

export interface AvailablePermissions {
  userManagement: string[];
  scheduleManagement: string[];
  accessControl: string[];
  monitoring: string[];
  systemConfiguration: string[];
  deviceManagement: string[];
}

export interface UpdateRolePrivilegesData {
  permissions: string[];
}

export const rolePrivilegesService = {
  /**
   * Get all available permissions grouped by category
   */
  async getAvailablePermissions(): Promise<ApiResponse<AvailablePermissions>> {
    const response = await api.get<ApiResponse<AvailablePermissions>>(
      "/role-privileges/permissions"
    );
    return response.data;
  },

  /**
   * Get all role privileges for Teacher and TechSupport
   */
  async getAllRolePrivileges(): Promise<ApiResponse<RolePrivilege[]>> {
    const response = await api.get<ApiResponse<RolePrivilege[]>>(
      "/role-privileges"
    );
    return response.data;
  },

  /**
   * Get role privileges for a specific role
   */
  async getRolePrivileges(
    role: "teacher" | "techsupport"
  ): Promise<ApiResponse<RolePrivilege>> {
    const response = await api.get<ApiResponse<RolePrivilege>>(
      `/role-privileges/${role}`
    );
    return response.data;
  },

  /**
   * Update role privileges for a specific role
   */
  async updateRolePrivileges(
    role: "teacher" | "techsupport",
    data: UpdateRolePrivilegesData
  ): Promise<ApiResponse<RolePrivilege>> {
    const response = await api.put<ApiResponse<RolePrivilege>>(
      `/role-privileges/${role}`,
      data
    );
    return response.data;
  },
};
