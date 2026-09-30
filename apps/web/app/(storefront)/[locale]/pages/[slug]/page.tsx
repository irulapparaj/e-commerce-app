import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { JsonLd } from '@/components/catalogue/JsonLd';
import { ContactForm } from '@/components/content/ContactForm';
import { Faq } from '@/components/content/Faq';
import { Prose } from '@/components/content/Prose';
import { SellerForm } from '@/components/content/SellerForm';
import { FAQ_ITEMS, buildFaqJsonLd } from '@/lib/content/faq';
import { buildBreadcrumbJsonLd } from '@/lib/content/jsonld';
import { getPageContent, type PageSlug } from '@/lib/content/load';
import { getWebEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const VALID_SLUGS: readonly PageSlug[] = [
  'about-us', 'contact', 'faq', 'grievance-redressal', 'become-a-seller', 'knowledge-hub',
];

const isValidSlug = (slug: string): slug is PageSlug =>
  VALID_SLUGS.includes(slug as PageSlug);

interface PageProps {
  readonly params: Promise<{ slug: string; locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!isValidSlug(slug)) return {};
  const content = await getPageContent(slug);
  if (content === null) return {};
  return {
    title: content.meta.title,
    description: content.meta.description,
    ...(content.meta.noindex ? { robots: { index: false } } : {}),
  };
}

export default async function StaticPage({ params }: PageProps) {
  const { slug } = await params;
  if (!isValidSlug(slug)) notFound();

  const content = await getPageContent(slug);
  if (content === null) notFound();

  const { WEB_ORIGIN } = getWebEnv();
  const breadcrumb = buildBreadcrumbJsonLd([
    { name: 'Home', url: WEB_ORIGIN },
    { name: content.meta.title, url: `${WEB_ORIGIN}/pages/${slug}` },
  ]);

  const extraJsonLd =
    slug === 'faq' ? buildFaqJsonLd(FAQ_ITEMS) : null;

  return (
    <>
      <JsonLd data={breadcrumb} />
      {extraJsonLd !== null && <JsonLd data={extraJsonLd} />}

      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-3xl font-bold text-foreground mb-8">{content.meta.title}</h1>

        <Prose sections={content.sections} />

        {slug === 'faq' && (
          <section className="mt-12">
            <h2 className="text-xl font-semibold text-foreground mb-6">Frequently asked questions</h2>
            <Faq items={FAQ_ITEMS} />
          </section>
        )}

        {slug === 'contact' && (
          <section className="mt-12">
            <ContactForm />
          </section>
        )}

        {slug === 'become-a-seller' && (
          <section className="mt-12">
            <SellerForm />
          </section>
        )}
      </main>
    </>
  );
}
