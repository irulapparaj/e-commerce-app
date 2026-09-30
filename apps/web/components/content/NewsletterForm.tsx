'use client';

import { useState } from 'react';

import { apiClient } from '@/lib/api/client';
import { isApiError } from '@/lib/api/envelope';

export function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(''); // honeypot
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) {
      setErrorMsg('Please tick the consent box to subscribe.');
      return;
    }
    setStatus('loading');
    setErrorMsg(null);

    try {
      await apiClient.post<{ status: string }>('/newsletter/subscribe', { email, website });
      setStatus('success');
      setEmail('');
      setConsent(false);
    } catch (err) {
      setErrorMsg(isApiError(err) ? err.message : 'Something went wrong. Please try again.');
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <p role="status" className="text-sm text-green-700 dark:text-green-300">
        You are subscribed. Thank you!
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" noValidate data-testid="newsletter-form">
      <div className="hidden" aria-hidden="true">
        <input tabIndex={-1} autoComplete="off" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>

      <div className="flex gap-2">
        <label htmlFor="nl-email" className="sr-only">Your email</label>
        <input
          id="nl-email"
          type="email"
          required
          placeholder="Your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50 transition-opacity whitespace-nowrap"
        >
          {status === 'loading' ? '…' : 'Subscribe'}
        </button>
      </div>

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent"
        />
        <span className="text-xs text-muted-foreground leading-relaxed">
          I agree to receive occasional emails from Invita Company. I can unsubscribe at any time.
        </span>
      </label>

      {errorMsg !== null && (
        <p role="alert" className="text-xs text-destructive">{errorMsg}</p>
      )}
    </form>
  );
}
