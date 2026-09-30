'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { emailSchema } from '@pe/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { adminApi, isAdminApiError } from '@/lib/admin/api';
import type { StaffRow } from '@/lib/admin/types';

import { Dialog } from '../Dialog';
import { FormField } from '../FormField';
import { errorMessage } from '../settings/SettingField';

const NAME_MAX = 120;

const inviteSchema = z.strictObject({
  email: emailSchema,
  name: z.string().trim().min(1, 'Name is required').max(NAME_MAX),
  role: z.enum(['ADMIN', 'STAFF']),
});

type InviteInput = z.input<typeof inviteSchema>;
type InviteOutput = z.output<typeof inviteSchema>;

interface InviteDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onInvited: (user: StaffRow) => void;
}

const CANCELLED = 'Confirmation was cancelled; nobody was invited.';

/** `POST /admin/staff` (ADMIN ⚡): creates the account and emails the invite. */
export function InviteDialog({ open, onClose, onInvited }: InviteDialogProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<InviteInput, unknown, InviteOutput>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', name: '', role: 'STAFF' },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { data } = await adminApi.post<{ user: StaffRow }>('/admin/staff', values);
      form.reset();
      onInvited(data.user);
    } catch (error) {
      if (!isAdminApiError(error)) return setFormError('Could not send the invite. Try again.');
      setFormError(error.code === 'STEP_UP_REQUIRED' ? CANCELLED : error.message);
    }
  });

  return (
    <Dialog open={open} titleId="invite-title" onClose={onClose} testId="invite-dialog">
      <form onSubmit={(event) => void submit(event)} className="admin-dialog-body" noValidate>
        <h2 id="invite-title" className="admin-dialog-title">
          Invite a team member
        </h2>
        <p className="admin-muted">
          They receive an email with the sign-in link and must set up an authenticator app on first
          login.
        </p>
        <FormField id="invite-email" label="Email" error={errorMessage(errors, 'email')}>
          {(control) => (
            <input
              {...control}
              type="email"
              autoComplete="off"
              className="admin-input"
              data-autofocus
              data-testid="invite-email"
              {...form.register('email')}
            />
          )}
        </FormField>
        <FormField id="invite-name" label="Name" error={errorMessage(errors, 'name')}>
          {(control) => (
            <input
              {...control}
              type="text"
              className="admin-input"
              data-testid="invite-name"
              {...form.register('name')}
            />
          )}
        </FormField>
        <FormField id="invite-role" label="Role" error={errorMessage(errors, 'role')}>
          {(control) => (
            <select
              {...control}
              className="admin-select"
              data-testid="invite-role"
              {...form.register('role')}
            >
              <option value="STAFF">STAFF — fulfilment and content</option>
              <option value="ADMIN">ADMIN — owner/operator</option>
            </select>
          )}
        </FormField>
        {formError !== null && (
          <p role="alert" className="admin-error">
            {formError}
          </p>
        )}
        <div className="admin-dialog-actions">
          <button type="button" className="admin-btn" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button
            type="submit"
            className="admin-btn admin-btn-primary"
            disabled={isSubmitting}
            data-testid="invite-submit"
          >
            {isSubmitting ? 'Sending…' : 'Send invite'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
