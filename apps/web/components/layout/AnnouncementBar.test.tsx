// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '@/test-utils/intl';
import { publicSettings } from '@/test-utils/storefront';

import { ANNOUNCEMENT_DISMISSED_KEY, AnnouncementBar } from './AnnouncementBar';

const { announcementBar } = publicSettings;

describe('AnnouncementBar', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the settings text as one labelled line', () => {
    renderWithIntl(
      <AnnouncementBar enabled={announcementBar.enabled} text={announcementBar.text} />,
    );

    expect(screen.getByRole('region', { name: 'Announcement' })).toHaveTextContent(
      'Free shipping on orders above ₹599',
    );
  });

  it('renders nothing when disabled or empty', () => {
    const { rerender } = renderWithIntl(<AnnouncementBar enabled={false} text="x" />);
    expect(screen.queryByTestId('announcement-bar')).toBeNull();
    rerender(<AnnouncementBar enabled text="   " />);
    expect(screen.queryByTestId('announcement-bar')).toBeNull();
  });

  it('dismisses for the session and stays dismissed on the next render', async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithIntl(<AnnouncementBar enabled text="Sale" />);

    await user.click(screen.getByRole('button', { name: 'Dismiss announcement' }));

    expect(screen.queryByTestId('announcement-bar')).toBeNull();
    expect(window.sessionStorage.getItem(ANNOUNCEMENT_DISMISSED_KEY)).toBe('1');
    unmount();

    renderWithIntl(<AnnouncementBar enabled text="Sale" />);
    expect(screen.queryByTestId('announcement-bar')).toBeNull();
  });

  it('still dismisses when sessionStorage throws', async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderWithIntl(<AnnouncementBar enabled text="Sale" />);

    expect(screen.getByTestId('announcement-bar')).toBeInTheDocument();
    await user.click(screen.getByTestId('announcement-dismiss'));
    expect(screen.queryByTestId('announcement-bar')).toBeNull();
  });
});
