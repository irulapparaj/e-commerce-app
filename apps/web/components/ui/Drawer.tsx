'use client';

import { useTranslations } from 'next-intl';
import { type MouseEvent, type ReactNode, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

import { IconButton } from './Button';
import { cx } from './cx';
import { useModal, useMounted } from './useModal';

interface DrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly children: ReactNode;
  readonly side?: 'left' | 'right';
  readonly footer?: ReactNode;
  readonly id?: string;
  readonly testId?: string;
}

/** Slide-in panel (cart, mobile nav). One of the two surfaces allowed a shadow. */
export function Drawer({
  open,
  onClose,
  title,
  children,
  side = 'right',
  footer,
  id,
  testId = 'drawer',
}: DrawerProps) {
  const t = useTranslations('a11y');
  const titleId = useId();
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
      className="fixed inset-0 z-overlay flex bg-scrim motion-safe:animate-fade-in"
      onMouseDown={onBackdrop}
      data-testid={`${testId}-backdrop`}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        id={id}
        tabIndex={-1}
        data-testid={testId}
        className={cx(
          'relative flex h-full w-full max-w-md flex-col bg-bg text-text shadow-drawer outline-none',
          side === 'right'
            ? 'ml-auto motion-safe:animate-slide-in-right'
            : 'mr-auto motion-safe:animate-slide-in-left',
        )}
      >
        <header className="flex min-h-header items-center justify-between gap-4 border-b border-hairline px-gutter">
          <h2 id={titleId} className="text-h3">
            {title}
          </h2>
          <IconButton
            icon="close"
            label={t('close')}
            onClick={onClose}
            data-testid={`${testId}-close`}
          />
        </header>
        <div className="flex-1 overflow-y-auto px-gutter py-4">{children}</div>
        {footer !== undefined && (
          <footer className="border-t border-hairline px-gutter py-4">{footer}</footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
