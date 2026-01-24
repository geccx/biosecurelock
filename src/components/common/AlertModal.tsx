import React from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import "./styles/AlertModal.css";

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  type?: "info" | "success" | "error" | "warning";
}

export function AlertModal({
  isOpen,
  onClose,
  title,
  message,
  type = "info",
}: AlertModalProps) {
  const getTitle = () => {
    if (title) return title;
    switch (type) {
      case "success":
        return "Success";
      case "error":
        return "Error";
      case "warning":
        return "Warning";
      default:
        return "Information";
    }
  };

  const getButtonVariant = () => {
    switch (type) {
      case "success":
        return "success" as const;
      case "error":
        return "danger" as const;
      case "warning":
        return "secondary" as const;
      default:
        return "primary" as const;
    }
  };

  // Split message by newlines to preserve formatting
  const messageLines = message.split("\n");

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={getTitle()} size="md">
      <div className="py-4">
        <div className="mb-4">
          {messageLines.map((line, index) => (
            <p key={index} className="text-gray-700 mb-2">
              {line}
            </p>
          ))}
        </div>
        <div className="flex justify-end">
          <Button variant={getButtonVariant()} onClick={onClose}>
            OK
          </Button>
        </div>
      </div>
    </Modal>
  );
}

