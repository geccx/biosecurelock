import api, { type ApiResponse } from "../lib/api";

export interface Semester {
  id: number;
  name: string;
  academicYear: string;
  startDate: string;
  endDate: string;
  status: "draft" | "approved" | "active" | "completed";
  approvedBy: number | null;
  approvedAt: string | null;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  createdByName?: string;
  approvedByName?: string;
}

export interface CreateSemesterData {
  name: string;
  academicYear: string;
  startDate: string;
  endDate: string;
}

export interface UpdateSemesterData {
  name?: string;
  academicYear?: string;
  startDate?: string;
  endDate?: string;
}

export interface SemesterFilters {
  status?: "draft" | "approved" | "active" | "completed";
  academicYear?: string;
  limit?: number;
  offset?: number;
}

export const semesterService = {
  async create(data: CreateSemesterData): Promise<ApiResponse<Semester>> {
    const response = await api.post<ApiResponse<Semester>>(
      "/admin/semesters",
      data,
    );
    return response.data;
  },

  async getAll(filters?: SemesterFilters): Promise<ApiResponse<Semester[]>> {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== "") {
          params.append(key, String(value));
        }
      });
    }
    const response = await api.get<ApiResponse<Semester[]>>(
      `/admin/semesters?${params.toString()}`,
    );
    return response.data;
  },

  async getById(id: number): Promise<ApiResponse<Semester>> {
    const response = await api.get<ApiResponse<Semester>>(
      `/admin/semesters/${id}`,
    );
    return response.data;
  },

  async update(
    id: number,
    data: UpdateSemesterData,
  ): Promise<ApiResponse<Semester>> {
    const response = await api.put<ApiResponse<Semester>>(
      `/admin/semesters/${id}`,
      data,
    );
    return response.data;
  },

  async delete(id: number): Promise<ApiResponse<{ message: string }>> {
    const response = await api.delete<ApiResponse<{ message: string }>>(
      `/admin/semesters/${id}`,
    );
    return response.data;
  },

  async approve(id: number): Promise<ApiResponse<Semester>> {
    const response = await api.put<ApiResponse<Semester>>(
      `/admin/semesters/${id}/approve`,
      {},
    );
    return response.data;
  },
};
