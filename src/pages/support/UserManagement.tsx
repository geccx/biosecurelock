import { useState, useEffect } from "react";
import { Button } from "../../components/common/Button";
import { Badge } from "../../components/common/Badge";
import { Card } from "../../components/common/Card";
import { usersService, type BackendUser } from "../../services";
import {
  Power,
  Key,
  TrashIcon,
  Eye,
  Edit,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useAlert } from "../../contexts/AlertContext";
import { ViewLocalUserModal } from "../../components/admin/ViewLocalUserModal";
import { EditLocalUserModal } from "../../components/admin/EditLocalUserModal";

export function UserManagement() {
  const { showAlert } = useAlert();
  const [users, setUsers] = useState<BackendUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  const [resettingPasswordUserId, setResettingPasswordUserId] = useState<
    string | null
  >(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<BackendUser | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [roleSortDirection, setRoleSortDirection] = useState<
    "asc" | "desc" | null
  >(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await usersService.getAll();
      if (response && response.success && response.data) {
        const usersData = Array.isArray(response.data) ? response.data : [];
        setUsers(usersData);
      } else {
        setUsers([]);
      }
    } catch (error) {
      console.error("❌ Failed to fetch users:", error);
      showAlert(
        `Failed to fetch users: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "error"
      );
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (userId: string, userRole: string) => {
    // Tech support cannot modify admin accounts
    if (userRole === "admin") {
      showAlert("Tech Support cannot modify admin accounts", "warning");
      return;
    }

    const action =
      users.find((u) => u.id === userId)?.status === "active"
        ? "deactivate"
        : "activate";

    if (!confirm(`Are you sure you want to ${action} this user?`)) {
      return;
    }

    setTogglingUserId(userId);
    try {
      const response = await usersService.toggleStatusTechSupport(
        parseInt(userId)
      );
      if (response && response.success) {
        // Refresh the users list
        await fetchUsers();
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
      const errorMessage =
        (
          error as {
            response?: { data?: { error?: string } };
            message?: string;
          }
        )?.response?.data?.error ||
        (error as { message?: string })?.message ||
        "Unknown error occurred";
      showAlert(`Failed to toggle user status: ${errorMessage}`, "error");
    } finally {
      setTogglingUserId(null);
    }
  };

  const handleResetPassword = async (
    userId: string,
    userRole: string,
    userEmail: string
  ) => {
    // Tech support cannot reset admin passwords
    if (userRole === "admin") {
      showAlert("Tech Support cannot modify admin accounts", "warning");
      return;
    }

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
    userEmail: string,
    userRole: string
  ) => {
    // Tech support cannot delete admin accounts
    if (userRole === "admin") {
      showAlert("Tech Support cannot delete admin accounts", "warning");
      return;
    }

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
        // Refresh the users list
        await fetchUsers();
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

  const handleViewUser = (user: BackendUser) => {
    // Tech support cannot view admin accounts
    if (user.role === "admin") {
      showAlert("Tech Support cannot view admin accounts", "warning");
      return;
    }
    setSelectedUserId(user.id);
    setIsViewModalOpen(true);
  };

  const handleCloseViewModal = () => {
    setIsViewModalOpen(false);
    setSelectedUserId(null);
  };

  const handleEditUser = (user: BackendUser) => {
    // Tech support cannot edit admin accounts
    if (user.role === "admin") {
      showAlert("Tech Support cannot edit admin accounts", "warning");
      return;
    }
    setEditingUser(user);
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setEditingUser(null);
  };

  const handleEditSuccess = () => {
    // Refresh the users list after successful edit
    fetchUsers();
  };

  // Get unique roles from users for filter dropdown
  const availableRoles = Array.from(
    new Set(users.map((user) => user.role))
  ).sort();

  // Filter and sort users
  const getFilteredAndSortedUsers = () => {
    let filtered = [...users];

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

  if (loading && users.length === 0) {
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
          <Button onClick={fetchUsers} disabled={loading} size="sm">
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        }
      >
        {users.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No users found</p>
            <p className="text-sm text-gray-400 mt-2">
              Users will appear here once they are created
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Showing <strong>{filteredAndSortedUsers.length}</strong> of{" "}
                <strong>{users.length}</strong> user
                {users.length !== 1 ? "s" : ""}
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
                  filteredAndSortedUsers.map((user) => {
                  const isAdmin = user.role === "admin";
                  const isActive = user.status === "active";

                  return (
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
                        <Badge variant={isActive ? "success" : "danger"}>
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
                        {isAdmin ? (
                          <span className="text-sm text-gray-400 italic">
                            Cannot modify admin
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Button
                              onClick={() => handleViewUser(user)}
                              size="sm"
                              variant="ghost"
                              className="flex items-center gap-2"
                              title="View user details"
                            >
                              <Eye className="w-4 h-4" />
                              View
                            </Button>
                            <Button
                              onClick={() => handleEditUser(user)}
                              size="sm"
                              variant="ghost"
                              disabled={
                                togglingUserId === user.id ||
                                resettingPasswordUserId === user.id ||
                                deletingUserId === user.id
                              }
                              className="flex items-center gap-2"
                              title="Edit user"
                            >
                              <Edit className="w-4 h-4" />
                              Edit
                            </Button>
                            <Button
                              onClick={() =>
                                handleToggleStatus(user.id, user.role)
                              }
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
                                : isActive
                                ? "Deactivate"
                                : "Activate"}
                            </Button>
                            <Button
                              onClick={() =>
                                handleResetPassword(
                                  user.id,
                                  user.role,
                                  user.email
                                )
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
                                handleDeleteUser(
                                  user.id,
                                  user.name,
                                  user.email,
                                  user.role
                                )
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
                        )}
                      </td>
                    </tr>
                  );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* View User Modal */}
      <ViewLocalUserModal
        isOpen={isViewModalOpen}
        onClose={handleCloseViewModal}
        userId={selectedUserId}
      />

      {/* Edit User Modal */}
      <EditLocalUserModal
        isOpen={isEditModalOpen}
        onClose={handleCloseEditModal}
        user={editingUser}
        onSuccess={handleEditSuccess}
      />
    </div>
  );
}
