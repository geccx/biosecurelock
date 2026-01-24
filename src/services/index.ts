// Export all services for easy importing
export { authService } from "./auth.service";
export type {
  LoginCredentials,
  RegisterData,
  AuthUser,
  CurrentUser,
} from "./auth.service";

export { usersService } from "./users.service";
export type {
  BackendUser,
  UpdatePermissionsData,
  CreateUserData,
  UpdateUserData,
  Teacher,
  TuyaUser,
} from "./users.service";

export { accessService } from "./access.service";
export type {
  UnlockRequest,
  TempPasswordRequest,
  AccessLog,
  AccessStats,
  AccessLogFilters,
} from "./access.service";

export { schedulesService } from "./schedules.service";
export type {
  Schedule as BackendSchedule,
  CreateScheduleData,
  UpdateScheduleData,
} from "./schedules.service";

export { enrollmentsService } from "./enrollments.service";
export type {
  Enrollment,
  CreateEnrollmentData,
  RejectEnrollmentData,
  SyncEnrollmentData,
} from "./enrollments.service";

export { logsService } from "./logs.service";
export type {
  AccessLogEntry,
  SystemLogEntry,
  LogFilters,
  LogStats,
  TuyaUnlockingHistoryEntry,
} from "./logs.service";

// New services for complete frontend-backend integration
export { dashboardService } from "./dashboard.service";
export type {
  DashboardStats,
  SystemStatus,
  RecentAccessLog,
  PendingApproval,
} from "./dashboard.service";

export { labSchedulesService } from "./labSchedules.service";
export type {
  LabSchedule,
  CreateLabScheduleData,
  UpdateLabScheduleData,
  LabScheduleFilters,
} from "./labSchedules.service";

export { moveRequestsService } from "./moveRequests.service";
export type {
  MoveRequest,
  CreateMoveRequestData,
  MoveRequestFilters,
} from "./moveRequests.service";

export { laboratoriesService } from "./laboratories.service";
export type {
  Laboratory,
  CreateLaboratoryData,
  UpdateLaboratoryData,
} from "./laboratories.service";

export { devicesService } from "./devices.service";
export type {
  Device,
  CreateDeviceData,
  UpdateDeviceData,
} from "./devices.service";

export { systemConfigService } from "./systemConfig.service";
export type {
  SystemConfig,
  UpdateConfigData,
  BlockchainStats,
  DeviceDetails,
  DeviceStatus,
  UnlockDeviceResponse,
} from "./systemConfig.service";

export { tuyaLogsService } from "./devices.service";
export type {
  TuyaDeviceLog,
  TuyaDeviceLogsResponse,
  TuyaLogsParams,
} from "./devices.service";

export { notificationPreferencesService } from "./notificationPreferences.service";
export type {
  NotificationPreferences,
  UpdateNotificationPreferencesData,
  Notification,
  NotificationListResponse,
} from "./notificationPreferences.service";

export { passwordRequestsService } from "./passwordRequests.service";
export type {
  PasswordRequest,
  PasswordRequestFilters,
} from "./passwordRequests.service";

export { rolePrivilegesService } from "./rolePrivileges.service";
export type {
  RolePrivilege,
  AvailablePermissions,
  UpdateRolePrivilegesData,
} from "./rolePrivileges.service";
