import { useEffect, useState } from "react";
import { CheckIcon, XIcon, ClockIcon, KeyRoundIcon, DownloadIcon, FileTextIcon, FileSpreadsheetIcon, CalendarIcon } from "lucide-react";
import { Card } from "../../components/common/Card";
import { Button } from "../../components/common/Button";
import { Badge } from "../../components/common/Badge";
import { Table } from "../../components/common/Table";
import { Modal } from "../../components/common/Modal";
import { Input } from "../../components/common/Input";
import {
  moveRequestsService,
  labSchedulesService,
  passwordRequestsService,
  type MoveRequest,
  type LabSchedule,
  type PasswordRequest,
} from "../../services";
import { useAlert } from "../../contexts/AlertContext";
import type { Schedule } from "../../types";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export function ScheduleApprovals() {
  const { showAlert } = useAlert();
  const [requests, setRequests] = useState<MoveRequest[]>([]);
  const [pendingSchedules, setPendingSchedules] = useState<LabSchedule[]>([]);
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);
  const [passwordRequests, setPasswordRequests] = useState<PasswordRequest[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"pending" | "all">("pending");
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  const [exportFormat, setExportFormat] = useState<"pdf" | "csv">("pdf");

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchRequests(),
        fetchPendingSchedules(),
        fetchPasswordRequests(),
        fetchAllSchedules(),
      ]);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRequests = async () => {
    try {
      const response = await moveRequestsService.getAll();
      if (response.success && response.data) {
        setRequests(response.data);
      }
    } catch (error) {
      console.error("Failed to fetch requests:", error);
    }
  };

  const fetchPendingSchedules = async () => {
    try {
      const response = await labSchedulesService.getAll({ status: "pending" });
      if (response.success && response.data) {
        setPendingSchedules(response.data);
      }
    } catch (error) {
      console.error("Failed to fetch pending schedules:", error);
    }
  };

  const fetchPasswordRequests = async () => {
    try {
      const response = await passwordRequestsService.getAll();
      if (response.success && response.data) {
        setPasswordRequests(response.data);
      }
    } catch (error) {
      console.error("Failed to fetch password requests:", error);
    }
  };

  const fetchAllSchedules = async () => {
    try {
      const response = await labSchedulesService.getAll();
      if (response.success && response.data) {
        setAllSchedules(
          response.data.map((s) => ({
            id: s.id,
            labName: s.labName,
            teacherId: s.teacherId,
            teacherName: s.teacherName,
            startTime: new Date(s.startTime),
            endTime: new Date(s.endTime),
            subject: s.subject,
            status: s.status as Schedule["status"],
            createdBy: s.createdBy || "",
            createdAt: new Date(s.createdAt),
          }))
        );
      }
    } catch (error) {
      console.error("Failed to fetch all schedules:", error);
    }
  };

  const handleApprove = async (requestId: string) => {
    try {
      await moveRequestsService.approve(parseInt(requestId));
      fetchRequests();
    } catch (error) {
      console.error("Failed to approve:", error);
      showAlert("Failed to approve request. Please try again.", "error");
    }
  };

  const handleDeny = async (requestId: string) => {
    const reason = prompt("Enter denial reason (optional):");
    try {
      await moveRequestsService.deny(parseInt(requestId), reason || undefined);
      fetchRequests();
    } catch (error) {
      console.error("Failed to deny:", error);
      showAlert("Failed to deny request. Please try again.", "error");
    }
  };

  const handleApproveSchedule = async (scheduleId: string) => {
    try {
      await labSchedulesService.approve(parseInt(scheduleId));
      await Promise.all([fetchPendingSchedules(), fetchAllSchedules()]);
    } catch (error) {
      console.error("Failed to approve schedule:", error);
      showAlert("Failed to approve schedule. Please try again.", "error");
    }
  };

  const handleDisapproveSchedule = async (scheduleId: string) => {
    const reason = prompt("Enter denial reason (optional):");
    try {
      await labSchedulesService.disapprove(
        parseInt(scheduleId),
        reason || undefined
      );
      await Promise.all([fetchPendingSchedules(), fetchAllSchedules()]);
    } catch (error) {
      console.error("Failed to disapprove schedule:", error);
      showAlert("Failed to disapprove schedule. Please try again.", "error");
    }
  };

  const handleApprovePassword = async (requestId: number) => {
    try {
      await passwordRequestsService.approve(requestId);
      fetchPasswordRequests();
      showAlert(
        "Password request approved and temporary password created successfully!",
        "success"
      );
    } catch (error: any) {
      console.error("Failed to approve password request:", error);
      showAlert(
        error.response?.data?.error ||
          error.message ||
          "Failed to approve password request. Please try again.",
        "error"
      );
    }
  };

  const handleRejectPassword = async (requestId: number) => {
    const reason = prompt("Enter rejection reason (optional):");
    try {
      await passwordRequestsService.reject(requestId, reason || undefined);
      fetchPasswordRequests();
    } catch (error) {
      console.error("Failed to reject password request:", error);
      showAlert("Failed to reject password request. Please try again.", "error");
    }
  };

  // Filter schedules based on date range for export
  const getFilteredSchedules = (startDate: string, endDate: string) => {
    if (!startDate && !endDate) {
      return allSchedules;
    }

    return allSchedules.filter((schedule) => {
      const scheduleDate = schedule.startTime;
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      if (start && end) {
        // Set end date to end of day
        end.setHours(23, 59, 59, 999);
        return scheduleDate >= start && scheduleDate <= end;
      } else if (start) {
        return scheduleDate >= start;
      } else if (end) {
        end.setHours(23, 59, 59, 999);
        return scheduleDate <= end;
      }

      return true;
    });
  };

  const handleExport = () => {
    const filteredSchedules = getFilteredSchedules(exportStartDate, exportEndDate);
    
    if (filteredSchedules.length === 0) {
      showAlert("No schedules to export. Please adjust your date filter.", "warning");
      return;
    }

    if (exportFormat === "pdf") {
      handleExportPDF(filteredSchedules);
    } else {
      handleExportCSV(filteredSchedules);
    }

    // Close modal after export
    setIsExportModalOpen(false);
    setExportStartDate("");
    setExportEndDate("");
  };

  const handleExportPDF = (schedulesToExport: Schedule[]) => {
    try {
      const doc = new jsPDF();
      
      // Add title
      doc.setFontSize(18);
      doc.text("Schedule Report", 14, 22);
      
      // Add date range info
      doc.setFontSize(10);
      const dateRangeText = exportStartDate || exportEndDate
        ? `Date Range: ${exportStartDate || "All"} to ${exportEndDate || "All"}`
        : "Date Range: All schedules";
      doc.text(dateRangeText, 14, 30);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 36);
      doc.text(`Total Schedules: ${schedulesToExport.length}`, 14, 42);

      // Prepare table data
      const tableData = schedulesToExport.map((schedule) => [
        schedule.labName,
        schedule.subject || "N/A",
        schedule.startTime.toLocaleDateString(),
        schedule.startTime.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }) +
          " - " +
          schedule.endTime.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        schedule.teacherName || "N/A",
        schedule.status,
      ]);

      // Add table
      autoTable(doc, {
        startY: 48,
        head: [["Laboratory", "Subject", "Date", "Time", "Teacher", "Status"]],
        body: tableData,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [59, 130, 246] }, // blue-500
        alternateRowStyles: { fillColor: [249, 250, 251] },
      });

      // Save PDF
      const fileName = `schedules_${exportStartDate || "all"}_${exportEndDate || "all"}_${Date.now()}.pdf`;
      doc.save(fileName);
      showAlert("PDF exported successfully!", "success");
    } catch (error) {
      console.error("Failed to export PDF:", error);
      showAlert("Failed to export PDF. Please try again.", "error");
    }
  };

  const handleExportCSV = (schedulesToExport: Schedule[]) => {
    try {
      // CSV headers
      const headers = [
        "Laboratory Name",
        "Subject",
        "Date",
        "Start Time",
        "End Time",
        "Teacher",
        "Status",
      ];

      // CSV rows
      const rows = schedulesToExport.map((schedule) => [
        schedule.labName,
        schedule.subject || "N/A",
        schedule.startTime.toLocaleDateString(),
        schedule.startTime.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        schedule.endTime.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        schedule.teacherName || "N/A",
        schedule.status,
      ]);

      // Combine headers and rows
      const csvContent = [headers, ...rows]
        .map((row) => row.map((cell) => `"${cell}"`).join(","))
        .join("\n");

      // Create blob and download
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `schedules_${exportStartDate || "all"}_${exportEndDate || "all"}_${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      showAlert("CSV exported successfully!", "success");
    } catch (error) {
      console.error("Failed to export CSV:", error);
      showAlert("Failed to export CSV. Please try again.", "error");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const reviewedRequests = requests.filter((r) => r.status !== "pending");
  const pendingPasswordRequests = passwordRequests.filter(
    (r) => r.status === "pending"
  );
  const reviewedPasswordRequests = passwordRequests.filter(
    (r) => r.status !== "pending"
  );

  return (
    <div className="space-y-6">
      {/* Tabs Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("pending")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "pending"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <ClockIcon className="w-4 h-4 inline mr-2" />
            Pending Approvals
          </button>
          <button
            onClick={() => setActiveTab("all")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "all"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <CalendarIcon className="w-4 h-4 inline mr-2" />
            All Schedules
          </button>
        </nav>
      </div>

      {/* Pending Approvals Tab Content */}
      {activeTab === "pending" && (
        <div className="space-y-6">
          {/* Password Requests Section */}
          <Card title="Pending Password Requests">
            {pendingPasswordRequests.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <KeyRoundIcon className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p>No pending password requests</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingPasswordRequests.map((request) => (
                  <div
                    key={request.id}
                    className="border border-gray-200 rounded-lg p-6"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {request.userName}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {request.labName} - {request.passwordName}
                        </p>
                        <p className="text-xs text-gray-500">{request.userEmail}</p>
                      </div>
                      <Badge variant="warning">Pending</Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-6 mb-4">
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-1">
                          Schedule
                        </p>
                        <p className="text-sm text-gray-600">
                          {new Date(request.scheduleStartTime).toLocaleString()} -{" "}
                          {new Date(request.scheduleEndTime).toLocaleTimeString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-1">
                          Password Validity
                        </p>
                        <p className="text-sm text-gray-600">
                          {new Date(request.validFrom).toLocaleString()} -{" "}
                          {new Date(request.validUntil).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-1">
                          Password
                        </p>
                        <p className="text-sm font-mono text-gray-900">
                          {request.password}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-1">
                          Max Usage
                        </p>
                        <p className="text-sm text-gray-600">
                          {request.maxUsage === 1 ? "Once" : "Multiple"}
                        </p>
                      </div>
                    </div>

                    {request.phone && (
                      <div className="mb-4">
                        <p className="text-sm font-medium text-gray-700 mb-1">
                          Phone
                        </p>
                        <p className="text-sm text-gray-600">{request.phone}</p>
                      </div>
                    )}

                    <div className="flex space-x-3">
                      <Button
                        variant="success"
                        size="sm"
                        onClick={() => handleApprovePassword(request.id)}
                      >
                        <CheckIcon className="w-4 h-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleRejectPassword(request.id)}
                      >
                        <XIcon className="w-4 h-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {reviewedPasswordRequests.length > 0 && (
            <Card title="Recently Reviewed Password Requests">
              <div className="space-y-3">
                {reviewedPasswordRequests.map((request) => (
                  <div
                    key={request.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {request.userName} - {request.passwordName}
                      </p>
                      <p className="text-sm text-gray-600">{request.labName}</p>
                      {request.approvedAt && (
                        <p className="text-xs text-gray-500">
                          Reviewed on{" "}
                          {new Date(request.approvedAt).toLocaleString()}
                          {request.approvedByName &&
                            ` by ${request.approvedByName}`}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant={
                        request.status === "approved"
                          ? "success"
                          : request.status === "rejected"
                          ? "danger"
                          : "info"
                      }
                    >
                      {request.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card title="Pending Schedule Approvals">
            {pendingSchedules.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <ClockIcon className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p>No pending schedule approvals</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingSchedules.map((schedule) => (
                  <div
                    key={schedule.id}
                    className="border border-gray-200 rounded-lg p-6"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {schedule.teacherName}
                        </h3>
                        <p className="text-sm text-gray-600">{schedule.labName}</p>
                      </div>
                      <Badge variant="warning">Pending</Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-6 mb-4">
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-1">
                          Start Time
                        </p>
                        <p className="text-sm text-gray-600">
                          {new Date(schedule.startTime).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-1">
                          End Time
                        </p>
                        <p className="text-sm text-gray-600">
                          {new Date(schedule.endTime).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {schedule.subject && (
                      <div className="mb-4">
                        <p className="text-sm font-medium text-gray-700 mb-1">
                          Subject
                        </p>
                        <p className="text-sm text-gray-600">{schedule.subject}</p>
                      </div>
                    )}

                    <div className="flex space-x-3">
                      <Button
                        variant="success"
                        size="sm"
                        onClick={() => handleApproveSchedule(schedule.id)}
                      >
                        <CheckIcon className="w-4 h-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDisapproveSchedule(schedule.id)}
                      >
                        <XIcon className="w-4 h-4 mr-1" />
                        Disapprove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Pending Schedule Move Requests">
            {pendingRequests.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <ClockIcon className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p>No pending schedule requests</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingRequests.map((request) => (
                  <div
                    key={request.id}
                    className="border border-gray-200 rounded-lg p-6"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {request.teacherName}
                        </h3>
                        <p className="text-sm text-gray-600">{request.labName}</p>
                      </div>
                      <Badge variant="warning">Pending</Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-6 mb-4">
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-1">
                          Current Schedule
                        </p>
                        <p className="text-sm text-gray-600">
                          {new Date(request.currentStartTime).toLocaleString()} -{" "}
                          {new Date(request.currentEndTime).toLocaleTimeString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-1">
                          Requested Schedule
                        </p>
                        <p className="text-sm text-gray-600">
                          {new Date(request.requestedStartTime).toLocaleString()} -{" "}
                          {new Date(request.requestedEndTime).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>

                    <div className="mb-4">
                      <p className="text-sm font-medium text-gray-700 mb-1">
                        Reason
                      </p>
                      <p className="text-sm text-gray-600">{request.reason}</p>
                    </div>

                    <div className="flex space-x-3">
                      <Button
                        variant="success"
                        size="sm"
                        onClick={() => handleApprove(request.id)}
                      >
                        <CheckIcon className="w-4 h-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDeny(request.id)}
                      >
                        <XIcon className="w-4 h-4 mr-1" />
                        Deny
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {reviewedRequests.length > 0 && (
            <Card title="Recently Reviewed">
              <div className="space-y-3">
                {reviewedRequests.map((request) => (
                  <div
                    key={request.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {request.teacherName}
                      </p>
                      <p className="text-sm text-gray-600">{request.labName}</p>
                      {request.reviewedAt && (
                        <p className="text-xs text-gray-500">
                          Reviewed on{" "}
                          {new Date(request.reviewedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant={request.status === "approved" ? "success" : "danger"}
                    >
                      {request.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* All Schedules Tab Content */}
      {activeTab === "all" && (
        <Card
          title="All Schedules"
          action={
            <Button
              onClick={() => setIsExportModalOpen(true)}
              variant="secondary"
              size="sm"
              disabled={allSchedules.length === 0}
            >
              <DownloadIcon className="w-4 h-4 mr-2" />
              Export Schedules
            </Button>
          }
        >
          {allSchedules.length > 0 ? (
            <Table data={allSchedules} columns={[
              {
                header: "Laboratory Name",
                accessor: "labName" as keyof Schedule,
              },
              {
                header: "Subject",
                accessor: (schedule: Schedule) => schedule.subject || "N/A",
              },
              {
                header: "Time of Access",
                accessor: (schedule: Schedule) => {
                  const startTime = schedule.startTime.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const endTime = schedule.endTime.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const date = schedule.startTime.toLocaleDateString();
                  return `${date} ${startTime} - ${endTime}`;
                },
              },
              {
                header: "Teacher",
                accessor: (schedule: Schedule) => schedule.teacherName || "N/A",
              },
              {
                header: "Status",
                accessor: (schedule: Schedule) => (
                  <Badge
                    variant={
                      schedule.status === "pending"
                        ? "warning"
                        : schedule.status === "scheduled"
                        ? "info"
                        : schedule.status === "completed"
                        ? "success"
                        : "danger"
                    }
                  >
                    {schedule.status}
                  </Badge>
                ),
              },
            ]} />
          ) : (
            <p className="text-center text-gray-500 py-8">No schedules found</p>
          )}
        </Card>
      )}

      {/* Export Modal */}
      <Modal
        isOpen={isExportModalOpen}
        onClose={() => {
          setIsExportModalOpen(false);
          setExportStartDate("");
          setExportEndDate("");
        }}
        title="Export Schedules"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Select a date range and export format to export schedules.
          </p>

          {/* Export Format Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Export Format
            </label>
            <div className="flex gap-4">
              <button
                onClick={() => setExportFormat("pdf")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                  exportFormat === "pdf"
                    ? "bg-blue-50 border-blue-500 text-blue-700"
                    : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                <FileTextIcon className="w-5 h-5" />
                PDF
              </button>
              <button
                onClick={() => setExportFormat("csv")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                  exportFormat === "csv"
                    ? "bg-blue-50 border-blue-500 text-blue-700"
                    : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                <FileSpreadsheetIcon className="w-5 h-5" />
                CSV
              </button>
            </div>
          </div>

          {/* Date Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date Range (Optional)
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Start Date
                </label>
                <Input
                  type="date"
                  value={exportStartDate}
                  onChange={(e) => setExportStartDate(e.target.value)}
                  placeholder="Select start date"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  End Date
                </label>
                <Input
                  type="date"
                  value={exportEndDate}
                  onChange={(e) => setExportEndDate(e.target.value)}
                  placeholder="Select end date"
                />
              </div>
            </div>
            {(exportStartDate || exportEndDate) && (
              <p className="text-xs text-gray-600 mt-2">
                {(() => {
                  const filtered = getFilteredSchedules(exportStartDate, exportEndDate);
                  return `Will export ${filtered.length} of ${allSchedules.length} schedules`;
                })()}
              </p>
            )}
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsExportModalOpen(false);
                setExportStartDate("");
                setExportEndDate("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleExport}>
              Export {exportFormat.toUpperCase()}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
