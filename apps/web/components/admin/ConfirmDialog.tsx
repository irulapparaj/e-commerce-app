'use client';

import type { ReactNode } from 'react';

import { Dialog } from './Dialog';

interface ConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly body: ReactNode;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly destructive?: boolean;
  readonly busy?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly testId?: string;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
  testId = 'confirm-dialog',
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      titleId="confirm-title"
      describedBy="confirm-body"
      onClose={onCancel}
      size="sm"
      testId={testId}
    >
      <div className="admin-dialog-body">
        <h2 id="confirm-title" className="admin-dialog-title">
          {title}
        </h2>
        <div id="confirm-body" className="admin-dialog-text">
          {body}
        </div>
        <div className="admin-dialog-actions">
          <button
            type="button"
            className="admin-btn"
            onClick={onCancel}
            disabled={busy}
            data-autofocus
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={destructive ? 'admin-btn admin-btn-danger' : 'admin-btn admin-btn-primary'}
            onClick={onConfirm}
            disabled={busy}
            data-testid="confirm-accept"
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
