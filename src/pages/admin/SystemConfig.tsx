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
  const [deviceStatuses, setDeviceStatuses] = useState
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
  const [selectedEmergencyDeviceId, setSelectedEmergencyDeviceId] =
    useState<string | null>(null);

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

    const deviceId =
      selectedEmergencyDeviceId ||
      onlineDoorLocks[0]?.tuyaDeviceId ||
      process.env.TUYA_DEVICE_ID;
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
          const device = onlineDoorLocks.find(
            (d) => (d.tuyaDeviceId || d.id) === deviceId
          );
          if (device) {
            await refreshDeviceData(device, deviceId);
          }
        }
      } else {
        showAlert(
          `Failed to perform emergency unlock: ${
            response.error || "Unknown error"
          }`,
          "error"
        );
      }
    } catch (error: any) {
      console.error("Failed to perform emergency unlock:", error);
      showAlert(
        `Failed to perform emergency unlock: ${
          error.message || "Unknown error"
        }`,
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
      <div className="system-config-loading">
        <div className="system-config-spinner"></div>
      </div>
    );
  }

  return (
    <div className="system-config-container">
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
          <div className="system-config-loading">
            <div className="system-config-spinner"></div>
          </div>
        ) : onlineDoorLocks.length === 0 ? (
          <div className="empty-state">
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
            className={`device-cards-grid ${
              onlineDoorLocks.length === 1
                ? "single-device"
                : "multi-device"
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
                  className={`device-card status-${currentStatus}`}
                >
                  <div className="device-card-header">
                    <div className="device-info-section">
                      <div
                        className={`device-icon-container status-${currentStatus}`}
                      >
                        {isLocked ? (
                          <LockIcon className={`w-6 h-6`} />
                        ) : (
                          <UnlockIcon className={`w-6 h-6`} />
                        )}
                      </div>
                      <div className="device-name-location">
                        <h3 className="device-name">{device.deviceName}</h3>
                        <div className="device-location">
                          <MapPinIcon className="w-3 h-3" />
                          <span>{device.location}</span>
                        </div>
                      </div>
                    </div>
                    <div className="device-badges">
                      <div className={`status-badge ${currentStatus}`}>
                        <div
                          className={`status-dot ${
                            currentStatus === "online" ? "pulse" : ""
                          }`}
                        ></div>
                        <span>
                          {currentStatus === "online"
                            ? "Online"
                            : currentStatus === "error"
                            ? "Error"
                            : "Offline"}
                        </span>
                      </div>
                      {details?.online !== undefined && (
                        <div
                          className={`lock-status-badge ${
                            isLocked ? "locked" : "unlocked"
                          }`}
                        >
                          {isLocked ? "🔒 Locked" : "🔓 Unlocked"}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="device-details">
                    <div className="device-detail-row">
                      <span className="device-detail-label">Device ID:</span>
                      <span className="device-detail-value mono">
                        {(details?.id || device.tuyaDeviceId)?.substring(
                          0,
                          12
                        )}
                        ...
                      </span>
                    </div>
                    {details && (
                      <>
                        {details.name && (
                          <div className="device-detail-row">
                            <span className="device-detail-label">Name:</span>
                            <span className="device-detail-value">
                              {details.name}
                            </span>
                          </div>
                        )}
                        {details.product_name && (
                          <div className="device-detail-row">
                            <span className="device-detail-label">
                              Product:
                            </span>
                            <span className="device-detail-value">
                              {details.product_name}
                            </span>
                          </div>
                        )}
                        {details.category && (
                          <div className="device-detail-row">
                            <span className="device-detail-label">
                              Category:
                            </span>
                            <span className="device-detail-value">
                              {details.category}
                            </span>
                          </div>
                        )}
                        {details.active_time && (
                          <div className="device-detail-row">
                            <span className="device-detail-label">
                              Activation:
                            </span>
                            <span className="device-detail-value">
                              {new Date(
                                details.active_time * 1000
                              ).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                        {details.ip && (
                          <div className="device-detail-row">
                            <span className="device-detail-label">
                              IP Address:
                            </span>
                            <span className="device-detail-value">
                              {details.ip}
                            </span>
                          </div>
                        )}
                        {details.time_zone && (
                          <div className="device-detail-row">
                            <span className="device-detail-label">
                              Time Zone:
                            </span>
                            <span className="device-detail-value">
                              {details.time_zone}
                            </span>
                          </div>
                        )}
                        {details.status &&
                          Array.isArray(details.status) &&
                          details.status.length > 0 && (
                            <div className="device-status-section">
                              <div className="device-status-title">
                                Device Status:
                              </div>
                              <div className="device-status-list">
                                {details.status
                                  .slice(0, 5)
                                  .map((statusItem: any, idx: number) => (
                                    <div
                                      key={idx}
                                      className="device-detail-row"
                                    >
                                      <span className="device-detail-label">
                                        {statusItem.code}:
                                      </span>
                                      <span className="device-detail-value mono">
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
                          <div className="device-detail-row">
                            <span className="device-detail-label">
                              Product:
                            </span>
                            <span className="device-detail-value">
                              {device.tuyaDetails.productName}
                            </span>
                          </div>
                        )}
                        {device.tuyaDetails.activeTime && (
                          <div className="device-detail-row">
                            <span className="device-detail-label">
                              Activation:
                            </span>
                            <span className="device-detail-value">
                              {new Date(
                                device.tuyaDetails.activeTime * 1000
                              ).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                        {device.tuyaDetails.ip && (
                          <div className="device-detail-row">
                            <span className="device-detail-label">
                              IP Address:
                            </span>
                            <span className="device-detail-value">
                              {device.tuyaDetails.ip}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                    <div className="device-detail-row">
                      <span className="device-detail-label">Last Checked:</span>
                      <span className="device-detail-value">
                        {new Date(device.lastChecked).toLocaleString()}
                      </span>
                    </div>
                    {device.error && (
                      <div className="device-error-box">
                        Error: {device.error}
                      </div>
                    )}
                  </div>

                  <div className="device-actions">
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
                          <span className="button-spinner"></span>
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
                          <span className="button-spinner"></span>
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
        <div className="emergency-section">
          <div className="emergency-alert">
            <div className="emergency-alert-content">
              <AlertTriangleIcon className="emergency-alert-icon" />
              <div className="emergency-alert-text">
                <h4>Emergency Unlock</h4>
                <p>
                  This feature bypasses all schedule checks and access rules.
                  Use only in emergency situations. All emergency unlocks are
                  logged with reason and timestamp for audit purposes.
                </p>
              </div>
            </div>
          </div>

          <div className="emergency-form">
            {onlineDoorLocks.length > 1 && (
              <div className="form-group">
                <label className="form-label">Select Device</label>
                <select
                  className="form-select"
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

            <div className="form-group">
              <label className="form-label">
                Reason for Emergency Unlock{" "}
                <span className="required">*</span>
              </label>
              <Input
                type="text"
                placeholder="Enter reason for emergency unlock (e.g., Fire alarm, Medical emergency, etc.)"
                value={emergencyReason}
                onChange={(e) => setEmergencyReason(e.target.value)}
                disabled={emergencyUnlocking}
                className="form-input"
              />
              <p className="form-hint">
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
                  <span className="button-spinner"></span>
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
          <div className="system-config-loading">
            <div className="system-config-spinner"></div>
          </div>
        ) : (
          <div className="gateway-grid">
            {/* Smart Door Lock summary */}
            <div>
              <div className="gateway-section-header">
                <LockIcon className="w-5 h-5" />
                <h3>Smart Door Lock (Env)</h3>
          </div>
          {smartDoorLockStatus ? (
            <div
              className={`gateway-card status-${
                smartDoorLockStatus.online
                  ? "online"
                  : smartDoorLockStatus.error
                  ? "error"
                  : "offline"
              }`}
            >
              <div className="gateway-card-header">
                <div className="gateway-card-info">
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
              <div className="device-details">
                {smartDoorLockStatus.productName && (
                  <div className="device-detail-row">
                    <span className="device-detail-label">Product:</span>
                    <span className="device-detail-value">
                      {smartDoorLockStatus.productName}
                    </span>
                  </div>
                )}
                {smartDoorLockStatus.model && (
                  <div className="device-detail-row">
                    <span className="device-detail-label">Model:</span>
                    <span className="device-detail-value">
                      {smartDoorLockStatus.model}
                    </span>
                  </div>
                )}
                {smartDoorLockStatus.category && (
                  <div className="device-detail-row">
                    <span className="device-detail-label">Category:</span>
                    <span className="device-detail-value">
                      {smartDoorLockStatus.category}
                    </span>
                  </div>
                )}
                {smartDoorLockStatus.ip && (
                  <div className="device-detail-row">
                    <span className="device-detail-label">IP Address:</span>
                    <span className="device-detail-value">
                      {smartDoorLockStatus.ip}
                    </span>
                  </div>
                )}
                {smartDoorLockStatus.timeZone && (
                  <div className="device-detail-row">
                    <span className="device-detail-label">Time Zone:</span>
                    <span className="device-detail-value">
                      {smartDoorLockStatus.timeZone}
                    </span>
                  </div>
                )}
                {smartDoorLockStatus.activeTime && (
                  <div className="device-detail-row">
                    <span className="device-detail-label">
                      Active Since:
                    </span>
                    <span className="device-detail-value">
                      {new Date(
                        smartDoorLockStatus.activeTime * 1000
                      ).toLocaleString()}
                    </span>
                  </div>
                )}
                {smartDoorLockStatus.updateTime && (
                  <div className="device-detail-row">
                    <span className="device-detail-label">
                      Last Updated:
                    </span>
                    <span className="device-detail-value">
                      {new Date(
                        smartDoorLockStatus.updateTime * 1000
                      ).toLocaleString()}
                    </span>
                  </div>
                )}
                {smartDoorLockStatus.status &&
                  smartDoorLockStatus.status.length > 0 && (
                    <div className="device-status-section">
                      <p className="font-medium mb-1 text-xs">
                        Status Codes:
                      </p>
                      <div className="device-status-list max-h-32 overflow-y-auto">
                        {smartDoorLockStatus.status.map((s, idx) => (
                          <div
                            key={idx}
                            className="device-detail-row"
                          >
                            <span className="device-detail-label mono">
                              {s.code}:
                            </span>
                            <span className="device-detail-value">
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
                  <div className="device-error-box">
                    <p className="font-semibold mb-1">Error:</p>
                    <p>{smartDoorLockStatus.error}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="gateway-not-configured">
              Smart door lock not configured
            </p>
          )}
        </div>

        {/* Gateway summary */}
        <div>
          <div className="gateway-section-header">
            <NetworkIcon className="w-5 h-5" />
            <h3>Gateway</h3>
          </div>
          {gatewayStatus ? (
            <div
              className={`gateway-card status-${
                gatewayStatus.online
                  ? "online"
                  : gatewayStatus.error
                  ? "error"
                  : "offline"
              }`}
            >
              <div className="gateway-card-header">
                <div className="gateway-card-info">
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
              <div className="device-details">
                {gatewayStatus.productName && (
                  <div className="device-detail-row">
                    <span className="device-detail-label">Product:</span>
                    <span className="device-detail-value">
                      {gatewayStatus.productName}
                    </span>
                  </div>
                )}
                {gatewayStatus.model && (
                  <div className="device-detail-row">
                    <span className="device-detail-label">Model:</span>
                    <span className="device-detail-value">
                      {gatewayStatus.model}
                    </span>
                  </div>
                )}
                {gatewayStatus.category && (
                  <div className="device-detail-row">
                    <span className="device-detail-label">Category:</span>
                    <span className="device-detail-value">
                      {gatewayStatus.category}
                    </span>
                  </div>
                )}
                {gatewayStatus.ip && (
                  <div className="device-detail-row">
                    <span className="device-detail-label">IP Address:</span>
                    <span className="device-detail-value">
                      {gatewayStatus.ip}
                    </span>
                  </div>
                )}
                {gatewayStatus.timeZone && (
                  <div className="device-detail-row">
                    <span className="device-detail-label">Time Zone:</span>
                    <span className="device-detail-value">
                      {gatewayStatus.timeZone}
                    </span>
                  </div>
                )}
                {gatewayStatus.sub !== undefined && (
                  <div className="device-detail-row">
                    <span className="device-detail-label">Sub-device:</span>
                    <span className="device-detail-value">
                      {gatewayStatus.sub ? "Yes" : "No"}
                    </span>
                  </div>
                )}
                {gatewayStatus.activeTime && (
                  <div className="device-detail-row">
                    <span className="device-detail-label">
                      Active Since:
                    </span>
                    <span className="device-detail-value">
                      {new Date(
                        gatewayStatus.activeTime * 1000
                      ).toLocaleString()}
                    </span>
                  </div>
                )}
                {gatewayStatus.updateTime && (
                  <div className="device-detail-row">
                    <span className="device-detail-label">
                      Last Updated:
                    </span>
                    <span className="device-detail-value">
                      {new Date(
                        gatewayStatus.updateTime * 1000
                      ).toLocaleString()}
                    </span>
                  </div>
                )}
                {gatewayStatus.status && gatewayStatus.status.length > 0 && (
                  <div className="device-status-section">
                    <p className="font-medium mb-1 text-xs">
                      Status Codes:
                    </p>
                    <div className="device-status-list max-h-32 overflow-y-auto">
                      {gatewayStatus.status.map((s, idx) => (
                        <div
                          key={idx}
                          className="device-detail-row"
                        >
                          <span className="device-detail-label mono">
                            {s.code}:
                          </span>
                          <span className="device-detail-value">
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
                  <div className="device-error-box">
                    <p className="font-semibold mb-1">Error:</p>
                    <p>{gatewayStatus.error}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="gateway-not-configured">
              Gateway not configured
            </p>
          )}
        </div>
      </div>
    )}
  </Card>

  <Card title="Security Policies">
    <div className="security-form">
      <div className="security-inputs-grid">
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

      <div className="security-toggles">
        <div className="security-toggle-item">
          <div className="security-toggle-content">
            <LockIcon className="w-5 h-5 text-gray-600" />
            <div className="security-toggle-text">
              <h4>Auto-Lock Enabled</h4>
              <p>Automatically lock after session timeout</p>
            </div>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={config.autoLockEnabled}
              onChange={(e) =>
                setConfig({
                  ...config,
                  autoLockEnabled: e.target.checked,
                })
              }
            />
            <span className="toggle-slider"></span>
          </label>
        </div>

        <div className="security-toggle-item">
          <div className="security-toggle-content">
            <BellIcon className="w-5 h-5 text-gray-600" />
            <div className="security-toggle-text">
              <h4>Notifications Enabled</h4>
              <p>Receive alerts for security events</p>
            </div>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={config.notificationsEnabled}
              onChange={(e) =>
                setConfig({
                  ...config,
                  notificationsEnabled: e.target.checked,
                })
              }
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div className="security-actions">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Configuration"}
        </Button>
      </div>
    </div>
  </Card>
</div>
);
}