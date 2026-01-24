import { useState, useEffect, useRef } from "react";
import {
  BellIcon,
  UserIcon,
  CheckIcon,
  XIcon,
  CalendarIcon,
  KeyRoundIcon,
  MoveIcon,
} from "lucide-react";
import type { User } from "../../types";
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

interface HeaderProps {
  user: User;
  title: string;
  onNavigate?: (path: string) => void;
}

export function Header({ user, title, onNavigate }: HeaderProps) {
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState<RequestNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isAdmin = currentUser?.role === "admin";
  const isTechSupport = currentUser?.role === "techsupport";

  useEffect(() => {
    fetchNotifications();
    // Refresh notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const baseParams = {
        limit: 20,
        offset: 0,
        unread_only: true,
      };

      if (isAdmin || isTechSupport) {
        const [passwordRequestsRes, schedulesRes, moveRequestsRes, systemRes] =
          await Promise.all([
            passwordRequestsService.getAll({ status: "pending" }),
            labSchedulesService.getAll({ status: "pending" }),
            moveRequestsService.getAll({ status: "pending" }),
            notificationPreferencesService.getAllNotifications(baseParams),
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
        setUnreadCount(response.data.total ?? mapped.length);
      }
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (notification: RequestNotification) => {
    if (!notification.backendId) return;

    try {
      if (isAdmin) {
        await notificationPreferencesService.markNotificationAsRead(
          notification.backendId
        );
      } else {
        await notificationPreferencesService.markAsRead(notification.backendId);
      }
      await fetchNotifications();
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
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
        // Local-only notifications (requests) – just clear the unread counter
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        setUnreadCount(0);
      }
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  };

  const handleViewAll = () => {
    setIsOpen(false);
    if (onNavigate) {
      if (isAdmin) {
        onNavigate("/admin/notifications");
      } else if (isTechSupport) {
        onNavigate("/techsupport/notifications");
      } else {
        onNavigate("/teacher/notifications");
      }
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">{title}</h2>

        <div className="flex items-center space-x-4">
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 relative"
            >
              <BellIcon className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {isOpen && (
              <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">
                    Notifications {unreadCount > 0 && `(${unreadCount})`}
                  </h3>
                  <div className="flex items-center space-x-2">
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllAsRead}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Mark all read
                      </button>
                    )}
                    <button
                      onClick={() => setIsOpen(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="overflow-y-auto flex-1">
                  {loading ? (
                    <div className="p-8 text-center">
                      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                      <BellIcon className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                      <p>No new notifications</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-200">
                      {notifications.map((notification) => {
                        const categoryIcon = () => {
                          switch (notification.category) {
                            case "pin_request":
                              return <KeyRoundIcon className="w-4 h-4 text-yellow-600" />;
                            case "schedule_request":
                              return (
                                <CalendarIcon className="w-4 h-4 text-emerald-600" />
                              );
                            case "move_request":
                              return <MoveIcon className="w-4 h-4 text-rose-600" />;
                            default:
                              return <BellIcon className="w-4 h-4 text-gray-500" />;
                          }
                        };

                        const categoryLabel = () => {
                          switch (notification.category) {
                            case "pin_request":
                              return "PIN/Password";
                            case "schedule_request":
                              return "Schedule";
                            case "move_request":
                              return "Move/Change";
                            default:
                              return "System";
                          }
                        };

                        return (
                          <div
                            key={notification.id}
                            className="p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                            onClick={() => handleMarkAsRead(notification)}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  {categoryIcon()}
                                  <p className="text-sm font-medium text-gray-900">
                                    {notification.title}
                                  </p>
                                  <span className="text-[11px] uppercase tracking-wide text-gray-500">
                                    {categoryLabel()}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                                  {notification.message}
                                </p>
                                <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                                  <span>{formatDate(notification.timestamp)}</span>
                                  {(isAdmin || isTechSupport) && notification.userName && (
                                    <span>{notification.userName}</span>
                                  )}
                                </div>
                              </div>
                              {notification.backendId && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMarkAsRead(notification);
                                  }}
                                  className="ml-2 p-1 text-gray-400 hover:text-gray-600"
                                >
                                  <CheckIcon className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="p-3 border-t border-gray-200">
                  <button
                    onClick={handleViewAll}
                    className="w-full text-center text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    View all notifications
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-3 pl-4 border-l border-gray-200">
            <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
              <UserIcon className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{user.name}</p>
              <p className="text-xs text-gray-500">{user.email}</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
