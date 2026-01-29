import { useState, useCallback } from "react";
import { useAuth } from "./hooks/useAuth";
import { LoginPage } from "./pages/LoginPage";
import { Sidebar } from "./components/layout/Sidebar";
import { Header } from "./components/layout/Header";
// Admin pages
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { UserManagement } from "./pages/admin/UserManagement";
import { ScheduleManagement } from "./pages/admin/ScheduleManagement";
import { ApprovalQueue } from "./pages/admin/ApprovalQueue";
import { MonitoringDashboard } from "./pages/admin/MonitoringDashboard";
import { SystemConfig } from "./pages/admin/SystemConfig";
import { ReportGeneration as AdminReportGeneration } from "./pages/admin/ReportGeneration";
import { RolePrivileges } from "./pages/admin/RolePrivileges";
import { NotificationManagement } from "./pages/admin/NotificationManagement";
import { UserEnrollment as AdminUserEnrollment } from "./pages/admin/UserEnrollment";
import { LaboratoryManagement } from "./pages/admin/LaboratoryManagement";
import { AdminAccessLogs } from "./pages/admin/AdminAccessLogs";
import { SemesterList } from "./pages/admin/SemesterList";
import { ScheduleTemplates } from "./pages/admin/ScheduleTemplates";
import { GeneratedSchedules } from "./pages/admin/GeneratedSchedules";
import { ScheduleChangeRequests } from "./pages/admin/ScheduleChangeRequests";
import { ScheduleAuditTrail } from "./pages/admin/ScheduleAuditTrail";
// Teacher pages
import { TeacherDashboard } from "./pages/teacher/TeacherDashboard";
import { MySchedules } from "./pages/teacher/MySchedules";
import { RequestMove } from "./pages/teacher/RequestMove";
import { AccessLogs } from "./pages/teacher/AccessLogs";
import { ReportGeneration as TeacherReportGeneration } from "./pages/teacher/ReportGeneration";
// Tech Support pages
import { TechSupportDashboard } from "./pages/support/TechSupportDashboard";
import { ScheduleApprovals } from "./pages/support/ScheduleApprovals";
import { UserEnrollment } from "./pages/support/UserEnrollment";
import { UserManagement as TechSupportUserManagement } from "./pages/support/UserManagement";
import { SystemMonitoring } from "./pages/support/SystemMonitoring";
import { TechSupportAccessLogs } from "./pages/support/TechSupportAccessLogs";
import { DeviceStatus } from "./pages/support/DeviceStatus";
import { ReportGeneration as TechSupportReportGeneration } from "./pages/support/ReportGeneration";
import { NotificationPreferences } from "./pages/NotificationPreferences";

export function App() {
  const { currentUser, isLoading, error, login, logout } = useAuth();
  const [currentPath, setCurrentPath] = useState("/admin");

  const handleLogin = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      const user = await login(email, password);
      if (user) {
        // Set initial path based on role
        if (user.role === "admin") {
          setCurrentPath("/admin");
        } else if (user.role === "teacher") {
          setCurrentPath("/teacher");
        } else {
          setCurrentPath("/techsupport");
        }
        return true;
      }
      return false;
    },
    [login],
  );
  const handleLogout = () => {
    logout();
    setCurrentPath("/admin");
  };
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }
  if (!currentUser) {
    return (
      <LoginPage onLogin={handleLogin} isLoading={isLoading} error={error} />
    );
  }
  const getPageTitle = () => {
    const titles: Record<string, string> = {
      // Admin
      "/admin": "Dashboard",
      "/admin/users": "User Management",
      "/admin/enrollment": "User Enrollment",
      "/admin/schedules": "Schedule Management",
      "/admin/approvals": "Approval Queue",
      "/admin/monitoring": "Real-Time Monitoring",
      "/admin/config": "System Configuration",
      "/admin/privileges": "Role Privileges",
      "/admin/reports": "Generate Reports",
      "/admin/notifications": "Notification Preferences",
      "/admin/laboratories": "Laboratory Management",
      "/admin/semesters": "Semesters",
      "/admin/schedule-templates": "Schedule Templates",
      "/admin/semester-schedules": "Generated Schedules",
      "/admin/schedule-changes": "Change Requests",
      "/admin/audit-trail": "Audit Trail",
      // Teacher
      "/teacher": "Dashboard",
      "/teacher/schedules": "My Schedules",
      "/teacher/request-move": "Request Schedule Move",
      "/teacher/logs": "My Access Logs",
      "/teacher/reports": "Generate Reports",
      "/teacher/notifications": "Notification Preferences",
      // Tech Support
      "/techsupport": "Dashboard",
      "/techsupport/approvals": "Schedule Approvals",
      "/techsupport/enrollment": "User Enrollment",
      "/techsupport/users": "User Management",
      "/techsupport/monitoring": "System Monitoring",
      "/techsupport/logs": "Access Logs",
      "/techsupport/devices": "Device Status",
      "/techsupport/reports": "Generate Reports",
      "/techsupport/notifications": "Notification Preferences",
    };
    return titles[currentPath] || "Dashboard";
  };
  const renderPage = () => {
    // Admin routes
    if (currentUser.role === "admin") {
      switch (currentPath) {
        case "/admin":
          return <AdminDashboard />;
        case "/admin/users":
          return <UserManagement />;
        case "/admin/enrollment":
          return <AdminUserEnrollment />;
        case "/admin/schedules":
          return <ScheduleManagement />;
        case "/admin/approvals":
          return <ApprovalQueue />;
        case "/admin/monitoring":
          return <MonitoringDashboard />;
        case "/admin/config":
          return <SystemConfig />;
        case "/admin/privileges":
          return <RolePrivileges />;
        case "/admin/reports":
          return <AdminReportGeneration />;
        case "/admin/notifications":
          return <NotificationManagement />;
        case "/admin/laboratories":
          return <LaboratoryManagement />;
        case "/admin/logs":
          return <AdminAccessLogs />;
        case "/admin/semesters":
          return <SemesterList />;
        case "/admin/schedule-templates":
          return <ScheduleTemplates />;
        case "/admin/semester-schedules":
          return <GeneratedSchedules />;
        case "/admin/schedule-changes":
          return <ScheduleChangeRequests />;
        case "/admin/audit-trail":
          return <ScheduleAuditTrail />;
        default:
          return <AdminDashboard />;
      }
    }
    // Teacher routes
    if (currentUser.role === "teacher") {
      switch (currentPath) {
        case "/teacher":
          return <TeacherDashboard teacherId={currentUser.id} />;
        case "/teacher/schedules":
          return <MySchedules teacherId={currentUser.id} />;
        case "/teacher/request-move":
          return <RequestMove teacherId={currentUser.id} />;
        case "/teacher/logs":
          return <AccessLogs teacherId={currentUser.id} />;
        case "/teacher/reports":
          return <TeacherReportGeneration teacherId={currentUser.id} />;
        case "/teacher/notifications":
          return <NotificationPreferences />;
        default:
          return <TeacherDashboard teacherId={currentUser.id} />;
      }
    }
    // Tech Support routes
    if (currentUser.role === "techsupport") {
      switch (currentPath) {
        case "/techsupport":
          return <TechSupportDashboard />;
        case "/techsupport/approvals":
          return <ScheduleApprovals />;
        case "/techsupport/enrollment":
          return <UserEnrollment />;
        case "/techsupport/users":
          return <TechSupportUserManagement />;
        case "/techsupport/monitoring":
          return <SystemMonitoring />;
        case "/techsupport/logs":
          return <TechSupportAccessLogs />;
        case "/techsupport/devices":
          return <DeviceStatus />;
        case "/techsupport/reports":
          return <TechSupportReportGeneration />;
        case "/techsupport/notifications":
          return <NotificationManagement />;
        default:
          return <TechSupportDashboard />;
      }
    }
    return <AdminDashboard />;
  };
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        role={currentUser.role}
        currentPath={currentPath}
        onNavigate={setCurrentPath}
        onLogout={handleLogout}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          user={currentUser}
          title={getPageTitle()}
          onNavigate={setCurrentPath}
        />

        <main className="flex-1 overflow-y-auto p-6">{renderPage()}</main>
      </div>
    </div>
  );
}
