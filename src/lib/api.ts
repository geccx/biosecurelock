import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

// Create axios instance with base configuration
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor - adds JWT token to requests
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handles errors globally
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error: AxiosError<{ 
    error?: string; 
    message?: string;
    code?: string | number;
    msg?: string;
    success?: boolean;
    details?: unknown;
  }>) => {
    if (error.response) {
      const { status, data, config } = error.response;

      // Handle 401 Unauthorized - token expired or invalid
      if (status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("currentUser");
        // Redirect to login if not already there
        if (window.location.pathname !== "/login") {
          window.location.href = "/";
        }
      }

      // Create a more informative error message
      // Check for Tuya API error format (code and msg)
      if (data?.code && data?.msg) {
        const errorMessage = `Error ${data.code}: ${data.msg}`;
        const enhancedError = new Error(errorMessage) as Error & {
          code?: string | number;
          status?: number;
          url?: string;
          method?: string;
          details?: unknown;
        };
        enhancedError.code = data.code;
        enhancedError.status = status;
        enhancedError.url = config?.url;
        enhancedError.method = config?.method?.toUpperCase();
        enhancedError.details = data;
        
        // Log detailed error in development mode
        if (import.meta.env.DEV) {
          console.error("API Error Details:", {
            code: data.code,
            message: data.msg,
            status,
            url: config?.url,
            method: config?.method,
            fullResponse: data,
          });
        }
        
        return Promise.reject(enhancedError);
      }

      // Standard error format
      const message = data?.error || data?.message || `HTTP ${status}: An error occurred`;
      const enhancedError = new Error(message) as Error & {
        status?: number;
        url?: string;
        method?: string;
        details?: unknown;
      };
      enhancedError.status = status;
      enhancedError.url = config?.url;
      enhancedError.method = config?.method?.toUpperCase();
      enhancedError.details = data;
      
      // Log detailed error in development mode
      if (import.meta.env.DEV) {
        console.error("API Error:", {
          status,
          message,
          url: config?.url,
          method: config?.method,
          response: data,
        });
      }
      
      return Promise.reject(enhancedError);
    }

    // Network error or timeout
    if (error.code === "ECONNABORTED") {
      return Promise.reject(new Error("Request timeout. Please try again."));
    }

    // Network error
    const networkError = new Error("Network error. Please check your connection.") as Error & {
      code?: string;
    };
    networkError.code = error.code;
    
    if (import.meta.env.DEV) {
      console.error("Network Error:", {
        code: error.code,
        message: error.message,
        config: error.config,
      });
    }
    
    return Promise.reject(networkError);
  }
);

export default api;

// Type for API responses
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string | number;
  msg?: string;
  details?: unknown;
}
