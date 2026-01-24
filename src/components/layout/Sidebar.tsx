import {
  LayoutDashboardIcon,
  UsersIcon,
  UserCheckIcon,
  UserPlusIcon,
  CalendarIcon,
  ClockIcon,
  ActivityIcon,
  ShieldIcon,
  SettingsIcon,
  WrenchIcon,
  FileTextIcon,
  LogOutIcon,
  FileBarChartIcon,
  BellIcon,
  KeyIcon,
  BuildingIcon,
} from "lucide-react";
import type { UserRole } from "../../types";
import "../../styles/Sidebar.css";

interface SidebarProps {
  role: UserRole;
  currentPath: string;
  onNavigate: (path: string) => void;
  onLogout: () => void;
}

export function Sidebar({
  role,
  currentPath,
  onNavigate,
  onLogout,
}: SidebarProps) {
  const roleLabels: Record<"admin" | "teacher" | "techsupport", string> = {
    admin: "Administrator",
    teacher: "Teacher",
    techsupport: "Tech Support",
  };

  const adminMenuItems = [
    {
      icon: LayoutDashboardIcon,
      label: "Dashboard",
      path: "/admin",
    },
    {
      icon: UsersIcon,
      label: "User Management",
      path: "/admin/users",
    },
    {
      icon: UserPlusIcon,
      label: "User Enrollment",
      path: "/admin/enrollment",
    },
    {
      icon: CalendarIcon,
      label: "Schedules",
      path: "/admin/schedules",
    },
    {
      icon: ClockIcon,
      label: "Approval Queue",
      path: "/admin/approvals",
    },
    {
      icon: ActivityIcon,
      label: "Monitoring",
      path: "/admin/monitoring",
    },
    {
      icon: SettingsIcon,
      label: "System Config",
      path: "/admin/config",
    },
    {
      icon: KeyIcon,
      label: "Role Privileges",
      path: "/admin/privileges",
    },
    {
      icon: FileBarChartIcon,
      label: "Reports",
      path: "/admin/reports",
    },
    {
      icon: BellIcon,
      label: "Notifications",
      path: "/admin/notifications",
    },
    {
      icon: BuildingIcon,
      label: "Laboratories",
      path: "/admin/laboratories",
    },
    {
      icon: ShieldIcon,
      label: "Access Logs",
      path: "/admin/logs",
    },
  ];

  const teacherMenuItems = [
    {
      icon: LayoutDashboardIcon,
      label: "Dashboard",
      path: "/teacher",
    },
    {
      icon: CalendarIcon,
      label: "My Schedules",
      path: "/teacher/schedules",
    },
    {
      icon: ClockIcon,
      label: "Request Move",
      path: "/teacher/request-move",
    },
    {
      icon: FileTextIcon,
      label: "Access Logs",
      path: "/teacher/logs",
    },
    {
      icon: FileBarChartIcon,
      label: "Reports",
      path: "/teacher/reports",
    },
    {
      icon: BellIcon,
      label: "Notifications",
      path: "/teacher/notifications",
    },
  ];

  const techSupportMenuItems = [
    {
      icon: LayoutDashboardIcon,
      label: "Dashboard",
      path: "/techsupport",
    },
    {
      icon: ClockIcon,
      label: "Schedule Approvals",
      path: "/techsupport/approvals",
    },
    {
      icon: UsersIcon,
      label: "User Enrollment",
      path: "/techsupport/enrollment",
    },
    {
      icon: UserCheckIcon,
      label: "User Management",
      path: "/techsupport/users",
    },
    {
      icon: ActivityIcon,
      label: "System Monitoring",
      path: "/techsupport/monitoring",
    },
    {
      icon: ShieldIcon,
      label: "Access Logs",
      path: "/techsupport/logs",
    },
    {
      icon: WrenchIcon,
      label: "Device Status",
      path: "/techsupport/devices",
    },
    {
      icon: FileBarChartIcon,
      label: "Reports",
      path: "/techsupport/reports",
    },
    {
      icon: BellIcon,
      label: "Notifications",
      path: "/techsupport/notifications",
    },
  ];

  const menuItems =
    role === "admin"
      ? adminMenuItems
      : role === "teacher"
      ? teacherMenuItems
      : techSupportMenuItems;

  const getRoleLabel = (r: UserRole): string => {
    if (r === "admin" || r === "teacher" || r === "techsupport") {
      return roleLabels[r];
    }
    return "User";
  };

  const getSidebarClass = (r: UserRole): string => {
    if (r === "admin") return "sidebar sidebar-admin";
    if (r === "teacher") return "sidebar sidebar-teacher";
    if (r === "techsupport") return "sidebar sidebar-techsupport";
    return "sidebar sidebar-admin";
  };

  return (
    <div className={getSidebarClass(role)}>
      <div className="sidebar-header">
        <h1 className="sidebar-title">BioSecureLock</h1>
        <p className="sidebar-subtitle">{getRoleLabel(role)}</p>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-list">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPath === item.path;
            return (
              <button
                key={item.path}
                onClick={() => onNavigate(item.path)}
                className={`nav-item ${isActive ? "nav-item-active" : ""}`}
              >
                <Icon className="nav-icon" />
                <span className="nav-label">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className="sidebar-footer">
        <button onClick={onLogout} className="logout-button">
          <LogOutIcon className="nav-icon" />
          <span className="nav-label">Logout</span>
        </button>
      </div>
    </div>
  );
}