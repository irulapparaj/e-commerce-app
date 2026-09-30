import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';

import { routing } from './routing';

/** Everything the store does happens in IST; dates and relative times format against it. */
export const STORE_TIME_ZONE = 'Asia/Kolkata';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const messages = (await import(`../messages/${locale}.json`)) as {
    default: Record<string, unknown>;
  };
  return { locale, messages: messages.default, timeZone: STORE_TIME_ZONE };
});
