import type { SettingKey } from '@pe/shared';
import type { Metadata } from 'next';

import { NotPermitted } from '@/components/admin/NotPermitted';
import { PageHeader } from '@/components/admin/PageHeader';
import { SettingsTabs } from '@/components/admin/settings/SettingsTabs';
import { pickParams } from '@/lib/admin/query';
import { adminServerGet } from '@/lib/admin/server';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Settings' };

interface SettingsPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const session = await getSession();
  if (session?.role !== 'ADMIN') return <NotPermitted role={session?.role} />;

  const { tab } = pickParams(await searchParams, ['tab']);
  const settings = await adminServerGet<Record<SettingKey, unknown>>('/admin/settings');

  return (
    <>
      <PageHeader
        title="Settings"
        description="Every change asks for a fresh authenticator code and is recorded in the audit log."
      />
      {settings.ok ? (
        <SettingsTabs values={settings.data} {...(tab === undefined ? {} : { initialTab: tab })} />
      ) : (
        <p role="alert" className="admin-error">
          Could not load settings ({settings.code}).
        </p>
      )}
    </>
  );
}
