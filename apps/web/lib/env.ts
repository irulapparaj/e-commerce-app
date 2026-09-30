import { formatEnvIssues, parseEnv, type WebEnv, webEnvSchema } from '@pe/shared';

let cached: WebEnv | undefined;

/** Lazily validated so `next build` never needs runtime secrets; the first request fails fast instead. */
export const getWebEnv = (): WebEnv => {
  if (cached === undefined) {
    const result = parseEnv(webEnvSchema);
    if (!result.ok) throw new Error(formatEnvIssues(result.issues));
    cached = result.env;
  }
  return cached;
};
