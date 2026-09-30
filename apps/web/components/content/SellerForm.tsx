'use client';

import { useState } from 'react';

import { apiClient } from '@/lib/api/client';
import { isApiError } from '@/lib/api/envelope';

interface FormState {
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  gstin: string;
  productCategories: string;
  message: string;
  website: string; // honeypot
}

const INITIAL: FormState = {
  businessName: '', contactName: '', email: '', phone: '',
  gstin: '', productCategories: '', message: '', website: '',
};

export function SellerForm() {
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
      const result = await apiClient.post<{ ticketId: string }>('/forms/seller-inquiry', {
        businessName: form.businessName,
        contactName: form.contactName,
        email: form.email,
        phone: form.phone,
        ...(form.gstin ? { gstin: form.gstin } : {}),
        productCategories: form.productCategories,
        message: form.message,
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
        <p className="font-medium">Inquiry received</p>
        <p className="mt-1 text-sm">
          Thank you for your interest. Your reference is <strong>{ticketId}</strong>. We will be in touch within 5 business days.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="hidden" aria-hidden="true">
        <input tabIndex={-1} autoComplete="off" name="website" value={form.website} onChange={set('website')} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="sf-business" className="mb-1.5 block text-sm font-medium text-foreground">Business name</label>
          <input id="sf-business" type="text" required maxLength={120} value={form.businessName} onChange={set('businessName')}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
        </div>
        <div>
          <label htmlFor="sf-contact" className="mb-1.5 block text-sm font-medium text-foreground">Contact person</label>
          <input id="sf-contact" type="text" required maxLength={80} value={form.contactName} onChange={set('contactName')}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="sf-email" className="mb-1.5 block text-sm font-medium text-foreground">Email</label>
          <input id="sf-email" type="email" required value={form.email} onChange={set('email')}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
        </div>
        <div>
          <label htmlFor="sf-phone" className="mb-1.5 block text-sm font-medium text-foreground">Phone</label>
          <input id="sf-phone" type="tel" required value={form.phone} onChange={set('phone')}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="sf-gstin" className="mb-1.5 block text-sm font-medium text-foreground">
            GSTIN <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <input id="sf-gstin" type="text" maxLength={15} value={form.gstin} onChange={set('gstin')}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
        </div>
        <div>
          <label htmlFor="sf-categories" className="mb-1.5 block text-sm font-medium text-foreground">Product categories</label>
          <input id="sf-categories" type="text" required maxLength={200} value={form.productCategories} onChange={set('productCategories')}
            placeholder="e.g. Agarbatti, Diyas, Camphor"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
        </div>
      </div>

      <div>
        <label htmlFor="sf-message" className="mb-1.5 block text-sm font-medium text-foreground">Tell us about your products</label>
        <textarea id="sf-message" required rows={5} minLength={10} maxLength={2000} value={form.message} onChange={set('message')}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent resize-y" />
      </div>

      {status === 'error' && errorMsg !== null && (
        <p role="alert" className="text-sm text-destructive">{errorMsg}</p>
      )}

      <button type="submit" disabled={status === 'loading'}
        className="rounded-md bg-accent px-6 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50 transition-opacity">
        {status === 'loading' ? 'Sending…' : 'Submit inquiry'}
      </button>
    </form>
  );
}
