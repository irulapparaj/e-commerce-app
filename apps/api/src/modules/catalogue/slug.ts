import { randomBytes } from 'node:crypto';

const MAX_SLUG_LENGTH = 100;
const MAX_SEQUENTIAL_SUFFIX = 50;
const RANDOM_SUFFIX_BYTES = 3;

/** Lower-case ASCII slug: accents are transliterated (NFKD), everything else becomes a hyphen. */
export const slugify = (value: string): string => {
  const slug = value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, (match) => match.slice(1, -1))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
  return slug === '' ? 'item' : slug;
};

/** Appends `-2`, `-3`, … until `exists` says the slug is free; falls back to a random suffix. */
export const uniqueSlug = async (
  base: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> => {
  if (!(await exists(base))) return base;
  for (let suffix = 2; suffix <= MAX_SEQUENTIAL_SUFFIX; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${base}-${randomBytes(RANDOM_SUFFIX_BYTES).toString('hex')}`;
};
