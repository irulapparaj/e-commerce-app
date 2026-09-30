import type { PublicSettings } from '@pe/shared';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/Badge';
import { ExternalLink, Link } from '@/components/ui/Link';
import { Container } from '@/components/ui/Primitives';
import type { CategoryNode } from '@/lib/api/types';

import { NewsletterForm } from '../content/NewsletterForm';

const collectionHref = (slug: string): string => `/collections/${slug}`;

type QuickLinkKey = 'about' | 'contact' | 'faq' | 'blog' | 'seller' | 'grievance';
type PolicyLinkKey = 'shipping' | 'refund' | 'privacy' | 'terms' | 'pricing';
type SocialKey = 'facebook' | 'instagram' | 'youtube' | 'x' | 'linkedin';

const QUICK_LINKS: readonly (readonly [QuickLinkKey, string])[] = [
  ['about', '/pages/about-us'],
  ['contact', '/pages/contact'],
  ['faq', '/pages/faq'],
  ['blog', '/pages/knowledge-hub'],
  ['seller', '/pages/become-a-seller'],
  ['grievance', '/pages/grievance-redressal'],
];

const POLICY_LINKS: readonly (readonly [PolicyLinkKey, string])[] = [
  ['shipping', '/policies/shipping'],
  ['refund', '/policies/refund'],
  ['privacy', '/policies/privacy'],
  ['terms', '/policies/terms'],
  ['pricing', '/policies/pricing'],
];

/** Placeholder profiles until the brand hands over its handles (settings, later). */
const SOCIAL_LINKS: readonly (readonly [SocialKey, string])[] = [
  ['facebook', 'https://www.facebook.com/'],
  ['instagram', 'https://www.instagram.com/'],
  ['youtube', 'https://www.youtube.com/'],
  ['x', 'https://x.com/'],
  ['linkedin', 'https://www.linkedin.com/'],
];

interface FooterColumnProps {
  readonly heading: string;
  readonly children: ReactNode;
}

function FooterColumn({ heading, children }: FooterColumnProps) {
  return (
    <div className="col-span-1 flex flex-col gap-3 md:col-span-3">
      <h2 className="small-caps font-body text-small text-muted">{heading}</h2>
      {children}
    </div>
  );
}

interface FooterProps {
  readonly categories: readonly CategoryNode[];
  readonly settings: PublicSettings;
  /** `NODE_ENV !== 'production'`: marks placeholder business details in dev and test. */
  readonly showPlaceholderMarker: boolean;
}

export function Footer({ categories, settings, showPlaceholderMarker }: FooterProps) {
  const t = useTranslations('footer');
  const year = new Date().getFullYear();

  return (
    <footer
      aria-label={t('label')}
      className="mt-auto border-t border-hairline bg-bg text-text"
      data-testid="site-footer"
    >
      <Container>
        <div className="grid grid-cols-1 gap-8 py-12 md:grid-cols-12 md:gap-6">
          <div className="flex flex-col gap-2 md:col-span-5">
            <h2 className="text-h3">{t('newsletter.heading')}</h2>
            <p className="text-base text-muted">{t('newsletter.body')}</p>
          </div>
          <div className="md:col-span-6 md:col-start-7">
            <NewsletterForm />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 border-t border-hairline py-12 md:grid-cols-12 md:gap-6">
          <FooterColumn heading={t('shop')}>
            <ul className="flex flex-col gap-2">
              {categories.map((category) => (
                <li key={category.id}>
                  <Link href={collectionHref(category.slug)} variant="quiet">
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </FooterColumn>
          <FooterColumn heading={t('quickLinks')}>
            <ul className="flex flex-col gap-2">
              {QUICK_LINKS.map(([key, href]) => (
                <li key={key}>
                  <Link href={href} variant="quiet">
                    {t(`links.${key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </FooterColumn>
          <FooterColumn heading={t('policies')}>
            <ul className="flex flex-col gap-2">
              {POLICY_LINKS.map(([key, href]) => (
                <li key={key}>
                  <Link href={href} variant="quiet">
                    {t(`links.${key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </FooterColumn>
          <FooterColumn heading={t('business')}>
            <address
              className="flex flex-col gap-1 text-small text-muted not-italic"
              data-testid="business-block"
            >
              <span className="text-text">{settings.brand.name}</span>
              <span>{settings.business.legalName}</span>
              <span className="tabular-nums">{t('gstin', { gstin: settings.business.gstin })}</span>
              <span className="tabular-nums">{t('udyam')}</span>
              <span>{settings.business.addressLines.join(', ')}</span>
              <span>{t('dispatchedFrom', { city: settings.pickupLocation.city })}</span>
              {showPlaceholderMarker && settings.business.isPlaceholder && (
                <span data-testid="placeholder-marker">
                  <Badge tone="critical">{t('placeholderMarker')}</Badge>
                </span>
              )}
            </address>
          </FooterColumn>
        </div>

        <div className="flex flex-col gap-4 border-t border-hairline py-6 text-small text-muted md:flex-row md:items-center md:justify-between">
          <p>{t('copyright', { year, brand: settings.brand.name })}</p>
          <ul aria-label={t('social.heading')} className="flex flex-wrap gap-x-5 gap-y-2">
            {SOCIAL_LINKS.map(([key, href]) => (
              <li key={key}>
                <ExternalLink href={href} variant="quiet">
                  {t(`social.${key}`)}
                </ExternalLink>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </footer>
  );
}
