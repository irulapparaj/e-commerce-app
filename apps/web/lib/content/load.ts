import 'server-only';

import { getPlaceholders, resolvePlaceholders } from './placeholders';

export interface ContentMeta {
  readonly title: string;
  readonly description: string;
  readonly lastUpdated?: string;
  readonly noindex?: boolean;
}

export interface ContentPage {
  readonly meta: ContentMeta;
  readonly sections: readonly ContentSection[];
}

export interface ContentSection {
  readonly heading?: string;
  readonly body: string;
}

/** Resolve all {{placeholder}} tokens in every section body, server-side. */
export const resolveContent = async (page: ContentPage): Promise<ContentPage> => {
  const placeholders = await getPlaceholders();
  return {
    ...page,
    sections: page.sections.map((section) => ({
      ...section,
      body: resolvePlaceholders(section.body, placeholders),
    })),
  };
};

export type PageSlug = 'about-us' | 'contact' | 'faq' | 'grievance-redressal' | 'become-a-seller' | 'knowledge-hub';
export type PolicySlug = 'shipping' | 'refund' | 'privacy' | 'terms' | 'pricing';

/** Dynamic imports so tree-shaking keeps bundles clean per-route. */
export const getPageContent = async (slug: PageSlug): Promise<ContentPage | null> => {
  try {
    const mod = await import(`../../content/pages/${slug}`) as { content: ContentPage };
    return resolveContent(mod.content);
  } catch {
    return null;
  }
};

export const getPolicyContent = async (slug: PolicySlug): Promise<ContentPage | null> => {
  try {
    const mod = await import(`../../content/policies/${slug}`) as { content: ContentPage };
    return resolveContent(mod.content);
  } catch {
    return null;
  }
};
