import { useState, useEffect } from "react";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
import { usersService, type TuyaUser } from "../../services";

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: TuyaUser | null;
  onSuccess?: () => void;
}

interface EditUserFormData {
  nick_name: string;
  sex: number; // 1=male, 2=female
  birthday: string; // Date string for input
  height: string; // Number as string for input
  weight: string; // Number as string for input
}

export function EditUserModal({
  isOpen,
  onClose,
  user: userProp,
  onSuccess,
}: EditUserModalProps) {
  const [user, setUser] = useState<TuyaUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<EditUserFormData>({
    nick_name: "",
    sex: 1,
    birthday: "",
    height: "",
    weight: "",
  });
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof EditUserFormData, string>>>({});

  useEffect(() => {
    if (isOpen && userProp) {
      // Use the user from props as primary source
      setUser(userProp);
      
      // Populate form with user data from the row
      setFormData({
        nick_name: userProp.nick_name || "",
        sex: userProp.sex || 1, // Default to male if not available
        birthday: userProp.birthday 
          ? new Date(userProp.birthday * 1000).toISOString().split("T")[0]
          : "",
        height: userProp.height ? String(userProp.height) : "",
        weight: userProp.weight ? String(userProp.weight) : "",
      });
      
      // If sex, birthday, height, or weight are missing, fetch full user details
      if (userProp.sex === undefined && userProp.birthday === undefined && 
          userProp.height === undefined && userProp.weight === undefined) {
        fetchUserDetails();
      }
      
      setError(null);
    } else {
      setUser(null);
      setFormData({
        nick_name: "",
        sex: 1,
        birthday: "",
        height: "",
        weight: "",
      });
      setFormErrors({});
      setError(null);
    }
  }, [isOpen, userProp]);

  const fetchUserDetails = async () => {
    if (!userProp) return;

    const userId = userProp.user_id || userProp.tuyaUserId || String(userProp.lock_user_id);
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await usersService.getTuyaUserDetails(userId);
      if (response && response.success && response.data) {
        const userData = response.data;
        setUser(userData);
        
        // Update form with fetched data, but keep existing values if they're already set
        setFormData((prev) => ({
          nick_name: prev.nick_name || userData.nick_name || "",
          sex: prev.sex !== 1 || userData.sex ? (userData.sex || 1) : prev.sex,
          birthday: prev.birthday || (userData.birthday 
            ? new Date(userData.birthday * 1000).toISOString().split("T")[0]
            : ""),
          height: prev.height || (userData.height ? String(userData.height) : ""),
          weight: prev.weight || (userData.weight ? String(userData.weight) : ""),
        }));
      }
    } catch (err) {
      console.error("❌ Failed to fetch user details:", err);
      // Don't set error here - use the row data as fallback
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof EditUserFormData, string>> = {};

    if (formData.sex !== 1 && formData.sex !== 2) {
      errors.sex = "Please select a valid gender";
    }

    if (formData.height && (isNaN(Number(formData.height)) || Number(formData.height) < 0)) {
      errors.height = "Height must be a positive number";
    }

    if (formData.weight && (isNaN(Number(formData.weight)) || Number(formData.weight) < 0)) {
      errors.weight = "Weight must be a positive number";
    }

    if (formData.birthday) {
      const birthdayDate = new Date(formData.birthday);
      if (isNaN(birthdayDate.getTime())) {
        errors.birthday = "Please enter a valid date";
      } else if (birthdayDate > new Date()) {
        errors.birthday = "Birthday cannot be in the future";
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    // Use the user from state (which might be updated from fetch) or fallback to prop
    const currentUser = user || userProp;
    if (!currentUser) {
      setError("User data is required");
      return;
    }

    // Use user_id from the fetched user list (this is the primary identifier from Tuya API)
    // user_id is returned when fetching the list of users and should be used for updates
    const userId = currentUser.user_id;
    if (!userId) {
      setError("User ID is required. The user_id field is missing from user data.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Convert form data to API format
      const updateData: {
        nick_name?: string;
        sex: number;
        birthday?: number;
        height?: number;
        weight?: number;
      } = {
        sex: formData.sex,
      };

      if (formData.nick_name.trim()) {
        updateData.nick_name = formData.nick_name.trim();
      }

      if (formData.birthday) {
        updateData.birthday = Math.floor(new Date(formData.birthday).getTime() / 1000);
      }

      if (formData.height) {
        updateData.height = parseInt(formData.height, 10);
      }

      if (formData.weight) {
        updateData.weight = parseInt(formData.weight, 10);
      }

      const response = await usersService.updateTuyaDeviceUser(userId, updateData);

      if (response && response.success) {
        // Call success callback if provided
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

  const handleChange = (field: keyof EditUserFormData, value: string | number) => {
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
          <span className="ml-2 text-sm text-gray-600">Loading user details...</span>
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
              User ID <span className="text-xs text-gray-400">(from user list)</span>
            </label>
            <input
              type="text"
              value={currentUser.user_id || ""}
              disabled
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
            />
            {!currentUser.user_id && (
              <p className="mt-1 text-xs text-red-600">
                Warning: user_id is missing. This may cause update to fail.
              </p>
            )}
          </div>

          {/* Nickname */}
          <Input
            label="Nickname"
            type="text"
            value={formData.nick_name}
            onChange={(e) => handleChange("nick_name", e.target.value)}
            error={formErrors.nick_name}
            placeholder="Enter nickname"
          />

          {/* Gender */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Gender <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.sex}
              onChange={(e) => handleChange("sex", parseInt(e.target.value, 10))}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                formErrors.sex ? "border-red-500" : "border-gray-300"
              }`}
            >
              <option value={1}>Male</option>
              <option value={2}>Female</option>
            </select>
            {formErrors.sex && (
              <p className="mt-1 text-sm text-red-600">{formErrors.sex}</p>
            )}
          </div>

          {/* Birthday */}
          <Input
            label="Birthday"
            type="date"
            value={formData.birthday}
            onChange={(e) => handleChange("birthday", e.target.value)}
            error={formErrors.birthday}
            max={new Date().toISOString().split("T")[0]}
          />

          {/* Height */}
          <Input
            label="Height (cm)"
            type="number"
            value={formData.height}
            onChange={(e) => handleChange("height", e.target.value)}
            error={formErrors.height}
            placeholder="Enter height in centimeters"
            min="0"
            step="1"
          />

          {/* Weight */}
          <Input
            label="Weight (g)"
            type="number"
            value={formData.weight}
            onChange={(e) => handleChange("weight", e.target.value)}
            error={formErrors.weight}
            placeholder="Enter weight in grams"
            min="0"
            step="1"
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

