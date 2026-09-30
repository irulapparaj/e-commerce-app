// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { errorEnvelope, okEnvelope, routerMock, stubFetch } from '@/test-utils/admin';

import { ToastProvider } from '../Toast';

import { FORM_SCHEMAS, fromFormValues, toFormValues } from './fields';
import { SettingsForm } from './SettingsForm';
import { SettingsTabs } from './SettingsTabs';

vi.mock('next/navigation', async () => {
  const { routerMock: router } = await import('@/test-utils/admin');
  return { useRouter: () => router, usePathname: () => '/admin/settings' };
});

const values = {
  announcement_bar: { enabled: true, text: 'Free shipping above ₹599' },
  promo_popup: { enabled: false, delaySeconds: 5 },
  free_shipping_threshold: 59900,
  brand: { name: 'Invita Company', tagline: 'Everyday devotion', logoKey: null },
  gst_profile: {
    gstin: '33AAAAA0000A1Z5',
    legalName: 'Placeholder',
    addressLines: ['Line 1', 'Chennai 600001'],
    isPlaceholder: true,
  },
  pickup_location: {
    name: 'Warehouse',
    line1: 'Line 1',
    city: 'Chennai',
    state: 'TN',
    pincode: '600001',
    phone: '9000000000',
  },
  return_window_days: 15,
  courier_preferences: { preferred: ['Delhivery'] },
} as const;

const echoValue = (call: { body: unknown }) => okEnvelope((call.body as { value: unknown }).value);

const renderForm = (key: keyof typeof values, onSaved = vi.fn()) => {
  render(
    <ToastProvider>
      <SettingsForm settingKey={key} initialValue={values[key]} onSaved={onSaved} />
    </ToastProvider>,
  );
  return onSaved;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('settings form schemas', () => {
  it('wraps primitive keys and splits multi-line address text into an array', () => {
    expect(FORM_SCHEMAS.free_shipping_threshold.safeParse({ value: 100 }).success).toBe(true);
    expect(FORM_SCHEMAS.free_shipping_threshold.safeParse({ value: -1 }).success).toBe(false);
    const parsed = FORM_SCHEMAS.gst_profile.safeParse({
      ...values.gst_profile,
      addressLines: ' Line 1 \n\nChennai 600001\n',
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.['addressLines']).toEqual(['Line 1', 'Chennai 600001']);
  });

  it('converts between stored values and form values', () => {
    expect(toFormValues('return_window_days', 15)).toEqual({ value: 15 });
    expect(toFormValues('gst_profile', values.gst_profile)).toMatchObject({
      addressLines: 'Line 1\nChennai 600001',
    });
    expect(toFormValues('gst_profile', 'garbage')).toEqual({ addressLines: '' });
    expect(toFormValues('brand', values.brand)).toEqual(values.brand);
    expect(fromFormValues('return_window_days', { value: 20 })).toBe(20);
    expect(fromFormValues('brand', values.brand)).toEqual(values.brand);
  });
});

describe('SettingsTabs', () => {
  it('renders one tab per setting key, switches panels and mirrors the tab in the URL', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <SettingsTabs values={values} initialTab="brand" />
      </ToastProvider>,
    );

    expect(screen.getAllByRole('tab')).toHaveLength(8);
    expect(screen.getByRole('tab', { name: 'Brand' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('settings-form-brand')).toBeInTheDocument();

    await user.click(screen.getByTestId('settings-tab-gst_profile'));
    expect(screen.getByTestId('settings-form-gst_profile')).toBeInTheDocument();
    expect(routerMock.replace).toHaveBeenCalledWith('/admin/settings?tab=gst_profile', {
      scroll: false,
    });

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Pickup location' })).toHaveFocus();
    expect(screen.getByTestId('settings-form-pickup_location')).toBeInTheDocument();
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByTestId('settings-form-brand')).toBeInTheDocument();
  });

  it('falls back to the first tab for an unknown key', () => {
    render(
      <ToastProvider>
        <SettingsTabs values={values} initialTab="nope" />
      </ToastProvider>,
    );

    expect(screen.getByRole('tab', { name: 'Announcement bar' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});

describe('SettingsForm', () => {
  it('PUTs an object setting, toasts Saved and reports the stored value', async () => {
    const user = userEvent.setup();
    const calls = stubFetch(echoValue);
    const onSaved = renderForm('brand');

    await user.clear(screen.getByLabelText('Brand name'));
    await user.type(screen.getByLabelText('Brand name'), 'New Name');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await user.click(screen.getByTestId('settings-save'));

    expect(await screen.findByTestId('toast')).toHaveTextContent('Saved');
    expect(calls).toEqual([
      {
        url: '/api/v1/admin/settings/brand',
        method: 'PUT',
        body: { value: { name: 'New Name', tagline: 'Everyday devotion', logoKey: null } },
      },
    ]);
    expect(onSaved).toHaveBeenCalledWith('brand', {
      name: 'New Name',
      tagline: 'Everyday devotion',
      logoKey: null,
    });
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).toBeNull());
  });

  it('PUTs a primitive setting as { value } and blocks invalid input client-side', async () => {
    const user = userEvent.setup();
    const calls = stubFetch(echoValue);
    renderForm('free_shipping_threshold');
    const input = screen.getByLabelText('Threshold (paise)');

    await user.clear(input);
    await user.type(input, '-5');
    await user.click(screen.getByTestId('settings-save'));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(calls).toHaveLength(0);

    await user.clear(input);
    await user.type(input, '79900');
    await user.click(screen.getByTestId('settings-save'));

    await screen.findByTestId('toast');
    expect(calls[0]).toMatchObject({ method: 'PUT', body: { value: 79900 } });
  });

  it('sends address lines as an array and the placeholder flag from the checkbox', async () => {
    const user = userEvent.setup();
    const calls = stubFetch(echoValue);
    renderForm('gst_profile');

    await user.clear(screen.getByLabelText('Registered address'));
    await user.type(screen.getByLabelText('Registered address'), '12 Main St{Enter}Chennai');
    await user.click(screen.getByLabelText('This profile is still a placeholder'));
    await user.click(screen.getByTestId('settings-save'));

    await screen.findByTestId('toast');
    expect(calls[0]?.body).toEqual({
      value: {
        gstin: '33AAAAA0000A1Z5',
        legalName: 'Placeholder',
        addressLines: ['12 Main St', 'Chennai'],
        isPlaceholder: false,
      },
    });
  });

  it('collects checkbox groups into an array and drops empty optional fields', async () => {
    const user = userEvent.setup();
    const calls = stubFetch(echoValue);
    renderForm('courier_preferences');

    await user.click(screen.getByLabelText('DTDC'));
    await user.click(screen.getByLabelText('Delhivery'));
    await user.click(screen.getByTestId('settings-save'));
    await screen.findByTestId('toast');

    expect(calls[0]?.body).toEqual({ value: { preferred: ['DTDC'] } });

    renderForm('promo_popup');
    await user.click(screen.getAllByTestId('settings-save')[1]!);
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.body).toEqual({ value: { enabled: false, delaySeconds: 5 } });
  });

  it('maps server VALIDATION details onto fields and shows other failures inline', async () => {
    const user = userEvent.setup();
    stubFetch((_call, index) =>
      index === 1
        ? errorEnvelope(400, 'VALIDATION', 'Request validation failed', [
            { path: 'gstin', message: 'GSTIN must be a Tamil Nadu (33) registration' },
          ])
        : index === 2
          ? errorEnvelope(403, 'STEP_UP_REQUIRED', 'Recent re-authentication required')
          : errorEnvelope(503, 'SERVICE_UNAVAILABLE', 'Try later'),
    );
    renderForm('gst_profile');

    await user.click(screen.getByTestId('settings-save'));
    expect(await screen.findByTestId('settings-form-error')).toHaveTextContent(
      'Fix the highlighted fields.',
    );
    expect(screen.getByLabelText('GSTIN')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('GSTIN must be a Tamil Nadu (33) registration')).toBeInTheDocument();

    await user.click(screen.getByTestId('settings-save'));
    expect(await screen.findByTestId('settings-form-error')).toHaveTextContent(
      'Confirmation was cancelled; nothing was saved.',
    );

    await user.click(screen.getByTestId('settings-save'));
    expect(await screen.findByTestId('settings-form-error')).toHaveTextContent('Try later');
  });

  it('shows a generic message when the network fails', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    renderForm('return_window_days');

    await user.click(screen.getByTestId('settings-save'));

    expect(await screen.findByTestId('settings-form-error')).toHaveTextContent(
      'Could not save. Try again.',
    );
    expect(within(screen.getByTestId('toast-region')).queryByTestId('toast')).toBeNull();
  });

  it('keeps the read-only state field and applies help text', () => {
    renderForm('pickup_location');

    expect(screen.getByLabelText('State')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('State')).toHaveValue('TN');
    expect(screen.getByLabelText('Phone')).toHaveAccessibleDescription(
      '10-digit Indian mobile number.',
    );
  });
});
