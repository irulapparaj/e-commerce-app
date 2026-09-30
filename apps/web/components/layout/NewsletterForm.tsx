'use client';

import { useTranslations } from 'next-intl';
import type { FormEvent } from 'react';

import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';

/** UI only: submission is wired by a later plan (email provider + suppression list). */
export function NewsletterForm() {
  const t = useTranslations('footer.newsletter');
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  };
  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      data-testid="newsletter-form"
    >
      <div className="flex-1">
        <Field label={t('emailLabel')} id="newsletter-email">
          <Input
            type="email"
            name="email"
            autoComplete="email"
            placeholder={t('emailPlaceholder')}
            required
          />
        </Field>
      </div>
      <Button type="submit" variant="secondary">
        {t('submit')}
      </Button>
    </form>
  );
}
