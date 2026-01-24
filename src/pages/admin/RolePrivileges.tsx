import { useState, useEffect } from "react";
import { Card } from "../../components/common/Card";
import { Button } from "../../components/common/Button";
import { Badge } from "../../components/common/Badge";
import {
  rolePrivilegesService,
  type RolePrivilege,
  type AvailablePermissions,
} from "../../services/rolePrivileges.service";
import {
  ShieldIcon,
  UsersIcon,
  CalendarIcon,
  LockIcon,
  EyeIcon,
  SettingsIcon,
  WrenchIcon,
  CheckIcon,
  XIcon,
} from "lucide-react";
import { useAlert } from "../../contexts/AlertContext";

type RoleType = "teacher" | "techsupport";

interface PermissionCategory {
  name: string;
  icon: React.ReactNode;
  permissions: string[];
}

export function RolePrivileges() {
  const { showAlert } = useAlert();
  const [availablePermissions, setAvailablePermissions] =
    useState<AvailablePermissions | null>(null);
  const [rolePrivileges, setRolePrivileges] = useState<RolePrivilege[]>([]);
  const [selectedRole, setSelectedRole] = useState<RoleType>("teacher");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    // Update selected permissions when role changes
    const roleData = rolePrivileges.find((r) => r.role === selectedRole);
    if (roleData) {
      setSelectedPermissions(new Set(roleData.permissions));
    }
  }, [selectedRole, rolePrivileges]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [permissionsRes, privilegesRes] = await Promise.all([
        rolePrivilegesService.getAvailablePermissions(),
        rolePrivilegesService.getAllRolePrivileges(),
      ]);

      if (permissionsRes.success && permissionsRes.data) {
        setAvailablePermissions(permissionsRes.data);
      }

      if (privilegesRes.success && privilegesRes.data) {
        setRolePrivileges(privilegesRes.data);
        // Set initial selected permissions
        const teacherData = privilegesRes.data.find(
          (r) => r.role === "teacher"
        );
        if (teacherData) {
          setSelectedPermissions(new Set(teacherData.permissions));
        }
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
      showAlert(
        `Failed to load role privileges: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePermissionToggle = (permission: string) => {
    setSelectedPermissions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(permission)) {
        newSet.delete(permission);
      } else {
        newSet.add(permission);
      }
      return newSet;
    });
  };

  const handleSave = async () => {
    if (!confirm(`Save changes for ${selectedRole} role?`)) {
      return;
    }

    setSaving(true);
    try {
      const permissionsArray = Array.from(selectedPermissions);
      const response = await rolePrivilegesService.updateRolePrivileges(
        selectedRole,
        { permissions: permissionsArray }
      );

      if (response.success) {
        // Update local state
        setRolePrivileges((prev) =>
          prev.map((r) =>
            r.role === selectedRole
              ? { ...r, permissions: permissionsArray }
              : r
          )
        );
        showAlert("Role privileges updated successfully!", "success");
      } else {
        showAlert(
          response.error || "Failed to update role privileges",
          "error"
        );
      }
    } catch (error) {
      console.error("Failed to update role privileges:", error);
      showAlert(
        `Failed to update role privileges: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const roleData = rolePrivileges.find((r) => r.role === selectedRole);
    if (roleData) {
      setSelectedPermissions(new Set(roleData.permissions));
    }
  };

  const getPermissionCategory = (permission: string): string => {
    if (!availablePermissions) return "other";
    if (availablePermissions.userManagement.includes(permission))
      return "userManagement";
    if (availablePermissions.scheduleManagement.includes(permission))
      return "scheduleManagement";
    if (availablePermissions.accessControl.includes(permission))
      return "accessControl";
    if (availablePermissions.monitoring.includes(permission))
      return "monitoring";
    if (availablePermissions.systemConfiguration.includes(permission))
      return "systemConfiguration";
    if (availablePermissions.deviceManagement.includes(permission))
      return "deviceManagement";
    return "other";
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "userManagement":
        return <UsersIcon className="w-5 h-5" />;
      case "scheduleManagement":
        return <CalendarIcon className="w-5 h-5" />;
      case "accessControl":
        return <LockIcon className="w-5 h-5" />;
      case "monitoring":
        return <EyeIcon className="w-5 h-5" />;
      case "systemConfiguration":
        return <SettingsIcon className="w-5 h-5" />;
      case "deviceManagement":
        return <WrenchIcon className="w-5 h-5" />;
      default:
        return <ShieldIcon className="w-5 h-5" />;
    }
  };

  const getCategoryName = (category: string): string => {
    const names: Record<string, string> = {
      userManagement: "User Management",
      scheduleManagement: "Schedule Management",
      accessControl: "Access Control",
      monitoring: "Monitoring & Logs",
      systemConfiguration: "System Configuration",
      deviceManagement: "Device Management",
      other: "Other",
    };
    return names[category] || category;
  };

  const getPermissionLabel = (permission: string): string => {
    const labels: Record<string, string> = {
      create_admin: "Create Admin",
      create_user: "Create User",
      edit_user: "Edit User",
      delete_user: "Delete User",
      deactivate_user: "Deactivate User",
      enroll_user: "Enroll User",
      create_schedule: "Create Schedule",
      edit_schedule: "Edit Schedule",
      delete_schedule: "Delete Schedule",
      request_schedule_move: "Request Schedule Move",
      approve_schedule_move: "Approve Schedule Move",
      view_all_schedules: "View All Schedules",
      view_own_schedules: "View Own Schedules",
      unlock_lab: "Unlock Lab",
      lock_lab: "Lock Lab",
      emergency_override: "Emergency Override",
      view_all_logs: "View All Logs",
      view_own_logs: "View Own Logs",
      generate_reports: "Generate Reports",
      modify_system_config: "Modify System Config",
      modify_security_policies: "Modify Security Policies",
      modify_blockchain_settings: "Modify Blockchain Settings",
      view_devices: "View Devices",
      manage_devices: "Manage Devices",
      troubleshoot: "Troubleshoot",
    };
    return labels[permission] || permission.replace(/_/g, " ");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!availablePermissions) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Failed to load available permissions</p>
        <Button onClick={fetchData} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  // Group permissions by category
  const allPermissions = [
    ...availablePermissions.userManagement,
    ...availablePermissions.scheduleManagement,
    ...availablePermissions.accessControl,
    ...availablePermissions.monitoring,
    ...availablePermissions.systemConfiguration,
    ...availablePermissions.deviceManagement,
  ];

  const permissionsByCategory = allPermissions.reduce((acc, permission) => {
    const category = getPermissionCategory(permission);
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(permission);
    return acc;
  }, {} as Record<string, string[]>);

  const hasChanges = () => {
    const roleData = rolePrivileges.find((r) => r.role === selectedRole);
    if (!roleData) return false;
    const currentPerms = new Set(roleData.permissions);
    const selectedPerms = selectedPermissions;
    if (currentPerms.size !== selectedPerms.size) return true;
    for (const perm of currentPerms) {
      if (!selectedPerms.has(perm)) return true;
    }
    for (const perm of selectedPerms) {
      if (!currentPerms.has(perm)) return true;
    }
    return false;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Role Privileges Management
          </h1>
          <p className="text-gray-600 mt-1">
            Manage access privileges for Teacher and TechSupport roles
          </p>
        </div>
      </div>

      {/* Role Selection */}
      <Card title="Select Role">
        <div className="flex space-x-4">
          <button
            onClick={() => setSelectedRole("teacher")}
            className={`flex-1 p-4 rounded-lg border-2 transition-all ${
              selectedRole === "teacher"
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              <UsersIcon
                className={`w-5 h-5 ${
                  selectedRole === "teacher" ? "text-blue-600" : "text-gray-400"
                }`}
              />
              <span
                className={`font-semibold ${
                  selectedRole === "teacher" ? "text-blue-900" : "text-gray-700"
                }`}
              >
                Teacher
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-2">
              {rolePrivileges.find((r) => r.role === "teacher")?.permissions
                .length || 0}{" "}
              permissions
            </p>
          </button>

          <button
            onClick={() => setSelectedRole("techsupport")}
            className={`flex-1 p-4 rounded-lg border-2 transition-all ${
              selectedRole === "techsupport"
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              <WrenchIcon
                className={`w-5 h-5 ${
                  selectedRole === "techsupport"
                    ? "text-blue-600"
                    : "text-gray-400"
                }`}
              />
              <span
                className={`font-semibold ${
                  selectedRole === "techsupport"
                    ? "text-blue-900"
                    : "text-gray-700"
                }`}
              >
                Tech Support
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-2">
              {rolePrivileges.find((r) => r.role === "techsupport")?.permissions
                .length || 0}{" "}
              permissions
            </p>
          </button>
        </div>
      </Card>

      {/* Permissions by Category */}
      <Card
        title={`${
          selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1)
        } Permissions`}
        action={
          <div className="flex space-x-2">
            {hasChanges() && (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleReset}
                disabled={saving}
              >
                Reset
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !hasChanges()}
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          {Object.entries(permissionsByCategory).map(
            ([category, permissions]) => (
              <div
                key={category}
                className="border-b border-gray-200 pb-6 last:border-0"
              >
                <div className="flex items-center space-x-2 mb-4">
                  {getCategoryIcon(category)}
                  <h3 className="text-lg font-semibold text-gray-900">
                    {getCategoryName(category)}
                  </h3>
                  <Badge variant="secondary">
                    {
                      permissions.filter((p) => selectedPermissions.has(p))
                        .length
                    }{" "}
                    / {permissions.length}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {permissions.map((permission) => {
                    const isSelected = selectedPermissions.has(permission);
                    return (
                      <label
                        key={permission}
                        className={`flex items-center space-x-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          isSelected
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handlePermissionToggle(permission)}
                          className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span
                          className={`flex-1 text-sm ${
                            isSelected
                              ? "text-blue-900 font-medium"
                              : "text-gray-700"
                          }`}
                        >
                          {getPermissionLabel(permission)}
                        </span>
                        {isSelected && (
                          <CheckIcon className="w-5 h-5 text-blue-600" />
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            )
          )}
        </div>
      </Card>

      {/* Summary */}
      <Card title="Summary">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Total Permissions</p>
            <p className="text-2xl font-bold text-gray-900">
              {selectedPermissions.size}
            </p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Available Permissions</p>
            <p className="text-2xl font-bold text-gray-900">
              {allPermissions.length}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
