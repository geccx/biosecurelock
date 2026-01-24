import { useState, useEffect } from "react";
import { Modal } from "../common/Modal";
import { Badge } from "../common/Badge";
import { Button } from "../common/Button";
import { usersService, type TuyaUser } from "../../services";
import { XIcon } from "lucide-react";
import '../../styles/UserModals.css';
interface UserDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string | null;
  user?: TuyaUser | null; // Optional: pass user data from table to avoid refetching
}

export function UserDetailModal({
  isOpen,
  onClose,
  userId,
  user: initialUser,
}: UserDetailModalProps) {
  const [user, setUser] = useState<TuyaUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && userId) {
      // If user data is provided, use it directly (includes effective_flag from table)
      if (initialUser && initialUser.user_id === userId) {
        setUser(initialUser);
        setError(null);
        setLoading(false);
      } else {
        // Otherwise, fetch from API
        fetchUserDetails();
      }
    } else {
      setUser(null);
      setError(null);
    }
  }, [isOpen, userId, initialUser]);

  const fetchUserDetails = async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await usersService.getTuyaUserDetails(userId);
      if (response && response.success && response.data) {
        // Merge with initial user data to preserve effective_flag if available
        const mergedUser = initialUser && initialUser.user_id === userId
          ? { ...response.data, effective_flag: initialUser.effective_flag }
          : response.data;
        setUser(mergedUser);
      } else {
        setError("Failed to fetch user details");
      }
    } catch (err) {
      console.error("❌ Failed to fetch user details:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch user details"
      );
    } finally {
      setLoading(false);
    }
  };

  const getUserTypeLabel = (userType: number) => {
    if (userType === 10) return "Administrator";
    if (userType === 50) return "Owner";
    if (userType === 20) return "Member";
    return "Unknown";
  };

  const getUserTypeVariant = (userType: number) => {
    if (userType === 10) return "info";
    if (userType === 50) return "success";
    return "warning";
  };

  const getUnlockMethodLabel = (dpCode: string) => {
    return dpCode.replace("unlock_", "").replace(/_/g, " ");
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="User Details" size="xl">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : error ? (
        <div className="py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error}</p>
            <Button
              onClick={fetchUserDetails}
              className="mt-4"
              variant="secondary"
              size="sm"
            >
              Retry
            </Button>
          </div>
        </div>
      ) : user ? (
        <div className="space-y-6">
          {/* User Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">
                User ID
              </h3>
              <p className="text-sm font-mono text-gray-900">{user.user_id}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">
                Lock User ID
              </h3>
              <p className="text-sm text-gray-900">{user.lock_user_id}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">
                Nickname
              </h3>
              <p className="text-sm text-gray-900">
                {user.nick_name || "N/A"}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Contact</h3>
              <p className="text-sm text-gray-900">
                {user.user_contact || "N/A"}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">
                User Type
              </h3>
              <Badge variant={getUserTypeVariant(user.user_type)}>
                {getUserTypeLabel(user.user_type)}
              </Badge>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Status</h3>
              <Badge variant={user.effective_flag === 1 ? "success" : "danger"}>
                {user.effective_flag === 1 ? "Active" : user.effective_flag === 0 ? "Inactive" : "Unknown"}
              </Badge>
            </div>
            {user.uid && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">UID</h3>
                <p className="text-sm font-mono text-gray-900">{user.uid}</p>
              </div>
            )}
            {user.avatar_url && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">
                  Avatar
                </h3>
                <img
                  src={user.avatar_url}
                  alt="User avatar"
                  className="w-16 h-16 rounded-full object-cover"
                />
              </div>
            )}
          </div>

          {/* Linked Local User */}
          {user.localUser && (
            <div className="border-t pt-4">
              <h3 className="text-sm font-medium text-gray-500 mb-2">
                Linked Local User
              </h3>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm font-medium text-green-900">
                  {user.localUser.name}
                </p>
                <p className="text-xs text-green-700">{user.localUser.email}</p>
              </div>
            </div>
          )}

          {/* Unlock Methods */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium text-gray-500 mb-4">
              Unlock Methods
            </h3>
            {user.unlockMethods && user.unlockMethods.length > 0 ? (
              <div className="space-y-3">
                {user.unlockMethods.map((method, idx) => (
                  <div
                    key={idx}
                    className="bg-gray-50 border border-gray-200 rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900 capitalize">
                        {getUnlockMethodLabel(method.type)}
                      </span>
                      {method.admin && (
                        <Badge variant="info" size="sm">
                          Admin
                        </Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                      <div>
                        <span className="font-medium">Name:</span>{" "}
                        {method.unlockName}
                      </div>
                      <div>
                        <span className="font-medium">Serial Number:</span>{" "}
                        {method.unlockSn}
                      </div>
                      {method.unlockId && (
                        <div>
                          <span className="font-medium">Unlock ID:</span>{" "}
                          {method.unlockId}
                        </div>
                      )}
                      {method.photoUnlock && (
                        <div>
                          <span className="font-medium">Photo Unlock:</span>{" "}
                          <Badge variant="success" size="sm">
                            Enabled
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : user.unlock_detail && user.unlock_detail.length > 0 ? (
              <div className="space-y-3">
                {user.unlock_detail.map((detail, idx) => (
                  <div
                    key={idx}
                    className="bg-gray-50 border border-gray-200 rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900 capitalize">
                        {getUnlockMethodLabel(detail.dp_code)}
                      </span>
                      <span className="text-xs text-gray-500">
                        {detail.count} method(s)
                      </span>
                    </div>
                    {detail.unlock_list && detail.unlock_list.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {detail.unlock_list.map((unlock, uIdx) => (
                          <div
                            key={uIdx}
                            className="bg-white border border-gray-100 rounded p-2 text-xs"
                          >
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="font-medium">Name:</span>{" "}
                                {unlock.unlock_name || `SN: ${unlock.unlock_sn}`}
                              </div>
                              <div>
                                <span className="font-medium">SN:</span>{" "}
                                {unlock.unlock_sn}
                              </div>
                              {unlock.admin && (
                                <div>
                                  <Badge variant="info" size="sm">
                                    Admin Method
                                  </Badge>
                                </div>
                              )}
                              {unlock.photo_unlock && (
                                <div>
                                  <Badge variant="success" size="sm">
                                    Photo Unlock
                                  </Badge>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800 font-medium mb-1">
                  Default Unlock Method: PIN
                </p>
                <p className="text-xs text-blue-600">
                  A default PIN unlock method is assigned to all users. 
                  Additional unlock methods (fingerprint, card, etc.) can be added through enrollment.
                </p>
              </div>
            )}
          </div>

          {/* Time Schedule Information */}
          {user.time_schedule_info && (
            <div className="border-t pt-4">
              <h3 className="text-sm font-medium text-gray-500 mb-4">
                Time Schedule
              </h3>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                {user.time_schedule_info.permanent ? (
                  <div className="flex items-center">
                    <Badge variant="success">Permanent Access</Badge>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div>
                      <span className="text-xs font-medium text-gray-500">
                        Effective Time:
                      </span>{" "}
                      <span className="text-sm text-gray-900">
                        {formatDate(user.time_schedule_info.effective_time)}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-500">
                        Expired Time:
                      </span>{" "}
                      <span className="text-sm text-gray-900">
                        {formatDate(user.time_schedule_info.expired_time)}
                      </span>
                    </div>
                    {user.time_schedule_info.schedule_details &&
                      user.time_schedule_info.schedule_details.length > 0 && (
                        <div className="mt-4">
                          <h4 className="text-xs font-medium text-gray-500 mb-2">
                            Schedule Details:
                          </h4>
                          <div className="space-y-2">
                            {user.time_schedule_info.schedule_details.map(
                              (schedule, idx) => (
                                <div
                                  key={idx}
                                  className="bg-white border border-gray-100 rounded p-2 text-xs"
                                >
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <span className="font-medium">
                                        All Day:
                                      </span>{" "}
                                      {schedule.all_day ? "Yes" : "No"}
                                    </div>
                                    <div>
                                      <span className="font-medium">
                                        Working Day:
                                      </span>{" "}
                                      {schedule.working_day}
                                    </div>
                                    <div>
                                      <span className="font-medium">
                                        Effective:
                                      </span>{" "}
                                      {formatDate(schedule.effective_time)}
                                    </div>
                                    <div>
                                      <span className="font-medium">
                                        Invalid:
                                      </span>{" "}
                                      {formatDate(schedule.invalid_time)}
                                    </div>
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Additional Information */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium text-gray-500 mb-4">
              Additional Information
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-500">
                  Back Home Notify:
                </span>{" "}
                <span className="text-gray-900">
                  {user.back_home_notify_attr === 1 ? "Enabled" : "Disabled"}
                </span>
              </div>
              {user.offline_unlock !== undefined && (
                <div>
                  <span className="font-medium text-gray-500">
                    Offline Unlock:
                  </span>{" "}
                  <span className="text-gray-900">
                    {user.offline_unlock ? "Enabled" : "Disabled"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Close Button */}
          <div className="flex justify-end pt-4 border-t">
            <Button onClick={onClose} variant="secondary">
              Close
            </Button>
          </div>
        </div>
      ) : (
        <div className="py-8 text-center text-gray-500">
          No user selected
        </div>
      )}
    </Modal>
  );
}

