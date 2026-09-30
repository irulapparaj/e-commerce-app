import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { JsonLd } from '@/components/catalogue/JsonLd';
import { Prose } from '@/components/content/Prose';
import { buildBreadcrumbJsonLd } from '@/lib/content/jsonld';
import { getPolicyContent, type PolicySlug } from '@/lib/content/load';
import { getWebEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const VALID_SLUGS: readonly PolicySlug[] = [
  'shipping', 'refund', 'privacy', 'terms', 'pricing',
];

const isValidSlug = (slug: string): slug is PolicySlug =>
  VALID_SLUGS.includes(slug as PolicySlug);

interface PageProps {
  readonly params: Promise<{ slug: string; locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!isValidSlug(slug)) return {};
  const content = await getPolicyContent(slug);
  if (content === null) return {};
  return {
    title: content.meta.title,
    description: content.meta.description,
  };
}

export default async function PolicyPage({ params }: PageProps) {
  const { slug } = await params;
  if (!isValidSlug(slug)) notFound();

  const content = await getPolicyContent(slug);
  if (content === null) notFound();

  const { WEB_ORIGIN } = getWebEnv();

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: 'Home', url: WEB_ORIGIN },
    { name: content.meta.title, url: `${WEB_ORIGIN}/policies/${slug}` },
  ]);

  return (
    <>
      <JsonLd data={breadcrumb} />

      <main className="mx-auto max-w-3xl px-4 py-16">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">{content.meta.title}</h1>
          {content.meta.lastUpdated !== undefined && (
            <p className="mt-2 text-sm text-muted-foreground">
              Last updated: {content.meta.lastUpdated}
            </p>
          )}
        </header>

        <Prose sections={content.sections} />
      </main>
    </>
  );
}
