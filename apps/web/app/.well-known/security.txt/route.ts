import { NextResponse } from 'next/server';

import { getWebEnv } from '@/lib/env';

export const revalidate = 86400;

export function GET(): NextResponse {
  const { WEB_ORIGIN } = getWebEnv();

  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);

  const contactEmail = 'security@pujaessentials.in';

  const body = [
    `Contact: mailto:${contactEmail}`,
    `Expires: ${expires.toISOString()}`,
    `Preferred-Languages: en`,
    `Canonical: ${WEB_ORIGIN}/.well-known/security.txt`,
  ].join('\n');

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
