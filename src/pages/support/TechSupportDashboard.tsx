import { useEffect, useState } from "react";
import {
  UsersIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  LockIcon,
  NetworkIcon,
  RefreshCwIcon,
  KeyRoundIcon,
  CalendarIcon,
  ArrowRightLeftIcon,
  BellIcon,
} from "lucide-react";
import { Card } from "../../components/common/Card";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { ScheduleCalendar } from "../../components/common/ScheduleCalendar";
import {
  buildRequestNotifications,
  type RequestNotification,
} from "../../utils/notificationUtils";
import {
  dashboardService,
  devicesService,
  moveRequestsService,
  passwordRequestsService,
  labSchedulesService,
  type DashboardStats,
  type Device,
  type MoveRequest,
  type LockAndGatewayStatus,
  type PasswordRequest,
  type LabSchedule,
} from "../../services";

export function TechSupportDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [pendingRequests, setPendingRequests] = useState<MoveRequest[]>([]);
  const [pendingPasswordRequests, setPendingPasswordRequests] = useState<PasswordRequest[]>([]);
  const [pendingScheduleApprovals, setPendingScheduleApprovals] = useState<LabSchedule[]>([]);
  const [moveChangeRequests, setMoveChangeRequests] = useState<MoveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState<RequestNotification[]>([]);
  const [smartDoorLock, setSmartDoorLock] =
    useState<LockAndGatewayStatus | null>(null);
  const [gateway, setGateway] = useState<LockAndGatewayStatus | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [
        statsRes,
        devicesRes,
        requestsRes,
        lockGatewayRes,
        passwordRequestsRes,
        scheduleApprovalsRes,
      ] = await Promise.all([
        dashboardService.getStats(),
        devicesService.getStatusWithTuya(),
        moveRequestsService.getPending(),
        devicesService.getLockAndGatewayStatus(),
        passwordRequestsService.getAll({ status: "pending" }),
        labSchedulesService.getAll({ status: "pending" }),
      ]);

      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data);
      }
      if (devicesRes.success && devicesRes.data) {
        setDevices(devicesRes.data);
      }
      if (requestsRes.success && requestsRes.data) {
        setPendingRequests(requestsRes.data);
        setMoveChangeRequests(requestsRes.data);
      }
      if (lockGatewayRes.success && lockGatewayRes.data) {
        setSmartDoorLock(lockGatewayRes.data.smartDoorLock);
        setGateway(lockGatewayRes.data.gateway);
      }
      if (passwordRequestsRes.success && passwordRequestsRes.data) {
        setPendingPasswordRequests(passwordRequestsRes.data);
      }
      if (scheduleApprovalsRes.success && scheduleApprovalsRes.data) {
        setPendingScheduleApprovals(scheduleApprovalsRes.data);
      }

      const aggregatedNotifications = buildRequestNotifications({
        passwordRequests: passwordRequestsRes.success ? passwordRequestsRes.data : [],
        schedules: scheduleApprovalsRes.success ? scheduleApprovalsRes.data : [],
        moveRequests: requestsRes.success ? requestsRes.data : [],
      });
      setNotifications(aggregatedNotifications);
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
      // Fallback to regular device list if Tuya fetch fails
      try {
        const fallbackResponse = await devicesService.getAll();
        if (fallbackResponse.success && fallbackResponse.data) {
          setDevices(fallbackResponse.data);
        }
      } catch (fallbackError) {
        console.error("Failed to fetch fallback devices:", fallbackError);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshDevices = async () => {
    setRefreshing(true);
    try {
      const [devicesRes, lockGatewayRes] = await Promise.all([
        devicesService.getStatusWithTuya(),
        devicesService.getLockAndGatewayStatus(),
      ]);
      if (devicesRes.success && devicesRes.data) {
        setDevices(devicesRes.data);
      }
      if (lockGatewayRes.success && lockGatewayRes.data) {
        setSmartDoorLock(lockGatewayRes.data.smartDoorLock);
        setGateway(lockGatewayRes.data.gateway);
      }
    } catch (error) {
      console.error("Failed to refresh devices:", error);
      await fetchData();
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const onlineDevicesCount =
    (smartDoorLock?.online ? 1 : 0) + (gateway?.online ? 1 : 0);

  const statCards = [
    {
      label: "Pending Enrollments",
      value: stats?.pendingEnrollments || 0,
      icon: UsersIcon,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      label: "Schedule Approvals",
      value: pendingScheduleApprovals.length,
      icon: AlertTriangleIcon,
      color: "text-orange-600",
      bgColor: "bg-orange-100",
    },
    {
      label: "Online Devices",
      value: onlineDevicesCount,
      icon: CheckCircleIcon,
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
    {
      label: "Pending PIN/Password Requests",
      value: pendingPasswordRequests.length,
      icon: KeyRoundIcon,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
    },
    {
      label: "Move/Change Access Requests",
      value: moveChangeRequests.length,
      icon: ArrowRightLeftIcon,
      color: "text-cyan-600",
      bgColor: "bg-cyan-100",
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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">{stat.label}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {stat.value}
                  </p>
                </div>
                <div
                  className={`w-12 h-12 ${stat.bgColor} rounded-lg flex items-center justify-center`}
                >
                  <Icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card title="Notifications">
        <div className="space-y-3">
          {notifications.length > 0 ? (
            notifications.slice(0, 10).map((notification) => {
              const categoryBadge = () => {
                switch (notification.category) {
                  case "pin_request":
                    return <Badge variant="warning">PIN/Password</Badge>;
                  case "schedule_request":
                    return <Badge variant="success">Schedule</Badge>;
                  case "move_request":
                    return <Badge variant="danger">Move/Change</Badge>;
                  default:
                    return <Badge variant="default">System</Badge>;
                }
              };

              const categoryIcon = () => {
                switch (notification.category) {
                  case "pin_request":
                    return <KeyRoundIcon className="w-4 h-4 text-yellow-600" />;
                  case "schedule_request":
                    return <CalendarIcon className="w-4 h-4 text-emerald-600" />;
                  case "move_request":
                    return <ArrowRightLeftIcon className="w-4 h-4 text-rose-600" />;
                  default:
                    return <BellIcon className="w-4 h-4 text-gray-500" />;
                }
              };

              return (
                <div
                  key={notification.id}
                  className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="mt-1">{categoryIcon()}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900">
                        {notification.title}
                      </p>
                      {categoryBadge()}
                    </div>
                    <p className="text-sm text-gray-700 mt-1 line-clamp-2">
                      {notification.message}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-2">
                      <span>{formatDate(notification.timestamp)}</span>
                      {notification.userName && (
                        <>
                          <span className="text-gray-400">•</span>
                          <span>{notification.userName}</span>
                        </>
                      )}
                      {notification.labName && (
                        <>
                          <span className="text-gray-400">•</span>
                          <span>{notification.labName}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-gray-500 text-center py-4">
              No notifications from teacher, schedule, or PIN/password requests
            </p>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Pending PIN/Password Requests">
          <div className="space-y-3">
            {pendingPasswordRequests.length > 0 ? (
              pendingPasswordRequests.slice(0, 5).map((request) => (
                <div key={request.id} className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        {request.userName}
                      </p>
                      <p className="text-sm text-gray-600">{request.labName}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Password: {request.passwordName}
                      </p>
                      <p className="text-xs text-gray-500">
                        Valid: {new Date(request.validFrom).toLocaleDateString()} - {new Date(request.validUntil).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant="warning">Pending</Badge>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">
                No pending PIN/password requests
              </p>
            )}
            {pendingPasswordRequests.length > 5 && (
              <p className="text-xs text-gray-500 text-center mt-2">
                +{pendingPasswordRequests.length - 5} more requests
              </p>
            )}
          </div>
        </Card>

        <Card title="Schedule Approvals">
          <div className="space-y-3">
            {pendingScheduleApprovals.length > 0 ? (
              pendingScheduleApprovals.slice(0, 5).map((schedule) => (
                <div key={schedule.id} className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        {schedule.teacherName}
                      </p>
                      <p className="text-sm text-gray-600">{schedule.labName}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(schedule.startTime).toLocaleString()} - {new Date(schedule.endTime).toLocaleString()}
                      </p>
                      {schedule.subject && (
                        <p className="text-xs text-gray-500">
                          Subject: {schedule.subject}
                        </p>
                      )}
                    </div>
                    <Badge variant="warning">Pending</Badge>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">
                No pending schedule approvals
              </p>
            )}
            {pendingScheduleApprovals.length > 5 && (
              <p className="text-xs text-gray-500 text-center mt-2">
                +{pendingScheduleApprovals.length - 5} more approvals
              </p>
            )}
          </div>
        </Card>

        <Card title="Move/Change Access Requests">
          <div className="space-y-3">
            {moveChangeRequests.length > 0 ? (
              moveChangeRequests.slice(0, 5).map((request) => (
                <div key={request.id} className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        {request.teacherName}
                      </p>
                      <p className="text-sm text-gray-600">{request.labName}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Current: {new Date(request.currentStartTime).toLocaleString()} - {new Date(request.currentEndTime).toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500">
                        Requested: {new Date(request.requestedStartTime).toLocaleString()} - {new Date(request.requestedEndTime).toLocaleString()}
                      </p>
                    </div>
                    <Badge variant="warning">Pending</Badge>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">
                No pending move/change access requests
              </p>
            )}
            {moveChangeRequests.length > 5 && (
              <p className="text-xs text-gray-500 text-center mt-2">
                +{moveChangeRequests.length - 5} more requests
              </p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Device Status">
          <div className="space-y-3">
            {devices.slice(0, 5).map((device) => (
              <div
                key={device.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div>
                  <p className="font-medium text-gray-900">
                    {device.deviceName}
                  </p>
                  <p className="text-sm text-gray-600">{device.location}</p>
                </div>
                <Badge
                  variant={
                    device.status === "online"
                      ? "success"
                      : device.status === "error"
                      ? "danger"
                      : "default"
                  }
                >
                  {device.status}
                </Badge>
              </div>
            ))}
            {devices.length === 0 && (
              <p className="text-gray-500 text-center py-4">No devices found</p>
            )}
          </div>
        </Card>
      </div>

      <Card
        title="Smart Door Lock & Gateway Status"
        action={
          <Button size="sm" onClick={handleRefreshDevices} disabled={refreshing}>
            <RefreshCwIcon
              className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Smart Door Lock Section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <LockIcon className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-900">
                Smart Door Lock
              </h3>
            </div>
            <div className="space-y-3">
              {smartDoorLock ? (
                <div
                  className={`p-4 rounded-lg border-2 ${
                    smartDoorLock.online
                      ? "border-green-200 bg-green-50"
                      : smartDoorLock.error
                      ? "border-red-200 bg-red-50"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">
                        {smartDoorLock.name || "Smart Door Lock"}
                      </p>
                      <p className="text-sm text-gray-600">
                        Device ID: {smartDoorLock.id?.substring(0, 12)}...
                      </p>
                    </div>
                    <Badge
                      variant={
                        smartDoorLock.online
                          ? "success"
                          : smartDoorLock.error
                          ? "danger"
                          : "default"
                      }
                    >
                      {smartDoorLock.online ? "online" : "offline"}
                    </Badge>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-gray-600">
                    {smartDoorLock.productName && (
                      <div className="flex justify-between">
                        <span>Product:</span>
                        <span className="font-medium">
                          {smartDoorLock.productName}
                        </span>
                      </div>
                    )}
                    {smartDoorLock.model && (
                      <div className="flex justify-between">
                        <span>Model:</span>
                        <span className="font-medium">
                          {smartDoorLock.model}
                        </span>
                      </div>
                    )}
                    {smartDoorLock.category && (
                      <div className="flex justify-between">
                        <span>Category:</span>
                        <span className="font-medium">
                          {smartDoorLock.category}
                        </span>
                      </div>
                    )}
                    {smartDoorLock.ip && (
                      <div className="flex justify-between">
                        <span>IP Address:</span>
                        <span className="font-mono">{smartDoorLock.ip}</span>
                      </div>
                    )}
                    {smartDoorLock.timeZone && (
                      <div className="flex justify-between">
                        <span>Time Zone:</span>
                        <span className="font-medium">
                          {smartDoorLock.timeZone}
                        </span>
                      </div>
                    )}
                    {smartDoorLock.sub !== undefined && (
                      <div className="flex justify-between">
                        <span>Sub-device:</span>
                        <span className="font-medium">
                          {smartDoorLock.sub ? "Yes" : "No"}
                        </span>
                      </div>
                    )}
                    {smartDoorLock.activeTime && (
                      <div className="flex justify-between">
                        <span>Active Since:</span>
                        <span>
                          {new Date(
                            smartDoorLock.activeTime * 1000
                          ).toLocaleString()}
                        </span>
                      </div>
                    )}
                    {smartDoorLock.updateTime && (
                      <div className="flex justify-between">
                        <span>Last Updated:</span>
                        <span>
                          {new Date(
                            smartDoorLock.updateTime * 1000
                          ).toLocaleString()}
                        </span>
                      </div>
                    )}
                    {smartDoorLock.status && smartDoorLock.status.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-200">
                        <p className="font-medium mb-1">Status Codes:</p>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {smartDoorLock.status.map((s, idx) => (
                            <div
                              key={idx}
                              className="flex justify-between text-xs"
                            >
                              <span className="font-mono text-gray-700">
                                {s.code}:
                              </span>
                              <span className="text-gray-900">
                                {typeof s.value === "boolean"
                                  ? s.value.toString()
                                  : typeof s.value === "number"
                                  ? s.value
                                  : String(s.value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                    {smartDoorLock.error && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                        <p className="font-semibold mb-1">Error:</p>
                        <p>{smartDoorLock.error}</p>
                        {smartDoorLock.rawResponse && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-red-600 hover:text-red-800">
                              View raw response
                            </summary>
                            <pre className="mt-1 p-2 bg-red-100 rounded text-xs overflow-auto max-h-32">
                              {JSON.stringify(smartDoorLock.rawResponse, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    )}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">
                  Smart door lock not configured
                </p>
              )}
            </div>
          </div>

          {/* Gateway Section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <NetworkIcon className="w-5 h-5 text-purple-600" />
              <h3 className="text-lg font-semibold text-gray-900">Gateway</h3>
            </div>
            <div className="space-y-3">
              {gateway ? (
                <div
                  className={`p-4 rounded-lg border-2 ${
                    gateway.online
                      ? "border-green-200 bg-green-50"
                      : gateway.error
                      ? "border-red-200 bg-red-50"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">
                        {gateway.name || "Gateway"}
                      </p>
                      <p className="text-sm text-gray-600">
                        Device ID: {gateway.id?.substring(0, 12)}...
                      </p>
                    </div>
                    <Badge
                      variant={
                        gateway.online
                          ? "success"
                          : gateway.error
                          ? "danger"
                          : "default"
                      }
                    >
                      {gateway.online ? "online" : "offline"}
                    </Badge>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-gray-600">
                    {gateway.productName && (
                      <div className="flex justify-between">
                        <span>Product:</span>
                        <span className="font-medium">
                          {gateway.productName}
                        </span>
                      </div>
                    )}
                    {gateway.model && (
                      <div className="flex justify-between">
                        <span>Model:</span>
                        <span className="font-medium">{gateway.model}</span>
                      </div>
                    )}
                    {gateway.category && (
                      <div className="flex justify-between">
                        <span>Category:</span>
                        <span className="font-medium">{gateway.category}</span>
                      </div>
                    )}
                    {gateway.ip && (
                      <div className="flex justify-between">
                        <span>IP Address:</span>
                        <span className="font-mono">{gateway.ip}</span>
                      </div>
                    )}
                    {gateway.timeZone && (
                      <div className="flex justify-between">
                        <span>Time Zone:</span>
                        <span className="font-medium">{gateway.timeZone}</span>
                      </div>
                    )}
                    {gateway.sub !== undefined && (
                      <div className="flex justify-between">
                        <span>Sub-device:</span>
                        <span className="font-medium">
                          {gateway.sub ? "Yes" : "No"}
                        </span>
                      </div>
                    )}
                    {gateway.activeTime && (
                      <div className="flex justify-between">
                        <span>Active Since:</span>
                        <span>
                          {new Date(
                            gateway.activeTime * 1000
                          ).toLocaleString()}
                        </span>
                      </div>
                    )}
                    {gateway.updateTime && (
                      <div className="flex justify-between">
                        <span>Last Updated:</span>
                        <span>
                          {new Date(
                            gateway.updateTime * 1000
                          ).toLocaleString()}
                        </span>
                      </div>
                    )}
                    {gateway.status && gateway.status.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-200">
                        <p className="font-medium mb-1">Status Codes:</p>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {gateway.status.map((s, idx) => (
                            <div
                              key={idx}
                              className="flex justify-between text-xs"
                            >
                              <span className="font-mono text-gray-700">
                                {s.code}:
                              </span>
                              <span className="text-gray-900">
                                {typeof s.value === "boolean"
                                  ? s.value.toString()
                                  : typeof s.value === "number"
                                  ? s.value
                                  : String(s.value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                    {gateway.error && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                        <p className="font-semibold mb-1">Error:</p>
                        <p>{gateway.error}</p>
                        {gateway.rawResponse && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-red-600 hover:text-red-800">
                              View raw response
                            </summary>
                            <pre className="mt-1 p-2 bg-red-100 rounded text-xs overflow-auto max-h-32">
                              {JSON.stringify(gateway.rawResponse, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    )}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">
                  Gateway not configured
                </p>
              )}
            </div>
          </div>
        </div>
      </Card>

      <ScheduleCalendar showAllSchedules={true} />
    </div>
  );
}
