import 'server-only';

import { getPublicSettings } from '@/lib/api/storefront';

export interface ContentPlaceholders {
  readonly legalName: string;
  readonly gstin: string;
  readonly pickupCity: string;
  readonly grievanceOfficerName: string;
  readonly grievanceOfficerEmail: string;
  readonly grievanceOfficerPhone: string;
  readonly returnWindowDays: number;
  readonly supportEmail: string;
  readonly isPlaceholder: boolean;
}

export const getPlaceholders = async (): Promise<ContentPlaceholders> => {
  const settings = await getPublicSettings();

  return {
    legalName: settings.business.legalName,
    gstin: settings.business.gstin,
    pickupCity: settings.pickupLocation.city,
    grievanceOfficerName: settings.grievanceOfficer?.name ?? 'Grievance Officer',
    grievanceOfficerEmail: settings.grievanceOfficer?.email ?? 'grievance@pujaessentials.in',
    grievanceOfficerPhone: settings.grievanceOfficer?.phone ?? '+91 98765 43210',
    returnWindowDays: settings.returnWindowDays ?? 15,
    supportEmail: settings.supportEmail ?? 'support@pujaessentials.in',
    isPlaceholder: settings.business.isPlaceholder,
  };
};

export const resolvePlaceholders = (text: string, placeholders: ContentPlaceholders): string =>
  text
    .replace(/\{\{legalName\}\}/g, escapeHtml(placeholders.legalName))
    .replace(/\{\{gstin\}\}/g, escapeHtml(placeholders.gstin))
    .replace(/\{\{pickupCity\}\}/g, escapeHtml(placeholders.pickupCity))
    .replace(/\{\{grievanceOfficer\.name\}\}/g, escapeHtml(placeholders.grievanceOfficerName))
    .replace(/\{\{grievanceOfficer\.email\}\}/g, escapeHtml(placeholders.grievanceOfficerEmail))
    .replace(/\{\{grievanceOfficer\.phone\}\}/g, escapeHtml(placeholders.grievanceOfficerPhone))
    .replace(/\{\{returnWindowDays\}\}/g, String(placeholders.returnWindowDays))
    .replace(/\{\{supportEmail\}\}/g, escapeHtml(placeholders.supportEmail));

const escapeHtml = (str: string): string =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
