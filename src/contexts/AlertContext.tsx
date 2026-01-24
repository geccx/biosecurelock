import React, { createContext, useContext, useState, useCallback } from "react";
import { AlertModal } from "../components/common/AlertModal";

interface AlertContextType {
  showAlert: (message: string, type?: "info" | "success" | "error" | "warning", title?: string) => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    message: string;
    type: "info" | "success" | "error" | "warning";
    title?: string;
  }>({
    isOpen: false,
    message: "",
    type: "info",
  });

  const showAlert = useCallback(
    (
      message: string,
      type: "info" | "success" | "error" | "warning" = "info",
      title?: string
    ) => {
      setAlertState({
        isOpen: true,
        message,
        type,
        title,
      });
    },
    []
  );

  const handleClose = useCallback(() => {
    setAlertState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      <AlertModal
        isOpen={alertState.isOpen}
        onClose={handleClose}
        message={alertState.message}
        type={alertState.type}
        title={alertState.title}
      />
    </AlertContext.Provider>
  );
}

export function useAlert() {
  const context = useContext(AlertContext);
  if (context === undefined) {
    throw new Error("useAlert must be used within an AlertProvider");
  }
  return context;
}

