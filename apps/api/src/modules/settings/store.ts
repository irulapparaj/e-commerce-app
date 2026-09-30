import {
  type PublicSettings,
  SETTING_DEFAULTS,
  SETTING_KEYS,
  type SettingKey,
  type SettingValue,
  type SettingValues,
  isSettingKey,
  parseSetting,
  toPublicSettings,
} from '@pe/shared';
import type { Prisma } from '@prisma/client';

import type { PrismaDb, PrismaTx } from '../../db/prisma';
import type { JsonCache } from '../../lib/cache';

export const PUBLIC_SETTINGS_CACHE_KEY = 'settings:public';
export const PUBLIC_SETTINGS_TTL_SECONDS = 60;

export interface SettingsStore {
  getAll(): Promise<SettingValues>;
  get<K extends SettingKey>(key: K): Promise<SettingValue<K>>;
  /** Public subset, cached 60 s (P04 task 11). */
  getPublic(): Promise<PublicSettings>;
  set<K extends SettingKey>(
    tx: Pick<PrismaTx, 'siteSetting'>,
    key: K,
    value: SettingValue<K>,
    updatedBy: string | null,
  ): Promise<void>;
  invalidate(): Promise<void>;
}

export interface SettingsStoreDeps {
  readonly prisma: Pick<PrismaDb, 'siteSetting'>;
  readonly cache: JsonCache;
  readonly log: { warn(obj: object, msg: string): void };
}

/** Every key resolves to a validated value: rows that fail their schema fall back to the default. */
export const createSettingsStore = ({ prisma, cache, log }: SettingsStoreDeps): SettingsStore => {
  const getAll: SettingsStore['getAll'] = async () => {
    const rows = await prisma.siteSetting.findMany({ select: { key: true, value: true } });
    const stored = new Map(rows.map((row) => [row.key, row.value] as const));
    const entries = SETTING_KEYS.map((key) => {
      const raw = stored.get(key);
      if (raw === undefined) return [key, SETTING_DEFAULTS[key]] as const;
      const parsed = parseSetting(key, raw);
      if (parsed.success) return [key, parsed.data] as const;
      log.warn(
        { key, issues: parsed.error.issues },
        'stored setting failed validation; using default',
      );
      return [key, SETTING_DEFAULTS[key]] as const;
    });
    return Object.fromEntries(entries) as SettingValues;
  };

  const get: SettingsStore['get'] = async (key) => (await getAll())[key];

  const getPublic: SettingsStore['getPublic'] = async () => {
    const cached = await cache.get<PublicSettings>(PUBLIC_SETTINGS_CACHE_KEY);
    if (cached !== null) return cached;
    const fresh = toPublicSettings(await getAll());
    await cache.set(PUBLIC_SETTINGS_CACHE_KEY, fresh, PUBLIC_SETTINGS_TTL_SECONDS);
    return fresh;
  };

  const set: SettingsStore['set'] = async (tx, key, value, updatedBy) => {
    if (!isSettingKey(key)) throw new Error(`unknown setting ${String(key)}`);
    const json = value as Prisma.InputJsonValue;
    await tx.siteSetting.upsert({
      where: { key },
      create: { key, value: json, updatedBy },
      update: { value: json, updatedBy },
    });
  };

  return {
    getAll,
    get,
    getPublic,
    set,
    invalidate: () => cache.del(PUBLIC_SETTINGS_CACHE_KEY),
  };
};
