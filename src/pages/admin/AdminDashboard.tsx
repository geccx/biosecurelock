import { useEffect, useState } from "react";
import {
  UsersIcon,
  CalendarIcon,
  ActivityIcon,
  AlertTriangleIcon,
  KeyRoundIcon,
  CheckCircleIcon,
  MoveIcon,
  BellIcon,
  InfoIcon,
} from "lucide-react";
import { ScheduleCalendar } from "../../components/common/ScheduleCalendar";
import {
  dashboardService,
  passwordRequestsService,
  labSchedulesService,
  moveRequestsService,
  notificationPreferencesService,
  logsService,
  type DashboardStats,
  type RecentAccessLog,
  type PendingApproval,
  type Notification,
  type PasswordRequest,
  type MoveRequest,
  type LabSchedule,
} from "../../services";


// Notification item interface for unified display
interface NotificationItem {
  id: string;
  type: "system" | "teacher_request" | "tech_support";
  category:
    | "pin_request"
    | "schedule_request"
    | "move_request"
    | "device_error"
    | "enrollment"
    | "system";
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  source: string;
  metadata?: {
    requestId?: string;
    userId?: number;
    userName?: string;
    labName?: string;
  };
}

interface MergedAccessLog extends RecentAccessLog {
  source?: "system" | "tuya";
  avatar?: string;
  unlockMethod?: string;
}

export function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<MergedAccessLog[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [pendingPasswordRequestsCount, setPendingPasswordRequestsCount] = useState(0);
  const [pendingSchedulesCount, setPendingSchedulesCount] = useState(0);
  const [pendingMoveRequestsCount, setPendingMoveRequestsCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [loading, setLoading] = useState(true);

useEffect(() => {
    async function fetchData() {
      try {
        const [
          statsRes,
          logsRes,
          approvalsRes,
          passwordRequestsRes,
          pendingSchedulesRes,
          moveRequestsRes,
          systemNotificationsRes,
        ] = await Promise.all([
          dashboardService.getStats(),
          dashboardService.getRecentLogs(10),
          dashboardService.getPendingApprovals(10),
          passwordRequestsService.getAll({ status: "pending" }),
          labSchedulesService.getAll({ status: "pending" }),
          moveRequestsService.getAll({ status: "pending" }),
          notificationPreferencesService.getAllNotifications({
            limit: 50,
            offset: 0,
            unread_only: false,
          }),
        ]);

        if (statsRes.success && statsRes.data) {
          setStats(statsRes.data);
        }
        
        // Fetch Tuya unlocking records for today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endTime = Date.now();
        const startTime = today.getTime();

        let tuyaLogs: MergedAccessLog[] = [];
        try {
          const tuyaRes = await logsService.getTuyaUnlockingHistory({
            page_no: 1,
            page_size: 10,
            start_time: startTime,
            end_time: endTime,
            showMediaInfo: true,
          });

          if (tuyaRes.success && tuyaRes.data) {
            const getUnlockMethodName = (code: string): string => {
              const methodMap: Record<string, string> = {
                unlock_finger: "Fingerprint",
                unlock_pwd: "Password",
                unlock_card: "Card",
                unlock_key: "Key",
                unlock_face: "Face",
                unlock_voice: "Voice",
                unlock_app: "App",
                unlock_remote: "Remote",
                unlock_temp_pwd: "Temporary Password",
                unlock_dynamic_pwd: "Dynamic Password",
                unlock_ble: "Bluetooth",
                unlock_zigbee: "Zigbee",
              };
              return methodMap[code] || code.replace("unlock_", "").replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
            };

            tuyaLogs = tuyaRes.data.map((log, index) => {
              const unlockCode = log.status?.code || "unknown";
              const unlockMethod = getUnlockMethodName(unlockCode);
              
              return {
                id: `tuya-${log.update_time}-${index}`,
                userId: log.user_id || "0",
                userName: log.nick_name || log.unlock_name || `User ${log.user_id || "0"}`,
                userRole: undefined,
                labName: "Laboratory",
                timestamp: new Date(log.update_time).toISOString(),
                method: unlockMethod,
                status: "granted" as const,
                blockchainHash: undefined,
                ipAddress: undefined,
                source: "tuya" as const,
                avatar: log.avatar,
                unlockMethod: unlockMethod,
              };
            });
          }
        } catch (error) {
          console.error("Failed to fetch Tuya unlocking history:", error);
        }

        // Merge regular logs and Tuya logs
        if (logsRes.success && logsRes.data) {
          const systemLogs: MergedAccessLog[] = logsRes.data.map((log) => ({
            ...log,
            source: "system" as const,
          }));

          const allLogs = [...systemLogs, ...tuyaLogs];
          allLogs.sort((a, b) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          
          setRecentLogs(allLogs.slice(0, 10));
        } else {
          setRecentLogs(tuyaLogs.slice(0, 10));
        }

        if (approvalsRes.success && approvalsRes.data) {
          setPendingApprovals(approvalsRes.data);
        }
        if (passwordRequestsRes.success && passwordRequestsRes.data) {
          setPendingPasswordRequestsCount(passwordRequestsRes.data.length);
        }
        if (pendingSchedulesRes.success && pendingSchedulesRes.data) {
          setPendingSchedulesCount(pendingSchedulesRes.data.length);
        }
        if (moveRequestsRes.success && moveRequestsRes.data) {
          setPendingMoveRequestsCount(moveRequestsRes.data.length);
        }

        // Aggregate notifications from multiple sources
        const aggregatedNotifications: NotificationItem[] = [];

        // System notifications
        if (systemNotificationsRes.success && systemNotificationsRes.data?.data) {
          const systemNotifs = systemNotificationsRes.data.data;
          systemNotifs.forEach((notif: Notification) => {
            const isRelevant =
              notif.type === "device_error" ||
              notif.type === "enrollment_approved" ||
              notif.type === "enrollment_rejected" ||
              notif.type === "new_user_added";

            if (isRelevant) {
              let category: NotificationItem["category"] = "system";
              let type: NotificationItem["type"] = "system";

              if (notif.type === "device_error") {
                category = "device_error";
                type = "tech_support";
              } else if (
                notif.type === "enrollment_approved" ||
                notif.type === "enrollment_rejected"
              ) {
                category = "enrollment";
                type = "tech_support";
              }

              aggregatedNotifications.push({
                id: `system-${notif.id}`,
                type,
                category,
                title: notif.title,
                message: notif.message,
                timestamp: notif.created_at,
                read: notif.read,
                source: "System Notification Service",
                metadata: {
                  userId: notif.user_id,
                  userName: notif.user_name,
                },
              });
            }
          });
        }

        // Teacher PIN/Password requests
        if (passwordRequestsRes.success && passwordRequestsRes.data) {
          passwordRequestsRes.data.forEach((req: PasswordRequest) => {
            aggregatedNotifications.push({
              id: `pin-request-${req.id}`,
              type: "teacher_request",
              category: "pin_request",
              title: "PIN/Password Request",
              message: `${req.userName} requested a PIN/password for ${req.labName}. Schedule: ${new Date(req.scheduleStartTime).toLocaleString()}`,
              timestamp: req.createdAt,
              read: false,
              source: "Password Requests Service",
              metadata: {
                requestId: req.id.toString(),
                userId: req.userId,
                userName: req.userName,
                labName: req.labName,
              },
            });
          });
        }

        // Teacher schedule requests
        if (pendingSchedulesRes.success && pendingSchedulesRes.data) {
          pendingSchedulesRes.data.forEach((schedule: LabSchedule) => {
            aggregatedNotifications.push({
              id: `schedule-request-${schedule.id}`,
              type: "teacher_request",
              category: "schedule_request",
              title: "Schedule Request",
              message: `${schedule.teacherName || "Teacher"} requested a schedule for ${schedule.labName}. Time: ${new Date(schedule.startTime).toLocaleString()}`,
              timestamp: schedule.createdAt,
              read: false,
              source: "Lab Schedules Service",
              metadata: {
                requestId: schedule.id.toString(),
                userId: parseInt(schedule.teacherId),
                userName: schedule.teacherName,
                labName: schedule.labName,
              },
            });
          });
        }

        // Teacher move/change schedule requests
        if (moveRequestsRes.success && moveRequestsRes.data) {
          moveRequestsRes.data.forEach((req: MoveRequest) => {
            aggregatedNotifications.push({
              id: `move-request-${req.id}`,
              type: "teacher_request",
              category: "move_request",
              title: "Schedule Move Request",
              message: `${req.teacherName} requested to move schedule for ${req.labName}. New time: ${new Date(req.requestedStartTime).toLocaleString()}`,
              timestamp: req.requestedAt,
              read: false,
              source: "Move Requests Service",
              metadata: {
                requestId: req.id,
                userId: parseInt(req.teacherId),
                userName: req.teacherName,
                labName: req.labName,
              },
            });
          });
        }

        aggregatedNotifications.sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        setNotifications(aggregatedNotifications);
        setUnreadNotificationCount(
          aggregatedNotifications.filter((n) => !n.read).length
        );
            } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
      </div>
    );
  }

// ✅ FIX 1: Calculate Total Users = Local Users + Tuya Users
  const totalUsers = (stats?.localUsers || 0) + (stats?.totalTuyaUsers || 0);

  // ✅ FIX 2: Calculate Access Logs Today count from merged logs
  const accessLogsToday = recentLogs.length;

  const statCards = [
    {
      label: "Total Users",
      value: totalUsers, // ✅ FIXED: Now shows sum of local + Tuya users
      icon: UsersIcon,
      iconClass: "icon-blue",
    },
    {
      label: "Total Schedules",
      value: stats?.activeSchedules || 0,
      icon: CalendarIcon,
      iconClass: "icon-green",
    },
    {
      label: "Pending Approvals",
      value: stats?.pendingApprovals || 0,
      icon: AlertTriangleIcon,
      iconClass: "icon-orange",
    },
    {
      label: "Access Logs Today",
      value: accessLogsToday, // ✅ FIXED: Now shows actual merged logs count
      icon: ActivityIcon,
      iconClass: "icon-purple",
    },
    {
      label: "Local Users",
      value: stats?.localUsers || 0,
      icon: UsersIcon,
      iconClass: "icon-indigo",
    },
    {
      label: "Tuya Device Users",
      value: stats?.totalTuyaUsers || 0,
      icon: UsersIcon,
      iconClass: "icon-teal",
    },
    {
      label: "Pending PIN/Password Requests",
      value: pendingPasswordRequestsCount,
      icon: KeyRoundIcon,
      iconClass: "icon-yellow",
    },
    {
      label: "Approve Schedules",
      value: pendingSchedulesCount,
      icon: CheckCircleIcon,
      iconClass: "icon-emerald",
    },
    {
      label: "Move / Change Schedule Requests",
      value: pendingMoveRequestsCount,
      icon: MoveIcon,
      iconClass: "icon-rose",
    },
  ];

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getCategoryIcon = (category: NotificationItem["category"]) => {
    switch (category) {
      case "pin_request":
        return <KeyRoundIcon style={{ width: '20px', height: '20px' }} />;
      case "schedule_request":
        return <CalendarIcon style={{ width: '20px', height: '20px' }} />;
      case "move_request":
        return <MoveIcon style={{ width: '20px', height: '20px' }} />;
      case "device_error":
        return <AlertTriangleIcon style={{ width: '20px', height: '20px' }} />;
      case "enrollment":
        return <CheckCircleIcon style={{ width: '20px', height: '20px' }} />;
      default:
        return <BellIcon style={{ width: '20px', height: '20px' }} />;
    }
  };

  const getCategoryBadge = (category: NotificationItem["category"]) => {
    switch (category) {
      case "pin_request":
        return <span className="badge badge-warning">PIN Request</span>;
      case "schedule_request":
        return <span className="badge badge-success">Schedule</span>;
      case "move_request":
        return <span className="badge badge-danger">Move Request</span>;
      case "device_error":
        return <span className="badge badge-danger">Device Error</span>;
      case "enrollment":
        return <span className="badge badge-default">Enrollment</span>;
      default:
        return <span className="badge badge-default">System</span>;
    }
  };

   return (
    <div className="admin-dashboard">
      {/* Stats Grid */}
      <div className="stats-grid">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="stat-card">
              <div className="stat-card-content">
                <div className="stat-info">
                  <p className="stat-label">{stat.label}</p>
                  <p className="stat-value">{stat.value}</p>
                </div>
                <div className={`stat-icon-wrapper ${stat.iconClass}`}>
                  <Icon style={{ width: '28px', height: '28px' }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Content Grid */}
      <div className="content-grid">
        {/* Pending Approvals */}
        <div className="dashboard-card fixed-height-card">
          <div className="card-header">
            <h3 className="card-title">Pending Approvals</h3>
            <span className="badge badge-warning">
              {pendingApprovals.length}
            </span>
          </div>
          <div>
            {pendingApprovals.length > 0 ? (
              pendingApprovals.map((item) => (
                <div key={item.id} className="list-item">
                  <div className="item-content">
                    <div className="item-info">
                      <p className="item-name">{item.teacherName}</p>
                      <p className="item-lab">{item.labName}</p>
                      <p className="item-time">
                        {item.type === "schedule" ? (
                          <>
                            Schedule:{" "}
                            {new Date(item.startTime || item.createdAt || "").toLocaleString()}
                            {item.subject && ` • ${item.subject}`}
                          </>
                        ) : (
                          <>
                            Move Request:{" "}
                            {new Date(item.requestedStartTime || item.requestedAt || "").toLocaleString()}
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="item-details">
                    <span className="badge badge-warning">
                      {item.type === "schedule" ? "Schedule" : "Move Request"}
                    </span>
                    <p className="item-method">Pending</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <AlertTriangleIcon className="empty-state-icon" />
                <p className="empty-state-text">No pending approvals</p>
                <p className="empty-state-subtext">All requests have been processed</p>
              </div>
            )}
          </div>
        </div>

 {/* Access Logs Today - ✅ FIXED: Now shows proper count */}
        <div className="dashboard-card fixed-height-card">
          <div className="card-header">
            <h3 className="card-title">Access Logs Today</h3>
            <span className="badge badge-default">
              {accessLogsToday} {/* ✅ FIXED: Shows merged logs count */}
            </span>
          </div>
          <div>
            {recentLogs.length > 0 ? (
              recentLogs.map((log) => (
                <div key={log.id} className="list-item">
                  <div className="item-content">
                    {log.source === "tuya" && log.avatar && (
                      <img
                        src={log.avatar}
                        alt={log.userName}
                        className="user-avatar"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    )}
                    <div className="item-info">
                      <p className="item-name">
                        {log.userName}
                        {log.userRole && (
                          <span className="badge badge-info" style={{ fontSize: '11px', padding: '4px 8px' }}>
                            {log.userRole}
                          </span>
                        )}
                        {log.source === "tuya" && (
                          <span className="badge badge-default" style={{ fontSize: '11px', padding: '4px 8px' }}>
                            Tuya
                          </span>
                        )}
                      </p>
                      <p className="item-lab">{log.labName}</p>
                      <p className="item-time">
                        {new Date(log.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="item-details">
                    <span className={`badge ${log.status === "granted" ? "badge-success" : "badge-danger"}`}>
                      {log.status}
                    </span>
                    <p className="item-method">{log.method}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <ActivityIcon className="empty-state-icon" />
                <p className="empty-state-text">No access logs today</p>
                <p className="empty-state-subtext">Access activity will appear here</p>
              </div>
            )}
          </div>
        </div>
      </div>


      {/* System Status */}
      <div className="dashboard-card">
        <div className="card-header">
          <h3 className="card-title">System Status</h3>
        </div>
        <div className="status-grid">
          <div className="status-card status-green">
            <p className="status-label">Blockchain Status</p>
            <p className="status-value">Online</p>
          </div>
          <div className="status-card status-blue">
            <p className="status-label">Lock Status</p>
            <p className="status-value">Secured</p>
          </div>
          <div className="status-card status-purple">
            <p className="status-label">Active Users</p>
            <p className="status-value">{stats?.activeUsers || 0}</p>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="dashboard-card">
        <div className="card-header">
          <h3 className="card-title">Notifications</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {unreadNotificationCount > 0 && (
              <span className="badge badge-warning">
                {unreadNotificationCount} unread
              </span>
            )}
            <InfoIcon style={{ width: '18px', height: '18px', color: '#a0aec0' }} />
          </div>
        </div>

        <div className="info-box">
          <div className="info-box-content">
            <InfoIcon className="info-icon" style={{ width: '20px', height: '20px' }} />
            <div className="info-text">
              <p className="info-title">Notification Sources:</p>
              <ul className="info-list">
                <li>
                  <strong>System Notifications:</strong> Device errors, enrollment status updates, and system events
                </li>
                <li>
                  <strong>Teacher Requests:</strong> PIN/password requests, schedule requests, and schedule move/change requests
                </li>
                <li>
                  <strong>Technical Support:</strong> Device errors and enrollment requests requiring admin attention
                </li>
              </ul>
              <p className="info-note">
                Notifications are automatically aggregated from multiple services and refreshed every 30 seconds.
              </p>
            </div>
          </div>
        </div>

        <div className="notification-scroll">
          {notifications.length > 0 ? (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={`notification-item ${notification.read ? 'notification-read' : 'notification-unread'}`}
              >
                <div className="notification-icon">
                  {getCategoryIcon(notification.category)}
                </div>
                <div className="notification-content">
                  <div className="notification-header">
                    <span className="notification-title">{notification.title}</span>
                    {getCategoryBadge(notification.category)}
                    {!notification.read && <span className="notification-unread-dot"></span>}
                  </div>
                  <p className="notification-message">{notification.message}</p>
                  <div className="notification-meta">
                    <span>{formatDate(notification.timestamp)}</span>
                    <span className="notification-separator">•</span>
                    <span className="notification-source">{notification.source}</span>
                    {notification.metadata?.userName && (
                      <>
                        <span className="notification-separator">•</span>
                        <span className="notification-source">{notification.metadata.userName}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <BellIcon className="empty-state-icon" />
              <p className="empty-state-text">No notifications</p>
              <p className="empty-state-subtext">
                Notifications will appear here when there are pending requests or system events
              </p>
            </div>
          )}
        </div>
      </div>

      <ScheduleCalendar showAllSchedules={true} />
    </div>
  );
}