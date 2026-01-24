import type { UserRole } from "../types";

export const permissions = {
  // User Management
  createUser: ["admin", "techsupport"],
  deleteUser: ["admin"],
  createAdmin: ["admin"],
  deactivateUser: ["admin", "techsupport"],
  enrollBiometrics: ["admin", "techsupport"],

  // Schedule Management
  createSchedule: ["admin"],
  deleteSchedule: ["admin"],
  approveScheduleMove: ["admin", "techsupport"],
  requestScheduleMove: ["teacher"],

  // Monitoring
  viewAllLogs: ["admin", "techsupport"],
  viewOwnLogs: ["teacher"],

  // System Configuration
  modifySystemConfig: ["admin"],
  viewSystemConfig: ["admin", "techsupport"],
  manualLockOverride: ["admin", "techsupport"],

  // Device Management
  viewDeviceStatus: ["admin", "techsupport"],
  troubleshootDevices: ["techsupport"],
};

export function hasPermission(
  userRole: UserRole,
  permission: keyof typeof permissions
): boolean {
  return permissions[permission].includes(userRole);
}
