import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { User } from "../types";
import { authService, LoginCredentials, RegisterData, AuthUser } from "../services/auth.service";

interface AuthContextType {
  currentUser: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<User | null>;
  register: (data: RegisterData) => Promise<User | null>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Convert backend user to frontend User type
function mapAuthUserToUser(authUser: AuthUser): User {
  return {
    id: String(authUser.userId),
    name: authUser.username,
    email: authUser.email,
    role: authUser.role as User["role"],
    status: "active",
    createdAt: new Date(),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize auth state from localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    const storedUser = localStorage.getItem("currentUser");

    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setCurrentUser(JSON.parse(storedUser));
      } catch {
        // Invalid stored data, clear it
        localStorage.removeItem("token");
        localStorage.removeItem("currentUser");
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<User | null> => {
    try {
      const response = await authService.login({ email, password });
      
      if (response.success && response.data) {
        const { token: newToken, ...userData } = response.data;
        const user = mapAuthUserToUser(userData);

        // Store in state and localStorage
        setToken(newToken);
        setCurrentUser(user);
        localStorage.setItem("token", newToken);
        localStorage.setItem("currentUser", JSON.stringify(user));

        return user;
      }
      return null;
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    }
  }, []);

  const register = useCallback(async (data: RegisterData): Promise<User | null> => {
    try {
      const response = await authService.register(data);
      
      if (response.success && response.data) {
        const { token: newToken, ...userData } = response.data;
        const user = mapAuthUserToUser(userData);

        // Store in state and localStorage
        setToken(newToken);
        setCurrentUser(user);
        localStorage.setItem("token", newToken);
        localStorage.setItem("currentUser", JSON.stringify(user));

        return user;
      }
      return null;
    } catch (error) {
      console.error("Registration error:", error);
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      // Call logout endpoint to log the event
      await authService.logout();
    } catch (error) {
      // Don't fail logout if logging fails
      console.error("Failed to log logout event:", error);
    } finally {
      // Always clear local state
      setCurrentUser(null);
      setToken(null);
      localStorage.removeItem("token");
      localStorage.removeItem("currentUser");
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return;

    try {
      const response = await authService.getCurrentUser();
      if (response.success && response.data) {
        const user: User = {
          id: String(response.data.id),
          name: response.data.username,
          email: response.data.email,
          role: response.data.role as User["role"],
          status: "active",
          createdAt: new Date(response.data.created_at),
        };
        setCurrentUser(user);
        localStorage.setItem("currentUser", JSON.stringify(user));
      }
    } catch (error) {
      console.error("Failed to refresh user:", error);
      // If refresh fails, logout
      logout();
    }
  }, [token, logout]);

  const value: AuthContextType = {
    currentUser,
    token,
    isLoading,
    isAuthenticated: !!currentUser && !!token,
    login,
    register,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
}

