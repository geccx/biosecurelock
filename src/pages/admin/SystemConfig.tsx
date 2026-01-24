import { useEffect, useState } from "react";
import {
  LockIcon,
  UnlockIcon,
  BellIcon,
  ShieldIcon,
  MapPinIcon,
  NetworkIcon,
  AlertTriangleIcon,
} from "lucide-react";
import { Card } from "../../components/common/Card";
import { Button } from "../../components/common/Button";
import { Input } from "../../components/common/Input";
import { Badge } from "../../components/common/Badge";
import {
  systemConfigService,
  devicesService,
  accessService,
  type SystemConfig as SystemConfigType,
  type LockAndGatewayStatus,
} from "../../services";
import type { Device } from "../../services/devices.service";
import { useAlert } from "../../contexts/AlertContext";
import "../../styles/SystemConfig.css";

export function SystemConfig() {
  const { showAlert } = useAlert();
  const [config, setConfig] = useState<SystemConfigType>({
    lockStatus: "locked",
    autoLockEnabled: true,
    maxAccessAttempts: 3,
    sessionTimeout: 30,
    notificationsEnabled: true,
    blockchainEnabled: true,
  });
  const [onlineDoorLocks, setOnlineDoorLocks] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [unlockingDevices, setUnlockingDevices] = useState<Set<string>>(
    new Set()
  );
  const [lockingDevices, setLockingDevices] = useState<Set<string>>(new Set());
  const [deviceStatuses, setDeviceStatuses] = useState<
    Record<string, "online" | "offline" | "error">
  >({});
  const [deviceDetails, setDeviceDetails] = useState<Record<string, any>>({});
  const [smartDoorLockStatus, setSmartDoorLockStatus] =
    useState<LockAndGatewayStatus | null>(null);
  const [gatewayStatus, setGatewayStatus] =
    useState<LockAndGatewayStatus | null>(null);
  const [loadingLockAndGateway, setLoadingLockAndGateway] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState("");
  const [emergencyUnlocking, setEmergencyUnlocking] = useState(false);
  const [selectedEmergencyDeviceId, setSelectedEmergencyDeviceId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    fetchOnlineDoorLocks();
    fetchLockAndGatewayStatus();
  }, []);

  const fetchData = async () => {
    try {
      const configRes = await systemConfigService.getConfig();

      if (configRes.success && configRes.data) {
        setConfig(configRes.data);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOnlineDoorLocks = async () => {
    setLoadingDevices(true);
    try {
      // First, try to get device from .env file
      try {
        const envDeviceResponse = await systemConfigService.getDeviceFromEnv();
        if (envDeviceResponse.success && envDeviceResponse.data) {
          const envDevice = envDeviceResponse.data;
          // Create a device object compatible with the UI
          const deviceObj: Device = {
            id: envDevice.id || envDevice.tuyaDeviceId,
            deviceName: envDevice.deviceName || "Smart Door Lock",
            location: envDevice.location || "Main Entrance",
            type: envDevice.type || "lock",
            tuyaDeviceId: envDevice.tuyaDeviceId,
            status: envDevice.status || "offline",
            lastChecked: envDevice.lastChecked || new Date().toISOString(),
          };

          setOnlineDoorLocks([deviceObj]);

          // Set status and details
          const deviceKey = deviceObj.id;
          setDeviceStatuses({
            [deviceKey]: envDevice.status || "offline",
          });

          if (envDevice.deviceDetails) {
            setDeviceDetails({
              [deviceKey]: envDevice.deviceDetails,
            });
          }

          setLoadingDevices(false);
          return;
        }
      } catch (envError) {
        console.warn(
          "Failed to fetch device from env, trying database:",
          envError
        );
      }

      // Fallback: Fetch all devices with Tuya status and filter for lock devices
      const response = await devicesService.getStatusWithTuya();
      if (response.success && response.data && Array.isArray(response.data)) {
        // Filter for lock devices only
        const lockDevices = response.data.filter(
          (device) => device.type === "lock" && device.tuyaDeviceId
        );

        // Ensure we have at least one device, or use the first device if available
        if (lockDevices.length > 0) {
          setOnlineDoorLocks(lockDevices);

          // Fetch details for each device (includes online property)
          const statusMap: Record<string, "online" | "offline" | "error"> = {};
          const detailsMap: Record<string, any> = {};
          await Promise.all(
            lockDevices.map(async (device) => {
              try {
                const deviceId = device.tuyaDeviceId || device.id;
                if (!deviceId) {
                  console.warn(`Device ${device.id} has no Tuya device ID`);
                  statusMap[device.id] = "error";
                  return;
                }

                // Fetch device details using GET /v1.0/devices/{device_id}
                // This includes the online property
                try {
                  const detailsResponse =
                    await systemConfigService.getDeviceDetails(deviceId);
                  if (detailsResponse.success && detailsResponse.data) {
                    const deviceDetails = detailsResponse.data.deviceDetails;
                    detailsMap[device.id] = deviceDetails;

                    // Extract online status from device details
                    if (deviceDetails && deviceDetails.online !== undefined) {
                      statusMap[device.id] =
                        deviceDetails.online === true ? "online" : "offline";
                    } else {
                      statusMap[device.id] = "offline";
                    }
                  } else {
                    statusMap[device.id] = "error";
                  }
                } catch (detailsError) {
                  console.warn(
                    `Failed to fetch details for device ${device.id}:`,
                    detailsError
                  );
                  statusMap[device.id] = "error";
                }
              } catch (error) {
                console.error(
                  `Failed to fetch details for device ${device.id}:`,
                  error
                );
                statusMap[device.id] = "error";
              }
            })
          );
          setDeviceStatuses(statusMap);
          setDeviceDetails(detailsMap);
        } else {
          // No lock devices found, try fallback
          setOnlineDoorLocks([]);
          setDeviceStatuses({});
          setDeviceDetails({});
        }
      } else {
        // Response doesn't have data or is not an array, try fallback
        setOnlineDoorLocks([]);
        setDeviceStatuses({});
        setDeviceDetails({});
      }
    } catch (error) {
      console.error("Failed to fetch door locks:", error);
      // Final fallback: try to get device from env again
      try {
        const envDeviceResponse = await systemConfigService.getDeviceFromEnv();
        if (envDeviceResponse.success && envDeviceResponse.data) {
          const envDevice = envDeviceResponse.data;
          const deviceObj: Device = {
            id: envDevice.id || envDevice.tuyaDeviceId,
            deviceName: envDevice.deviceName || "Smart Door Lock",
            location: envDevice.location || "Main Entrance",
            type: envDevice.type || "lock",
            tuyaDeviceId: envDevice.tuyaDeviceId,
            status: envDevice.status || "offline",
            lastChecked: envDevice.lastChecked || new Date().toISOString(),
          };

          setOnlineDoorLocks([deviceObj]);
          const deviceKey = deviceObj.id;
          setDeviceStatuses({
            [deviceKey]: envDevice.status || "offline",
          });
          if (envDevice.deviceDetails) {
            setDeviceDetails({
              [deviceKey]: envDevice.deviceDetails,
            });
          }
        } else {
          setOnlineDoorLocks([]);
          setDeviceStatuses({});
          setDeviceDetails({});
        }
      } catch (finalError) {
        console.error("Failed to fetch device from env:", finalError);
        setOnlineDoorLocks([]);
        setDeviceStatuses({});
        setDeviceDetails({});
      }
    } finally {
      setLoadingDevices(false);
    }
  };

  const fetchLockAndGatewayStatus = async () => {
    setLoadingLockAndGateway(true);
    try {
      const response = await devicesService.getLockAndGatewayStatus();
      if (response.success && response.data) {
        setSmartDoorLockStatus(response.data.smartDoorLock || null);
        setGatewayStatus(response.data.gateway || null);
      } else {
        setSmartDoorLockStatus(null);
        setGatewayStatus(null);
      }
    } catch (error) {
      console.error("Failed to fetch lock and gateway status:", error);
      setSmartDoorLockStatus(null);
      setGatewayStatus(null);
    } finally {
      setLoadingLockAndGateway(false);
    }
  };

  const handleUnlockDevice = async (device: Device) => {
    const deviceId = device.tuyaDeviceId || device.id;
    setUnlockingDevices((prev) => new Set(prev).add(deviceId));

    try {
      const response = await systemConfigService.unlockDevice(deviceId);
      if (response.success) {
        showAlert(
          `Device "${device.deviceName}" unlocked successfully!`,
          "success"
        );
        // Refresh device status and details after unlock
        await refreshDeviceData(device, deviceId);
      } else {
        showAlert(
          `Failed to unlock device: ${response.error || "Unknown error"}`,
          "error"
        );
      }
    } catch (error: any) {
      console.error("Failed to unlock device:", error);
      showAlert(
        `Failed to unlock device: ${error.message || "Unknown error"}`,
        "error"
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
    setLockingDevices((prev) => new Set(prev).add(deviceId));

    try {
      const response = await systemConfigService.lockDevice(deviceId);
      if (response.success) {
        showAlert(
          `Device "${device.deviceName}" lock command sent successfully!`,
          "success"
        );
        // Refresh device status and details after lock
        await refreshDeviceData(device, deviceId);
      } else {
        showAlert(
          `Failed to lock device: ${response.error || "Unknown error"}`,
          "error"
        );
      }
    } catch (error: any) {
      console.error("Failed to lock device:", error);
      showAlert(
        `Failed to lock device: ${error.message || "Unknown error"}`,
        "error"
      );
    } finally {
      setLockingDevices((prev) => {
        const newSet = new Set(prev);
        newSet.delete(deviceId);
        return newSet;
      });
    }
  };

  const refreshDeviceData = async (device: Device, deviceId: string) => {
    try {
      // Refresh device details (includes online property)
      const detailsResponse = await systemConfigService.getDeviceDetails(
        deviceId
      );
      if (detailsResponse.success && detailsResponse.data) {
        const deviceDetails = detailsResponse.data.deviceDetails;
        setDeviceDetails((prev) => ({
          ...prev,
          [device.id]: deviceDetails,
        }));

        // Extract online status from device details
        if (deviceDetails && deviceDetails.online !== undefined) {
          setDeviceStatuses((prev) => ({
            ...prev,
            [device.id]: deviceDetails.online === true ? "online" : "offline",
          }));
        }
      }
    } catch (error) {
      console.error("Failed to refresh device data:", error);
    }
  };

  const handleEmergencyUnlock = async () => {
    if (!emergencyReason.trim()) {
      showAlert("Please provide a reason for the emergency unlock", "error");
      return;
    }

    const deviceId = selectedEmergencyDeviceId || onlineDoorLocks[0]?.tuyaDeviceId || process.env.TUYA_DEVICE_ID;
    if (!deviceId) {
      showAlert("No device available for emergency unlock", "error");
      return;
    }

    setEmergencyUnlocking(true);
    try {
      const response = await accessService.emergencyUnlock({
        reason: emergencyReason.trim(),
        deviceId: deviceId,
        labName: "Laboratory",
      });

      if (response.success) {
        showAlert(
          `Emergency unlock performed successfully. Reason: ${emergencyReason}`,
          "success"
        );
        setEmergencyReason("");
        setSelectedEmergencyDeviceId(null);
        // Refresh device status
        if (onlineDoorLocks.length > 0) {
          const device = onlineDoorLocks.find(d => (d.tuyaDeviceId || d.id) === deviceId);
          if (device) {
            await refreshDeviceData(device, deviceId);
          }
        }
      } else {
        showAlert(
          `Failed to perform emergency unlock: ${response.error || "Unknown error"}`,
          "error"
        );
      }
    } catch (error: any) {
      console.error("Failed to perform emergency unlock:", error);
      showAlert(
        `Failed to perform emergency unlock: ${error.message || "Unknown error"}`,
        "error"
      );
    } finally {
      setEmergencyUnlocking(false);
    }
  };

  const handleRefreshDeviceStatus = async (device: Device) => {
    const deviceId = device.tuyaDeviceId || device.id;
    try {
      // Refresh device details (includes online property)
      const detailsResponse = await systemConfigService.getDeviceDetails(
        deviceId
      );

      if (detailsResponse.success && detailsResponse.data) {
        const deviceDetails = detailsResponse.data.deviceDetails;
        setDeviceDetails((prev) => ({
          ...prev,
          [device.id]: deviceDetails,
        }));

        // Extract online status from device details
        if (deviceDetails && deviceDetails.online !== undefined) {
          setDeviceStatuses((prev) => ({
            ...prev,
            [device.id]: deviceDetails.online === true ? "online" : "offline",
          }));
        }
      }
    } catch (error) {
      console.error(`Failed to refresh status for device ${device.id}:`, error);
      setDeviceStatuses((prev) => ({
        ...prev,
        [device.id]: "error",
      }));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await systemConfigService.updateConfig(config);
      showAlert("System configuration saved successfully!", "success");
    } catch (error) {
      console.error("Failed to save config:", error);
      showAlert("Failed to save configuration. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card
        title="Smart Door Locks (Tuya)"
        action={
          <Button
            size="sm"
            onClick={fetchOnlineDoorLocks}
            disabled={loadingDevices}
          >
            {loadingDevices ? "Refreshing..." : "Refresh"}
          </Button>
        }
      >
        {loadingDevices ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : onlineDoorLocks.length === 0 ? (
          <div className="text-center py-8">
            <LockIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">
              No smart door locks found
            </p>
            <p className="text-sm text-gray-400 mt-2">
              Make sure devices are registered in the database with Tuya device
              IDs
            </p>
            <Button
              size="sm"
              variant="secondary"
              onClick={fetchOnlineDoorLocks}
              disabled={loadingDevices}
              className="mt-4"
            >
              Retry
            </Button>
          </div>
        ) : (
          <div
            className={`grid grid-cols-1 gap-4 ${
              onlineDoorLocks.length === 1
                ? "md:grid-cols-1 md:max-w-md md:mx-auto"
                : "md:grid-cols-2 lg:grid-cols-3"
            }`}
          >
            {onlineDoorLocks.map((device) => {
              const currentStatus =
                deviceStatuses[device.id] || device.status || "offline";
              const deviceId = device.tuyaDeviceId || device.id;
              const isUnlocking = unlockingDevices.has(deviceId);
              const isLocking = lockingDevices.has(deviceId);
              const details = deviceDetails[device.id];

              // Get lock status from device details
              const lockStatus = details?.status?.find(
                (s: any) =>
                  s.code === "door_lock_state" ||
                  s.code === "lock" ||
                  s.code === "switch"
              );
              const isLocked =
                lockStatus?.value === true ||
                lockStatus?.value === "lock" ||
                lockStatus?.value === 1;

              return (
                <div
                  key={device.id}
                  className={`p-6 rounded-lg border-2 ${
                    currentStatus === "online"
                      ? "border-green-200 bg-green-50"
                      : currentStatus === "error"
                      ? "border-red-200 bg-red-50"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                          currentStatus === "online"
                            ? "bg-green-100"
                            : currentStatus === "error"
                            ? "bg-red-100"
                            : "bg-gray-100"
                        }`}
                      >
                        {isLocked ? (
                          <LockIcon
                            className={`w-6 h-6 ${
                              currentStatus === "online"
                                ? "text-green-600"
                                : currentStatus === "error"
                                ? "text-red-600"
                                : "text-gray-600"
                            }`}
                          />
                        ) : (
                          <UnlockIcon
                            className={`w-6 h-6 ${
                              currentStatus === "online"
                                ? "text-green-600"
                                : currentStatus === "error"
                                ? "text-red-600"
                                : "text-gray-600"
                            }`}
                          />
                        )}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {device.deviceName}
                        </h3>
                        <div className="flex items-center space-x-1 text-xs text-gray-600 mt-1">
                          <MapPinIcon className="w-3 h-3" />
                          <span>{device.location}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end space-y-2">
                      <div
                        className={`flex items-center space-x-1 px-2 py-1 rounded-full ${
                          currentStatus === "online"
                            ? "bg-green-100"
                            : currentStatus === "error"
                            ? "bg-red-100"
                            : "bg-gray-100"
                        }`}
                      >
                        <div
                          className={`w-2 h-2 rounded-full ${
                            currentStatus === "online"
                              ? "bg-green-600 animate-pulse"
                              : currentStatus === "error"
                              ? "bg-red-600"
                              : "bg-gray-600"
                          }`}
                        ></div>
                        <span
                          className={`text-xs font-medium ${
                            currentStatus === "online"
                              ? "text-green-800"
                              : currentStatus === "error"
                              ? "text-red-800"
                              : "text-gray-800"
                          }`}
                        >
                          {currentStatus === "online"
                            ? "Online"
                            : currentStatus === "error"
                            ? "Error"
                            : "Offline"}
                        </span>
                      </div>
                      {details?.online !== undefined && (
                        <div
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            isLocked
                              ? "bg-red-100 text-red-800"
                              : "bg-green-100 text-green-800"
                          }`}
                        >
                          {isLocked ? "🔒 Locked" : "🔓 Unlocked"}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 text-sm mb-4">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Device ID:</span>
                      <span className="font-mono text-xs text-gray-900">
                        {details?.id?.substring(0, 12) ||
                          device.tuyaDeviceId?.substring(0, 12)}
                        ...
                      </span>
                    </div>
                    {details && (
                      <>
                        {details.name && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Name:</span>
                            <span className="font-medium text-gray-900">
                              {details.name}
                            </span>
                          </div>
                        )}
                        {details.product_name && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Product:</span>
                            <span className="font-medium text-gray-900">
                              {details.product_name}
                            </span>
                          </div>
                        )}
                        {details.category && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Category:</span>
                            <span className="font-medium text-gray-900">
                              {details.category}
                            </span>
                          </div>
                        )}
                        {details.active_time && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Activation:</span>
                            <span className="text-xs text-gray-900">
                              {new Date(
                                details.active_time * 1000
                              ).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                        {details.ip && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">IP Address:</span>
                            <span className="font-medium text-gray-900">
                              {details.ip}
                            </span>
                          </div>
                        )}
                        {details.time_zone && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Time Zone:</span>
                            <span className="font-medium text-gray-900">
                              {details.time_zone}
                            </span>
                          </div>
                        )}
                        {details.status &&
                          Array.isArray(details.status) &&
                          details.status.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-200">
                              <div className="text-xs font-semibold text-gray-700 mb-1">
                                Device Status:
                              </div>
                              <div className="space-y-1">
                                {details.status
                                  .slice(0, 5)
                                  .map((statusItem: any, idx: number) => (
                                    <div
                                      key={idx}
                                      className="flex justify-between text-xs"
                                    >
                                      <span className="text-gray-600">
                                        {statusItem.code}:
                                      </span>
                                      <span className="font-mono text-gray-900">
                                        {typeof statusItem.value === "boolean"
                                          ? statusItem.value.toString()
                                          : typeof statusItem.value === "object"
                                          ? JSON.stringify(statusItem.value)
                                          : statusItem.value}
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}
                      </>
                    )}
                    {!details && device.tuyaDetails && (
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
                            <span className="text-gray-600">Activation:</span>
                            <span className="text-xs text-gray-900">
                              {new Date(
                                device.tuyaDetails.activeTime * 1000
                              ).toLocaleDateString()}
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
                      </>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-600">Last Checked:</span>
                      <span className="text-xs text-gray-900">
                        {new Date(device.lastChecked).toLocaleString()}
                      </span>
                    </div>
                    {device.error && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                        Error: {device.error}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex space-x-2">
                    <Button
                      size="sm"
                      variant="success"
                      onClick={() => handleUnlockDevice(device)}
                      disabled={
                        isUnlocking ||
                        isLocking ||
                        currentStatus === "offline" ||
                        currentStatus === "error"
                      }
                      className="flex-1"
                    >
                      {isUnlocking ? (
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
                        isLocking ||
                        isUnlocking ||
                        currentStatus === "offline" ||
                        currentStatus === "error"
                      }
                      className="flex-1"
                    >
                      {isLocking ? (
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
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleRefreshDeviceStatus(device)}
                      disabled={loadingDevices}
                    >
                      Refresh
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Emergency Override">
        <div className="space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <AlertTriangleIcon className="w-5 h-5 text-yellow-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <h4 className="font-semibold text-yellow-900 mb-1">
                  Emergency Unlock
                </h4>
                <p className="text-sm text-yellow-800">
                  This feature bypasses all schedule checks and access rules.
                  Use only in emergency situations. All emergency unlocks are
                  logged with reason and timestamp for audit purposes.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {onlineDoorLocks.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Device
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedEmergencyDeviceId || ""}
                  onChange={(e) => setSelectedEmergencyDeviceId(e.target.value)}
                  disabled={emergencyUnlocking}
                >
                  <option value="">
                    {onlineDoorLocks[0]?.tuyaDeviceId
                      ? "Use default device"
                      : "Select a device"}
                  </option>
                  {onlineDoorLocks.map((device) => {
                    const deviceId = device.tuyaDeviceId || device.id;
                    return (
                      <option key={device.id} value={deviceId}>
                        {device.deviceName} ({device.location})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for Emergency Unlock <span className="text-red-600">*</span>
              </label>
              <Input
                type="text"
                placeholder="Enter reason for emergency unlock (e.g., Fire alarm, Medical emergency, etc.)"
                value={emergencyReason}
                onChange={(e) => setEmergencyReason(e.target.value)}
                disabled={emergencyUnlocking}
                className="w-full"
              />
              <p className="mt-1 text-xs text-gray-500">
                This reason will be logged for audit purposes.
              </p>
            </div>

            <Button
              variant="danger"
              onClick={handleEmergencyUnlock}
              disabled={emergencyUnlocking || !emergencyReason.trim()}
              className="w-full"
            >
              {emergencyUnlocking ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Performing Emergency Unlock...
                </>
              ) : (
                <>
                  <AlertTriangleIcon className="w-4 h-4 mr-2" />
                  Emergency Unlock
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>

      <Card
        title="Smart Door Lock & Gateway Status"
        action={
          <Button
            size="sm"
            onClick={fetchLockAndGatewayStatus}
            disabled={loadingLockAndGateway}
          >
            {loadingLockAndGateway ? "Refreshing..." : "Refresh"}
          </Button>
        }
      >
        {loadingLockAndGateway ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Smart Door Lock summary */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <LockIcon className="w-5 h-5 text-blue-600" />
                <h3 className="text-md font-semibold text-gray-900">
                  Smart Door Lock (Env)
                </h3>
              </div>
              {smartDoorLockStatus ? (
                <div
                  className={`p-4 rounded-lg border-2 ${
                    smartDoorLockStatus.online
                      ? "border-green-200 bg-green-50"
                      : smartDoorLockStatus.error
                      ? "border-red-200 bg-red-50"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">
                        {smartDoorLockStatus.name || "Smart Door Lock"}
                      </p>
                      {smartDoorLockStatus.id && (
                        <p className="text-xs text-gray-600">
                          Device ID:{" "}
                          {smartDoorLockStatus.id.substring(0, 12)}
                          ...
                        </p>
                      )}
                    </div>
                    <Badge
                      variant={
                        smartDoorLockStatus.online
                          ? "success"
                          : smartDoorLockStatus.error
                          ? "danger"
                          : "default"
                      }
                    >
                      {smartDoorLockStatus.online ? "online" : "offline"}
                    </Badge>
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-gray-600">
                    {smartDoorLockStatus.productName && (
                      <div className="flex justify-between">
                        <span>Product:</span>
                        <span className="font-medium">
                          {smartDoorLockStatus.productName}
                        </span>
                      </div>
                    )}
                    {smartDoorLockStatus.model && (
                      <div className="flex justify-between">
                        <span>Model:</span>
                        <span className="font-medium">
                          {smartDoorLockStatus.model}
                        </span>
                      </div>
                    )}
                    {smartDoorLockStatus.category && (
                      <div className="flex justify-between">
                        <span>Category:</span>
                        <span className="font-medium">
                          {smartDoorLockStatus.category}
                        </span>
                      </div>
                    )}
                    {smartDoorLockStatus.ip && (
                      <div className="flex justify-between">
                        <span>IP Address:</span>
                        <span className="font-mono">
                          {smartDoorLockStatus.ip}
                        </span>
                      </div>
                    )}
                    {smartDoorLockStatus.timeZone && (
                      <div className="flex justify-between">
                        <span>Time Zone:</span>
                        <span className="font-medium">
                          {smartDoorLockStatus.timeZone}
                        </span>
                      </div>
                    )}
                    {smartDoorLockStatus.activeTime && (
                      <div className="flex justify-between">
                        <span>Active Since:</span>
                        <span>
                          {new Date(
                            smartDoorLockStatus.activeTime * 1000
                          ).toLocaleString()}
                        </span>
                      </div>
                    )}
                    {smartDoorLockStatus.updateTime && (
                      <div className="flex justify-between">
                        <span>Last Updated:</span>
                        <span>
                          {new Date(
                            smartDoorLockStatus.updateTime * 1000
                          ).toLocaleString()}
                        </span>
                      </div>
                    )}
                    {smartDoorLockStatus.status &&
                      smartDoorLockStatus.status.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          <p className="font-medium mb-1">Status Codes:</p>
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {smartDoorLockStatus.status.map((s, idx) => (
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
                    {smartDoorLockStatus.error && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                        <p className="font-semibold mb-1">Error:</p>
                        <p>{smartDoorLockStatus.error}</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">
                  Smart door lock not configured
                </p>
              )}
            </div>

            {/* Gateway summary */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <NetworkIcon className="w-5 h-5 text-purple-600" />
                <h3 className="text-md font-semibold text-gray-900">Gateway</h3>
              </div>
              {gatewayStatus ? (
                <div
                  className={`p-4 rounded-lg border-2 ${
                    gatewayStatus.online
                      ? "border-green-200 bg-green-50"
                      : gatewayStatus.error
                      ? "border-red-200 bg-red-50"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">
                        {gatewayStatus.name || "Gateway"}
                      </p>
                      {gatewayStatus.id && (
                        <p className="text-xs text-gray-600">
                          Device ID: {gatewayStatus.id.substring(0, 12)}...
                        </p>
                      )}
                    </div>
                    <Badge
                      variant={
                        gatewayStatus.online
                          ? "success"
                          : gatewayStatus.error
                          ? "danger"
                          : "default"
                      }
                    >
                      {gatewayStatus.online ? "online" : "offline"}
                    </Badge>
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-gray-600">
                    {gatewayStatus.productName && (
                      <div className="flex justify-between">
                        <span>Product:</span>
                        <span className="font-medium">
                          {gatewayStatus.productName}
                        </span>
                      </div>
                    )}
                    {gatewayStatus.model && (
                      <div className="flex justify-between">
                        <span>Model:</span>
                        <span className="font-medium">
                          {gatewayStatus.model}
                        </span>
                      </div>
                    )}
                    {gatewayStatus.category && (
                      <div className="flex justify-between">
                        <span>Category:</span>
                        <span className="font-medium">
                          {gatewayStatus.category}
                        </span>
                      </div>
                    )}
                    {gatewayStatus.ip && (
                      <div className="flex justify-between">
                        <span>IP Address:</span>
                        <span className="font-mono">{gatewayStatus.ip}</span>
                      </div>
                    )}
                    {gatewayStatus.timeZone && (
                      <div className="flex justify-between">
                        <span>Time Zone:</span>
                        <span className="font-medium">
                          {gatewayStatus.timeZone}
                        </span>
                      </div>
                    )}
                    {gatewayStatus.sub !== undefined && (
                      <div className="flex justify-between">
                        <span>Sub-device:</span>
                        <span className="font-medium">
                          {gatewayStatus.sub ? "Yes" : "No"}
                        </span>
                      </div>
                    )}
                    {gatewayStatus.activeTime && (
                      <div className="flex justify-between">
                        <span>Active Since:</span>
                        <span>
                          {new Date(
                            gatewayStatus.activeTime * 1000
                          ).toLocaleString()}
                        </span>
                      </div>
                    )}
                    {gatewayStatus.updateTime && (
                      <div className="flex justify-between">
                        <span>Last Updated:</span>
                        <span>
                          {new Date(
                            gatewayStatus.updateTime * 1000
                          ).toLocaleString()}
                        </span>
                      </div>
                    )}
                    {gatewayStatus.status && gatewayStatus.status.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-200">
                        <p className="font-medium mb-1">Status Codes:</p>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {gatewayStatus.status.map((s, idx) => (
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
                    {gatewayStatus.error && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                        <p className="font-semibold mb-1">Error:</p>
                        <p>{gatewayStatus.error}</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">
                  Gateway not configured
                </p>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card title="Security Policies">
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <Input
              label="Max Access Attempts"
              type="number"
              value={config.maxAccessAttempts}
              onChange={(e) =>
                setConfig({
                  ...config,
                  maxAccessAttempts: parseInt(e.target.value),
                })
              }
            />
            <Input
              label="Session Timeout (minutes)"
              type="number"
              value={config.sessionTimeout}
              onChange={(e) =>
                setConfig({
                  ...config,
                  sessionTimeout: parseInt(e.target.value),
                })
              }
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <LockIcon className="w-5 h-5 text-gray-600" />
                <div>
                  <p className="font-medium text-gray-900">Auto-Lock Enabled</p>
                  <p className="text-sm text-gray-600">
                    Automatically lock after session timeout
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.autoLockEnabled}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      autoLockEnabled: e.target.checked,
                    })
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <BellIcon className="w-5 h-5 text-gray-600" />
                <div>
                  <p className="font-medium text-gray-900">
                    Notifications Enabled
                  </p>
                  <p className="text-sm text-gray-600">
                    Receive alerts for security events
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.notificationsEnabled}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      notificationsEnabled: e.target.checked,
                    })
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Configuration"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
