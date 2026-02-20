// @ts-nocheck
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

type Toast = { id: string; message: string; variant?: "info" | "success" | "error"; duration?: number };

const ToastContext = createContext<{ showToast: (t: Omit<Toast, "id">) => void } | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((t: Omit<Toast, "id">) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setToasts((s) => [...s, { id, ...t }]);
  }, []);

  useEffect(() => {
    if (!toasts.length) return;
    const timers: number[] = [];
    toasts.forEach((toast) => {
      const timeout = window.setTimeout(() => {
        setToasts((s) => s.filter((x) => x.id !== toast.id));
      }, toast.duration || 4000);
      timers.push(timeout);
    });
    return () => timers.forEach((t) => clearTimeout(t));
  }, [toasts]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div aria-live="polite" aria-atomic="true" className="fixed inset-x-0 bottom-6 flex items-end justify-center pointer-events-none z-50">
        <div className="w-full max-w-md px-4">
          <div className="space-y-3">
            {toasts.map((t) => (
              <div
                key={t.id}
                role="status"
                className={`pointer-events-auto rounded-md p-3 shadow-md transform transition-all duration-150 ${t.variant === "error" ? "bg-red-50 border border-red-200 text-red-800" : t.variant === "success" ? "bg-green-50 border border-green-200 text-green-800" : "bg-white border"}`}
                style={{ animation: "fade-in 160ms ease-out" }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 text-sm">{t.message}</div>
                  <button onClick={() => setToasts((s) => s.filter((x) => x.id !== t.id))} className="text-xs text-text-muted">Close</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ToastContext.Provider>
  );
}
