import React, { useState, useEffect } from "react";
import {
  KeyIcon,
  UserPlusIcon,
} from "lucide-react";
import { Card } from "../../components/common/Card";
import { Button } from "../../components/common/Button";
import { Input } from "../../components/common/Input";
import { Badge } from "../../components/common/Badge";
import {
  usersService,
  accessService,
  type BackendUser,
} from "../../services";
import { useAlert } from "../../contexts/AlertContext";

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
        // Filter out admins
        setUsers(response.data.filter((u) => u.role !== "admin"));
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

    // Validate PIN (should be 6-7 digits)
    if (!/^\d{6,7}$/.test(pin)) {
      showAlert("PIN must be 6-7 digits", "warning");
      return;
    }

    // Validate dates
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
        showAlert(`Successfully created temporary password for ${user.name}`, "success");
        // Reset form
        setPin("");
        setPasswordName("");
        setValidFrom("");
        setValidUntil("");
        setMaxUsage("1");
        fetchUsers();
      } else {
        showAlert(response.error || "Failed to create temporary password", "error");
      }
    } catch (error) {
      console.error("Failed to create temporary password:", error);
      const errorMessage =
        (error as { response?: { data?: { error?: string } } })?.response
          ?.data?.error ||
        (error as { message?: string })?.message ||
        "Failed to create temporary password. Please try again.";
      showAlert(errorMessage, "error");
    } finally {
      setIsEnrolling(false);
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
    <div className="max-w-4xl mx-auto space-y-6">
      <Card title="User PIN Enrollment">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select User
            </label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
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
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-3">
                Current PIN Status
              </h3>
              <div className="flex items-center space-x-2">
                <KeyIcon className="w-5 h-5 text-gray-600" />
                <div>
                  <p className="text-sm text-gray-600">PIN</p>
                  <Badge variant={user.pin ? "success" : "default"}>
                    {user.pin ? "****" : "Not set"}
                  </Badge>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {user && (
        <Card title="Create Temporary PIN Password">
          <div className="space-y-4">
            <Input
              label="Password Name"
              type="text"
              value={passwordName}
              onChange={(e) => setPasswordName(e.target.value)}
              placeholder="e.g., Temporary Access for John"
              required
            />

            <Input
              label="PIN (6-7 digits)"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter 6-7 digit PIN"
              required
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Valid From"
                type="datetime-local"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                required
              />

              <Input
                label="Valid Until"
                type="datetime-local"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                required
              />
            </div>

            <Input
              label="Max Usage (optional)"
              type="number"
              value={maxUsage}
              onChange={(e) => setMaxUsage(e.target.value)}
              placeholder="1"
              min="1"
            />

            <div className="flex justify-end space-x-3">
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
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  <>
                    <UserPlusIcon className="w-4 h-4 mr-2" />
                    Create Temporary Password
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
