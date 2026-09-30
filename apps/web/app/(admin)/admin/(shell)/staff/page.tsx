import type { Metadata } from 'next';

import { NotPermitted } from '@/components/admin/NotPermitted';
import { StaffPanel } from '@/components/admin/staff/StaffPanel';
import { adminServerGet } from '@/lib/admin/server';
import type { StaffRow } from '@/lib/admin/types';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Staff & Roles' };

export default async function StaffPage() {
  const session = await getSession();
  if (session?.role !== 'ADMIN') return <NotPermitted role={session?.role} />;

  const staff = await adminServerGet<readonly StaffRow[]>('/admin/staff');
  if (!staff.ok)
    return (
      <p role="alert" className="admin-error">
        Could not load staff ({staff.code}).
      </p>
    );
  return <StaffPanel rows={staff.data} />;
}
