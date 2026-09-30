import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';

import en from '@/messages/en.json';

export const messages = en;

export function IntlWrapper({ children }: { readonly children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Kolkata">
      {children}
    </NextIntlClientProvider>
  );
}

/** Components read every string through next-intl, so tests render inside the `en` provider. */
export const renderWithIntl = (
  ui: ReactElement,
  options: Omit<RenderOptions, 'wrapper'> = {},
): RenderResult => render(ui, { wrapper: IntlWrapper, ...options });
