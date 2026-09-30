'use client';

import { useEffect, useRef, useState } from 'react';

import { rupeesToPaise } from '@/lib/catalogue/params';

const DEBOUNCE_MS = 250;
/** The API's minimum page size; only `meta.total` is read from the response. */
const PREVIEW_LIMIT = 12;

export interface MatchCountArgs {
  /** Collection scope, or null on the all-products listing. */
  readonly slug: string | null;
  /** Live panel values in rupees (0 = unset); null while the inputs fail validation. */
  readonly min: number | null;
  readonly max: number | null;
  /** The applied range and its known result count, so an untouched panel never fetches. */
  readonly appliedMin: number;
  readonly appliedMax: number;
  readonly appliedTotal: number;
}

export const matchCountUrl = (slug: string | null, min: number, max: number): string => {
  const qs = new URLSearchParams({ limit: String(PREVIEW_LIMIT) });
  if (min > 0) qs.set('minPrice', String(rupeesToPaise(min)));
  if (max > 0) qs.set('maxPrice', String(rupeesToPaise(max)));
  const base = slug === null ? 'products' : `categories/${encodeURIComponent(slug)}/products`;
  return `/api/v1/${base}?${qs}`;
};

/**
 * Exact "how many items would this range show" preview: the list endpoint already reports
 * `meta.total`, so a debounced fetch answers before the user commits. Returns null while the
 * range is invalid or a fresh count is still in flight — callers fall back to a plain label.
 */
export function useMatchCount({
  slug,
  min,
  max,
  appliedMin,
  appliedMax,
  appliedTotal,
}: MatchCountArgs): number | null {
  const cacheRef = useRef(new Map<string, number>());
  const [fetched, setFetched] = useState<{ key: string; total: number } | null>(null);

  const key = min === null || max === null ? null : `${min}:${max}`;
  const appliedKey = `${appliedMin}:${appliedMax}`;

  useEffect(() => {
    if (key === null || key === appliedKey) return undefined;
    const cached = cacheRef.current.get(key);
    if (cached !== undefined) {
      setFetched({ key, total: cached });
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(matchCountUrl(slug, min ?? 0, max ?? 0), {
            signal: controller.signal,
          });
          if (!res.ok) return;
          const body = (await res.json()) as { meta?: { total?: number } };
          if (typeof body.meta?.total !== 'number') return;
          cacheRef.current.set(key, body.meta.total);
          setFetched({ key, total: body.meta.total });
        } catch {
          // Preview only — a failed count silently falls back to the plain Apply label.
        }
      })();
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [key, appliedKey, slug, min, max]);

  if (key === null) return null;
  if (key === appliedKey) return appliedTotal;
  return fetched?.key === key ? fetched.total : null;
}
