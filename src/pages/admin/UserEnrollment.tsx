import React, { useState, useEffect } from "react";
import { KeyIcon, UserPlusIcon, InfoIcon } from "lucide-react";
import { Button } from "../../components/common/Button";
import { Input } from "../../components/common/Input";
import { Badge } from "../../components/common/Badge";
import {
  usersService,
  accessService,
  type BackendUser,
} from "../../services";
import { useAlert } from "../../contexts/AlertContext";
import "../../styles/UserEnrollment.css";

export function UserEnrollment() {
  const { showAlert } = useAlert();
  const [users, setUsers] = useState<BackendUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState("");
  const [pin, setPin] = useState("");
  const [passwordName, setPasswordName] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [maxUsage, setMaxUsage] = useState("1");
  const [isEnrolling, setIsEnrolling] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await usersService.getAll();
      if (response.success && response.data) {
        setUsers(response.data);
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setLoading(false);
    }
  };

  const user = users.find((u) => u.id === selectedUser);

  const handleEnroll = async () => {
    if (!user || !pin || !passwordName || !validFrom || !validUntil) {
      showAlert("Please fill in all required fields", "warning");
      return;
    }

    if (!/^\d{6,7}$/.test(pin)) {
      showAlert("PIN must be 6-7 digits", "warning");
      return;
    }

    const fromDate = new Date(validFrom);
    const untilDate = new Date(validUntil);
    if (untilDate <= fromDate) {
      showAlert("Valid until date must be after valid from date", "warning");
      return;
    }

    setIsEnrolling(true);
    try {
      const response = await accessService.createTempPassword({
        name: passwordName,
        password: pin,
        validFrom: validFrom,
        validUntil: validUntil,
        maxUsage: parseInt(maxUsage) || 1,
        targetUserId: parseInt(user.id),
      });

      if (response.success) {
        showAlert(
          `Successfully created temporary password for ${user.name}`,
          "success"
        );
        setPin("");
        setPasswordName("");
        setValidFrom("");
        setValidUntil("");
        setMaxUsage("1");
        fetchUsers();
      } else {
        showAlert(
          response.error || "Failed to create temporary password",
          "error"
        );
      }
    } catch (error) {
      console.error("Failed to create temporary password:", error);
      const errorMessage =
        (error as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ||
        (error as { message?: string })?.message ||
        "Failed to create temporary password. Please try again.";
      showAlert(errorMessage, "error");
    } finally {
      setIsEnrolling(false);
    }
  };

  if (loading) {
    return (
      <div className="enrollment-loading-container">
        <div className="enrollment-spinner"></div>
      </div>
    );
  }

  return (
    <div className="user-enrollment-container">
      <div className="dashboard-card">
        <div className="card-header">
          <h3 className="card-title">User PIN Enrollment</h3>
        </div>
        <div className="enrollment-form-group">
          <div>
            <label className="enrollment-form-label">
              Select User <span className="enrollment-required">*</span>
            </label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="enrollment-form-select"
            >
              <option value="">Choose a user...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role}) - {u.email}
                </option>
              ))}
            </select>
          </div>

          {user && (
            <div className="enrollment-user-status-card">
              <h3 className="enrollment-user-status-title">
                Current PIN Status
              </h3>
              <div className="enrollment-status-info">
                <KeyIcon className="enrollment-status-icon" />
                <div>
                  <p className="enrollment-status-text">PIN</p>
                  <Badge variant={user.pin ? "success" : "default"}>
                    {user.pin ? "****" : "Not set"}
                  </Badge>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {user && (
        <div className="dashboard-card">
          <div className="card-header">
            <h3 className="card-title">Create Temporary PIN Password</h3>
          </div>

          <div className="enrollment-info-box">
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <InfoIcon className="enrollment-info-icon" />
              <p className="enrollment-info-text">
                Create a temporary PIN password for <strong>{user.name}</strong>
                . This will allow them to access laboratories during the
                specified time period. The PIN must be 6-7 digits and can be
                used up to the maximum usage limit.
              </p>
            </div>
          </div>

          <div className="enrollment-form-group">
            <Input
              label={
                <>
                  Password Name{" "}
                  <span className="enrollment-required">*</span>
                </>
              }
              type="text"
              value={passwordName}
              onChange={(e) => setPasswordName(e.target.value)}
              placeholder="e.g., Temporary Access for John"
              required
            />

            <Input
              label={
                <>
                  PIN (6-7 digits){" "}
                  <span className="enrollment-required">*</span>
                </>
              }
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter 6-7 digit PIN"
              required
            />

            <div className="enrollment-grid-2-cols">
              <Input
                label={
                  <>
                    Valid From <span className="enrollment-required">*</span>
                  </>
                }
                type="datetime-local"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                required
              />

              <Input
                label={
                  <>
                    Valid Until <span className="enrollment-required">*</span>
                  </>
                }
                type="datetime-local"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                required
              />
            </div>

            <Input
              label="Max Usage"
              type="number"
              value={maxUsage}
              onChange={(e) => setMaxUsage(e.target.value)}
              placeholder="1"
              min="1"
            />

            <div className="enrollment-button-group">
              <Button
                variant="secondary"
                onClick={() => {
                  setPin("");
                  setPasswordName("");
                  setValidFrom("");
                  setValidUntil("");
                  setMaxUsage("1");
                }}
              >
                Clear
              </Button>
              <Button
                variant="success"
                onClick={handleEnroll}
                disabled={
                  !pin ||
                  !passwordName ||
                  !validFrom ||
                  !validUntil ||
                  isEnrolling
                }
              >
                {isEnrolling ? (
                  <>
                    <span className="enrollment-btn-spinner" />
                    Creating...
                  </>
                ) : (
                  <>
                    <UserPlusIcon className="enrollment-btn-icon" />
                    Create Temporary Password
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}