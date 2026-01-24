import { useState, useEffect } from "react";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
import { usersService, type BackendUser } from "../../services";
import '../../styles/UserModals.css';

interface EditLocalUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: BackendUser | null;
  onSuccess?: () => void;
}

interface EditLocalUserFormData {
  name: string;
  email: string;
  role: string;
  status: string;
  department: string;
}

export function EditLocalUserModal({
  isOpen,
  onClose,
  user: userProp,
  onSuccess,
}: EditLocalUserModalProps) {
  const [user, setUser] = useState<BackendUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<EditLocalUserFormData>({
    name: "",
    email: "",
    role: "",
    status: "active",
    department: "",
  });
  const [formErrors, setFormErrors] = useState<
    Partial<Record<keyof EditLocalUserFormData, string>>
  >({});

  useEffect(() => {
    if (isOpen && userProp) {
      setUser(userProp);
      setFormData({
        name: userProp.name || "",
        email: userProp.email || "",
        role: userProp.role || "",
        status: userProp.status || "active",
        department: userProp.department || "",
      });
      setError(null);
    } else {
      setUser(null);
      setFormData({
        name: "",
        email: "",
        role: "",
        status: "active",
        department: "",
      });
      setFormErrors({});
      setError(null);
    }
  }, [isOpen, userProp]);

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof EditLocalUserFormData, string>> = {};

    if (!formData.name.trim() || formData.name.trim().length < 2) {
      errors.name = "Name must be at least 2 characters";
    }

    if (!formData.email.trim()) {
      errors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = "Please enter a valid email address";
    }

    if (!formData.role) {
      errors.role = "Role is required";
    } else if (
      !["admin", "teacher", "techsupport", "user", "visitor"].includes(
        formData.role
      )
    ) {
      errors.role = "Please select a valid role";
    }

    if (!formData.status) {
      errors.status = "Status is required";
    } else if (
      !["active", "inactive", "pending"].includes(formData.status)
    ) {
      errors.status = "Please select a valid status";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const currentUser = user || userProp;
    if (!currentUser) {
      setError("User data is required");
      return;
    }

    const userId = currentUser.id;
    if (!userId) {
      setError("User ID is required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const updateData: {
        name?: string;
        email?: string;
        role?: string;
        status?: string;
        department?: string;
      } = {};

      if (formData.name !== currentUser.name) {
        updateData.name = formData.name.trim();
      }
      if (formData.email !== currentUser.email) {
        updateData.email = formData.email.trim();
      }
      if (formData.role !== currentUser.role) {
        updateData.role = formData.role;
      }
      if (formData.status !== (currentUser.status || "active")) {
        updateData.status = formData.status;
      }
      if (formData.department !== (currentUser.department || "")) {
        updateData.department = formData.department.trim() || undefined;
      }

      // Only send update if there are changes
      if (Object.keys(updateData).length === 0) {
        setError("No changes to save");
        setSaving(false);
        return;
      }

      const response = await usersService.update(parseInt(userId), updateData);

      if (response && response.success) {
        if (onSuccess) {
          onSuccess();
        }
        onClose();
      } else {
        setError(response?.error || "Failed to update user");
      }
    } catch (err) {
      console.error("❌ Failed to update user:", err);
      setError(
        err instanceof Error ? err.message : "Failed to update user"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (
    field: keyof EditLocalUserFormData,
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    // Clear error for this field when user starts typing
    if (formErrors[field]) {
      setFormErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  if (!userProp) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Edit User" size="lg">
        <div className="py-8 text-center text-gray-500">
          No user selected
        </div>
      </Modal>
    );
  }

  const currentUser = user || userProp;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit User" size="lg">
      {loading && (
        <div className="flex items-center justify-center py-4">
          <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="ml-2 text-sm text-gray-600">
            Loading user details...
          </span>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* User ID (read-only) */}
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1">
            User ID
          </label>
          <input
            type="text"
            value={currentUser.id || ""}
            disabled
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
          />
        </div>

        {/* Name */}
        <Input
          label="Name"
          type="text"
          value={formData.name}
          onChange={(e) => handleChange("name", e.target.value)}
          error={formErrors.name}
          placeholder="Enter name"
          required
        />

        {/* Email */}
        <Input
          label="Email"
          type="email"
          value={formData.email}
          onChange={(e) => handleChange("email", e.target.value)}
          error={formErrors.email}
          placeholder="Enter email"
          required
        />

        {/* Role */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Role <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.role}
            onChange={(e) => handleChange("role", e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              formErrors.role ? "border-red-500" : "border-gray-300"
            }`}
            required
          >
            <option value="">Select a role</option>
            <option value="admin">Admin</option>
            <option value="teacher">Teacher</option>
            <option value="techsupport">Tech Support</option>
            <option value="user">User</option>
            <option value="visitor">Visitor</option>
          </select>
          {formErrors.role && (
            <p className="mt-1 text-sm text-red-600">{formErrors.role}</p>
          )}
        </div>

        {/* Status */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Status <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.status}
            onChange={(e) => handleChange("status", e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              formErrors.status ? "border-red-500" : "border-gray-300"
            }`}
            required
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="pending">Pending</option>
          </select>
          {formErrors.status && (
            <p className="mt-1 text-sm text-red-600">{formErrors.status}</p>
          )}
        </div>

        {/* Department */}
        <Input
          label="Department"
          type="text"
          value={formData.department}
          onChange={(e) => handleChange("department", e.target.value)}
          error={formErrors.department}
          placeholder="Enter department (optional)"
        />

        {/* Form Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            type="button"
            onClick={onClose}
            variant="secondary"
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

