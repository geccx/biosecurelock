import { useState, useEffect } from "react";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { Modal } from "../../components/common/Modal";
import { Input } from "../../components/common/Input";
import { Badge } from "../../components/common/Badge";
import {
  semesterService,
  type Semester,
  type CreateSemesterData,
  type SemesterFilters,
} from "../../services";
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  CheckCircleIcon,
  CalendarIcon,
} from "lucide-react";
import { useAlert } from "../../contexts/AlertContext";

const STATUS_VARIANTS: Record<
  Semester["status"],
  "default" | "info" | "success" | "warning"
> = {
  draft: "default",
  approved: "info",
  active: "success",
  completed: "warning",
};

export function SemesterList() {
  const { showAlert } = useAlert();
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSemester, setEditingSemester] = useState<Semester | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [filters, setFilters] = useState<SemesterFilters>({});
  const [formData, setFormData] = useState<CreateSemesterData>({
    name: "",
    academicYear: "",
    startDate: "",
    endDate: "",
  });
  const [formErrors, setFormErrors] = useState<
    Partial<Record<keyof CreateSemesterData, string>>
  >({});

  const fetchSemesters = async () => {
    setLoading(true);
    try {
      const response = await semesterService.getAll(filters);
      if (response?.success && response.data) {
        setSemesters(response.data);
      } else {
        setSemesters([]);
      }
    } catch (error) {
      console.error("Failed to fetch semesters:", error);
      showAlert(
        error instanceof Error ? error.message : "Failed to fetch semesters",
        "error",
      );
      setSemesters([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSemesters();
  }, [filters.status, filters.academicYear]);

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof CreateSemesterData, string>> = {};
    if (!formData.name.trim()) errors.name = "Name is required";
    if (!formData.academicYear.trim())
      errors.academicYear = "Academic year is required";
    if (!formData.startDate) errors.startDate = "Start date is required";
    if (!formData.endDate) errors.endDate = "End date is required";
    if (
      formData.startDate &&
      formData.endDate &&
      formData.startDate > formData.endDate
    ) {
      errors.endDate = "End date must be after start date";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const resetForm = () => {
    setFormData({
      name: "",
      academicYear: "",
      startDate: "",
      endDate: "",
    });
    setFormErrors({});
    setEditingSemester(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleOpenEdit = (semester: Semester) => {
    setEditingSemester(semester);
    setFormData({
      name: semester.name,
      academicYear: semester.academicYear,
      startDate: semester.startDate.slice(0, 10),
      endDate: semester.endDate.slice(0, 10),
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    try {
      const payload = {
        name: formData.name.trim(),
        academicYear: formData.academicYear.trim(),
        startDate: formData.startDate,
        endDate: formData.endDate,
      };
      if (editingSemester) {
        const response = await semesterService.update(
          editingSemester.id,
          payload,
        );
        if (response?.success) {
          showAlert("Semester updated successfully", "success");
          setIsModalOpen(false);
          resetForm();
          await fetchSemesters();
        } else {
          showAlert(response?.error ?? "Failed to update semester", "error");
        }
      } else {
        const response = await semesterService.create(payload);
        if (response?.success) {
          showAlert("Semester created successfully", "success");
          setIsModalOpen(false);
          resetForm();
          await fetchSemesters();
        } else {
          showAlert(response?.error ?? "Failed to create semester", "error");
        }
      }
    } catch (error) {
      showAlert(
        error instanceof Error ? error.message : "Something went wrong",
        "error",
      );
    }
  };

  const handleApprove = async (semester: Semester) => {
    if (semester.status !== "draft") return;
    setApprovingId(semester.id);
    try {
      const response = await semesterService.approve(semester.id);
      if (response?.success) {
        showAlert("Semester approved successfully", "success");
        await fetchSemesters();
      } else {
        showAlert(response?.error ?? "Failed to approve semester", "error");
      }
    } catch (error) {
      showAlert(
        error instanceof Error ? error.message : "Failed to approve",
        "error",
      );
    } finally {
      setApprovingId(null);
    }
  };

  const handleDelete = async (semester: Semester) => {
    if (semester.status !== "draft") {
      showAlert("Only draft semesters can be deleted", "error");
      return;
    }
    if (
      !confirm(
        `Delete semester "${semester.name}"? This cannot be undone. Make sure it has no schedule templates.`,
      )
    ) {
      return;
    }
    setDeletingId(semester.id);
    try {
      const response = await semesterService.delete(semester.id);
      if (response?.success) {
        showAlert("Semester deleted successfully", "success");
        await fetchSemesters();
      } else {
        showAlert(response?.error ?? "Failed to delete semester", "error");
      }
    } catch (error) {
      showAlert(
        error instanceof Error ? error.message : "Failed to delete",
        "error",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return d;
    }
  };

  if (loading && semesters.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card
        title="Semesters"
        action={
          <div className="flex gap-2 flex-wrap">
            <select
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={filters.status ?? ""}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  status: (e.target.value ||
                    undefined) as SemesterFilters["status"],
                }))
              }
            >
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="approved">Approved</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </select>
            <input
              type="text"
              placeholder="Academic year"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-32 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={filters.academicYear ?? ""}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  academicYear: e.target.value || undefined,
                }))
              }
            />
            <Button
              onClick={handleOpenCreate}
              size="sm"
              className="flex items-center gap-2"
            >
              <PlusIcon className="w-4 h-4" />
              Create Semester
            </Button>
            <Button
              onClick={fetchSemesters}
              disabled={loading}
              size="sm"
              variant="secondary"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        }
      >
        {semesters.length === 0 ? (
          <div className="text-center py-12">
            <CalendarIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No semesters found</p>
            <p className="text-sm text-gray-400 mt-2">
              Create a semester to manage official schedule templates
            </p>
            <Button onClick={handleOpenCreate} size="sm" className="mt-4">
              Create Semester
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Academic Year
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Start Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    End Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {semesters.map((sem) => (
                  <tr key={sem.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {sem.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {sem.academicYear}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatDate(sem.startDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatDate(sem.endDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={STATUS_VARIANTS[sem.status]}>
                        {sem.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {(sem.status === "draft" ||
                          sem.status === "approved") && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleOpenEdit(sem)}
                            className="flex items-center gap-1"
                          >
                            <PencilIcon className="w-4 h-4" />
                            Edit
                          </Button>
                        )}
                        {sem.status === "draft" && (
                          <Button
                            size="sm"
                            variant="success"
                            onClick={() => handleApprove(sem)}
                            disabled={approvingId === sem.id}
                            className="flex items-center gap-1"
                          >
                            <CheckCircleIcon className="w-4 h-4" />
                            {approvingId === sem.id
                              ? "Approving..."
                              : "Approve"}
                          </Button>
                        )}
                        {sem.status === "draft" && (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => handleDelete(sem)}
                            disabled={deletingId === sem.id}
                            className="flex items-center gap-1"
                          >
                            <TrashIcon className="w-4 h-4" />
                            {deletingId === sem.id ? "Deleting..." : "Delete"}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          resetForm();
        }}
        title={editingSemester ? "Edit Semester" : "Create Semester"}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Name"
            value={formData.name}
            onChange={(e) =>
              setFormData((f) => ({ ...f, name: e.target.value }))
            }
            error={formErrors.name}
            placeholder="e.g. 1st Semester 2024-25"
          />
          <Input
            label="Academic Year"
            value={formData.academicYear}
            onChange={(e) =>
              setFormData((f) => ({ ...f, academicYear: e.target.value }))
            }
            error={formErrors.academicYear}
            placeholder="e.g. 2024-2025"
          />
          <Input
            label="Start Date"
            type="date"
            value={formData.startDate}
            onChange={(e) =>
              setFormData((f) => ({ ...f, startDate: e.target.value }))
            }
            error={formErrors.startDate}
          />
          <Input
            label="End Date"
            type="date"
            value={formData.endDate}
            onChange={(e) =>
              setFormData((f) => ({ ...f, endDate: e.target.value }))
            }
            error={formErrors.endDate}
          />
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsModalOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button type="submit">
              {editingSemester ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
