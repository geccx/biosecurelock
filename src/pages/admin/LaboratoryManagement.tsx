import { useState, useEffect } from "react";
import { Button } from "../../components/common/Button";
import { Card } from "../../components/common/Card";
import { Modal } from "../../components/common/Modal";
import { Input } from "../../components/common/Input";
import { laboratoriesService, type Laboratory, type CreateLaboratoryData } from "../../services/laboratories.service";
import {
  PlusIcon,
  EditIcon,
  TrashIcon,
  BuildingIcon,
} from "lucide-react";
import { useAlert } from "../../contexts/AlertContext";

export function LaboratoryManagement() {
  const { showAlert } = useAlert();
  const [laboratories, setLaboratories] = useState<Laboratory[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingLab, setEditingLab] = useState<Laboratory | null>(null);
  const [deletingLabId, setDeletingLabId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<CreateLaboratoryData>({
    name: "",
    location: "",
  });
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof CreateLaboratoryData, string>>>({});

  useEffect(() => {
    fetchLaboratories();
  }, []);

  const fetchLaboratories = async () => {
    setLoading(true);
    try {
      const response = await laboratoriesService.getAll();
      if (response && response.success && response.data) {
        setLaboratories(response.data);
      } else {
        setLaboratories([]);
        showAlert("Failed to fetch laboratories", "error");
      }
    } catch (error) {
      console.error("❌ Failed to fetch laboratories:", error);
      showAlert(
        `Failed to fetch laboratories: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "error"
      );
      setLaboratories([]);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof CreateLaboratoryData, string>> = {};

    if (!formData.name.trim()) {
      errors.name = "Laboratory name is required";
    } else if (formData.name.trim().length < 2) {
      errors.name = "Laboratory name must be at least 2 characters";
    }

    if (!formData.location.trim()) {
      errors.location = "Location is required";
    } else if (formData.location.trim().length < 2) {
      errors.location = "Location must be at least 2 characters";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      const response = await laboratoriesService.create({
        name: formData.name.trim(),
        location: formData.location.trim(),
      });

      if (response && response.success) {
        showAlert("Laboratory created successfully", "success");
        setIsCreateModalOpen(false);
        resetForm();
        await fetchLaboratories();
      } else {
        showAlert(response.error || "Failed to create laboratory", "error");
      }
    } catch (error) {
      console.error("❌ Failed to create laboratory:", error);
      showAlert(
        `Failed to create laboratory: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "error"
      );
    }
  };

  const handleEdit = (lab: Laboratory) => {
    setEditingLab(lab);
    setFormData({
      name: lab.name,
      location: lab.location,
    });
    setFormErrors({});
    setIsEditModalOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingLab || !validateForm()) {
      return;
    }

    try {
      const response = await laboratoriesService.update(parseInt(editingLab.id), {
        name: formData.name.trim(),
        location: formData.location.trim(),
      });

      if (response && response.success) {
        showAlert("Laboratory updated successfully", "success");
        setIsEditModalOpen(false);
        setEditingLab(null);
        resetForm();
        await fetchLaboratories();
      } else {
        showAlert(response.error || "Failed to update laboratory", "error");
      }
    } catch (error) {
      console.error("❌ Failed to update laboratory:", error);
      showAlert(
        `Failed to update laboratory: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "error"
      );
    }
  };

  const handleDelete = async (lab: Laboratory) => {
    if (
      !confirm(
        `Are you sure you want to delete laboratory "${lab.name}"? This action cannot be undone.`
      )
    ) {
      return;
    }

    setDeletingLabId(lab.id);
    try {
      const response = await laboratoriesService.delete(parseInt(lab.id));
      if (response && response.success) {
        showAlert("Laboratory deleted successfully", "success");
        await fetchLaboratories();
      } else {
        showAlert(response.error || "Failed to delete laboratory", "error");
      }
    } catch (error) {
      console.error("❌ Failed to delete laboratory:", error);
      showAlert(
        `Failed to delete laboratory: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "error"
      );
    } finally {
      setDeletingLabId(null);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      location: "",
    });
    setFormErrors({});
  };

  const handleOpenCreateModal = () => {
    resetForm();
    setIsCreateModalOpen(true);
  };

  const handleCloseCreateModal = () => {
    setIsCreateModalOpen(false);
    resetForm();
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setEditingLab(null);
    resetForm();
  };

  if (loading && laboratories.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card
        title="Laboratory Management"
        action={
          <div className="flex gap-2">
            <Button
              onClick={handleOpenCreateModal}
              size="sm"
              className="flex items-center gap-2"
            >
              <PlusIcon className="w-4 h-4" />
              Create Laboratory
            </Button>
            <Button
              onClick={fetchLaboratories}
              disabled={loading}
              size="sm"
              variant="secondary"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        }
      >
        {laboratories.length === 0 ? (
          <div className="text-center py-8">
            <BuildingIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No laboratories found</p>
            <p className="text-sm text-gray-400 mt-2">
              Create a new laboratory to get started
            </p>
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
                    Location
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {laboratories.map((lab) => (
                  <tr key={lab.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {lab.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">{lab.location}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => handleEdit(lab)}
                          size="sm"
                          variant="ghost"
                          disabled={deletingLabId === lab.id}
                          className="flex items-center gap-2"
                        >
                          <EditIcon className="w-4 h-4" />
                          Edit
                        </Button>
                        <Button
                          onClick={() => handleDelete(lab)}
                          size="sm"
                          variant="ghost"
                          disabled={deletingLabId === lab.id}
                          className="flex items-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <TrashIcon className="w-4 h-4" />
                          {deletingLabId === lab.id ? "Deleting..." : "Delete"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={handleCloseCreateModal}
        title="Create New Laboratory"
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Laboratory Name *"
            type="text"
            value={formData.name}
            onChange={(e) =>
              setFormData({ ...formData, name: e.target.value })
            }
            error={formErrors.name}
            placeholder="e.g., Computer Lab 1"
          />

          <Input
            label="Location *"
            type="text"
            value={formData.location}
            onChange={(e) =>
              setFormData({ ...formData, location: e.target.value })
            }
            error={formErrors.location}
            placeholder="e.g., Building A, Floor 2"
          />

          <div className="flex justify-end gap-3 pt-4">
            <Button
              onClick={handleCloseCreateModal}
              variant="secondary"
              size="sm"
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} size="sm">
              Create Laboratory
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={handleCloseEditModal}
        title="Edit Laboratory"
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Laboratory Name *"
            type="text"
            value={formData.name}
            onChange={(e) =>
              setFormData({ ...formData, name: e.target.value })
            }
            error={formErrors.name}
            placeholder="e.g., Computer Lab 1"
          />

          <Input
            label="Location *"
            type="text"
            value={formData.location}
            onChange={(e) =>
              setFormData({ ...formData, location: e.target.value })
            }
            error={formErrors.location}
            placeholder="e.g., Building A, Floor 2"
          />

          <div className="flex justify-end gap-3 pt-4">
            <Button
              onClick={handleCloseEditModal}
              variant="secondary"
              size="sm"
            >
              Cancel
            </Button>
            <Button onClick={handleUpdate} size="sm">
              Update Laboratory
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

