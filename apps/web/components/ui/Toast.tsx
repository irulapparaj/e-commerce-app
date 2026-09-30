'use client';

import { useTranslations } from 'next-intl';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

import { IconButton } from './Button';
import { cx } from './cx';

export type ToastTone = 'info' | 'success' | 'critical';

export interface ToastItem {
  readonly id: number;
  readonly message: string;
  readonly tone: ToastTone;
}

export interface NotifyOptions {
  readonly tone?: ToastTone;
  readonly durationMs?: number;
}

export interface ToastContextValue {
  readonly notify: (message: string, options?: NotifyOptions) => number;
  readonly dismiss: (id: number) => void;
}

const DEFAULT_DURATION_MS = 5000;
const TONES: Readonly<Record<ToastTone, string>> = {
  info: 'text-text',
  success: 'text-success',
  critical: 'text-critical',
};

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (context === null) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
};

interface ToastRegionProps {
  readonly items: readonly ToastItem[];
  readonly onDismiss: (id: number) => void;
}

function ToastRegion({ items, onDismiss }: ToastRegionProps) {
  const t = useTranslations('a11y');
  return (
    <section
      aria-label={t('notifications')}
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-toast flex flex-col items-center gap-2 px-gutter"
      data-testid="toast-region"
    >
      {items.map((item) => (
        <div
          key={item.id}
          role="status"
          data-testid="toast"
          className="pointer-events-auto flex max-w-md items-center gap-3 rounded-control border border-hairline bg-surface py-2 pr-2 pl-4 text-small motion-safe:animate-fade-in"
        >
          <span className={cx('font-medium', TONES[item.tone])}>{item.message}</span>
          <IconButton
            icon="close"
            size="sm"
            iconSize={16}
            label={t('dismiss')}
            onClick={() => onDismiss(item.id)}
          />
        </div>
      ))}
    </section>
  );
}

/** Quiet, bottom-centred status messages; each dismisses itself after five seconds. */
export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [items, setItems] = useState<readonly ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, { tone = 'info', durationMs = DEFAULT_DURATION_MS }: NotifyOptions = {}) => {
      nextId.current += 1;
      const id = nextId.current;
      setItems((current) => [...current, { id, message, tone }]);
      window.setTimeout(() => dismiss(id), durationMs);
      return id;
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastRegion items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}
