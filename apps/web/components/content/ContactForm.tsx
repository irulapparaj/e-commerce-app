'use client';

import { useState } from 'react';

import { apiClient } from '@/lib/api/client';
import { isApiError } from '@/lib/api/envelope';

interface FormState {
  name: string;
  email: string;
  subject: string;
  message: string;
  orderNumber: string;
  website: string; // honeypot
}

const INITIAL: FormState = { name: '', email: '', subject: '', message: '', orderNumber: '', website: '' };

export function ContactForm() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg(null);

    try {
      const result = await apiClient.post<{ ticketId: string }>('/forms/contact', {
        name: form.name,
        email: form.email,
        subject: form.subject,
        message: form.message,
        ...(form.orderNumber ? { orderNumber: form.orderNumber } : {}),
        website: form.website,
      });
      setTicketId(result.data.ticketId);
      setStatus('success');
      setForm(INITIAL);
    } catch (err) {
      setErrorMsg(isApiError(err) ? err.message : 'Something went wrong. Please try again.');
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div role="alert" className="rounded-lg border border-green-200 bg-green-50 p-6 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
        <p className="font-medium">Message sent</p>
        <p className="mt-1 text-sm">
          We received your message. Your reference is <strong>{ticketId}</strong>. We will reply within 24 business hours.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {/* Honeypot — hidden from human users */}
      <div className="hidden" aria-hidden="true">
        <input tabIndex={-1} autoComplete="off" name="website" value={form.website} onChange={set('website')} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="cf-name" className="mb-1.5 block text-sm font-medium text-foreground">Name</label>
          <input id="cf-name" type="text" required maxLength={80} value={form.name} onChange={set('name')}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
        </div>
        <div>
          <label htmlFor="cf-email" className="mb-1.5 block text-sm font-medium text-foreground">Email</label>
          <input id="cf-email" type="email" required value={form.email} onChange={set('email')}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
        </div>
      </div>

      <div>
        <label htmlFor="cf-subject" className="mb-1.5 block text-sm font-medium text-foreground">Subject</label>
        <input id="cf-subject" type="text" required maxLength={120} value={form.subject} onChange={set('subject')}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
      </div>

      <div>
        <label htmlFor="cf-order" className="mb-1.5 block text-sm font-medium text-foreground">
          Order number <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <input id="cf-order" type="text" maxLength={40} value={form.orderNumber} onChange={set('orderNumber')}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
      </div>

      <div>
        <label htmlFor="cf-message" className="mb-1.5 block text-sm font-medium text-foreground">Message</label>
        <textarea id="cf-message" required rows={5} minLength={10} maxLength={2000} value={form.message} onChange={set('message')}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent resize-y" />
      </div>

      {status === 'error' && errorMsg !== null && (
        <p role="alert" className="text-sm text-destructive">{errorMsg}</p>
      )}

      <button type="submit" disabled={status === 'loading'}
        className="rounded-md bg-accent px-6 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50 transition-opacity">
        {status === 'loading' ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
}
