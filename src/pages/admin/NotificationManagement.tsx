import { useEffect, useState } from "react";
import {
  BellIcon,
  CheckIcon,
  XIcon,
  TrashIcon,
  EyeIcon,
  EyeOffIcon,
  FilterIcon,
  SearchIcon,
} from "lucide-react";
import { Card } from "../../components/common/Card";
import { Button } from "../../components/common/Button";
import { Input } from "../../components/common/Input";
import {
  notificationPreferencesService,
  passwordRequestsService,
  labSchedulesService,
  moveRequestsService,
  type Notification,
} from "../../services";
import { useAuth } from "../../hooks/useAuth";
import {
  buildRequestNotifications,
  type RequestNotification,
} from "../../utils/notificationUtils";

export function NotificationManagement() {
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState<RequestNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const isAdmin = currentUser?.role === "admin";
  const isTechSupport = currentUser?.role === "techsupport";

  useEffect(() => {
    fetchNotifications();
  }, [page, selectedUser]);

  const fetchNotifications = async () => {
    try {
      setLoading(true);

      const baseParams = {
        limit,
        offset: (page - 1) * limit,
        unread_only: false,
      };

      if (isAdmin || isTechSupport) {
        const [passwordRequestsRes, schedulesRes, moveRequestsRes, systemRes] =
          await Promise.all([
            passwordRequestsService.getAll({ status: "pending" }),
            labSchedulesService.getAll({ status: "pending" }),
            moveRequestsService.getAll({ status: "pending" }),
            notificationPreferencesService.getAllNotifications({
              ...baseParams,
              user_id: selectedUser || undefined,
            }),
          ]);

        // API shape can be either { data: Notification[], total } or { data: { data, total } }
        const systemNotifs =
          (systemRes.data as unknown as { data?: Notification[]; total?: number })
            ?.data ?? (systemRes.data as unknown as Notification[]) ?? [];

        const merged = buildRequestNotifications({
          passwordRequests: passwordRequestsRes.success
            ? passwordRequestsRes.data
            : [],
          schedules: schedulesRes.success ? schedulesRes.data : [],
          moveRequests: moveRequestsRes.success ? moveRequestsRes.data : [],
          systemNotifications: systemNotifs,
        });

        setNotifications(merged);
        setTotal(merged.length);
        setUnreadCount(merged.filter((n) => !n.read).length || merged.length);
        return;
      }

      const response = await notificationPreferencesService.getNotifications(
        baseParams
      );

      if (response.success && response.data) {
        const notifs = response.data.data || response.data;
        const mapped = notifs.map<RequestNotification>((notif: Notification) => ({
          id: `system-${notif.id}`,
          backendId: notif.id,
          category: "system",
          title: notif.title,
          message: notif.message,
          timestamp: notif.created_at,
          source: "System Notification",
          userName: notif.user_name,
          read: notif.read,
          canMarkRead: true,
        }));

        setNotifications(mapped);
        setTotal(mapped.length);
        setUnreadCount(response.data.total ?? mapped.length);
      }
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
      setMessage({
        type: "error",
        text: "Failed to load notifications",
      });
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (notification: RequestNotification) => {
    try {
      const backendId =
        notification.backendId && notification.canMarkRead
          ? notification.backendId
          : null;

      // Local-only or non-persisted notifications: mark in-memory
      if (!backendId) {
        // Mark as read locally so UI stays in sync
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notification.id ? { ...n, read: true } : n
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
        return;
      }

      if (isAdmin) {
        await notificationPreferencesService.markNotificationAsRead(
          backendId
        );
      } else {
        await notificationPreferencesService.markAsRead(backendId);
      }
      await fetchNotifications();
      setMessage({
        type: "success",
        text: "Notification marked as read",
      });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
      setMessage({
        type: "error",
        text: "Failed to mark notification as read",
      });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const hasBackendNotifications = notifications.some(
        (notif) => notif.backendId && notif.canMarkRead
      );

      if (hasBackendNotifications) {
        await notificationPreferencesService.markAllAsRead();
        await fetchNotifications();
      } else {
        // Local-only notifications – clear unread counter locally
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        setUnreadCount(0);
      }
      setMessage({
        type: "success",
        text: "All notifications marked as read",
      });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error("Failed to mark all as read:", error);
      setMessage({
        type: "error",
        text: "Failed to mark all notifications as read",
      });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleDelete = async (notification: RequestNotification) => {
    if (!isAdmin) return;

    if (!confirm("Are you sure you want to delete this notification?")) {
      return;
    }

    try {
      // Only backend notifications can be deleted
      if (!notification.backendId) {
        return;
      }

      await notificationPreferencesService.deleteNotification(
        notification.backendId
      );
      await fetchNotifications();
      setMessage({
        type: "success",
        text: "Notification deleted successfully",
      });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error("Failed to delete notification:", error);
      setMessage({
        type: "error",
        text: "Failed to delete notification",
      });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleDeleteAll = async () => {
    if (!isAdmin) return;

    if (
      !confirm(
        "Are you sure you want to delete all notifications? This action cannot be undone."
      )
    ) {
      return;
    }

    try {
      await notificationPreferencesService.deleteAllNotifications(
        selectedUser || undefined
      );
      await fetchNotifications();
      setMessage({
        type: "success",
        text: "All notifications deleted successfully",
      });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error("Failed to delete all notifications:", error);
      setMessage({
        type: "error",
        text: "Failed to delete all notifications",
      });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const filteredNotifications = notifications.filter((notification) => {
    // Apply read/unread filter
    if (filter === "unread" && notification.read) return false;
    if (filter === "read" && !notification.read) return false;

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      return (
        notification.title.toLowerCase().includes(searchLower) ||
        notification.message.toLowerCase().includes(searchLower) ||
        notification.category.toLowerCase().includes(searchLower) ||
        (notification.userName &&
          notification.userName.toLowerCase().includes(searchLower))
      );
    }
    return true;
  });

  const getNotificationTypeColor = (category: string) => {
    const typeColors: Record<string, string> = {
      pin_request: "bg-yellow-100 text-yellow-800",
      schedule_request: "bg-emerald-100 text-emerald-800",
      move_request: "bg-rose-100 text-rose-800",
      move_request_submitted: "bg-rose-100 text-rose-800",
      device_error: "bg-orange-100 text-orange-800",
      enrollment: "bg-blue-100 text-blue-800",
      system: "bg-gray-100 text-gray-800",
    };
    return typeColors[category] || "bg-gray-100 text-gray-800";
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Notification Management
          </h1>
          <p className="text-gray-600 mt-2">
            {isAdmin
              ? "Manage all system notifications"
              : isTechSupport
              ? "View all system notifications"
              : "View your notifications"}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {unreadCount > 0 && (
            <div className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
              {unreadCount} unread
            </div>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={handleMarkAllAsRead}
            disabled={unreadCount === 0}
          >
            <CheckIcon className="w-4 h-4 mr-2" />
            Mark All Read
          </Button>
          {isAdmin && (
            <Button
              size="sm"
              variant="danger"
              onClick={handleDeleteAll}
              disabled={notifications.length === 0}
            >
              <TrashIcon className="w-4 h-4 mr-2" />
              Delete All
            </Button>
          )}
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
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-4 pb-4 border-b">
            <div className="flex items-center space-x-2">
              <FilterIcon className="w-5 h-5 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Filter:</span>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => {
                  setFilter("all");
                  setPage(1);
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === "all"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                All ({total})
              </button>
              <button
                onClick={() => {
                  setFilter("unread");
                  setPage(1);
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === "unread"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Unread ({unreadCount})
              </button>
              <button
                onClick={() => {
                  setFilter("read");
                  setPage(1);
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === "read"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Read ({total - unreadCount})
              </button>
            </div>

            <div className="flex-1 max-w-md">
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search notifications..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          {/* Notifications List */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="text-center py-12">
              <BellIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 font-medium">No notifications found</p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {filteredNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      notification.read
                        ? "bg-gray-50 border-gray-200"
                        : "bg-blue-50 border-blue-200"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${getNotificationTypeColor(
                              notification.category
                            )}`}
                          >
                            {notification.category.replace(/_/g, " ")}
                          </span>
                          {!notification.read && (
                            <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                          )}
                        </div>
                        <h3 className="font-semibold text-gray-900 mb-1">
                          {notification.title}
                        </h3>
                        <p className="text-sm text-gray-600 mb-2">
                          {notification.message}
                        </p>
                        <div className="flex items-center space-x-4 text-xs text-gray-500">
                          <span>{formatDate(notification.timestamp)}</span>
                          {(isAdmin || isTechSupport) && notification.userName && (
                            <span>
                              User: {notification.userName}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 ml-4">
                        {!notification.read && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleMarkAsRead(notification)}
                            title="Mark as read"
                          >
                            <EyeIcon className="w-4 h-4" />
                          </Button>
                        )}
                        {notification.read && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleMarkAsRead(notification)}
                            title="Mark as unread"
                          >
                            <EyeOffIcon className="w-4 h-4" />
                          </Button>
                        )}
                        {isAdmin && (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => handleDelete(notification)}
                            title="Delete"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="text-sm text-gray-600">
                    Showing {(page - 1) * limit + 1} to{" "}
                    {Math.min(page * limit, total)} of {total} notifications
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Previous
                    </Button>
                    <span className="px-4 py-2 text-sm text-gray-700">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

