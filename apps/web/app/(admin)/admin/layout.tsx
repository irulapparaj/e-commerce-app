import { brand } from '@pe/shared';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import { parseTheme, THEME_COOKIE } from '@/lib/theme';

import '@/app/globals.css';

export const metadata: Metadata = {
  title: { default: `Admin · ${brand.name}`, template: `%s · Admin · ${brand.name}` },
  robots: { index: false, follow: false },
};

/** Same theme cookie as the storefront, so a staff member's explicit choice follows them into the console. */
export default async function AdminLayout({ children }: { readonly children: ReactNode }) {
  const cookieStore = await cookies();
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  return (
    <html lang="en" data-theme={theme ?? undefined}>
      <body>{children}</body>
    </html>
  );
}
