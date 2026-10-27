import React, { createContext, ReactNode, useContext, useState } from "react";
import { View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Toast, { ToastType } from "./toast";

interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextType {
  showToast: (toast: Omit<ToastItem, "id">) => void;
  showSuccess: (title: string, message?: string, duration?: number) => void;
  showError: (title: string, message?: string, duration?: number) => void;
  showWarning: (title: string, message?: string, duration?: number) => void;
  showInfo: (title: string, message?: string, duration?: number) => void;
  dismissToast: (id: string) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};

export const ToastProvider = ({
  children,
  maxToasts = 3,
}: {
  children: ReactNode;
  maxToasts?: number;
}) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const { top } = useSafeAreaInsets();

  const showToast = (toast: Omit<ToastItem, "id">) => {
    const nextToast = {
      ...toast,
      id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    };
    setToasts((current) => [nextToast, ...current].slice(0, maxToasts));
  };

  const dismissToast = (id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  };

  const dismissAll = () => {
    setToasts([]);
  };

  const containerStyle: ViewStyle = {
    position: "absolute",
    top,
    left: 0,
    right: 0,
    zIndex: 999999,
    pointerEvents: "box-none",
  };

  return (
    <ToastContext.Provider
      value={{
        showToast,
        showSuccess: (title, message, duration) =>
          showToast({ type: "success", title, message, duration }),
        showError: (title, message, duration) =>
          showToast({ type: "error", title, message, duration }),
        showWarning: (title, message, duration) =>
          showToast({ type: "warning", title, message, duration }),
        showInfo: (title, message, duration) =>
          showToast({ type: "info", title, message, duration }),
        dismissToast,
        dismissAll,
      }}>
      {children}
      <View style={containerStyle}>
        {toasts.map((toast, index) => (
          <Toast
            key={toast.id}
            id={toast.id}
            type={toast.type}
            title={toast.title}
            message={toast.message}
            duration={toast.duration}
            onDismiss={dismissToast}
            index={index}
          />
        ))}
      </View>
    </ToastContext.Provider>
  );
};
