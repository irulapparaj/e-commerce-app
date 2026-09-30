'use client';

import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

import { Accordion } from '@/components/ui/Accordion';
import { IconButton } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Icon } from '@/components/ui/Icon';
import { Link as IntlLink } from '@/i18n/navigation';
import type { CategoryNode } from '@/lib/api/types';

import { collectionHref } from './MegaMenuPanel';

const ITEM_LINK =
  'inline-flex min-h-touch w-full items-center text-base text-text no-underline hover:underline hover:decoration-hairline hover:underline-offset-4';

interface MobileNavProps {
  readonly categories: readonly CategoryNode[];
  readonly accountHref: string;
  readonly signedIn: boolean;
}

/** Hamburger → left drawer with one accordion level per category. */
export function MobileNav({ categories, accountHref, signedIn }: MobileNavProps) {
  const t = useTranslations('shell');
  const tn = useTranslations('nav');
  const [open, setOpen] = useState(false);
  const drawerId = useId();
  const close = () => setOpen(false);

  return (
    <div className="xl:hidden">
      <IconButton
        icon="menu"
        label={t('openMenu')}
        aria-expanded={open}
        aria-controls={open ? drawerId : undefined}
        onClick={() => setOpen(true)}
        data-testid="mobile-nav-open"
      />
      <Drawer
        open={open}
        onClose={close}
        title={t('menuTitle')}
        side="left"
        id={drawerId}
        testId="mobile-nav"
        footer={
          <IntlLink href={accountHref} className={ITEM_LINK} onClick={close}>
            <Icon name="user" className="mr-2" />
            {signedIn ? t('account') : t('signIn')}
          </IntlLink>
        }
      >
        <nav aria-label={tn('mobile')}>
          {categories.length === 0 ? (
            <p className="text-muted">{tn('empty')}</p>
          ) : (
            <Accordion type="multiple" headingLevel={3}>
              {categories.map((category) =>
                category.children.length === 0 ? (
                  <div key={category.id} className="border-b border-hairline py-2">
                    <IntlLink
                      href={collectionHref(category.slug)}
                      className={ITEM_LINK}
                      onClick={close}
                    >
                      {category.name}
                    </IntlLink>
                  </div>
                ) : (
                  <Accordion.Item key={category.id} id={category.slug} title={category.name}>
                    <ul className="flex flex-col pl-4">
                      {category.children.map((child) => (
                        <li key={child.id}>
                          <IntlLink
                            href={collectionHref(child.slug)}
                            className={ITEM_LINK}
                            onClick={close}
                          >
                            {child.name}
                          </IntlLink>
                        </li>
                      ))}
                      <li>
                        <IntlLink
                          href={collectionHref(category.slug)}
                          className={`${ITEM_LINK} font-medium underline decoration-hairline underline-offset-4`}
                          onClick={close}
                        >
                          {tn('exploreAll', { category: category.name })}
                        </IntlLink>
                      </li>
                    </ul>
                  </Accordion.Item>
                ),
              )}
            </Accordion>
          )}
        </nav>
      </Drawer>
    </div>
  );
}
