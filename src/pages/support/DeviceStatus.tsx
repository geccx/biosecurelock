import { useEffect, useState } from "react";
import {
  WrenchIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  RefreshCwIcon,
  LockIcon,
  NetworkIcon,
  UnlockIcon,
} from "lucide-react";
import { Card } from "../../components/common/Card";
import { Button } from "../../components/common/Button";
import { Badge } from "../../components/common/Badge";
import {
  devicesService,
  dashboardService,
  systemConfigService,
  syncService,
  type Device,
  type LockAndGatewayStatus,
  type DashboardStats,
  type DeviceSyncStatus,
} from "../../services";
import { useAlert } from "../../contexts/AlertContext";

export function DeviceStatus() {
  const { showAlert } = useAlert();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [smartDoorLock, setSmartDoorLock] =
    useState<LockAndGatewayStatus | null>(null);
  const [gateway, setGateway] = useState<LockAndGatewayStatus | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [unlockingDevices, setUnlockingDevices] = useState<Set<string>>(
    new Set(),
  );
  const [lockingDevices, setLockingDevices] = useState<Set<string>>(new Set());
  const [syncStatuses, setSyncStatuses] = useState<DeviceSyncStatus[]>([]);

  useEffect(() => {
    fetchDevices();
  }, []);

  const fetchDevices = async () => {
    try {
      // Fetch devices with Tuya status, lock/gateway status, dashboard stats, and sync status
      const [devicesRes, lockGatewayRes, statsRes, syncRes] = await Promise.all(
        [
          devicesService.getStatusWithTuya(),
          devicesService.getLockAndGatewayStatus(),
          dashboardService.getStats(),
          syncService
            .getDevicesStatus()
            .catch(() => ({ success: false, data: [] })),
        ],
      );

      if (devicesRes.success && devicesRes.data) {
        setDevices(devicesRes.data);
      }
      if (lockGatewayRes.success && lockGatewayRes.data) {
        setSmartDoorLock(lockGatewayRes.data.smartDoorLock);
        setGateway(lockGatewayRes.data.gateway);
      }
      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data);
      }
      if (syncRes.success && syncRes.data) {
        setSyncStatuses(syncRes.data);
      }
    } catch (error) {
      console.error("Failed to fetch devices:", error);
      // Fall back to regular device list if Tuya fetch fails
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

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const [devicesRes, lockGatewayRes, statsRes, syncRes] = await Promise.all(
        [
          devicesService.getStatusWithTuya(),
          devicesService.getLockAndGatewayStatus(),
          dashboardService.getStats(),
          syncService
            .getDevicesStatus()
            .catch(() => ({ success: false, data: [] })),
        ],
      );
      if (devicesRes.success && devicesRes.data) {
        setDevices(devicesRes.data);
      }
      if (lockGatewayRes.success && lockGatewayRes.data) {
        setSmartDoorLock(lockGatewayRes.data.smartDoorLock);
        setGateway(lockGatewayRes.data.gateway);
      }
      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data);
      }
      if (syncRes.success && syncRes.data) {
        setSyncStatuses(syncRes.data);
      }
    } catch (error) {
      console.error("Failed to refresh devices:", error);
      // Fall back to fetching current status
      await fetchDevices();
    } finally {
      setRefreshing(false);
    }
  };

  const handleUnlockDevice = async (device: Device) => {
    const deviceId = device.tuyaDeviceId || device.id;
    if (!deviceId) {
      showAlert("Device ID not found. Cannot unlock device.", "error");
      return;
    }

    setUnlockingDevices((prev) => new Set(prev).add(deviceId));

    try {
      const response = await systemConfigService.unlockDevice(deviceId);
      if (response.success) {
        showAlert(
          `Device "${device.deviceName}" unlocked successfully!`,
          "success",
        );
        // Refresh device status after unlock
        await handleRefresh();
      } else {
        showAlert(
          `Failed to unlock device: ${response.error || "Unknown error"}`,
          "error",
        );
      }
    } catch (error: any) {
      console.error("Failed to unlock device:", error);
      showAlert(
        `Failed to unlock device: ${error.message || "Unknown error"}`,
        "error",
      );
    } finally {
      setUnlockingDevices((prev) => {
        const newSet = new Set(prev);
        newSet.delete(deviceId);
        return newSet;
      });
    }
  };

  const handleLockDevice = async (device: Device) => {
    const deviceId = device.tuyaDeviceId || device.id;
    if (!deviceId) {
      showAlert("Device ID not found. Cannot lock device.", "error");
      return;
    }

    setLockingDevices((prev) => new Set(prev).add(deviceId));

    try {
      const response = await systemConfigService.lockDevice(deviceId);
      if (response.success) {
        showAlert(
          `Device "${device.deviceName}" lock command sent successfully!`,
          "success",
        );
        // Refresh device status after lock
        await handleRefresh();
      } else {
        showAlert(
          `Failed to lock device: ${response.error || "Unknown error"}`,
          "error",
        );
      }
    } catch (error: any) {
      console.error("Failed to lock device:", error);
      showAlert(
        `Failed to lock device: ${error.message || "Unknown error"}`,
        "error",
      );
    } finally {
      setLockingDevices((prev) => {
        const newSet = new Set(prev);
        newSet.delete(deviceId);
        return newSet;
      });
    }
  };

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case "lock":
        return "🔒";
      case "fingerprint":
        return "👆";
      case "rfid":
        return "💳";
      case "network":
        return "🌐";
      default:
        return "🔧";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Calculate device counts including lock and gateway
  const onlineDevices =
    devices.filter((d) => d.status === "online").length +
    (smartDoorLock?.online ? 1 : 0) +
    (gateway?.online ? 1 : 0);
  const offlineDevices =
    devices.filter((d) => d.status === "offline").length +
    (smartDoorLock && !smartDoorLock.online ? 1 : 0) +
    (gateway && !gateway.online ? 1 : 0);
  const errorDevices =
    devices.filter((d) => d.status === "error").length +
    (smartDoorLock?.error ? 1 : 0) +
    (gateway?.error ? 1 : 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Online Devices</p>
              <p className="text-3xl font-bold text-green-600 mt-1">
                {onlineDevices}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircleIcon className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Offline Devices</p>
              <p className="text-3xl font-bold text-gray-600 mt-1">
                {offlineDevices}
              </p>
            </div>
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
              <AlertCircleIcon className="w-6 h-6 text-gray-600" />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Error Devices</p>
              <p className="text-3xl font-bold text-red-600 mt-1">
                {errorDevices}
              </p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertCircleIcon className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </Card>
      </div>

      {syncStatuses.length > 0 && (
        <Card title="Sync Health (Local Data Retention)">
          <p className="text-sm text-gray-600 mb-4">
            Last sync times and connectivity for TUYA devices. Used for offline
            log retrieval and credential sync.
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Device</th>
                  <th className="text-left py-2">Connectivity</th>
                  <th className="text-left py-2">Last Sync</th>
                  <th className="text-left py-2">Last Log Retrieval</th>
                  <th className="text-left py-2">Pending</th>
                </tr>
              </thead>
              <tbody>
                {syncStatuses.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100">
                    <td className="py-2 font-medium">{s.deviceName}</td>
                    <td className="py-2">
                      <Badge
                        variant={
                          s.connectivityStatus === "online"
                            ? "success"
                            : s.connectivityStatus === "offline"
                              ? "default"
                              : "warning"
                        }
                      >
                        {s.connectivityStatus}
                      </Badge>
                    </td>
                    <td className="py-2 text-gray-600">
                      {s.lastSuccessfulSync
                        ? new Date(s.lastSuccessfulSync).toLocaleString()
                        : "—"}
                    </td>
                    <td className="py-2 text-gray-600">
                      {s.lastLogRetrieval
                        ? new Date(s.lastLogRetrieval).toLocaleString()
                        : "—"}
                    </td>
                    <td className="py-2">
                      {s.pendingCredentials > 0 || s.pendingSchedules > 0 ? (
                        <span className="text-amber-600">
                          {s.pendingCredentials + s.pendingSchedules} pending
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card
        title="Device Status Monitor"
        action={
          <Button size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCwIcon
              className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh Status
          </Button>
        }
      >
        {devices.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {devices.map((device) => (
              <div
                key={device.id}
                className={`p-6 rounded-lg border-2 ${
                  device.status === "online"
                    ? "border-green-200 bg-green-50"
                    : device.status === "error"
                      ? "border-red-200 bg-red-50"
                      : "border-gray-200 bg-gray-50"
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">
                      {getDeviceIcon(device.type)}
                    </span>
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {device.deviceName}
                      </h3>
                      <p className="text-sm text-gray-600">{device.location}</p>
                    </div>
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

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Device Type:</span>
                    <span className="font-medium text-gray-900">
                      {device.type}
                    </span>
                  </div>
                  {device.tuyaDeviceId && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Tuya Device ID:</span>
                      <span className="font-mono text-xs text-gray-900">
                        {device.tuyaDeviceId.substring(0, 12)}...
                      </span>
                    </div>
                  )}
                  {device.tuyaDetails && (
                    <>
                      {device.tuyaDetails.productName && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Product:</span>
                          <span className="font-medium text-gray-900">
                            {device.tuyaDetails.productName}
                          </span>
                        </div>
                      )}
                      {device.tuyaDetails.activeTime && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">
                            Activation Time:
                          </span>
                          <span className="font-medium text-gray-900">
                            {new Date(
                              device.tuyaDetails.activeTime * 1000,
                            ).toLocaleString()}
                          </span>
                        </div>
                      )}
                      {device.tuyaDetails.ip && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">IP Address:</span>
                          <span className="font-medium text-gray-900">
                            {device.tuyaDetails.ip}
                          </span>
                        </div>
                      )}
                      {device.tuyaDetails.timeZone && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Time Zone:</span>
                          <span className="font-medium text-gray-900">
                            {device.tuyaDetails.timeZone}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">Last Checked:</span>
                    <span className="font-medium text-gray-900">
                      {new Date(device.lastChecked).toLocaleTimeString()}
                    </span>
                  </div>
                  {device.error && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                      Error: {device.error}
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200">
                  {device.type === "lock" && device.tuyaDeviceId ? (
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => handleUnlockDevice(device)}
                        disabled={
                          unlockingDevices.has(
                            device.tuyaDeviceId || device.id,
                          ) ||
                          lockingDevices.has(
                            device.tuyaDeviceId || device.id,
                          ) ||
                          device.status === "offline" ||
                          device.status === "error"
                        }
                        className="flex-1"
                      >
                        {unlockingDevices.has(
                          device.tuyaDeviceId || device.id,
                        ) ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                            Unlocking...
                          </>
                        ) : (
                          <>
                            <UnlockIcon className="w-4 h-4 mr-2" />
                            Unlock Door
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => handleLockDevice(device)}
                        disabled={
                          lockingDevices.has(
                            device.tuyaDeviceId || device.id,
                          ) ||
                          unlockingDevices.has(
                            device.tuyaDeviceId || device.id,
                          ) ||
                          device.status === "offline" ||
                          device.status === "error"
                        }
                        className="flex-1"
                      >
                        {lockingDevices.has(
                          device.tuyaDeviceId || device.id,
                        ) ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                            Locking...
                          </>
                        ) : (
                          <>
                            <LockIcon className="w-4 h-4 mr-2" />
                            Lock Door
                          </>
                        )}
                      </Button>
                    </div>
                  ) : device.status !== "online" ? (
                    <Button size="sm" variant="secondary" className="w-full">
                      <WrenchIcon className="w-4 h-4 mr-2" />
                      Troubleshoot
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-gray-500 py-8">No devices found</p>
        )}
      </Card>

      <Card title="System Status">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-green-50 rounded-lg">
            <p className="text-sm text-green-800 font-medium">
              Blockchain Status
            </p>
            <p className="text-2xl font-bold text-green-900 mt-1">Online</p>
          </div>
          <div className="p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800 font-medium">Lock Status</p>
            <p className="text-2xl font-bold text-blue-900 mt-1">
              {smartDoorLock?.online ? "Secured" : "Unsecured"}
            </p>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg">
            <p className="text-sm text-purple-800 font-medium">Active Users</p>
            <p className="text-2xl font-bold text-purple-900 mt-1">
              {stats?.activeUsers || 0}
            </p>
          </div>
        </div>
      </Card>

      <Card
        title="Smart Door Lock & Gateway Status"
        action={
          <Button size="sm" onClick={handleRefresh} disabled={refreshing}>
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
                            smartDoorLock.activeTime * 1000,
                          ).toLocaleString()}
                        </span>
                      </div>
                    )}
                    {smartDoorLock.updateTime && (
                      <div className="flex justify-between">
                        <span>Last Updated:</span>
                        <span>
                          {new Date(
                            smartDoorLock.updateTime * 1000,
                          ).toLocaleString()}
                        </span>
                      </div>
                    )}
                    {smartDoorLock.status &&
                      smartDoorLock.status.length > 0 && (
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
                  {smartDoorLock.id && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          variant="success"
                          onClick={() => {
                            const device: Device = {
                              id: smartDoorLock.id || "",
                              deviceName:
                                smartDoorLock.name || "Smart Door Lock",
                              location: "Main Entrance",
                              type: "lock",
                              tuyaDeviceId: smartDoorLock.id,
                              status: smartDoorLock.online
                                ? "online"
                                : "offline",
                              lastChecked: new Date().toISOString(),
                            };
                            handleUnlockDevice(device);
                          }}
                          disabled={
                            unlockingDevices.has(smartDoorLock.id) ||
                            lockingDevices.has(smartDoorLock.id) ||
                            !smartDoorLock.online ||
                            !!smartDoorLock.error
                          }
                          className="flex-1"
                        >
                          {unlockingDevices.has(smartDoorLock.id) ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                              Unlocking...
                            </>
                          ) : (
                            <>
                              <UnlockIcon className="w-4 h-4 mr-2" />
                              Unlock Door
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            const device: Device = {
                              id: smartDoorLock.id || "",
                              deviceName:
                                smartDoorLock.name || "Smart Door Lock",
                              location: "Main Entrance",
                              type: "lock",
                              tuyaDeviceId: smartDoorLock.id,
                              status: smartDoorLock.online
                                ? "online"
                                : "offline",
                              lastChecked: new Date().toISOString(),
                            };
                            handleLockDevice(device);
                          }}
                          disabled={
                            lockingDevices.has(smartDoorLock.id) ||
                            unlockingDevices.has(smartDoorLock.id) ||
                            !smartDoorLock.online ||
                            !!smartDoorLock.error
                          }
                          className="flex-1"
                        >
                          {lockingDevices.has(smartDoorLock.id) ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                              Locking...
                            </>
                          ) : (
                            <>
                              <LockIcon className="w-4 h-4 mr-2" />
                              Lock Door
                            </>
                          )}
                        </Button>
                      </div>
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
                          {new Date(gateway.activeTime * 1000).toLocaleString()}
                        </span>
                      </div>
                    )}
                    {gateway.updateTime && (
                      <div className="flex justify-between">
                        <span>Last Updated:</span>
                        <span>
                          {new Date(gateway.updateTime * 1000).toLocaleString()}
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
    </div>
  );
}
