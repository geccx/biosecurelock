import { useEffect, useState } from "react";
import { BellIcon, CheckIcon, XIcon } from "lucide-react";
import { Card } from "../components/common/Card";
import { Button } from "../components/common/Button";
import {
  notificationPreferencesService,
  type NotificationPreferences,
  type UpdateNotificationPreferencesData,
} from "../services";

export function NotificationPreferences() {
  const [preferences, setPreferences] =
    useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    fetchPreferences();
  }, []);

  const fetchPreferences = async () => {
    try {
      setLoading(true);
      const response = await notificationPreferencesService.getPreferences();
      if (response.success && response.data) {
        setPreferences(response.data);
      }
    } catch (error) {
      console.error("Failed to fetch notification preferences:", error);
      setMessage({
        type: "error",
        text: "Failed to load notification preferences",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (key: keyof UpdateNotificationPreferencesData) => {
    if (!preferences) return;

    const newValue = !preferences[key as keyof NotificationPreferences];
    const updateData: UpdateNotificationPreferencesData = {
      [key]: newValue,
    };

    try {
      setSaving(true);
      const response = await notificationPreferencesService.updatePreferences(
        updateData
      );
      if (response.success && response.data) {
        setPreferences(response.data);
        setMessage({
          type: "success",
          text: "Notification preferences updated successfully",
        });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      console.error("Failed to update notification preferences:", error);
      setMessage({
        type: "error",
        text: "Failed to update notification preferences",
      });
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!preferences) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Failed to load notification preferences</p>
      </div>
    );
  }

  const notificationTypes = [
    {
      key: "schedule_approved" as const,
      label: "Schedule Approved",
      description: "Get notified when your lab schedule is approved",
      icon: CheckIcon,
    },
    {
      key: "schedule_disapproved" as const,
      label: "Schedule Disapproved",
      description: "Get notified when your lab schedule is disapproved",
      icon: XIcon,
    },
    {
      key: "new_user_added" as const,
      label: "New User Added",
      description: "Get notified when a new user is added to the system",
      icon: BellIcon,
    },
    {
      key: "device_error" as const,
      label: "Device Error",
      description: "Get notified when a device encounters an error",
      icon: BellIcon,
    },
    {
      key: "enrollment_approved" as const,
      label: "Enrollment Approved",
      description: "Get notified when your enrollment request is approved",
      icon: CheckIcon,
    },
    {
      key: "enrollment_rejected" as const,
      label: "Enrollment Rejected",
      description: "Get notified when your enrollment request is rejected",
      icon: XIcon,
    },
    {
      key: "move_request_approved" as const,
      label: "Move Request Approved",
      description: "Get notified when your schedule move request is approved",
      icon: CheckIcon,
    },
    {
      key: "move_request_denied" as const,
      label: "Move Request Denied",
      description: "Get notified when your schedule move request is denied",
      icon: XIcon,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Notification Preferences
          </h1>
          <p className="text-gray-600 mt-2">
            Choose which notifications you want to receive
          </p>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg ${
            message.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      <Card>
        <div className="space-y-4">
          {notificationTypes.map((notificationType) => {
            const Icon = notificationType.icon;
            const isEnabled =
              preferences[notificationType.key as keyof NotificationPreferences];

            return (
              <div
                key={notificationType.key}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center space-x-3 flex-1">
                  <Icon
                    className={`w-5 h-5 ${
                      isEnabled ? "text-blue-600" : "text-gray-400"
                    }`}
                  />
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">
                      {notificationType.label}
                    </p>
                    <p className="text-sm text-gray-600">
                      {notificationType.description}
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={() => handleToggle(notificationType.key)}
                    disabled={saving}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>
                </label>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

