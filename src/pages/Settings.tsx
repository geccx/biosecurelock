import { useState, useEffect } from "react";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { SetPasswordModal } from "../components/admin/SetPasswordModal";
import { usersService, type TuyaUser } from "../services";
import { KeyRoundIcon } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

export function Settings() {
  const { currentUser } = useAuth();
  const [myTuyaUser, setMyTuyaUser] = useState<TuyaUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSetPasswordModalOpen, setIsSetPasswordModalOpen] = useState(false);

  useEffect(() => {
    fetchMyTuyaUser();
  }, [currentUser]);

  const fetchMyTuyaUser = async () => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await usersService.getTuyaUsers();
      if (response && response.success && response.data) {
        const usersData = Array.isArray(response.data) ? response.data : [];

        // Find the current user's Tuya account by matching email or username
        const myUser = usersData.find((user) => {
          // Match by email
          if (
            user.localUserEmail === currentUser.email ||
            user.localUser?.email === currentUser.email
          ) {
            return true;
          }
          // Match by username/name
          if (
            user.localUserName === currentUser.name ||
            user.localUser?.name === currentUser.name
          ) {
            return true;
          }
          // Match by user_contact (which might be email or username)
          if (
            user.user_contact === currentUser.email ||
            user.user_contact === currentUser.name
          ) {
            return true;
          }
          return false;
        });

        setMyTuyaUser(myUser || null);
      } else {
        setMyTuyaUser(null);
      }
    } catch (error) {
      console.error("❌ Failed to fetch Tuya user:", error);
      setMyTuyaUser(null);
    } finally {
      setLoading(false);
    }
  };

  const getDisplayName = (user: TuyaUser) => {
    return (
      user.nick_name ||
      user.user_contact ||
      user.localUserName ||
      currentUser?.name ||
      "Unknown"
    );
  };

  const handleSetPassword = () => {
    if (!myTuyaUser || !myTuyaUser.user_id) {
      return;
    }
    setIsSetPasswordModalOpen(true);
  };

  const handleSetPasswordSuccess = () => {
    setIsSetPasswordModalOpen(false);
  };

  const handleSetPasswordClose = () => {
    setIsSetPasswordModalOpen(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // If user not found, still show the form (user said everyone is connected)
  const tuyaUserId = myTuyaUser?.user_id || myTuyaUser?.tuyaUserId;
  const displayName = myTuyaUser
    ? getDisplayName(myTuyaUser)
    : currentUser?.name || "Your Account";

  return (
    <div className="space-y-6">
      <Card title="Settings - Set Temporary Password">
        <div className="mb-6">
          <p className="text-sm text-gray-600 mb-6">
            Set a temporary password for your account. This password can be used
            to unlock the door during the specified time period.
          </p>

          {tuyaUserId ? (
            <div className="flex justify-center">
              <Button
                onClick={handleSetPassword}
                disabled={isSetPasswordModalOpen}
                size="lg"
                className="flex items-center justify-center gap-2"
              >
                <KeyRoundIcon className="w-5 h-5" />
                Set Temporary Password
              </Button>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">
                Loading your account information...
              </p>
              <Button
                onClick={fetchMyTuyaUser}
                disabled={loading}
                size="sm"
                variant="secondary"
              >
                Refresh
              </Button>
            </div>
          )}
        </div>
      </Card>

      {tuyaUserId && (
        <SetPasswordModal
          isOpen={isSetPasswordModalOpen}
          onClose={handleSetPasswordClose}
          onSuccess={handleSetPasswordSuccess}
          userId={tuyaUserId}
          userName={displayName}
        />
      )}
    </div>
  );
}
