import { loadEnv, type WebEnv, webEnvSchema } from '@pe/shared';

let cached: WebEnv | undefined;

/** Lazily validated so `next build` never needs runtime secrets; the first request fails fast instead. */
export const getWebEnv = (): WebEnv => {
  cached ??= loadEnv(webEnvSchema);
  return cached;
};
