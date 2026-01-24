import api, { type ApiResponse } from "../lib/api";

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  role?: "admin" | "user" | "visitor";
}

export interface AuthUser {
  userId: number;
  username: string;
  email: string;
  role: string;
  token: string;
}

export interface CurrentUser {
  id: number;
  username: string;
  email: string;
  role: string;
  created_at: string;
}

export const authService = {
  /**
   * Login with email and password
   */
  async login(credentials: LoginCredentials): Promise<ApiResponse<AuthUser>> {
    const response = await api.post<ApiResponse<AuthUser>>(
      "/auth/login",
      credentials
    );
    return response.data;
  },

  /**
   * Register a new user
   */
  async register(data: RegisterData): Promise<ApiResponse<AuthUser>> {
    const response = await api.post<ApiResponse<AuthUser>>(
      "/auth/register",
      data
    );
    return response.data;
  },

  /**
   * Get current authenticated user
   */
  async getCurrentUser(): Promise<ApiResponse<CurrentUser>> {
    const response = await api.get<ApiResponse<CurrentUser>>("/users/me");
    return response.data;
  },

  /**
   * Logout - logs the logout event on the server
   */
  async logout(): Promise<ApiResponse<{ message: string }>> {
    const response = await api.post<ApiResponse<{ message: string }>>(
      "/auth/logout"
    );
    return response.data;
  },
};
