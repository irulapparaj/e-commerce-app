'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { IconButton } from '@/components/ui/Button';
import { Container } from '@/components/ui/Primitives';

export const ANNOUNCEMENT_DISMISSED_KEY = 'announcement-dismissed';

const readDismissed = (): boolean => {
  try {
    return window.sessionStorage.getItem(ANNOUNCEMENT_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
};

const writeDismissed = (): void => {
  try {
    window.sessionStorage.setItem(ANNOUNCEMENT_DISMISSED_KEY, '1');
  } catch {
    // Storage blocked: the bar simply returns on the next page.
  }
};

interface AnnouncementBarProps {
  readonly enabled: boolean;
  readonly text: string;
}

/** One quiet line from `settings.announcementBar`; dismissed for the rest of the session. */
export function AnnouncementBar({ enabled, text }: AnnouncementBarProps) {
  const t = useTranslations('shell');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  if (!enabled || text.trim() === '' || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    writeDismissed();
  };

  return (
    <section
      aria-label={t('announcement')}
      className="border-b border-hairline bg-surface text-small text-muted"
      data-testid="announcement-bar"
    >
      <Container>
        <div className="flex min-h-10 items-center justify-center gap-2">
          <p className="py-2 text-center">{text}</p>
          <IconButton
            icon="close"
            size="sm"
            iconSize={16}
            label={t('dismissAnnouncement')}
            onClick={dismiss}
            data-testid="announcement-dismiss"
          />
        </div>
      </Container>
    </section>
  );
}
