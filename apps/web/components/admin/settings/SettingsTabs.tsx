'use client';

import { isSettingKey, SETTING_KEYS, type SettingKey } from '@pe/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { SETTING_META } from './fields';
import { SettingsForm } from './SettingsForm';

interface SettingsTabsProps {
  readonly values: Readonly<Record<SettingKey, unknown>>;
  readonly initialTab?: string;
}

const FIRST_KEY: SettingKey = 'announcement_bar';

export function SettingsTabs({ values, initialTab }: SettingsTabsProps) {
  const router = useRouter();
  const [active, setActive] = useState<SettingKey>(
    initialTab !== undefined && isSettingKey(initialTab) ? initialTab : FIRST_KEY,
  );
  const [current, setCurrent] = useState(values);

  const select = (key: SettingKey) => {
    setActive(key);
    router.replace(`/admin/settings?tab=${key}`, { scroll: false });
  };

  const onSaved = (key: SettingKey, value: unknown) =>
    setCurrent((prev) => ({ ...prev, [key]: value }));

  return (
    <div>
      <div role="tablist" aria-label="Setting groups" className="admin-tabs">
        {SETTING_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`settings-tab-${key}`}
            aria-selected={key === active}
            aria-controls={`settings-panel-${key}`}
            tabIndex={key === active ? 0 : -1}
            className="admin-tab"
            onClick={() => select(key)}
            onKeyDown={(event) => {
              const index = SETTING_KEYS.indexOf(key);
              const next =
                event.key === 'ArrowRight'
                  ? SETTING_KEYS[(index + 1) % SETTING_KEYS.length]
                  : event.key === 'ArrowLeft'
                    ? SETTING_KEYS[(index - 1 + SETTING_KEYS.length) % SETTING_KEYS.length]
                    : undefined;
              if (next === undefined) return;
              event.preventDefault();
              select(next);
              document.getElementById(`settings-tab-${next}`)?.focus();
            }}
            data-testid={`settings-tab-${key}`}
          >
            {SETTING_META[key].title}
          </button>
        ))}
      </div>
      <section
        role="tabpanel"
        id={`settings-panel-${active}`}
        aria-labelledby={`settings-tab-${active}`}
        data-testid={`settings-panel-${active}`}
      >
        <SettingsForm
          key={active}
          settingKey={active}
          initialValue={current[active]}
          onSaved={onSaved}
        />
      </section>
    </div>
  );
}
