import { useState, useEffect, useCallback } from "react";
import type { User } from "../types";
import { authService, type AuthUser } from "../services/auth.service";

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

export function useAuth() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const login = useCallback(
    async (email: string, password: string): Promise<User | null> => {
      setError(null);
      setIsLoading(true);

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

        setError("Login failed. Please check your credentials.");
        return null;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Login failed";
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

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
      setError(null);
      localStorage.removeItem("token");
      localStorage.removeItem("currentUser");
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    currentUser,
    token,
    isLoading,
    error,
    login,
    logout,
    clearError,
    isAuthenticated: !!currentUser && !!token,
  };
}
