import { useState } from "react";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
import { usersService } from "../../services"
interface SetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  userId: string;
  userName?: string;
}

interface SetPasswordFormData {
  name: string;
  password: string;
  validFrom: string; // ISO8601 date string
  validUntil: string; // ISO8601 date string
  maxUsage: number; // 1 = once, 0 = multiple
  phone: string;
  time_zone: string;
  useSchedule: boolean;
  schedule_list: Array<{
    effective_time: number; // minutes (0-1440)
    invalid_time: number; // minutes (0-1440)
    working_day: number; // 1=Sun, 2=Mon, 4=Tue, 8=Wed, 16=Thu, 32=Fri, 64=Sat
  }>;
  relate_dev_list: string; // Comma-separated device IDs (for Bluetooth locks)
}

export function SetPasswordModal({
  isOpen,
  onClose,
  onSuccess,
  userId,
  userName,
}: SetPasswordModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Calculate default dates (now and 1 week from now)
  const now = new Date();
  const oneWeekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  
  const [formData, setFormData] = useState<SetPasswordFormData>({
    name: userName ? `Password for ${userName}` : "",
    password: "",
    validFrom: now.toISOString().slice(0, 16), // Format for datetime-local input
    validUntil: oneWeekLater.toISOString().slice(0, 16),
    maxUsage: 1, // Default: once
    phone: "",
    time_zone: "",
    useSchedule: false,
    schedule_list: [
      {
        effective_time: 0, // 00:00
        invalid_time: 1440, // 24:00
        working_day: 0,
      },
    ],
    relate_dev_list: "",
  });

  const [formErrors, setFormErrors] = useState<
    Partial<Record<keyof SetPasswordFormData, string>>
  >({});

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof SetPasswordFormData, string>> = {};

    if (!formData.name.trim()) {
      errors.name = "Password name is required";
    }

    if (!formData.password) {
      errors.password = "Password is required";
    } else if (formData.password.length < 6 || formData.password.length > 7) {
      errors.password = "Password must be 6-7 digits (6 for Zigbee/Bluetooth, 7 for Wi-Fi)";
    } else if (!/^\d+$/.test(formData.password)) {
      errors.password = "Password must contain only digits";
    }

    if (!formData.validFrom) {
      errors.validFrom = "Valid from date is required";
    }

    if (!formData.validUntil) {
      errors.validUntil = "Valid until date is required";
    }

    const fromDate = new Date(formData.validFrom);
    const untilDate = new Date(formData.validUntil);
    if (untilDate <= fromDate) {
      errors.validUntil = "Valid until must be after valid from";
    }

    if (formData.useSchedule) {
      if (!formData.time_zone) {
        errors.time_zone = "Time zone is required when using schedule";
      }
      formData.schedule_list.forEach((schedule, index) => {
        if (schedule.effective_time < 0 || schedule.effective_time > 1440) {
          errors.schedule_list = `Schedule ${index + 1}: Effective time must be 0-1440 minutes`;
        }
        if (schedule.invalid_time < 0 || schedule.invalid_time > 1440) {
          errors.schedule_list = `Schedule ${index + 1}: Invalid time must be 0-1440 minutes`;
        }
        if (schedule.invalid_time <= schedule.effective_time) {
          errors.schedule_list = `Schedule ${index + 1}: Invalid time must be after effective time`;
        }
      });
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    
    if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else if (name === "maxUsage") {
      setFormData((prev) => ({ ...prev, [name]: parseInt(value) }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleScheduleChange = (
    index: number,
    field: "effective_time" | "invalid_time" | "working_day",
    value: number
  ) => {
    setFormData((prev) => {
      const newSchedule = [...prev.schedule_list];
      newSchedule[index] = { ...newSchedule[index], [field]: value };
      return { ...prev, schedule_list: newSchedule };
    });
  };

  const addSchedule = () => {
    setFormData((prev) => ({
      ...prev,
      schedule_list: [
        ...prev.schedule_list,
        {
          effective_time: 0,
          invalid_time: 1440,
          working_day: 0,
        },
      ],
    }));
  };

  const removeSchedule = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      schedule_list: prev.schedule_list.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      // Convert datetime-local to ISO8601 format
      const validFromISO = new Date(formData.validFrom).toISOString();
      const validUntilISO = new Date(formData.validUntil).toISOString();

      // Prepare request payload
      const payload: any = {
        name: formData.name.trim(),
        password: formData.password,
        validFrom: validFromISO,
        validUntil: validUntilISO,
        maxUsage: formData.maxUsage,
      };

      // Optional fields
      if (formData.phone.trim()) {
        payload.phone = formData.phone.trim();
      }

      if (formData.useSchedule) {
        if (formData.time_zone.trim()) {
          payload.time_zone = formData.time_zone.trim();
        } else {
          payload.time_zone = "";
        }
        payload.schedule_list = formData.schedule_list;
      }

      if (formData.relate_dev_list.trim()) {
        // Split comma-separated device IDs
        payload.relate_dev_list = formData.relate_dev_list
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id.length > 0);
      }

      const response = await usersService.createTempPasswordForUser(
        userId,
        payload
      );

      if (response.success) {
        setFormData({
          name: "",
          password: "",
          validFrom: now.toISOString().slice(0, 16),
          validUntil: oneWeekLater.toISOString().slice(0, 16),
          maxUsage: 1,
          phone: "",
          time_zone: "",
          useSchedule: false,
          schedule_list: [
            {
              effective_time: 0,
              invalid_time: 1440,
              working_day: 0,
            },
          ],
          relate_dev_list: "",
        });
        setFormErrors({});
        setError(null);
        onSuccess?.();
        onClose();
      } else {
        setError(response.error || "Failed to create temporary password");
      }
    } catch (err: any) {
      console.error("Error creating temporary password:", err);
      setError(
        err.response?.data?.error ||
          err.response?.data?.details ||
          err.message ||
          "Failed to create temporary password"
      );
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  };

  const parseTime = (timeString: string): number => {
    const [hours, mins] = timeString.split(":").map(Number);
    return hours * 60 + mins;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Set Temporary Password"
      size="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Name */}
          <Input
            label="Password Name *"
            name="name"
            type="text"
            value={formData.name}
            onChange={handleChange}
            error={formErrors.name}
            required
            placeholder="e.g., Guest Password"
          />

          {/* Password */}
          <Input
            label="Password * (6-7 digits)"
            name="password"
            type="text"
            value={formData.password}
            onChange={handleChange}
            error={formErrors.password}
            required
            placeholder="123456"
            maxLength={7}
            pattern="[0-9]*"
            inputMode="numeric"
          />

          {/* Valid From */}
          <Input
            label="Valid From *"
            name="validFrom"
            type="datetime-local"
            value={formData.validFrom}
            onChange={handleChange}
            error={formErrors.validFrom}
            required
          />

          {/* Valid Until */}
          <Input
            label="Valid Until *"
            name="validUntil"
            type="datetime-local"
            value={formData.validUntil}
            onChange={handleChange}
            error={formErrors.validUntil}
            required
          />

          {/* Max Usage */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max Usage *
            </label>
            <select
              name="maxUsage"
              value={formData.maxUsage}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value={1}>Once (single use)</option>
              <option value={0}>Multiple (unlimited uses)</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Required for Zigbee locks
            </p>
          </div>

          {/* Phone */}
          <Input
            label="Phone (Optional)"
            name="phone"
            type="text"
            value={formData.phone}
            onChange={handleChange}
            placeholder="Mobile phone number"
          />
        </div>

        {/* Schedule Section */}
        <div className="border-t pt-4">
          <div className="flex items-center mb-4">
            <input
              type="checkbox"
              id="useSchedule"
              name="useSchedule"
              checked={formData.useSchedule}
              onChange={handleChange}
              className="mr-2"
            />
            <label htmlFor="useSchedule" className="text-sm font-medium text-gray-700">
              Use Periodic Password Schedule
            </label>
          </div>

          {formData.useSchedule && (
            <div className="space-y-4 pl-6 border-l-2 border-blue-200">
              {/* Time Zone */}
              <Input
                label="Time Zone *"
                name="time_zone"
                type="text"
                value={formData.time_zone}
                onChange={handleChange}
                error={formErrors.time_zone}
                placeholder="e.g., Asia/Manila or +08:00"
                required={formData.useSchedule}
              />

              {/* Schedule List */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Schedule List *
                </label>
                {formData.schedule_list.map((schedule, index) => (
                  <div
                    key={index}
                    className="mb-4 p-4 border border-gray-200 rounded-lg bg-gray-50"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-700">
                        Schedule {index + 1}
                      </span>
                      {formData.schedule_list.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeSchedule(index)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">
                          Effective Time (HH:MM)
                        </label>
                        <input
                          type="time"
                          value={formatTime(schedule.effective_time)}
                          onChange={(e) =>
                            handleScheduleChange(
                              index,
                              "effective_time",
                              parseTime(e.target.value)
                            )
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">
                          Invalid Time (HH:MM)
                        </label>
                        <input
                          type="time"
                          value={formatTime(schedule.invalid_time)}
                          onChange={(e) =>
                            handleScheduleChange(
                              index,
                              "invalid_time",
                              parseTime(e.target.value)
                            )
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">
                          Working Day
                        </label>
                        <select
                          value={schedule.working_day}
                          onChange={(e) =>
                            handleScheduleChange(
                              index,
                              "working_day",
                              parseInt(e.target.value)
                            )
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value={0}>Every Day</option>
                          <option value={1}>Sunday</option>
                          <option value={2}>Monday</option>
                          <option value={4}>Tuesday</option>
                          <option value={8}>Wednesday</option>
                          <option value={16}>Thursday</option>
                          <option value={32}>Friday</option>
                          <option value={64}>Saturday</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addSchedule}
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  + Add Another Schedule
                </button>
                {formErrors.schedule_list && (
                  <p className="mt-1 text-sm text-red-600">
                    {formErrors.schedule_list}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Relate Dev List (for Bluetooth locks) */}
        <div className="border-t pt-4">
          <Input
            label="Related Device List (Optional - Bluetooth locks only)"
            name="relate_dev_list"
            type="text"
            value={formData.relate_dev_list}
            onChange={handleChange}
            placeholder="Comma-separated device IDs, e.g., dev1,dev2"
          />
          <p className="mt-1 text-xs text-gray-500">
            Only for Bluetooth lock accessories. Leave empty for other lock types.
          </p>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create Password"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

