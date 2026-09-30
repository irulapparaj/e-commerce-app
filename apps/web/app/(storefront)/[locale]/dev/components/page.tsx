import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';

import { ComponentGallery } from '@/components/dev/ComponentGallery';

export const metadata: Metadata = {
  title: 'Component gallery',
  robots: { index: false, follow: false },
};

interface GalleryPageProps {
  readonly params: Promise<{ locale: string }>;
}

/** Development only: every component in every state, in both themes, for visual regression. */
export default async function GalleryPage({ params }: GalleryPageProps) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { locale } = await params;
  setRequestLocale(locale);
  return <ComponentGallery />;
}
