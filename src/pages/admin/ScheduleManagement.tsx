import React, { useState, useEffect } from "react";
import { PlusIcon, DownloadIcon, FileTextIcon, FileSpreadsheetIcon, TrashIcon } from "lucide-react";
import { Card } from "../../components/common/Card";
import { Button } from "../../components/common/Button";
import { Badge } from "../../components/common/Badge";
import { Table } from "../../components/common/Table";
import { Modal } from "../../components/common/Modal";
import { Input } from "../../components/common/Input";
import {
  labSchedulesService,
  usersService,
  laboratoriesService,
  type LabSchedule,
  type Teacher,
  type Laboratory,
} from "../../services";
import type { Schedule } from "../../types";
import { useAlert } from "../../contexts/AlertContext";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import "../../styles/ScheduleManagement.css";

const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];

export function ScheduleManagement() {
  const { showAlert } = useAlert();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [laboratories, setLaboratories] = useState<Laboratory[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [scheduleToDelete, setScheduleToDelete] = useState<Schedule | null>(null);
  
  const [formData, setFormData] = useState({
    labName: "",
    teacherId: "",
    startTime: "",
    endTime: "",
    subject: "",
    recurrenceType: "weekly" as "one-time" | "weekly",
    daysOfWeek: [] as string[],
    recurrenceEndDate: "",
  });
  
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  const [exportFormat, setExportFormat] = useState<"pdf" | "csv">("pdf");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [schedulesRes, teachersRes, laboratoriesRes] = await Promise.all([
        labSchedulesService.getAll(),
        usersService.getTeachers(),
        laboratoriesService.getAll(),
      ]);

      if (schedulesRes.success && schedulesRes.data) {
        setSchedules(
          schedulesRes.data.map((s: any) => ({
            id: s.id,
            labName: s.labName,
            teacherId: s.teacherId,
            teacherName: s.teacherName,
            startTime: s.recurrenceType === "weekly" ? s.startTime : new Date(s.startTime),
            endTime: s.recurrenceType === "weekly" ? s.endTime : new Date(s.endTime),
            subject: s.subject,
            status: s.status,
            recurrenceType: s.recurrenceType || "one-time",
            daysOfWeek: s.daysOfWeek || [],
            recurrenceEndDate: s.recurrenceEndDate,
            createdBy: s.createdBy || "",
            createdAt: new Date(s.createdAt),
          }))
        );
      }

      if (teachersRes.success && teachersRes.data) {
        setTeachers(teachersRes.data);
      }

      if (laboratoriesRes.success && laboratoriesRes.data) {
        setLaboratories(laboratoriesRes.data);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  // Validation for weekly schedules
  if (formData.recurrenceType === "weekly" && formData.daysOfWeek.length === 0) {
    showAlert("Please select at least one day of the week for weekly schedules", "error");
    return;
  }

  try {
    const submitData: any = {
      labName: formData.labName,
      teacherId: parseInt(formData.teacherId),
      subject: formData.subject,
      recurrenceType: formData.recurrenceType,
    };

    if (formData.recurrenceType === "weekly") {
      // For weekly schedules, send just time (HH:MM)
      submitData.startTime = formData.startTime; // Should be "14:00" format
      submitData.endTime = formData.endTime;     // Should be "16:00" format
      submitData.daysOfWeek = formData.daysOfWeek; // Should be ["Tuesday", "Thursday"]
      submitData.recurrenceEndDate = formData.recurrenceEndDate || null;
    } else {
      // For one-time schedules, send full datetime ISO string
      submitData.startTime = new Date(formData.startTime).toISOString();
      submitData.endTime = new Date(formData.endTime).toISOString();
      submitData.daysOfWeek = [];
      submitData.recurrenceEndDate = null;
    }

    console.log("Submitting schedule data:", submitData); // Debug log

    await labSchedulesService.create(submitData);

    setIsModalOpen(false);
    setFormData({
      labName: "",
      teacherId: "",
      startTime: "",
      endTime: "",
      subject: "",
      recurrenceType: "weekly",
      daysOfWeek: [],
      recurrenceEndDate: "",
    });
    fetchData();
    showAlert("Schedule created successfully!", "success");
  } catch (error) {
    console.error("Failed to create schedule:", error);
    showAlert("Failed to create schedule. Please try again.", "error");
  }
};

  const toggleDayOfWeek = (day: string) => {
    setFormData(prev => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(day)
        ? prev.daysOfWeek.filter(d => d !== day)
        : [...prev.daysOfWeek, day]
    }));
  };

  const handleDeleteClick = (schedule: Schedule) => {
    setScheduleToDelete(schedule);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!scheduleToDelete) return;

    try {
      const response = await labSchedulesService.delete(scheduleToDelete.id);
      
      if (response.success) {
        showAlert("Schedule deleted successfully!", "success");
        setIsDeleteModalOpen(false);
        setScheduleToDelete(null);
        fetchData();
      } else {
        showAlert("Failed to delete schedule. Please try again.", "error");
      }
    } catch (error) {
      console.error("Failed to delete schedule:", error);
      showAlert("Failed to delete schedule. Please try again.", "error");
    }
  };

  const handleDeleteCancel = () => {
    setIsDeleteModalOpen(false);
    setScheduleToDelete(null);
  };

  const getFilteredSchedules = (startDate: string, endDate: string) => {
    if (!startDate && !endDate) {
      return schedules;
    }

    return schedules.filter((schedule) => {
      // For weekly schedules, include all since they're recurring
      if (schedule.recurrenceType === "weekly") {
        if (schedule.recurrenceEndDate) {
          const endDateObj = new Date(schedule.recurrenceEndDate);
          const filterStart = startDate ? new Date(startDate) : null;
          if (filterStart && endDateObj < filterStart) {
            return false;
          }
        }
        return true;
      }

      // For one-time schedules, filter by date
      const scheduleDate = schedule.startTime as Date;
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      if (start && end) {
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

    setIsExportModalOpen(false);
    setExportStartDate("");
    setExportEndDate("");
  };

  const handleExportPDF = (schedulesToExport: Schedule[]) => {
    try {
      const doc = new jsPDF();
      
      doc.setFontSize(18);
      doc.text("Schedule Report", 14, 22);
      
      doc.setFontSize(10);
      const dateRangeText = exportStartDate || exportEndDate
        ? `Date Range: ${exportStartDate || "All"} to ${exportEndDate || "All"}`
        : "Date Range: All schedules";
      doc.text(dateRangeText, 14, 30);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 36);
      doc.text(`Total Schedules: ${schedulesToExport.length}`, 14, 42);

      const tableData = schedulesToExport.map((schedule) => {
        if (schedule.recurrenceType === "weekly") {
          return [
            schedule.labName,
            schedule.subject || "N/A",
            schedule.daysOfWeek?.join(", ") || "N/A",
            `${schedule.startTime} - ${schedule.endTime}`,
            schedule.teacherName || "N/A",
            "Weekly",
          ];
        } else {
          return [
            schedule.labName,
            schedule.subject || "N/A",
            (schedule.startTime as Date).toLocaleDateString(),
            (schedule.startTime as Date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) +
              " - " +
              (schedule.endTime as Date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            schedule.teacherName || "N/A",
            "One-time",
          ];
        }
      });

      autoTable(doc, {
        startY: 48,
        head: [["Laboratory", "Subject", "Days/Date", "Time", "Teacher", "Type"]],
        body: tableData,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [147, 51, 234] },
        alternateRowStyles: { fillColor: [250, 245, 255] },
      });

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
      const headers = [
        "Laboratory Name",
        "Subject",
        "Days/Date",
        "Start Time",
        "End Time",
        "Teacher",
        "Type",
      ];

      const rows = schedulesToExport.map((schedule) => {
        if (schedule.recurrenceType === "weekly") {
          return [
            schedule.labName,
            schedule.subject || "N/A",
            schedule.daysOfWeek?.join(", ") || "N/A",
            schedule.startTime,
            schedule.endTime,
            schedule.teacherName || "N/A",
            "Weekly",
          ];
        } else {
          return [
            schedule.labName,
            schedule.subject || "N/A",
            (schedule.startTime as Date).toLocaleDateString(),
            (schedule.startTime as Date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            (schedule.endTime as Date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            schedule.teacherName || "N/A",
            "One-time",
          ];
        }
      });

      const csvContent = [headers, ...rows]
        .map((row) => row.map((cell) => `"${cell}"`).join(","))
        .join("\n");

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

  const columns = [
    {
      header: "Laboratory Name",
      accessor: "labName" as keyof Schedule,
    },
    {
      header: "Subject",
      accessor: (schedule: Schedule) => schedule.subject || "N/A",
    },
    {
      header: "Schedule",
      accessor: (schedule: Schedule) => {
        if (schedule.recurrenceType === "weekly") {
          return (
            <div>
              <div className="font-semibold">{schedule.daysOfWeek?.join(", ")}</div>
              <div className="text-sm text-gray-600">
                {schedule.startTime} - {schedule.endTime}
              </div>
              {schedule.recurrenceEndDate && (
                <div className="text-xs text-gray-500">
                  Until: {new Date(schedule.recurrenceEndDate).toLocaleDateString()}
                </div>
              )}
            </div>
          );
        } else {
          const startTime = (schedule.startTime as Date).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
          const endTime = (schedule.endTime as Date).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
          const date = (schedule.startTime as Date).toLocaleDateString();
          return `${date} ${startTime} - ${endTime}`;
        }
      },
    },
    {
      header: "Teacher",
      accessor: (schedule: Schedule) => schedule.teacherName || "N/A",
    },
    {
      header: "Type",
      accessor: (schedule: Schedule) => (
        <Badge variant={schedule.recurrenceType === "weekly" ? "info" : "secondary"}>
          {schedule.recurrenceType === "weekly" ? "Weekly" : "One-time"}
        </Badge>
      ),
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
    {
      header: "Actions",
      accessor: (schedule: Schedule) => (
        <Button
          onClick={() => handleDeleteClick(schedule)}
          variant="danger"
          size="sm"
        >
          <TrashIcon className="icon-sm" />
          Delete
        </Button>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="schedule-loading-container">
        <div className="schedule-spinner"></div>
      </div>
    );
  }

  return (
    <div className="schedule-management-container">
      <Card
        title="Schedule Management"
        action={
          <div className="card-actions">
            <Button
              onClick={() => setIsExportModalOpen(true)}
              variant="secondary"
              size="sm"
              disabled={schedules.length === 0}
            >
              <DownloadIcon className="icon-sm" />
              Export Schedules
            </Button>
            <Button onClick={() => setIsModalOpen(true)} size="sm">
              <PlusIcon className="icon-sm" />
              Create Schedule
            </Button>
          </div>
        }
      >
        {schedules.length > 0 ? (
          <Table data={schedules} columns={columns} />
        ) : (
          <p className="schedule-empty-state">No schedules found</p>
        )}
      </Card>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={handleDeleteCancel}
        title="Delete Schedule"
      >
        <div className="modal-form">
          <p className="modal-description">
            Are you sure you want to delete this schedule? This action cannot be undone.
          </p>
          
          {scheduleToDelete && (
            <div className="delete-schedule-details">
              <p><strong>Laboratory:</strong> {scheduleToDelete.labName}</p>
              <p><strong>Subject:</strong> {scheduleToDelete.subject || "N/A"}</p>
              <p><strong>Teacher:</strong> {scheduleToDelete.teacherName || "N/A"}</p>
              {scheduleToDelete.recurrenceType === "weekly" ? (
                <>
                  <p><strong>Days:</strong> {scheduleToDelete.daysOfWeek?.join(", ")}</p>
                  <p><strong>Time:</strong> {scheduleToDelete.startTime} - {scheduleToDelete.endTime}</p>
                  {scheduleToDelete.recurrenceEndDate && (
                    <p><strong>Ends:</strong> {new Date(scheduleToDelete.recurrenceEndDate).toLocaleDateString()}</p>
                  )}
                </>
              ) : (
                <>
                  <p><strong>Date:</strong> {(scheduleToDelete.startTime as Date).toLocaleDateString()}</p>
                  <p><strong>Time:</strong> {(scheduleToDelete.startTime as Date).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })} - {(scheduleToDelete.endTime as Date).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}</p>
                </>
              )}
            </div>
          )}

          <div className="modal-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={handleDeleteCancel}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleDeleteConfirm}
            >
              Delete Schedule
            </Button>
          </div>
        </div>
      </Modal>

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
        <div className="modal-form">
          <p className="modal-description">
            Select a date range and export format to export schedules.
          </p>

          <div className="export-format-container">
            <label className="export-format-label">
              Export Format
            </label>
            <div className="export-format-buttons">
              <button
                onClick={() => setExportFormat("pdf")}
                className={`export-format-button ${exportFormat === "pdf" ? "active" : ""}`}
              >
                <FileTextIcon className="export-format-icon" />
                PDF
              </button>
              <button
                onClick={() => setExportFormat("csv")}
                className={`export-format-button ${exportFormat === "csv" ? "active" : ""}`}
              >
                <FileSpreadsheetIcon className="export-format-icon" />
                CSV
              </button>
            </div>
          </div>

          <div className="date-filter-container">
            <label className="date-filter-label">
              Date Range (Optional)
            </label>
            <div className="date-filter-grid">
              <div className="date-input-wrapper">
                <label className="date-input-label">Start Date</label>
                <Input
                  type="date"
                  value={exportStartDate}
                  onChange={(e) => setExportStartDate(e.target.value)}
                  placeholder="Select start date"
                />
              </div>
              <div className="date-input-wrapper">
                <label className="date-input-label">End Date</label>
                <Input
                  type="date"
                  value={exportEndDate}
                  onChange={(e) => setExportEndDate(e.target.value)}
                  placeholder="Select end date"
                />
              </div>
            </div>
            {(exportStartDate || exportEndDate) && (
              <p className="date-filter-info">
                {(() => {
                  const filtered = getFilteredSchedules(exportStartDate, exportEndDate);
                  return `Will export ${filtered.length} of ${schedules.length} schedules`;
                })()}
              </p>
            )}
          </div>

          <div className="modal-actions">
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

      {/* Create Schedule Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create New Schedule"
      >
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-field">
            <label className="form-field-label">
              Laboratory Name <span className="form-field-required">*</span>
            </label>
            <select
              value={formData.labName}
              onChange={(e) =>
                setFormData({ ...formData, labName: e.target.value })
              }
              className="form-select"
              required
            >
              <option value="">Select a laboratory</option>
              {laboratories.map((lab) => (
                <option key={lab.id} value={lab.name}>
                  {lab.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label className="form-field-label">
              Teacher <span className="form-field-required">*</span>
            </label>
            <select
              value={formData.teacherId}
              onChange={(e) =>
                setFormData({ ...formData, teacherId: e.target.value })
              }
              className="form-select"
              required
            >
              <option value="">Select a teacher</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Subject"
            value={formData.subject}
            onChange={(e) =>
              setFormData({ ...formData, subject: e.target.value })
            }
            placeholder="Data Structures"
          />

          <div className="form-field">
            <label className="form-field-label">
              Schedule Type <span className="form-field-required">*</span>
            </label>
            <div className="schedule-type-buttons">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, recurrenceType: "weekly", daysOfWeek: [] })}
                className={`schedule-type-button ${formData.recurrenceType === "weekly" ? "active" : ""}`}
              >
                Weekly Recurring
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, recurrenceType: "one-time", daysOfWeek: [], recurrenceEndDate: "" })}
                className={`schedule-type-button ${formData.recurrenceType === "one-time" ? "active" : ""}`}
              >
                One-Time
              </button>
            </div>
          </div>

          {formData.recurrenceType === "weekly" && (
            <div className="form-field">
              <label className="form-field-label">
                Days of Week <span className="form-field-required">*</span>
              </label>
              <div className="days-of-week-grid">
                {DAYS_OF_WEEK.map(day => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDayOfWeek(day)}
                    className={`day-button ${formData.daysOfWeek.includes(day) ? "selected" : ""}`}
                  >
                    {day.slice(0, 3)}
                  </button>
                ))}
              </div>
              {formData.daysOfWeek.length > 0 && (
                <p className="selected-days-text">
                  Selected: {formData.daysOfWeek.join(", ")}
                </p>
              )}
            </div>
          )}

          <div className="modal-grid-2">
            <Input
              label="Start Time"
              type={formData.recurrenceType === "weekly" ? "time" : "datetime-local"}
              value={formData.startTime}
              onChange={(e) =>
                setFormData({ ...formData, startTime: e.target.value })
              }
              required
            />
            <Input
              label="End Time"
              type={formData.recurrenceType === "weekly" ? "time" : "datetime-local"}
              value={formData.endTime}
              onChange={(e) =>
                setFormData({ ...formData, endTime: e.target.value })
              }
              required
            />
          </div>

          {formData.recurrenceType === "weekly" && (
            <Input
              label="Schedule Ends On (Optional)"
              type="date"
              value={formData.recurrenceEndDate}
              onChange={(e) =>
                setFormData({ ...formData, recurrenceEndDate: e.target.value })
              }
              placeholder="Leave empty for ongoing schedule"
            />
          )}

          <div className="modal-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Create Schedule</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}