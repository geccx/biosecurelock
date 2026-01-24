import { useState, useEffect } from "react";
import { Modal } from "../common/Modal";
import { Badge } from "../common/Badge";
import { Button } from "../common/Button";
import { usersService, type BackendUser } from "../../services";
interface ViewLocalUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string | null;
}

interface UserDetails extends BackendUser {
  enrollments?: Array<{
    enrollment_type: string;
    status: string;
  }>;
}

export function ViewLocalUserModal({
  isOpen,
  onClose,
  userId,
}: ViewLocalUserModalProps) {
  const [user, setUser] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && userId) {
      fetchUserDetails();
    } else {
      setUser(null);
      setError(null);
    }
  }, [isOpen, userId]);

  const fetchUserDetails = async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await usersService.getById(parseInt(userId));
      if (response && response.success && response.data) {
        setUser(response.data as UserDetails);
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
              <p className="text-sm font-mono text-gray-900">{user.id}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Name</h3>
              <p className="text-sm text-gray-900">{user.name}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Email</h3>
              <p className="text-sm text-gray-900">{user.email}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Role</h3>
              <Badge variant="info">{user.role}</Badge>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Status</h3>
              <Badge variant={user.status === "active" ? "success" : "danger"}>
                {user.status || "active"}
              </Badge>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">
                Department
              </h3>
              <p className="text-sm text-gray-900">
                {user.department || "N/A"}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">
                Created At
              </h3>
              <p className="text-sm text-gray-900">
                {new Date(user.createdAt).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Enrollments */}
          {user.enrollments && user.enrollments.length > 0 && (
            <div className="border-t pt-4">
              <h3 className="text-sm font-medium text-gray-500 mb-4">
                Enrollments
              </h3>
              <div className="space-y-2">
                {user.enrollments.map((enrollment, idx) => (
                  <div
                    key={idx}
                    className="bg-gray-50 border border-gray-200 rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900 capitalize">
                        {enrollment.enrollment_type}
                      </span>
                      <Badge
                        variant={
                          enrollment.status === "approved"
                            ? "success"
                            : enrollment.status === "pending"
                            ? "warning"
                            : "danger"
                        }
                        size="sm"
                      >
                        {enrollment.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Enrollment Methods */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium text-gray-500 mb-4">
              Enrollment Methods
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {user.fingerprint && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="text-sm font-medium text-gray-900">
                    Fingerprint
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {user.fingerprint ? "Enrolled" : "Not enrolled"}
                  </div>
                </div>
              )}
              {user.rfid && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="text-sm font-medium text-gray-900">RFID</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {user.rfid ? "Enrolled" : "Not enrolled"}
                  </div>
                </div>
              )}
              {user.pin && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="text-sm font-medium text-gray-900">PIN</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {user.pin ? "Enrolled" : "Not enrolled"}
                  </div>
                </div>
              )}
              {!user.fingerprint && !user.rfid && !user.pin && (
                <p className="text-sm text-gray-400">No enrollment methods</p>
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

