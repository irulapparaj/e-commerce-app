'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

export type ToastTone = 'info' | 'success' | 'critical';

interface ToastItem {
  readonly id: number;
  readonly message: string;
  readonly tone: ToastTone;
}

interface ToastContextValue {
  readonly notify: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
const AUTO_DISMISS_MS = 5000;

export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly ToastItem[]>([]);
  const sequence = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      sequence.current += 1;
      const id = sequence.current;
      setToasts((current) => [...current, { id, message, tone }]);
      window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="admin-toasts" role="status" aria-live="polite" data-testid="toast-region">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`admin-toast admin-toast-${toast.tone}`}
            data-testid="toast"
          >
            <span>{toast.message}</span>
            <button
              type="button"
              className="admin-toast-close"
              aria-label="Dismiss notification"
              onClick={() => dismiss(toast.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (context === null) throw new Error('useToast must be used inside ToastProvider');
  return context;
};
