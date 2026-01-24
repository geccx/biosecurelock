import { useState, useEffect } from "react";
import { Button } from "../../components/common/Button";
import { Badge } from "../../components/common/Badge";
import { Card } from "../../components/common/Card";
import { UserDetailModal } from "../../components/admin/UserDetailModal";
import { EditUserModal } from "../../components/admin/EditUserModal";
import { ViewLocalUserModal } from "../../components/admin/ViewLocalUserModal";
import { EditLocalUserModal } from "../../components/admin/EditLocalUserModal";
import { CreateUserModal } from "../../components/admin/CreateUserModal";
import { usersService, type TuyaUser, type BackendUser } from "../../services";
import {
  EyeIcon,
  EditIcon,
  UserPlusIcon,
  Power,
  Key,
  TrashIcon,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useAlert } from "../../contexts/AlertContext";

type TabType = "tuya" | "local";

export function UserManagement() {
  const { showAlert } = useAlert();
  const [activeTab, setActiveTab] = useState<TabType>("local");
  const [tuyaUsers, setTuyaUsers] = useState<TuyaUser[]>([]);
  const [localUsers, setLocalUsers] = useState<BackendUser[]>([]);
  const [loadingTuya, setLoadingTuya] = useState(true);
  const [loadingLocal, setLoadingLocal] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<TuyaUser | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<TuyaUser | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedLocalUserId, setSelectedLocalUserId] = useState<string | null>(null);
  const [isLocalUserModalOpen, setIsLocalUserModalOpen] = useState(false);
  const [editingLocalUser, setEditingLocalUser] = useState<BackendUser | null>(null);
  const [isEditLocalUserModalOpen, setIsEditLocalUserModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  const [resettingPasswordUserId, setResettingPasswordUserId] = useState<
    string | null
  >(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [roleSortDirection, setRoleSortDirection] = useState<"asc" | "desc" | null>(null);
  const [userTypeFilter, setUserTypeFilter] = useState<string>("all");
  const [userTypeSortDirection, setUserTypeSortDirection] = useState<"asc" | "desc" | null>(null);

  useEffect(() => {
    if (activeTab === "tuya") {
      fetchTuyaUsers();
    } else {
      fetchLocalUsers();
    }
  }, [activeTab]);

  const fetchTuyaUsers = async () => {
    setLoadingTuya(true);
    try {
      const response = await usersService.getTuyaUsers();
      if (response && response.success && response.data) {
        const usersData = Array.isArray(response.data) ? response.data : [];
        setTuyaUsers(usersData);
      } else {
        setTuyaUsers([]);
      }
    } catch (error) {
      console.error("❌ Failed to fetch Tuya users:", error);
      showAlert(
        `Failed to fetch Tuya users: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "error"
      );
      setTuyaUsers([]);
    } finally {
      setLoadingTuya(false);
    }
  };

  const fetchLocalUsers = async () => {
    setLoadingLocal(true);
    try {
      const response = await usersService.getAll();
      if (response && response.success && response.data) {
        const usersData = Array.isArray(response.data) ? response.data : [];
        setLocalUsers(usersData);
      } else {
        setLocalUsers([]);
      }
    } catch (error) {
      console.error("❌ Failed to fetch local users:", error);
      showAlert(
        `Failed to fetch local users: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "error"
      );
      setLocalUsers([]);
    } finally {
      setLoadingLocal(false);
    }
  };

  const handleToggleStatus = async (userId: string) => {
    if (!confirm("Are you sure you want to toggle this user's status?")) {
      return;
    }

    setTogglingUserId(userId);
    try {
      const response = await usersService.toggleStatus(parseInt(userId));
      if (response && response.success) {
        // Refresh the local users list
        await fetchLocalUsers();
        showAlert(
          `User status changed to ${
            response.data?.status || "updated"
          } successfully`,
          "success"
        );
      } else {
        showAlert(response.error || "Failed to toggle user status", "error");
      }
    } catch (error) {
      console.error("❌ Failed to toggle user status:", error);
      showAlert(
        `Failed to toggle user status: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "error"
      );
    } finally {
      setTogglingUserId(null);
    }
  };

  const handleResetPassword = async (userId: string, userEmail: string) => {
    if (
      !confirm(
        `Are you sure you want to reset the password for ${userEmail}? The temporary password will be set to "1234567".`
      )
    ) {
      return;
    }

    setResettingPasswordUserId(userId);
    try {
      const response = await usersService.resetPassword(parseInt(userId));
      if (response && response.success) {
        showAlert(
          `Password reset successfully!\n\nTemporary password: ${
            response.data?.temporaryPassword || "1234567"
          }\n\nPlease inform the user to change their password after logging in.`,
          "success"
        );
      } else {
        showAlert(response.error || "Failed to reset password", "error");
      }
    } catch (error) {
      console.error("❌ Failed to reset password:", error);
      const errorMessage =
        (
          error as {
            response?: { data?: { error?: string } };
            message?: string;
          }
        )?.response?.data?.error ||
        (error as { message?: string })?.message ||
        "Unknown error occurred";
      showAlert(`Failed to reset password: ${errorMessage}`, "error");
    } finally {
      setResettingPasswordUserId(null);
    }
  };

  const handleDeleteUser = async (
    userId: string,
    userName: string,
    userEmail: string
  ) => {
    if (
      !confirm(
        `Are you sure you want to delete user ${userName} (${userEmail})? This will permanently delete the user account from the database and Tuya Cloud. This action cannot be undone.`
      )
    ) {
      return;
    }

    setDeletingUserId(userId);
    try {
      const response = await usersService.delete(parseInt(userId));
      if (response && response.success) {
        // Refresh the local users list
        await fetchLocalUsers();
        showAlert(response.message || "User deleted successfully", "success");
      } else {
        showAlert(response.error || "Failed to delete user", "error");
      }
    } catch (error) {
      console.error("❌ Failed to delete user:", error);
      const errorMessage =
        (
          error as {
            response?: { data?: { error?: string } };
            message?: string;
          }
        )?.response?.data?.error ||
        (error as { message?: string })?.message ||
        "Unknown error occurred";
      showAlert(`Failed to delete user: ${errorMessage}`, "error");
    } finally {
      setDeletingUserId(null);
    }
  };

  // Helper functions
  const getDisplayName = (user: TuyaUser) => {
    return user.nick_name || user.user_contact || "Unknown";
  };

  const getContactInfo = (user: TuyaUser) => {
    return user.user_contact || "No contact";
  };

  const getUserTypeLabel = (user: TuyaUser) => {
    if (user.user_type === 10) return "Admin";
    if (user.user_type === 50) return "Owner";
    if (user.user_type === 20) return "Member";
    return "Unknown";
  };

  const getUserTypeVariant = (user: TuyaUser) => {
    if (user.user_type === 10) return "info";
    if (user.user_type === 50) return "success";
    return "warning";
  };

  const getUserStatus = (user: TuyaUser) => {
    return user.effective_flag === 1 ? "Active" : "Inactive";
  };

  const getStatusVariant = (user: TuyaUser) => {
    return user.effective_flag === 1 ? "success" : "danger";
  };

  const handleViewUser = (user: TuyaUser) => {
    // Use user_id from the fetched user list (primary identifier from Tuya API)
    const userId = user.user_id;
    if (!userId) {
      showAlert("User ID is missing. Cannot view user details.", "warning");
      return;
    }
    setSelectedUserId(userId);
    setSelectedUser(user); // Pass the user object to preserve effective_flag
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedUserId(null);
    setSelectedUser(null);
  };

  const handleEditUser = (user: TuyaUser) => {
    setEditingUser(user);
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setEditingUser(null);
  };

  const handleEditSuccess = () => {
    // Refresh the user list after successful edit
    fetchTuyaUsers();
  };

  const handleViewLocalUser = (user: BackendUser) => {
    setSelectedLocalUserId(user.id);
    setIsLocalUserModalOpen(true);
  };

  const handleCloseLocalUserModal = () => {
    setIsLocalUserModalOpen(false);
    setSelectedLocalUserId(null);
  };

  const handleEditLocalUser = (user: BackendUser) => {
    setEditingLocalUser(user);
    setIsEditLocalUserModalOpen(true);
  };

  const handleCloseEditLocalUserModal = () => {
    setIsEditLocalUserModalOpen(false);
    setEditingLocalUser(null);
  };

  const handleEditLocalUserSuccess = () => {
    // Refresh the local users list after successful edit
    fetchLocalUsers();
  };

  // Get unique roles from users for filter dropdown
  const availableRoles = Array.from(
    new Set(localUsers.map((user) => user.role))
  ).sort();

  // Filter and sort users
  const getFilteredAndSortedUsers = () => {
    let filtered = [...localUsers];

    // Apply role filter
    if (roleFilter !== "all") {
      filtered = filtered.filter((user) => user.role === roleFilter);
    }

    // Apply role sorting
    if (roleSortDirection) {
      filtered.sort((a, b) => {
        const roleA = a.role.toLowerCase();
        const roleB = b.role.toLowerCase();
        if (roleSortDirection === "asc") {
          return roleA.localeCompare(roleB);
        } else {
          return roleB.localeCompare(roleA);
        }
      });
    }

    return filtered;
  };

  const handleRoleSort = () => {
    if (roleSortDirection === null) {
      setRoleSortDirection("asc");
    } else if (roleSortDirection === "asc") {
      setRoleSortDirection("desc");
    } else {
      setRoleSortDirection(null);
    }
  };

  const filteredAndSortedUsers = getFilteredAndSortedUsers();

  // Get unique user types from Tuya users for filter dropdown
  const availableUserTypes = Array.from(
    new Set(tuyaUsers.map((user) => user.user_type))
  ).sort((a, b) => a - b);

  // Filter and sort Tuya users
  const getFilteredAndSortedTuyaUsers = () => {
    let filtered = [...tuyaUsers];

    // Apply user type filter
    if (userTypeFilter !== "all") {
      const filterType = parseInt(userTypeFilter);
      filtered = filtered.filter((user) => user.user_type === filterType);
    }

    // Apply user type sorting
    if (userTypeSortDirection) {
      filtered.sort((a, b) => {
        if (userTypeSortDirection === "asc") {
          return a.user_type - b.user_type;
        } else {
          return b.user_type - a.user_type;
        }
      });
    }

    return filtered;
  };

  const handleUserTypeSort = () => {
    if (userTypeSortDirection === null) {
      setUserTypeSortDirection("asc");
    } else if (userTypeSortDirection === "asc") {
      setUserTypeSortDirection("desc");
    } else {
      setUserTypeSortDirection(null);
    }
  };

  const getUserTypeLabelFromValue = (userType: number) => {
    if (userType === 10) return "Admin";
    if (userType === 50) return "Owner";
    if (userType === 20) return "Member";
    return "Unknown";
  };

  const filteredAndSortedTuyaUsers = getFilteredAndSortedTuyaUsers();

  const handleCreateSuccess = () => {
    // Refresh the user list after successful creation
    if (activeTab === "tuya") {
      fetchTuyaUsers();
    } else {
      fetchLocalUsers();
    }
  };

  const handleDeleteTuyaUser = async (tuyaUser: TuyaUser) => {
    const userName = getDisplayName(tuyaUser);
    const userContact = getContactInfo(tuyaUser);

    if (
      !confirm(
        `Are you sure you want to delete user ${userName} (${userContact})? This will permanently delete the user from Tuya Cloud${
          tuyaUser.localUserId ? " and the database" : ""
        }. This action cannot be undone.`
      )
    ) {
      return;
    }

    setDeletingUserId(tuyaUser.user_id);
    try {
      // Delete from Tuya Cloud
      const tuyaResponse = await usersService.deleteTuyaDeviceUser(
        tuyaUser.user_id
      );

      if (tuyaResponse && tuyaResponse.success) {
        // If user has a linked local user, delete from database as well
        if (tuyaUser.localUserId) {
          try {
            await usersService.delete(parseInt(tuyaUser.localUserId));
          } catch (dbError) {
            console.error("Failed to delete local user:", dbError);
            showAlert(
              "User deleted from Tuya Cloud, but failed to delete from database. Please delete manually.",
              "warning"
            );
          }
        }

        // Refresh the user list
        await fetchTuyaUsers();
        showAlert(
          tuyaResponse.message || "User deleted successfully",
          "success"
        );
      } else {
        showAlert(tuyaResponse.error || "Failed to delete user", "error");
      }
    } catch (error) {
      console.error("❌ Failed to delete Tuya user:", error);
      const errorMessage =
        (
          error as {
            response?: { data?: { error?: string } };
            message?: string;
          }
        )?.response?.data?.error ||
        (error as { message?: string })?.message ||
        "Unknown error occurred";
      showAlert(`Failed to delete user: ${errorMessage}`, "error");
    } finally {
      setDeletingUserId(null);
    }
  };

  const isLoading = activeTab === "tuya" ? loadingTuya : loadingLocal;

  if (
    isLoading &&
    (activeTab === "tuya" ? tuyaUsers.length === 0 : localUsers.length === 0)
  ) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card
        title="User Management"
        action={
          <div className="flex gap-2">
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              size="sm"
              className="flex items-center gap-2"
            >
              <UserPlusIcon className="w-4 h-4" />
              Create User
            </Button>
            <Button
              onClick={activeTab === "tuya" ? fetchTuyaUsers : fetchLocalUsers}
              disabled={isLoading}
              size="sm"
            >
              {isLoading ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        }
      >
        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab("local")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "local"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Local Users
            </button>
            <button
              onClick={() => setActiveTab("tuya")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "tuya"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Tuya Device Users
            </button>
          </nav>
        </div>

        {/* Local Users Tab */}
        {activeTab === "local" && (
          <div>
            {localUsers.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No local users found</p>
                <p className="text-sm text-gray-400 mt-2">
                  Create a new user to get started
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm text-gray-600">
                    Showing <strong>{filteredAndSortedUsers.length}</strong> of{" "}
                    <strong>{localUsers.length}</strong> user
                    {localUsers.length !== 1 ? "s" : ""}
                  </p>
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-medium text-gray-700">
                      Filter by Role:
                    </label>
                    <select
                      value={roleFilter}
                      onChange={(e) => setRoleFilter(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      <option value="all">All Roles</option>
                      {availableRoles.map((role) => (
                        <option key={role} value={role}>
                          {role.charAt(0).toUpperCase() + role.slice(1)}
                        </option>
                      ))}
                    </select>
                    {roleFilter !== "all" && (
                      <Button
                        onClick={() => setRoleFilter("all")}
                        size="sm"
                        variant="ghost"
                        className="text-xs"
                      >
                        Clear Filter
                      </Button>
                    )}
                  </div>
                </div>
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <button
                          onClick={handleRoleSort}
                          className="flex items-center gap-1 hover:text-gray-700 transition-colors"
                        >
                          Role
                          {roleSortDirection === null ? (
                            <ArrowUpDown className="w-4 h-4" />
                          ) : roleSortDirection === "asc" ? (
                            <ArrowUp className="w-4 h-4" />
                          ) : (
                            <ArrowDown className="w-4 h-4" />
                          )}
                        </button>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Department
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredAndSortedUsers.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-6 py-8 text-center text-gray-500"
                        >
                          No users found matching the selected filter.
                        </td>
                      </tr>
                    ) : (
                      filteredAndSortedUsers.map((user) => (
                        <tr key={user.id}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {user.name}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-500">
                              {user.email}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Badge variant="info">{user.role}</Badge>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Badge
                              variant={
                                user.status === "active" ? "success" : "danger"
                              }
                            >
                              {user.status || "active"}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {user.department || "N/A"}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(user.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <div className="flex items-center gap-2">
                            <Button
                              onClick={() => handleViewLocalUser(user)}
                              size="sm"
                              variant="ghost"
                              disabled={
                                togglingUserId === user.id ||
                                resettingPasswordUserId === user.id ||
                                deletingUserId === user.id
                              }
                              className="flex items-center gap-2"
                            >
                              <EyeIcon className="w-4 h-4" />
                              View
                            </Button>
                            <Button
                              onClick={() => handleEditLocalUser(user)}
                              size="sm"
                              variant="ghost"
                              disabled={
                                togglingUserId === user.id ||
                                resettingPasswordUserId === user.id ||
                                deletingUserId === user.id
                              }
                              className="flex items-center gap-2"
                            >
                              <EditIcon className="w-4 h-4" />
                              Edit
                            </Button>
                            <Button
                              onClick={() => handleToggleStatus(user.id)}
                              size="sm"
                              variant="ghost"
                              disabled={
                                togglingUserId === user.id ||
                                resettingPasswordUserId === user.id
                              }
                              className="flex items-center gap-2"
                            >
                              <Power className="w-4 h-4" />
                              {togglingUserId === user.id
                                ? "Updating..."
                                : user.status === "active"
                                ? "Deactivate"
                                : "Activate"}
                            </Button>
                            <Button
                              onClick={() =>
                                handleResetPassword(user.id, user.email)
                              }
                              size="sm"
                              variant="ghost"
                              disabled={
                                togglingUserId === user.id ||
                                resettingPasswordUserId === user.id ||
                                deletingUserId === user.id
                              }
                              className="flex items-center gap-2"
                            >
                              <Key className="w-4 h-4" />
                              {resettingPasswordUserId === user.id
                                ? "Resetting..."
                                : "Reset Password"}
                            </Button>
                            <Button
                              onClick={() =>
                                handleDeleteUser(user.id, user.name, user.email)
                              }
                              size="sm"
                              variant="ghost"
                              disabled={
                                togglingUserId === user.id ||
                                resettingPasswordUserId === user.id ||
                                deletingUserId === user.id
                              }
                              className="flex items-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <TrashIcon className="w-4 h-4" />
                              {deletingUserId === user.id
                                ? "Deleting..."
                                : "Delete"}
                            </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tuya Users Tab */}
        {activeTab === "tuya" && (
          <div>
            {tuyaUsers.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No users found in Tuya device</p>
                <p className="text-sm text-gray-400 mt-2">
                  Users will appear here after they are registered in the Tuya
                  device
                </p>
                <div className="mt-4 p-4 bg-gray-100 rounded text-left text-xs max-w-4xl mx-auto">
                  <p className="font-bold mb-2">🔍 Debug Information:</p>
                  <div className="space-y-1">
                    <p>
                      <strong>Users array length:</strong> {tuyaUsers.length}
                    </p>
                    <p>
                      <strong>Users array type:</strong>{" "}
                      {Array.isArray(tuyaUsers) ? "Array" : typeof tuyaUsers}
                    </p>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    💡 Check the browser console for detailed API response logs
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm text-gray-600">
                    Showing <strong>{filteredAndSortedTuyaUsers.length}</strong> of{" "}
                    <strong>{tuyaUsers.length}</strong> user
                    {tuyaUsers.length !== 1 ? "s" : ""}
                  </p>
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-medium text-gray-700">
                      Filter by User Type:
                    </label>
                    <select
                      value={userTypeFilter}
                      onChange={(e) => setUserTypeFilter(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      <option value="all">All User Types</option>
                      {availableUserTypes.map((userType) => (
                        <option key={userType} value={userType.toString()}>
                          {getUserTypeLabelFromValue(userType)}
                        </option>
                      ))}
                    </select>
                    {userTypeFilter !== "all" && (
                      <Button
                        onClick={() => setUserTypeFilter("all")}
                        size="sm"
                        variant="ghost"
                        className="text-xs"
                      >
                        Clear Filter
                      </Button>
                    )}
                  </div>
                </div>
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        User ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name / Contact
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <button
                          onClick={handleUserTypeSort}
                          className="flex items-center gap-1 hover:text-gray-700 transition-colors"
                        >
                          User Type
                          {userTypeSortDirection === null ? (
                            <ArrowUpDown className="w-4 h-4" />
                          ) : userTypeSortDirection === "asc" ? (
                            <ArrowUp className="w-4 h-4" />
                          ) : (
                            <ArrowDown className="w-4 h-4" />
                          )}
                        </button>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Unlock Methods
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Linked Local User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Time Schedule
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredAndSortedTuyaUsers.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-6 py-8 text-center text-gray-500"
                        >
                          No users found matching the selected filter.
                        </td>
                      </tr>
                    ) : (
                      filteredAndSortedTuyaUsers.map((tuyaUser, index) => (
                      <tr
                        key={tuyaUser.user_id || tuyaUser.tuyaUserId || index}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-mono text-gray-600">
                            {(
                              tuyaUser.user_id ||
                              tuyaUser.tuyaUserId ||
                              "N/A"
                            ).substring(0, 12)}
                            ...
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {getDisplayName(tuyaUser)}
                            </div>
                            <div className="text-sm text-gray-500">
                              {getContactInfo(tuyaUser)}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge variant={getUserTypeVariant(tuyaUser)}>
                            {getUserTypeLabel(tuyaUser)}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900">
                            {tuyaUser.unlockMethods &&
                            tuyaUser.unlockMethods.length > 0 ? (
                              <div className="space-y-1">
                                {tuyaUser.unlockMethods.map((method, idx) => (
                                  <div key={idx} className="text-xs">
                                    <span className="font-medium">
                                      {method.type.replace("unlock_", "")}:
                                    </span>{" "}
                                    {method.unlockName}
                                  </div>
                                ))}
                              </div>
                            ) : tuyaUser.unlock_detail &&
                              tuyaUser.unlock_detail.length > 0 ? (
                              <div className="space-y-1">
                                {tuyaUser.unlock_detail.map((detail, idx) => (
                                  <div key={idx} className="text-xs">
                                    <span className="font-medium">
                                      {detail.dp_code.replace("unlock_", "")}
                                    </span>
                                    : {detail.count} method(s)
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-400">None</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge variant={getStatusVariant(tuyaUser)}>
                            {getUserStatus(tuyaUser)}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`text-sm font-medium ${
                            tuyaUser.localUserId 
                              ? "text-green-600" 
                              : "text-gray-400"
                          }`}>
                            {tuyaUser.localUserId ? "Available" : "Unavailable"}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {tuyaUser.time_schedule_info ? (
                            <div>
                              {tuyaUser.time_schedule_info.permanent ? (
                                <span className="text-green-600">
                                  Permanent
                                </span>
                              ) : (
                                <div>
                                  <div className="text-xs">
                                    {new Date(
                                      tuyaUser.time_schedule_info
                                        .effective_time * 1000
                                    ).toLocaleDateString()}
                                  </div>
                                  <div className="text-xs">
                                    to{" "}
                                    {new Date(
                                      tuyaUser.time_schedule_info.expired_time *
                                        1000
                                    ).toLocaleDateString()}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">N/A</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <div className="flex items-center gap-2">
                            <Button
                              onClick={() => handleViewUser(tuyaUser)}
                              size="sm"
                              variant="ghost"
                              disabled={deletingUserId === tuyaUser.user_id}
                              className="flex items-center gap-2"
                            >
                              <EyeIcon className="w-4 h-4" />
                              View
                            </Button>
                            <Button
                              onClick={() => handleEditUser(tuyaUser)}
                              size="sm"
                              variant="ghost"
                              disabled={deletingUserId === tuyaUser.user_id}
                              className="flex items-center gap-2"
                            >
                              <EditIcon className="w-4 h-4" />
                              Edit
                            </Button>
                            <Button
                              onClick={() => handleDeleteTuyaUser(tuyaUser)}
                              size="sm"
                              variant="ghost"
                              disabled={deletingUserId === tuyaUser.user_id}
                              className="flex items-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <TrashIcon className="w-4 h-4" />
                              {deletingUserId === tuyaUser.user_id
                                ? "Deleting..."
                                : "Delete"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* User Detail Modal */}
      <UserDetailModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        userId={selectedUserId}
        user={selectedUser}
      />

      {/* Edit User Modal */}
      <EditUserModal
        isOpen={isEditModalOpen}
        onClose={handleCloseEditModal}
        user={editingUser}
        onSuccess={handleEditSuccess}
      />

      {/* View Local User Modal */}
      <ViewLocalUserModal
        isOpen={isLocalUserModalOpen}
        onClose={handleCloseLocalUserModal}
        userId={selectedLocalUserId}
      />

      {/* Edit Local User Modal */}
      <EditLocalUserModal
        isOpen={isEditLocalUserModalOpen}
        onClose={handleCloseEditLocalUserModal}
        user={editingLocalUser}
        onSuccess={handleEditLocalUserSuccess}
      />

      {/* Create User Modal */}
      <CreateUserModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleCreateSuccess}
      />
    </div>
  );
}
