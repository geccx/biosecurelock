import { useState } from "react";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import { Input } from "../common/Input";


import { usersService, type CreateUserData } from "../../services";

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface CreateUserFormData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: "admin" | "teacher" | "techsupport";
  sex: number; // 1=male, 2=female
}

export function CreateUserModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateUserModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateUserFormData>({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "teacher",
    sex: 1,
  });
  const [formErrors, setFormErrors] = useState<
    Partial<Record<keyof CreateUserFormData, string>>
  >({});

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof CreateUserFormData, string>> = {};

    if (!formData.name.trim() || formData.name.length < 2) {
      errors.name = "Name must be at least 2 characters";
    }

    if (
      !formData.email.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)
    ) {
      errors.email = "Valid email is required";
    }

    if (!formData.password || formData.password.length < 6) {
      errors.password = "Password must be at least 6 characters";
    }

    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }

    if (!formData.role) {
      errors.role = "Role is required";
    }

    

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      // Prepare data for API
      // Note: tuya_user_id will be created automatically in the background
      // back_home_notify_attr is automatically set to 1 (enabled) to notify admin and techsupport
      // Append trailing "#" to password when sending to API (per requirement)
      const createData: CreateUserData = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        password: `${formData.password}`,
        role: formData.role,
        sex: formData.sex,
      };


      const response = await usersService.create(createData);

      if (response.success) {
        // Reset form
        setFormData({
          name: "",
          email: "",
          password: "",
          confirmPassword: "",
          role: "teacher",
          sex: 1,
        });
        setFormErrors({});
        setError(null);
        onSuccess?.();
        onClose();
      } else {
        setError(response.error || "Failed to create user");
      }
    } catch (err: any) {
      console.error("Error creating user:", err);
      setError(
        err.response?.data?.error ||
          err.response?.data?.details ||
          err.message ||
          "Failed to create user"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    // Clear error for this field
    if (formErrors[name as keyof CreateUserFormData]) {
      setFormErrors((prev) => ({
        ...prev,
        [name]: undefined,
      }));
    }
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New User" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Name */}
          <Input
            label="Name *"
            name="name"
            type="text"
            value={formData.name}
            onChange={handleChange}
            error={formErrors.name}
            required
          />

          {/* Email */}
          <Input
            label="Email *"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            error={formErrors.email}
            required
          />

          {/* Password */}
          <Input
            label="Password *"
            name="password"
            type="password"
            value={formData.password}
            onChange={handleChange}
            error={formErrors.password}
            required
          />

          {/* Confirm Password */}
          <Input
            label="Confirm Password *"
            name="confirmPassword"
            type="password"
            value={formData.confirmPassword}
            onChange={handleChange}
            error={formErrors.confirmPassword}
            required
          />

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role *
            </label>
            <select
              name="role"
              value={formData.role}
              onChange={handleChange}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                formErrors.role ? "border-red-300" : "border-gray-300"
              }`}
              required
            >
              <option value="admin">Admin</option>
              <option value="teacher">Teacher</option>
              <option value="techsupport">Tech Support</option>
            </select>
            {formErrors.role && (
              <p className="mt-1 text-sm text-red-600">{formErrors.role}</p>
            )}
          </div>

          {/* Sex */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Gender
            </label>
            <select
              name="sex"
              value={formData.sex}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={1}>Male</option>
              <option value={2}>Female</option>
            </select>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-700">
          <p className="font-semibold mb-1">Note:</p>
          <p>
            This will automatically register the user in Tuya platform, add them
            as a device user, and then create login credentials in the system.
            Arrival notifications are automatically enabled to notify admins and
            tech support when the user arrives.
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create User"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
