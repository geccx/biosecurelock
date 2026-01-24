import React, { useState, useEffect } from "react";
import {
  PlusIcon,
  DownloadIcon,
  FileTextIcon,
  FileSpreadsheetIcon,
  TrashIcon,
} from "lucide-react";
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

export function ScheduleManagement() {
  const { showAlert } = useAlert();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [laboratories, setLaboratories] = useState<Laboratory[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false); // create
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false); // update
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Selected schedule
  const [scheduleToDelete, setScheduleToDelete] = useState<Schedule | null>(
    null
  );
  const [scheduleToUpdate, setScheduleToUpdate] = useState<Schedule | null>(
    null
  );

  // Form data
  const [formData, setFormData] = useState({
    labName: "",
    teacherId: "",
    startTime: "",
    endTime: "",
    subject: "",
  });

  // Export states
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
          schedulesRes.data.map((s) => ({
            id: s.id,
            labName: s.labName,
            teacherId: s.teacherId,
            teacherName: s.teacherName,
            startTime: new Date(s.startTime),
            endTime: new Date(s.endTime),
            subject: s.subject,
            status: s.status,
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

  // -------------------- CREATE --------------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const start = new Date(formData.startTime);
    const end = new Date(formData.endTime);

    if (start >= end) {
      showAlert("Start time must be before end time.", "error");
      return;
    }

    try {
      await labSchedulesService.create({
        labName: formData.labName,
        teacherId: parseInt(formData.teacherId),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        subject: formData.subject,
      });

      setIsModalOpen(false);
      setFormData({ labName: "", teacherId: "", startTime: "", endTime: "", subject: "" });
      fetchData();
      showAlert("Schedule created successfully!", "success");
    } catch (error) {
      console.error("Failed to create schedule:", error);
      showAlert("Failed to create schedule. Please try again.", "error");
    }
  };

  // -------------------- UPDATE --------------------
  const handleEditClick = (schedule: Schedule) => {
    setScheduleToUpdate(schedule);
    setFormData({
      labName: schedule.labName,
      teacherId: schedule.teacherId.toString(),
      startTime: schedule.startTime.toISOString().slice(0, 16),
      endTime: schedule.endTime.toISOString().slice(0, 16),
      subject: schedule.subject || "",
    });
    setIsUpdateModalOpen(true);
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleToUpdate) return;

    const start = new Date(formData.startTime);
    const end = new Date(formData.endTime);

    if (start >= end) {
      showAlert("Start time must be before end time.", "error");
      return;
    }

    try {
      const response = await labSchedulesService.update(scheduleToUpdate.id, {
        labName: formData.labName,
        teacherId: parseInt(formData.teacherId),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        subject: formData.subject,
      });

      if (response.success) {
        showAlert("Schedule updated successfully!", "success");
        setIsUpdateModalOpen(false);
        setScheduleToUpdate(null);
        setFormData({ labName: "", teacherId: "", startTime: "", endTime: "", subject: "" });
        fetchData();
      } else {
        showAlert("Failed to update schedule. Please try again.", "error");
      }
    } catch (error) {
      console.error("Failed to update schedule:", error);
      showAlert("Failed to update schedule. Please try again.", "error");
    }
  };

  // -------------------- DELETE --------------------
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

  // -------------------- EXPORT --------------------
  const getFilteredSchedules = (startDate: string, endDate: string) => {
    if (!startDate && !endDate) return schedules;

    return schedules.filter((schedule) => {
      const scheduleDate = schedule.startTime;
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

    if (exportFormat === "pdf") handleExportPDF(filteredSchedules);
    else handleExportCSV(filteredSchedules);

    setIsExportModalOpen(false);
    setExportStartDate("");
    setExportEndDate("");
  };

  const handleExportPDF = (schedulesToExport: Schedule[]) => {
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

    const tableData = schedulesToExport.map((schedule) => [
      schedule.labName,
      schedule.subject || "N/A",
      schedule.startTime.toLocaleDateString(),
      schedule.startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) +
        " - " +
        schedule.endTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      schedule.teacherName || "N/A",
      schedule.status,
    ]);

    autoTable(doc, {
      startY: 48,
      head: [["Laboratory", "Subject", "Date", "Time", "Teacher", "Status"]],
      body: tableData,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [147, 51, 234] },
      alternateRowStyles: { fillColor: [250, 245, 255] },
    });

    const fileName = `schedules_${exportStartDate || "all"}_${exportEndDate || "all"}_${Date.now()}.pdf`;
    doc.save(fileName);
    showAlert("PDF exported successfully!", "success");
  };

  const handleExportCSV = (schedulesToExport: Schedule[]) => {
    const headers = ["Laboratory Name", "Subject", "Date", "Start Time", "End Time", "Teacher", "Status"];
    const rows = schedulesToExport.map((schedule) => [
      schedule.labName,
      schedule.subject || "N/A",
      schedule.startTime.toLocaleDateString(),
      schedule.startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      schedule.endTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      schedule.teacherName || "N/A",
      schedule.status,
    ]);

    const csvContent = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");

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
  };

  // -------------------- TABLE COLUMNS --------------------
  const columns = [
    { header: "Laboratory Name", accessor: "labName" as keyof Schedule },
    { header: "Subject", accessor: (s: Schedule) => s.subject || "N/A" },
    {
      header: "Time of Access",
      accessor: (s: Schedule) => {
        const startTime = s.startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const endTime = s.endTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const date = s.startTime.toLocaleDateString();
        return `${date} ${startTime} - ${endTime}`;
      },
    },
    { header: "Teacher", accessor: (s: Schedule) => s.teacherName || "N/A" },
    {
      header: "Status",
      accessor: (s: Schedule) => (
        <Badge
          variant={
            s.status === "pending"
              ? "warning"
              : s.status === "scheduled"
              ? "info"
              : s.status === "completed"
              ? "success"
              : "danger"
          }
        >
          {s.status}
        </Badge>
      ),
    },
    {
      header: "Actions",
      accessor: (s: Schedule) => (
        <div className="actions-buttons">
          <Button onClick={() => handleEditClick(s)} variant="secondary" size="sm">Edit</Button>
          <Button onClick={() => handleDeleteClick(s)} variant="danger" size="sm">
            <TrashIcon className="icon-sm" /> Delete
          </Button>
        </div>
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
            <Button onClick={() => setIsExportModalOpen(true)} variant="secondary" size="sm" disabled={schedules.length === 0}>
              <DownloadIcon className="icon-sm" /> Export Schedules
            </Button>
            <Button onClick={() => setIsModalOpen(true)} size="sm">
              <PlusIcon className="icon-sm" /> Create Schedule
            </Button>
          </div>
        }
      >
        {schedules.length > 0 ? <Table data={schedules} columns={columns} /> : <p className="schedule-empty-state">No schedules found</p>}
      </Card>

      {/* Create, Update, Delete, Export Modals */}
      {/* Create Schedule Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Create New Schedule">
        <form onSubmit={handleSubmit} className="modal-form">
          {/* Form fields same as previous code */}
          <div className="form-field">
            <label className="form-field-label">Laboratory Name *</label>
            <select
              value={formData.labName}
              onChange={(e) => setFormData({ ...formData, labName: e.target.value })}
              className="form-select"
              required
            >
              <option value="">Select a laboratory</option>
              {laboratories.map((lab) => <option key={lab.id} value={lab.name}>{lab.name}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label className="form-field-label">Teacher</label>
            <select
              value={formData.teacherId}
              onChange={(e) => setFormData({ ...formData, teacherId: e.target.value })}
              className="form-select"
              required
            >
              <option value="">Select a teacher</option>
              {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
            </select>
          </div>
          <Input label="Subject" value={formData.subject} onChange={(e) => setFormData({ ...formData, subject: e.target.value })} placeholder="Data Structures" />
          <div className="modal-grid-2">
            <Input label="Start Time" type="datetime-local" value={formData.startTime} onChange={(e) => setFormData({ ...formData, startTime: e.target.value })} required />
            <Input label="End Time" type="datetime-local" value={formData.endTime} onChange={(e) => setFormData({ ...formData, endTime: e.target.value })} required />
          </div>
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit">Create Schedule</Button>
          </div>
        </form>
      </Modal>

      {/* Update Schedule Modal */}
      <Modal isOpen={isUpdateModalOpen} onClose={() => setIsUpdateModalOpen(false)} title="Update Schedule">
        <form onSubmit={handleUpdateSubmit} className="modal-form">
          <div className="form-field">
            <label className="form-field-label">Laboratory Name *</label>
            <select
              value={formData.labName}
              onChange={(e) => setFormData({ ...formData, labName: e.target.value })}
              className="form-select"
              required
            >
              <option value="">Select a laboratory</option>
              {laboratories.map((lab) => <option key={lab.id} value={lab.name}>{lab.name}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label className="form-field-label">Teacher</label>
            <select
              value={formData.teacherId}
              onChange={(e) => setFormData({ ...formData, teacherId: e.target.value })}
              className="form-select"
              required
            >
              <option value="">Select a teacher</option>
              {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
            </select>
          </div>
          <Input label="Subject" value={formData.subject} onChange={(e) => setFormData({ ...formData, subject: e.target.value })} placeholder="Data Structures" />
          <div className="modal-grid-2">
            <Input label="Start Time" type="datetime-local" value={formData.startTime} onChange={(e) => setFormData({ ...formData, startTime: e.target.value })} required />
            <Input label="End Time" type="datetime-local" value={formData.endTime} onChange={(e) => setFormData({ ...formData, endTime: e.target.value })} required />
          </div>
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setIsUpdateModalOpen(false)}>Cancel</Button>
            <Button type="submit">Update Schedule</Button>
          </div>
        </form>
      </Modal>

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
              <p><strong>Date:</strong> {scheduleToDelete.startTime.toLocaleDateString()}</p>
              <p><strong>Time:</strong> {scheduleToDelete.startTime.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })} - {scheduleToDelete.endTime.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}</p>
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

          {/* Export Format Selection */}
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

          {/* Date Filter */}
          <div className="date-filter-container">
            <label className="date-filter-label">
              Date Range (Optional)
            </label>
            <div className="date-filter-grid">
              <div className="date-input-wrapper">
                <label className="date-input-label">
                  Start Date
                </label>
                <Input
                  type="date"
                  value={exportStartDate}
                  onChange={(e) => setExportStartDate(e.target.value)}
                  placeholder="Select start date"
                />
              </div>
              <div className="date-input-wrapper">
                <label className="date-input-label">
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
              Teacher
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

          <div className="modal-grid-2">
            <Input
              label="Start Time"
              type="datetime-local"
              value={formData.startTime}
              onChange={(e) =>
                setFormData({ ...formData, startTime: e.target.value })
              }
              required
            />
            <Input
              label="End Time"
              type="datetime-local"
              value={formData.endTime}
              onChange={(e) =>
                setFormData({ ...formData, endTime: e.target.value })
              }
              required
            />
          </div>

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

     