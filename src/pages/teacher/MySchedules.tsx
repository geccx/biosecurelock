import { useEffect, useState } from "react";
import { PlusIcon, CalendarIcon } from "lucide-react";
import { Card } from "../../components/common/Card";
import { Badge } from "../../components/common/Badge";
import { Table } from "../../components/common/Table";
import { Button } from "../../components/common/Button";
import { Input } from "../../components/common/Input";
import { Modal } from "../../components/common/Modal";
import { labSchedulesService, moveRequestsService, laboratoriesService } from "../../services";
import type { Laboratory } from "../../services";
import api from "../../lib/api";
import { formatForManila } from "../../utils/timezone";
import { useAlert } from "../../contexts/AlertContext";

interface MySchedulesProps {
  teacherId: string;
}

interface ScheduleDisplay {
  id: string;
  labName: string;
  subject?: string;
  purpose?: string;
  startTime: Date;
  endTime: Date;
  status: "scheduled" | "completed" | "cancelled" | "pending";
}

export function MySchedules({ teacherId }: MySchedulesProps) {
  const { showAlert } = useAlert();
  const [schedules, setSchedules] = useState<ScheduleDisplay[]>([]);
  const [laboratories, setLaboratories] = useState<Laboratory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [selectedSchedule, setSelectedSchedule] =
    useState<ScheduleDisplay | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    labName: "",
    date: "",
    startTime: "",
    endTime: "",
    purpose: "",
    // Password fields
    includePassword: false,
    passwordName: "",
    password: "",
    passwordValidFrom: "",
    passwordValidUntil: "",
    passwordMaxUsage: 1,
    passwordPhone: "",
  });
  const [moveFormData, setMoveFormData] = useState({
    newDate: "",
    newStartTime: "",
    newEndTime: "",
    reason: "",
  });

  useEffect(() => {
    fetchSchedules();
    fetchLaboratories();
  }, [teacherId]);

  const fetchLaboratories = async () => {
    try {
      const response = await laboratoriesService.getAll();
      if (response.success && response.data) {
        setLaboratories(response.data);
      }
    } catch (error) {
      console.error("Failed to fetch laboratories:", error);
    }
  };

  const fetchSchedules = async () => {
    try {
      const response = await labSchedulesService.getMySchedules();
      if (response.success && response.data) {
        setSchedules(
          response.data.map((s) => ({
            id: s.id,
            labName: s.labName,
            subject: s.subject,
            purpose: s.subject, // Using subject as purpose for now
            startTime: new Date(s.startTime),
            endTime: new Date(s.endTime),
            status: s.status as
              | "scheduled"
              | "completed"
              | "cancelled"
              | "pending",
          }))
        );
      }
    } catch (error) {
      console.error("Failed to fetch schedules:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      // Format dates in Asia/Manila timezone format
      const startDateTime = formatForManila(formData.date, formData.startTime);
      const endDateTime = formatForManila(formData.date, formData.endTime);

      const response = await labSchedulesService.create({
        labName: formData.labName,
        teacherId: parseInt(teacherId),
        startTime: startDateTime,
        endTime: endDateTime,
        subject: formData.purpose, // Using subject field for purpose
        // Include password data if checkbox is checked
        passwordRequest: formData.includePassword
          ? {
              passwordName: formData.passwordName,
              password: formData.password,
              validFrom: formData.passwordValidFrom
                ? new Date(formData.passwordValidFrom).toISOString()
                : startDateTime,
              validUntil: formData.passwordValidUntil
                ? new Date(formData.passwordValidUntil).toISOString()
                : endDateTime,
              maxUsage: formData.passwordMaxUsage,
              phone: formData.passwordPhone || undefined,
            }
          : undefined,
      });

      if (response.success) {
        // Reset form and refresh schedules
        setFormData({
          labName: "",
          date: "",
          startTime: "",
          endTime: "",
          purpose: "",
          includePassword: false,
          passwordName: "",
          password: "",
          passwordValidFrom: "",
          passwordValidUntil: "",
          passwordMaxUsage: 1,
          passwordPhone: "",
        });
        setShowAddForm(false);
        await fetchSchedules();
        if (formData.includePassword) {
          showAlert(
            "Schedule and password request submitted successfully! The password request will be reviewed by an admin or tech support.",
            "success"
          );
        }
      }
    } catch (error) {
      console.error("Failed to create schedule:", error);
      showAlert("Failed to create schedule. Please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleMoveDate = (schedule: ScheduleDisplay) => {
    setSelectedSchedule(schedule);
    // Pre-fill new date/time with current values as default
    const currentDate = schedule.startTime.toISOString().split("T")[0];
    const currentStartTime = schedule.startTime
      .toTimeString()
      .split(" ")[0]
      .slice(0, 5);
    const currentEndTime = schedule.endTime
      .toTimeString()
      .split(" ")[0]
      .slice(0, 5);

    setMoveFormData({
      newDate: currentDate,
      newStartTime: currentStartTime,
      newEndTime: currentEndTime,
      reason: "",
    });
    setShowMoveModal(true);
  };

  const handleMoveRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchedule) return;

    setSubmitting(true);

    try {
      // Format dates in Asia/Manila timezone format
      const newStartDateTime = formatForManila(
        moveFormData.newDate,
        moveFormData.newStartTime
      );
      const newEndDateTime = formatForManila(
        moveFormData.newDate,
        moveFormData.newEndTime
      );

      const response = await moveRequestsService.create({
        scheduleId: parseInt(selectedSchedule.id),
        requestedStartTime: newStartDateTime,
        requestedEndTime: newEndDateTime,
        reason: moveFormData.reason,
      });

      if (response.success) {
        // Reset form and refresh schedules
        setMoveFormData({
          newDate: "",
          newStartTime: "",
          newEndTime: "",
          reason: "",
        });
        setShowMoveModal(false);
        setSelectedSchedule(null);
        await fetchSchedules();
        showAlert(
          "Move request submitted successfully! It will be reviewed by an admin.",
          "success"
        );
      }
    } catch (error: any) {
      console.error("Failed to create move request:", error);
      const errorMessage =
        error.response?.data?.error ||
        "Failed to create move request. Please try again.";
      showAlert(errorMessage, "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const columns = [
    {
      header: "Laboratory Name",
      accessor: "labName" as keyof ScheduleDisplay,
    },
    {
      header: "Subject",
      accessor: (schedule: ScheduleDisplay) =>
        schedule.subject || schedule.purpose || "N/A",
    },
    {
      header: "Time of Access",
      accessor: (schedule: ScheduleDisplay) => {
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
      header: "Status",
      accessor: (schedule: ScheduleDisplay) => (
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
      accessor: (schedule: ScheduleDisplay) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => handleMoveDate(schedule)}
          disabled={
            schedule.status === "completed" || schedule.status === "cancelled"
          }
          title="Request to move this schedule to a new date/time"
        >
          <CalendarIcon className="w-4 h-4 mr-1" />
          Move Date
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">My Schedules</h1>
        <Button onClick={() => setShowAddForm(!showAddForm)} variant="success">
          <PlusIcon className="w-4 h-4 mr-2" />
          Add Schedule
        </Button>
      </div>

      {showAddForm && (
        <Card title="Add New Schedule">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Laboratory Name <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.labName}
                  onChange={(e) =>
                    setFormData({ ...formData, labName: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              <Input
                label="Date"
                type="date"
                value={formData.date}
                onChange={(e) =>
                  setFormData({ ...formData, date: e.target.value })
                }
                required
              />
              <Input
                label="Start Time"
                type="time"
                value={formData.startTime}
                onChange={(e) =>
                  setFormData({ ...formData, startTime: e.target.value })
                }
                required
              />
              <Input
                label="End Time"
                type="time"
                value={formData.endTime}
                onChange={(e) =>
                  setFormData({ ...formData, endTime: e.target.value })
                }
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Subject <span className="text-red-500">*</span>
              </label>
              <textarea
                value={formData.purpose}
                onChange={(e) =>
                  setFormData({ ...formData, purpose: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Enter the subject of this schedule..."
                required
              />
            </div>

            {/* Temporary Password Section */}
            <div className="border-t pt-4">
              <div className="flex items-center mb-4">
                <input
                  type="checkbox"
                  id="includePassword"
                  checked={formData.includePassword}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      includePassword: e.target.checked,
                    })
                  }
                  className="mr-2"
                />
                <label
                  htmlFor="includePassword"
                  className="text-sm font-medium text-gray-700"
                >
                  Set Temporary Password for This Schedule
                </label>
              </div>

              {formData.includePassword && (
                <div className="space-y-4 pl-6 border-l-2 border-blue-200">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="Password Name *"
                      value={formData.passwordName}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          passwordName: e.target.value,
                        })
                      }
                      required={formData.includePassword}
                      placeholder="e.g., Lab Access Password"
                    />
                    <Input
                      label="Password * (6-7 digits)"
                      type="text"
                      value={formData.password}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          password: e.target.value
                            .replace(/\D/g, "")
                            .slice(0, 7),
                        })
                      }
                      required={formData.includePassword}
                      placeholder="123456"
                      maxLength={7}
                      pattern="[0-9]*"
                      inputMode="numeric"
                    />
                    <Input
                      label="Valid From *"
                      type="datetime-local"
                      value={
                        formData.passwordValidFrom ||
                        (formData.date && formData.startTime
                          ? `${formData.date}T${formData.startTime}`
                          : "")
                      }
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          passwordValidFrom: e.target.value,
                        })
                      }
                      required={formData.includePassword}
                    />
                    <Input
                      label="Valid Until *"
                      type="datetime-local"
                      value={
                        formData.passwordValidUntil ||
                        (formData.date && formData.endTime
                          ? `${formData.date}T${formData.endTime}`
                          : "")
                      }
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          passwordValidUntil: e.target.value,
                        })
                      }
                      required={formData.includePassword}
                    />
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Max Usage *
                      </label>
                      <select
                        value={formData.passwordMaxUsage}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            passwordMaxUsage: parseInt(e.target.value),
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required={formData.includePassword}
                      >
                        <option value={1}>Once (single use)</option>
                        <option value={0}>Multiple (unlimited uses)</option>
                      </select>
                    </div>
                    <Input
                      label="Phone (Optional)"
                      type="text"
                      value={formData.passwordPhone}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          passwordPhone: e.target.value,
                        })
                      }
                      placeholder="Mobile phone number"
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    The password request will be submitted for approval. Once
                    approved by an admin or tech support, the temporary password
                    will be activated.
                  </p>
                </div>
              )}
            </div>
            <div className="flex justify-end space-x-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowAddForm(false);
                  setFormData({
                    labName: "",
                    date: "",
                    startTime: "",
                    endTime: "",
                    purpose: "",
                    includePassword: false,
                    passwordName: "",
                    password: "",
                    passwordValidFrom: "",
                    passwordValidUntil: "",
                    passwordMaxUsage: 1,
                    passwordPhone: "",
                  });
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="success" disabled={submitting}>
                {submitting ? "Creating..." : "Create Schedule"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card title="My Schedules">
        {schedules.length > 0 ? (
          <Table data={schedules} columns={columns} />
        ) : (
          <p className="text-center text-gray-500 py-8">No schedules found</p>
        )}
      </Card>

      {/* Move Date Modal */}
      <Modal
        isOpen={showMoveModal}
        onClose={() => {
          setShowMoveModal(false);
          setSelectedSchedule(null);
          setMoveFormData({
            newDate: "",
            newStartTime: "",
            newEndTime: "",
            reason: "",
          });
        }}
        title="Move Schedule Date"
      >
        <form onSubmit={handleMoveRequest} className="space-y-4">
          {selectedSchedule && (
            <>
              {/* Current Schedule (Read-only) */}
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Current Schedule
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-600">Lab Name:</span>
                    <p className="font-medium text-gray-900">
                      {selectedSchedule.labName}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-600">Date:</span>
                    <p className="font-medium text-gray-900">
                      {selectedSchedule.startTime.toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-600">Start Time:</span>
                    <p className="font-medium text-gray-900">
                      {selectedSchedule.startTime.toLocaleTimeString()}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-600">End Time:</span>
                    <p className="font-medium text-gray-900">
                      {selectedSchedule.endTime.toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* New Schedule (Editable) */}
              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  New Schedule
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="New Date"
                    type="date"
                    value={moveFormData.newDate}
                    onChange={(e) =>
                      setMoveFormData({
                        ...moveFormData,
                        newDate: e.target.value,
                      })
                    }
                    required
                  />
                  <div></div>
                  <Input
                    label="New Start Time"
                    type="time"
                    value={moveFormData.newStartTime}
                    onChange={(e) =>
                      setMoveFormData({
                        ...moveFormData,
                        newStartTime: e.target.value,
                      })
                    }
                    required
                  />
                  <Input
                    label="New End Time"
                    type="time"
                    value={moveFormData.newEndTime}
                    onChange={(e) =>
                      setMoveFormData({
                        ...moveFormData,
                        newEndTime: e.target.value,
                      })
                    }
                    required
                  />
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason for Move <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={moveFormData.reason}
                  onChange={(e) =>
                    setMoveFormData({ ...moveFormData, reason: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={4}
                  placeholder="Please provide a reason for moving this schedule..."
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  This request will be reviewed by an administrator.
                </p>
              </div>
            </>
          )}

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowMoveModal(false);
                setSelectedSchedule(null);
                setMoveFormData({
                  newDate: "",
                  newStartTime: "",
                  newEndTime: "",
                  reason: "",
                });
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit Move Request"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
