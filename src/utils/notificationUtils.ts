import type { PasswordRequest } from "../services/passwordRequests.service";
import type { LabSchedule } from "../services/labSchedules.service";
import type { MoveRequest } from "../services/moveRequests.service";

export type RequestNotificationCategory =
  | "pin_request"
  | "schedule_request"
  | "move_request"
  | "move_request_submitted"
  | "system";

export interface RequestNotification {
  id: string;
  category: RequestNotificationCategory;
  title: string;
  message: string;
  timestamp: string;
  source: string;
  userName?: string;
  labName?: string;
  requestId?: string | number;
  backendId?: number;
  canMarkRead?: boolean;
  read?: boolean;
}

export function buildRequestNotifications(params: {
  passwordRequests?: PasswordRequest[];
  schedules?: LabSchedule[];
  moveRequests?: MoveRequest[];
  systemNotifications?: Notification[];
}): RequestNotification[] {
  const notifications: RequestNotification[] = [];

  if (params.passwordRequests) {
    params.passwordRequests.forEach((req) => {
      notifications.push({
        id: `pin-request-${req.id}`,
        category: "pin_request",
        title: "PIN/Password Request",
        message: `${req.userName} requested a PIN/password for ${req.labName}. Schedule: ${new Date(
          req.scheduleStartTime
        ).toLocaleString()}`,
        timestamp: req.createdAt,
        source: "Password Requests",
        userName: req.userName,
        labName: req.labName,
        requestId: req.id,
      });
    });
  }

  if (params.schedules) {
    params.schedules.forEach((schedule) => {
      notifications.push({
        id: `schedule-request-${schedule.id}`,
        category: "schedule_request",
        title: "Schedule Request",
        message: `${schedule.teacherName || "Teacher"} requested a schedule for ${
          schedule.labName
        }. Time: ${new Date(schedule.startTime).toLocaleString()}`,
        timestamp: schedule.createdAt,
        source: "Schedule Requests",
        userName: schedule.teacherName,
        labName: schedule.labName,
        requestId: schedule.id,
      });
    });
  }

  if (params.moveRequests) {
    params.moveRequests.forEach((req) => {
      notifications.push({
        id: `move-request-${req.id}`,
        category: "move_request",
        title: "Schedule Move Request",
        message: `${req.teacherName} requested to move schedule for ${
          req.labName
        }. New time: ${new Date(req.requestedStartTime).toLocaleString()}`,
        timestamp: req.requestedAt,
        source: "Move Requests",
        userName: req.teacherName,
        labName: req.labName,
        requestId: req.id,
      });
    });
  }

  // Include system notifications (e.g., submitted move requests that are stored server-side)
  if (params.systemNotifications) {
    params.systemNotifications.forEach((notif) => {
      notifications.push({
        id: `system-${notif.id}`,
        backendId: notif.id,
        category:
          notif.type === "move_request_submitted"
            ? "move_request_submitted"
            : "system",
        title: notif.title,
        message: notif.message,
        timestamp: notif.created_at,
        source: "System Notification",
        userName: notif.user_name,
        read: notif.read,
        canMarkRead: true,
      });
    });
  }

  return notifications.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}


