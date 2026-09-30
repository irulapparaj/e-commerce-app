import { z } from 'zod';

export {
  HOME_SETTING_KEYS,
  isSettingKey,
  parseSetting,
  SETTING_DEFAULTS,
  SETTING_KEYS,
  SETTING_SCHEMAS,
  type SettingKey,
  type SettingValue,
  type SettingValues,
} from '@pe/shared';

const KEY_MAX = 40;

export const settingKeyParams = z.strictObject({ key: z.string().min(1).max(KEY_MAX) });

/** `value` is validated against the per-key schema inside the handler (unknown key → 404 first). */
export const settingBody = z.strictObject({ value: z.unknown() });
