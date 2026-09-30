import { brand } from '@pe/shared';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';

import { CartDrawer } from '@/components/cart/CartDrawer';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { SkinProvider } from '@/components/layout/SkinProvider';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/layout/SkipLink';
import { IconSprite } from '@/components/ui/Icon';
import { ToastProvider } from '@/components/ui/Toast';
import { routing } from '@/i18n/routing';
import { getCategoryTree, getPublicSettings } from '@/lib/api/storefront';
import { getSession } from '@/lib/auth/session';
import { getWebEnv } from '@/lib/env';
import { parseSkin, SKIN_COOKIE, skinAttribute } from '@/lib/skins';
import { parseTheme, THEME_COOKIE } from '@/lib/theme';

import { fontClassName } from '../fonts';

import '@/app/globals.css';

const ACCOUNT_PATH = '/account';
const LOGIN_PATH = '/login';

/** Absent during `next build` (no runtime env); every request has it. */
const webOrigin = (): string | null => {
  try {
    return getWebEnv().WEB_ORIGIN;
  } catch {
    return null;
  }
};

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicSettings();
  const name = settings.brand.name || brand.name;
  const origin = webOrigin();
  return {
    ...(origin === null ? {} : { metadataBase: new URL(origin) }),
    title: { default: name, template: `%s · ${name}` },
    description: settings.brand.tagline || brand.tagline,
    alternates: { canonical: './' },
    robots: { index: true, follow: true },
    openGraph: { type: 'website', siteName: name, locale: 'en_IN' },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

interface LocaleLayoutProps {
  readonly children: ReactNode;
  readonly params: Promise<{ locale: string }>;
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  // Cookie hints render `data-theme` and `data-skin` on the server so nobody sees the defaults flash by.
  const cookieStore = await cookies();
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  const skin = parseSkin(cookieStore.get(SKIN_COOKIE)?.value);
  const [categories, settings, session] = await Promise.all([
    getCategoryTree(),
    getPublicSettings(),
    getSession(),
  ]);
  const signedIn = session !== null && session.aud === 'storefront';

  return (
    <html
      lang={locale}
      data-theme={theme ?? undefined}
      data-skin={skinAttribute(skin)}
      className={fontClassName}
    >
      <body className="flex min-h-dvh flex-col bg-bg font-body text-text">
        <NextIntlClientProvider>
          <SkinProvider initialSkin={skin}>
            <IconSprite />
            <SkipLink />
            <ToastProvider>
              <AnnouncementBar
                enabled={settings.announcementBar.enabled}
                text={settings.announcementBar.text}
              />
              <Header
                brandName={settings.brand.name || brand.name}
                categories={categories}
                accountHref={signedIn ? ACCOUNT_PATH : LOGIN_PATH}
                signedIn={signedIn}
                initialTheme={theme}
              />
              <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex-1 outline-none">
                {children}
              </main>
              <CartDrawer />
              <Footer
                categories={categories}
                settings={settings}
                showPlaceholderMarker={process.env.NODE_ENV !== 'production'}
              />
            </ToastProvider>
          </SkinProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
