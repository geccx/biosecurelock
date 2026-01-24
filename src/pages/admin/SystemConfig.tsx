import { useEffect, useState } from "react";
import {
  LockIcon,
  UnlockIcon,
  BellIcon,
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
  const [unlockingDevices, setUnlockingDevices] = useState<Set<string>>(new Set());
  const [lockingDevices, setLockingDevices] = useState<Set<string>>(new Set());
  const [deviceStatuses, setDeviceStatuses] = useState<Record<string, "online" | "offline" | "error">>({});
  const [deviceDetails, setDeviceDetails] = useState<Record<string, any>>({});
  const [smartDoorLockStatus, setSmartDoorLockStatus] = useState<LockAndGatewayStatus | null>(null);
  const [gatewayStatus, setGatewayStatus] = useState<LockAndGatewayStatus | null>(null);
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
          setDeviceStatuses({ [deviceKey]: envDevice.status || "offline" });

          if (envDevice.deviceDetails) {
            setDeviceDetails({ [deviceKey]: envDevice.deviceDetails });
          }

          setLoadingDevices(false);
          return;
        }
      } catch (envError) {
        console.warn("Failed to fetch device from env, trying database:", envError);
      }

      const response = await devicesService.getStatusWithTuya();
      if (response.success && response.data && Array.isArray(response.data)) {
        const lockDevices = response.data.filter(
          (device) => device.type === "lock" && device.tuyaDeviceId
        );

        if (lockDevices.length > 0) {
          setOnlineDoorLocks(lockDevices);

          const statusMap: Record<string, "online" | "offline" | "error"> = {};
          const detailsMap: Record<string, any> = {};
          await Promise.all(
            lockDevices.map(async (device) => {
              try {
                const deviceId = device.tuyaDeviceId || device.id;
                if (!deviceId) {
                  statusMap[device.id] = "error";
                  return;
                }

                const detailsResponse = await systemConfigService.getDeviceDetails(deviceId);
                if (detailsResponse.success && detailsResponse.data) {
                  const deviceDetails = detailsResponse.data.deviceDetails;
                  detailsMap[device.id] = deviceDetails;
                  statusMap[device.id] =
                    deviceDetails?.online === true ? "online" : "offline";
                } else {
                  statusMap[device.id] = "error";
                }
              } catch (error) {
                statusMap[device.id] = "error";
              }
            })
          );
          setDeviceStatuses(statusMap);
          setDeviceDetails(detailsMap);
        } else {
          setOnlineDoorLocks([]);
        }
      }
    } catch (error) {
      console.error("Failed to fetch door locks:", error);
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
      }
    } catch (error) {
      console.error("Failed to fetch lock and gateway status:", error);
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
        showAlert(`Device "${device.deviceName}" unlocked successfully!`, "success");
        await refreshDeviceData(device, deviceId);
      } else {
        showAlert(`Failed to unlock device: ${response.error || "Unknown error"}`, "error");
      }
    } catch (error: any) {
      showAlert(`Failed to unlock device: ${error.message || "Unknown error"}`, "error");
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
        showAlert(`Device "${device.deviceName}" locked successfully!`, "success");
        await refreshDeviceData(device, deviceId);
      } else {
        showAlert(`Failed to lock device: ${response.error || "Unknown error"}`, "error");
      }
    } catch (error: any) {
      showAlert(`Failed to lock device: ${error.message || "Unknown error"}`, "error");
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
      const detailsResponse = await systemConfigService.getDeviceDetails(deviceId);
      if (detailsResponse.success && detailsResponse.data) {
        const deviceDetails = detailsResponse.data.deviceDetails;
        setDeviceDetails((prev) => ({ ...prev, [device.id]: deviceDetails }));
        setDeviceStatuses((prev) => ({
          ...prev,
          [device.id]: deviceDetails?.online === true ? "online" : "offline",
        }));
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

    const deviceId = selectedEmergencyDeviceId || onlineDoorLocks[0]?.tuyaDeviceId;
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
        showAlert(`Emergency unlock performed successfully.`, "success");
        setEmergencyReason("");
        setSelectedEmergencyDeviceId(null);
        const device = onlineDoorLocks.find((d) => (d.tuyaDeviceId || d.id) === deviceId);
        if (device) await refreshDeviceData(device, deviceId);
      } else {
        showAlert(`Failed to perform emergency unlock: ${response.error}`, "error");
      }
    } catch (error: any) {
      showAlert(`Failed to perform emergency unlock: ${error.message}`, "error");
    } finally {
      setEmergencyUnlocking(false);
    }
  };

  const handleRefreshDeviceStatus = async (device: Device) => {
    const deviceId = device.tuyaDeviceId || device.id;
    try {
      const detailsResponse = await systemConfigService.getDeviceDetails(deviceId);
      if (detailsResponse.success && detailsResponse.data) {
        const deviceDetails = detailsResponse.data.deviceDetails;
        setDeviceDetails((prev) => ({ ...prev, [device.id]: deviceDetails }));
        setDeviceStatuses((prev) => ({
          ...prev,
          [device.id]: deviceDetails?.online === true ? "online" : "offline",
        }));
      }
    } catch (error) {
      setDeviceStatuses((prev) => ({ ...prev, [device.id]: "error" }));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await systemConfigService.updateConfig(config);
      showAlert("System configuration saved successfully!", "success");
    } catch (error) {
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
          <Button size="sm" onClick={fetchOnlineDoorLocks} disabled={loadingDevices}>
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
            <LockIcon />
            <p>No smart door locks found</p>
            <p>Make sure devices are registered in the database with Tuya device IDs</p>
            <Button size="sm" variant="secondary" onClick={fetchOnlineDoorLocks}>
              Retry
            </Button>
          </div>
        ) : (
          <div className={`device-cards-grid ${onlineDoorLocks.length === 1 ? "single-device" : "multi-device"}`}>
            {onlineDoorLocks.map((device) => {
              const currentStatus = deviceStatuses[device.id] || device.status || "offline";
              const deviceId = device.tuyaDeviceId || device.id;
              const isUnlocking = unlockingDevices.has(deviceId);
              const isLocking = lockingDevices.has(deviceId);
              const details = deviceDetails[device.id];

              const lockStatus = details?.status?.find(
                (s: any) =>
                  s.code === "door_lock_state" || s.code === "lock" || s.code === "switch"
              );
              const isLocked =
                lockStatus?.value === true ||
                lockStatus?.value === "lock" ||
                lockStatus?.value === 1;

              return (
                <div key={device.id} className={`device-card status-${currentStatus}`}>
                  <div className="device-card-header">
                    <div className="device-info-section">
                      <div className={`device-icon-container status-${currentStatus}`}>
                        {isLocked ? <LockIcon /> : <UnlockIcon />}
                      </div>
                      <div className="device-name-location">
                        <h3 className="device-name">{device.deviceName}</h3>
                        <div className="device-location">
                          <MapPinIcon />
                          <span>{device.location}</span>
                        </div>
                      </div>
                    </div>
                    <div className="device-badges">
                      <div className={`status-badge ${currentStatus}`}>
                        <div className={`status-dot ${currentStatus === "online" ? "pulse" : ""}`}></div>
                        <span>
                          {currentStatus === "online" ? "Online" : currentStatus === "error" ? "Error" : "Offline"}
                        </span>
                      </div>
                      {details?.online !== undefined && (
                        <div className={`lock-status-badge ${isLocked ? "locked" : "unlocked"}`}>
                          {isLocked ? "🔒 Locked" : "🔓 Unlocked"}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="device-details">
                    <div className="device-detail-row">
                      <span className="device-detail-label">Device ID:</span>
                      <span className="device-detail-value mono">
                        {(details?.id || device.tuyaDeviceId)?.substring(0, 12)}...
                      </span>
                    </div>
                    {details?.product_name && (
                      <div className="device-detail-row">
                        <span className="device-detail-label">Product:</span>
                        <span className="device-detail-value">{details.product_name}</span>
                      </div>
                    )}
                    {details?.category && (
                      <div className="device-detail-row">
                        <span className="device-detail-label">Category:</span>
                        <span className="device-detail-value">{details.category}</span>
                      </div>
                    )}
                    {details?.ip && (
                      <div className="device-detail-row">
                        <span className="device-detail-label">IP Address:</span>
                        <span className="device-detail-value">{details.ip}</span>
                      </div>
                    )}
                    <div className="device-detail-row">
                      <span className="device-detail-label">Last Checked:</span>
                      <span className="device-detail-value">
                        {new Date(device.lastChecked).toLocaleString()}
                      </span>
                    </div>

                    {details?.status && Array.isArray(details.status) && details.status.length > 0 && (
                      <div className="device-status-section">
                        <div className="device-status-title">Device Status:</div>
                        <div className="device-status-list">
                          {details.status.slice(0, 5).map((statusItem: any, idx: number) => (
                            <div key={idx} className="device-detail-row">
                              <span className="device-detail-label">{statusItem.code}:</span>
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

                    {device.error && (
                      <div className="device-error-box">Error: {device.error}</div>
                    )}
                  </div>

                  <div className="device-actions">
                    <Button
                      size="sm"
                      variant="success"
                      onClick={() => handleUnlockDevice(device)}
                      disabled={isUnlocking || isLocking || currentStatus !== "online"}
                    >
                      {isUnlocking ? (
                        <>
                          <span className="button-spinner"></span>
                          Unlocking...
                        </>
                      ) : (
                        <>
                          <UnlockIcon className="w-4 h-4 mr-2" />
                          Unlock
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => handleLockDevice(device)}
                      disabled={isLocking || isUnlocking || currentStatus !== "online"}
                    >
                      {isLocking ? (
                        <>
                          <span className="button-spinner"></span>
                          Locking...
                        </>
                      ) : (
                        <>
                          <LockIcon className="w-4 h-4 mr-2" />
                          Lock
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleRefreshDeviceStatus(device)}
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
                  This feature bypasses all schedule checks and access rules. Use only in emergency
                  situations. All emergency unlocks are logged for audit purposes.
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
                  <option value="">Use default device</option>
                  {onlineDoorLocks.map((device) => (
                    <option key={device.id} value={device.tuyaDeviceId || device.id}>
                      {device.deviceName} ({device.location})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">
                Reason for Emergency Unlock <span className="required">*</span>
              </label>
              <Input
                type="text"
                placeholder="Enter reason (e.g., Fire alarm, Medical emergency)"
                value={emergencyReason}
                onChange={(e) => setEmergencyReason(e.target.value)}
                disabled={emergencyUnlocking}
                className="form-input"
              />
              <p className="form-hint">This reason will be logged for audit purposes.</p>
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
          <Button size="sm" onClick={fetchLockAndGatewayStatus} disabled={loadingLockAndGateway}>
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
            <div>
              <div className="gateway-section-header">
                <LockIcon />
                <h3>Smart Door Lock (Env)</h3>
              </div>
              {smartDoorLockStatus ? (
                <div className={`gateway-card status-${smartDoorLockStatus.online ? "online" : smartDoorLockStatus.error ? "error" : "offline"}`}>
                  <div className="gateway-card-header">
                    <div className="gateway-card-info">
                      <p>{smartDoorLockStatus.name || "Smart Door Lock"}</p>
                      <p>Device ID: {smartDoorLockStatus.id?.substring(0, 12)}...</p>
                    </div>
                    <Badge variant={smartDoorLockStatus.online ? "success" : "default"}>
                      {smartDoorLockStatus.online ? "online" : "offline"}
                    </Badge>
                  </div>
                  <div className="device-details">
                    {smartDoorLockStatus.productName && (
                      <div className="device-detail-row">
                        <span className="device-detail-label">Product:</span>
                        <span className="device-detail-value">{smartDoorLockStatus.productName}</span>
                      </div>
                    )}
                    {smartDoorLockStatus.category && (
                      <div className="device-detail-row">
                        <span className="device-detail-label">Category:</span>
                        <span className="device-detail-value">{smartDoorLockStatus.category}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="gateway-not-configured">Smart door lock not configured</p>
              )}
            </div>

            <div>
              <div className="gateway-section-header">
                <NetworkIcon />
                <h3>Gateway</h3>
              </div>
              {gatewayStatus ? (
                <div className={`gateway-card status-${gatewayStatus.online ? "online" : gatewayStatus.error ? "error" : "offline"}`}>
                  <div className="gateway-card-header">
                    <div className="gateway-card-info">
                      <p>{gatewayStatus.name || "Gateway"}</p>
                      <p>Device ID: {gatewayStatus.id?.substring(0, 12)}...</p>
                    </div>
                    <Badge variant={gatewayStatus.online ? "success" : "default"}>
                      {gatewayStatus.online ? "online" : "offline"}
                    </Badge>
                  </div>
                  <div className="device-details">
                    {gatewayStatus.productName && (
                      <div className="device-detail-row">
                        <span className="device-detail-label">Product:</span>
                        <span className="device-detail-value">{gatewayStatus.productName}</span>
                      </div>
                    )}
                    {gatewayStatus.category && (
                      <div className="device-detail-row">
                        <span className="device-detail-label">Category:</span>
                        <span className="device-detail-value">{gatewayStatus.category}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="gateway-not-configured">Gateway not configured</p>
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
                setConfig({ ...config, maxAccessAttempts: parseInt(e.target.value) })
              }
            />
            <Input
              label="Session Timeout (minutes)"
              type="number"
              value={config.sessionTimeout}
              onChange={(e) =>
                setConfig({ ...config, sessionTimeout: parseInt(e.target.value) })
              }
            />
          </div>

          <div className="security-toggles">
            <div className="security-toggle-item">
              <div className="security-toggle-content">
                <LockIcon />
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
                    setConfig({ ...config, autoLockEnabled: e.target.checked })
                  }
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="security-toggle-item">
              <div className="security-toggle-content">
                <BellIcon />
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
                    setConfig({ ...config, notificationsEnabled: e.target.checked })
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
