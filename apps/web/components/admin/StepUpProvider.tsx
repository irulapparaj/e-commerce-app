'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { setStepUpHandler } from '@/lib/admin/api';
import { secondsUntil } from '@/lib/admin/format';

import { AdminStepUpDialog } from './AdminStepUpDialog';

interface StepUpContextValue {
  /** Epoch seconds when the current step-up window closes, null when none is active. */
  readonly stepUpExp: number | null;
  readonly requestStepUp: () => Promise<boolean>;
}

interface PendingRequest {
  readonly id: number;
  readonly resolve: (ok: boolean) => void;
}

interface StepUpProviderProps {
  readonly children: ReactNode;
  readonly initialStepUpExp?: number | null;
}

const StepUpContext = createContext<StepUpContextValue | null>(null);
const TICK_MS = 1000;

/** Owns the TOTP dialog and registers it with `adminApi` so any 403 STEP_UP_REQUIRED opens it. */
export function StepUpProvider({ children, initialStepUpExp = null }: StepUpProviderProps) {
  const [stepUpExp, setStepUpExp] = useState<number | null>(initialStepUpExp);
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const sequence = useRef(0);

  const requestStepUp = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        sequence.current += 1;
        setPending({ id: sequence.current, resolve });
      }),
    [],
  );

  useEffect(() => setStepUpHandler(requestStepUp), [requestStepUp]);

  const settle = (ok: boolean, exp?: number) => {
    pending?.resolve(ok);
    setPending(null);
    if (exp !== undefined) setStepUpExp(exp);
  };

  const value = useMemo(() => ({ stepUpExp, requestStepUp }), [stepUpExp, requestStepUp]);

  return (
    <StepUpContext.Provider value={value}>
      {children}
      <AdminStepUpDialog
        key={pending?.id ?? 0}
        open={pending !== null}
        onSuccess={(exp) => settle(true, exp)}
        onCancel={() => settle(false)}
      />
    </StepUpContext.Provider>
  );
}

export const useStepUp = (): StepUpContextValue => {
  const context = useContext(StepUpContext);
  if (context === null) throw new Error('useStepUp must be used inside StepUpProvider');
  return context;
};

/** Seconds left in the step-up window, ticking once a second; 0 when none is active. */
export const useStepUpRemaining = (): number => {
  const { stepUpExp } = useStepUp();
  const [remaining, setRemaining] = useState(() => secondsUntil(stepUpExp, Date.now()));

  useEffect(() => {
    setRemaining(secondsUntil(stepUpExp, Date.now()));
    if (stepUpExp === null) return undefined;
    const timer = window.setInterval(
      () => setRemaining(secondsUntil(stepUpExp, Date.now())),
      TICK_MS,
    );
    return () => window.clearInterval(timer);
  }, [stepUpExp]);

  return remaining;
};
