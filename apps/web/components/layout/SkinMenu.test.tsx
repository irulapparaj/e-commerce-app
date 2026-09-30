// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SKIN_IDS, type SkinId } from '@/lib/skins';
import { renderWithIntl } from '@/test-utils/intl';

import { SkinMenu } from './SkinMenu';
import { SkinProvider } from './SkinProvider';

const TRIGGER = 'Change look and feel';

/** Node 25 ships a non-functional `localStorage` global that shadows jsdom's; tests bring their own. */
const memoryStorage = (): Storage => {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    key: (index: number) => [...items.keys()][index] ?? null,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    clear: () => items.clear(),
  };
};

const renderMenu = (initialSkin: SkinId | null = null) =>
  renderWithIntl(
    <SkinProvider initialSkin={initialSkin}>
      <SkinMenu />
    </SkinProvider>,
  );

describe('SkinMenu', () => {
  beforeEach(() => {
    delete document.documentElement.dataset['skin'];
    document.cookie = 'skin=; Max-Age=0; Path=/';
    vi.stubGlobal('localStorage', memoryStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens a dialog listing every skin with the current one checked', async () => {
    const user = userEvent.setup();
    renderMenu();
    const trigger = screen.getByRole('button', { name: TRIGGER });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('data-skin-state', 'classic');

    await user.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Look & feel' });
    expect(within(dialog).getAllByRole('radio')).toHaveLength(SKIN_IDS.length);
    expect(within(dialog).getByRole('radio', { name: /Classic/ })).toBeChecked();
    expect(within(dialog).getByRole('radio', { name: /Classic/ })).toHaveAccessibleName(/Default/);
  });

  it('applies, persists and reflects the chosen skin, and clears it for the default', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: TRIGGER }));

    await user.click(screen.getByRole('radio', { name: /Utsav Rang/ }));

    expect(document.documentElement.dataset['skin']).toBe('utsav-rang');
    expect(document.cookie).toContain('skin=utsav-rang');
    expect(window.localStorage.getItem('skin')).toBe('utsav-rang');
    expect(screen.getByRole('radio', { name: /Utsav Rang/ })).toBeChecked();
    expect(screen.getByTestId('skin-trigger')).toHaveAttribute('data-skin-state', 'utsav-rang');

    await user.click(screen.getByRole('radio', { name: /Classic/ }));

    expect(document.documentElement.dataset['skin']).toBeUndefined();
    expect(document.cookie).toContain('skin=classic');
    expect(screen.getByTestId('skin-trigger')).toHaveAttribute('data-skin-state', 'classic');
  });

  it('starts from the server hint', async () => {
    const user = userEvent.setup();
    renderMenu('mandir-gold');
    await user.click(screen.getByRole('button', { name: TRIGGER }));
    expect(screen.getByRole('radio', { name: /Mandir Gold/ })).toBeChecked();
  });

  it('survives localStorage throwing on write', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('localStorage', {
      ...memoryStorage(),
      setItem: () => {
        throw new Error('quota');
      },
    });
    renderMenu();
    await user.click(screen.getByRole('button', { name: TRIGGER }));
    await user.click(screen.getByRole('radio', { name: /Pushpa Purity/ }));

    expect(document.documentElement.dataset['skin']).toBe('pushpa-purity');
    expect(document.cookie).toContain('skin=pushpa-purity');
  });
});
