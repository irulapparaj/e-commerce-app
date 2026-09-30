'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { SearchOverlay } from '@/components/catalogue/SearchOverlay';
import { IconButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Link as IntlLink } from '@/i18n/navigation';
import type { CategoryNode } from '@/lib/api/types';
import { formatCartCount } from '@/lib/format';
import type { Theme } from '@/lib/theme';
import { useCartCount, useCartStore, useSetCartOpen } from '@/stores/cart';

import { SkinMenu } from './SkinMenu';
import { ThemeToggle } from './ThemeToggle';

interface HeaderActionsProps {
  readonly categories: readonly CategoryNode[];
  readonly accountHref: string;
  readonly signedIn: boolean;
  readonly initialTheme: Theme | null;
}

/** Search (P10 overlay), account, cart (P11 drawer) and the theme switch. */
export function HeaderActions({
  categories,
  accountHref,
  signedIn,
  initialTheme,
}: HeaderActionsProps) {
  const t = useTranslations('shell');
  const locale = useLocale();
  const count = useCartCount();
  const hydrate = useCartStore((s) => s.hydrate);
  const setCartOpen = useSetCartOpen();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  const accountLabel = signedIn ? t('account') : t('signIn');

  return (
    <>
      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        locale={locale}
        categories={categories}
      />
      <div className="ml-auto flex items-center gap-1">
        {/* Search and account live in the mobile drawer; hide them from the header at <lg. */}
        <div className="hidden lg:flex lg:items-center lg:gap-1">
          <IconButton
            icon="search"
            label={t('search')}
            aria-haspopup="dialog"
            aria-expanded={searchOpen}
            data-testid="search-trigger"
            onClick={() => setSearchOpen(true)}
          />
          <IntlLink
            href={accountHref}
            aria-label={accountLabel}
            className="inline-flex size-touch items-center justify-center rounded-control border border-transparent text-text no-underline transition-colors duration-fast ease-out hover:border-hairline hover:bg-surface"
            data-testid="account-link"
          >
            <Icon name="user" />
          </IntlLink>
        </div>
        <IconButton
          icon="bag"
          label={t('cartWithCount', { count })}
          aria-haspopup="dialog"
          aria-expanded={false}
          data-testid="cart-trigger"
          onClick={() => setCartOpen(true)}
        >
          {count > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-accent px-1 text-caption font-semibold tabular-nums text-accent-contrast"
              data-testid="cart-count"
            >
              {formatCartCount(count)}
            </span>
          )}
        </IconButton>
        <SkinMenu />
        <ThemeToggle initialTheme={initialTheme} />
      </div>
    </>
  );
}
