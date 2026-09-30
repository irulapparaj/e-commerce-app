import type { ComponentProps } from 'react';

import { Link as IntlLink } from '@/i18n/navigation';

export type LinkVariant = 'inline' | 'nav' | 'quiet' | 'unstyled';

/** Ink links with hairline underlines; hover darkens the underline, never the colour. */
const VARIANTS: Readonly<Record<LinkVariant, string>> = {
  inline:
    'text-text underline decoration-hairline underline-offset-4 transition-colors duration-fast ease-out hover:decoration-text',
  nav: 'inline-flex min-h-touch items-center text-base text-text no-underline hover:underline hover:decoration-hairline hover:underline-offset-4',
  quiet:
    'text-muted no-underline transition-colors duration-fast ease-out hover:text-text hover:underline hover:decoration-hairline hover:underline-offset-4',
  unstyled: 'no-underline',
};

interface LinkProps extends Omit<ComponentProps<typeof IntlLink>, 'className'> {
  readonly variant?: LinkVariant;
}

/** Locale-aware internal link (`@/i18n/navigation`). */
export function Link({ variant = 'inline', ...rest }: LinkProps) {
  return <IntlLink className={VARIANTS[variant]} {...rest} />;
}

interface ExternalLinkProps extends Omit<ComponentProps<'a'>, 'className' | 'rel' | 'target'> {
  readonly variant?: LinkVariant;
}

export function ExternalLink({ variant = 'inline', ...rest }: ExternalLinkProps) {
  return <a className={VARIANTS[variant]} rel="noopener noreferrer" target="_blank" {...rest} />;
}
