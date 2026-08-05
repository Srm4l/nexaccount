import { useEffect, useState } from "react";

type ToastType = "success" | "error" | "info" | "gold";

type ToastMessage = {
  id: number;
  message: string;
  type: ToastType;
};

let toastListeners: Array<(toast: ToastMessage) => void> = [];

export function showToast(message: string, type: ToastType = "success") {
  const id = Date.now() + Math.random();
  toastListeners.forEach((listener) => listener({ id, message, type }));
}

export function ToastHost() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const listener = (toast: ToastMessage) => {
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 3500);
    };
    toastListeners.push(listener);
    return () => {
      toastListeners = toastListeners.filter((l) => l !== listener);
    };
  }, []);

  return (
    <div className="fixed bottom-5 right-5 z-[999] flex flex-col gap-3 items-end pointer-events-none">
      {toasts.map((t) => {
        const icons = { success: "✅", error: "❌", info: "ℹ️", gold: "⭐" };
        const borderColors = {
          success: "border-[#00D2D3]",
          error: "border-red-500",
          info: "border-[#6C5CE7]",
          gold: "border-[#FFD700]",
        };
        return (
          <div
            key={t.id}
            className={`bg-[#17172B] border ${borderColors[t.type]} rounded-xl px-4 py-3 flex items-center gap-3 shadow-xl max-w-xs pointer-events-auto transform translate-y-0 transition-transform duration-300`}
          >
            <span className="text-lg">{icons[t.type]}</span>
            <span className="text-sm font-medium text-white">{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}
