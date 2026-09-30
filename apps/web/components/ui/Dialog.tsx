'use client';

import { useTranslations } from 'next-intl';
import { type MouseEvent, type ReactNode, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

import { IconButton } from './Button';
import { cx } from './cx';
import { useModal, useMounted } from './useModal';

interface DialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly children: ReactNode;
  readonly description?: string;
  readonly size?: 'sm' | 'md' | 'lg';
  readonly actions?: ReactNode;
  readonly testId?: string;
}

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' } as const;

/** Centred modal (promo popup, confirmations). The other surface allowed a shadow. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  description,
  size = 'md',
  actions,
  testId = 'dialog',
}: DialogProps) {
  const t = useTranslations('a11y');
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const mounted = useMounted();
  useModal({ open: open && mounted, onClose, panelRef });

  if (!open || !mounted) return null;

  const onBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return createPortal(
    <div
      data-modal-root=""
      className="fixed inset-0 z-overlay flex items-end justify-center bg-scrim p-4 motion-safe:animate-fade-in sm:items-center"
      onMouseDown={onBackdrop}
      data-testid={`${testId}-backdrop`}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description === undefined ? undefined : descriptionId}
        tabIndex={-1}
        data-testid={testId}
        className={cx(
          'relative flex w-full flex-col gap-4 rounded-control bg-surface p-6 text-text shadow-modal outline-none motion-safe:animate-scale-in',
          SIZES[size],
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="text-h3">
              {title}
            </h2>
            {description !== undefined && (
              <p id={descriptionId} className="text-small text-muted">
                {description}
              </p>
            )}
          </div>
          <IconButton
            icon="close"
            label={t('close')}
            size="sm"
            onClick={onClose}
            data-testid={`${testId}-close`}
          />
        </div>
        <div>{children}</div>
        {actions !== undefined && <div className="flex flex-wrap justify-end gap-2">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}
