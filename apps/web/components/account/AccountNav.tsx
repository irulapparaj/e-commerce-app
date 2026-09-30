'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';

const NAV_ITEMS = [
  { key: 'overview' as const, href: '/account' },
  { key: 'orders' as const, href: '/account/orders' },
  { key: 'addresses' as const, href: '/account/addresses' },
  { key: 'security' as const, href: '/account/security' },
] as const;

export function AccountNav() {
  const t = useTranslations('account');
  const pathname = usePathname();

  return (
    <nav aria-label="Account navigation">
      <ul
        role="list"
        style={{
          display: 'flex',
          gap: 'var(--space-1)',
          listStyle: 'none',
          padding: 0,
          margin: 0,
          borderBottom: '1px solid var(--hairline)',
          marginBottom: 'var(--space-4)',
        }}
      >
        {NAV_ITEMS.map(({ key, href }) => {
          const active = key === 'overview' ? pathname.endsWith('/account') : pathname.includes(href);
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                style={{
                  display: 'block',
                  padding: 'var(--space-2) var(--space-1)',
                  fontWeight: active ? '600' : '400',
                  color: active ? 'var(--text)' : 'var(--muted)',
                  borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                  marginBottom: '-1px',
                  textDecoration: 'none',
                  fontSize: 'var(--text-small)',
                  transition: 'color var(--duration-fast) var(--ease-out)',
                }}
              >
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
