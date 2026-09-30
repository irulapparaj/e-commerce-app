'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { IconButton } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Icon } from '@/components/ui/Icon';
import { DEFAULT_SKIN, SKIN_IDS, type SkinId } from '@/lib/skins';

import { useSkin } from './SkinProvider';

interface SkinOptionProps {
  readonly id: SkinId;
  readonly checked: boolean;
  readonly onSelect: (id: SkinId) => void;
}

/**
 * The preview chip carries `data-skin` (and pins `data-theme="light"`), so its dots and the name's
 * typeface resolve to that skin's own tokens through the cascade — no colour literals in TypeScript.
 */
function SkinOption({ id, checked, onSelect }: SkinOptionProps) {
  const t = useTranslations('appearance');
  return (
    <label className="flex cursor-pointer items-center gap-4 rounded-control border border-hairline p-3 transition-colors duration-fast ease-out hover:bg-surface has-[:checked]:border-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent">
      <input
        type="radio"
        name="skin"
        value={id}
        checked={checked}
        onChange={() => onSelect(id)}
        className="sr-only"
        data-testid={`skin-option-${id}`}
      />
      <span
        data-skin={id}
        data-theme="light"
        aria-hidden="true"
        className="flex shrink-0 items-center gap-1 rounded-control border border-hairline bg-bg p-2"
      >
        <span className="size-4 rounded-full bg-hero" />
        <span className="size-4 rounded-full bg-accent" />
        <span className="size-4 rounded-full bg-text" />
        <span className="size-4 rounded-full border border-hairline bg-surface" />
      </span>
      <span className="flex flex-1 flex-col">
        <span className="flex items-center gap-2">
          <span data-skin={id} className="font-display text-h3 leading-tight">
            {t(`skins.${id}.name`)}
          </span>
          {id === DEFAULT_SKIN && (
            <span className="small-caps text-caption text-muted">{t('default')}</span>
          )}
          {checked && <Icon name="check" size={16} className="ml-auto text-accent" />}
        </span>
        <span className="text-small text-muted">{t(`skins.${id}.description`)}</span>
      </span>
    </label>
  );
}

/** Header control: a drawer of skins; picking one switches tokens instantly and persists the choice. */
export function SkinMenu() {
  const t = useTranslations('appearance');
  const { skin, setSkin } = useSkin();
  const [open, setOpen] = useState(false);

  return (
    <>
      <IconButton
        icon="palette"
        label={t('open')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        data-testid="skin-trigger"
        data-skin-state={skin}
      />
      <Drawer open={open} onClose={() => setOpen(false)} title={t('title')} testId="skin-drawer">
        <p className="text-small text-muted">{t('intro')}</p>
        <fieldset className="m-0 mt-4 flex flex-col gap-2 border-0 p-0">
          <legend className="sr-only">{t('title')}</legend>
          {SKIN_IDS.map((id) => (
            <SkinOption key={id} id={id} checked={skin === id} onSelect={setSkin} />
          ))}
        </fieldset>
      </Drawer>
    </>
  );
}
