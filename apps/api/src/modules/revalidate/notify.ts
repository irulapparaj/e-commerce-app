import type { JobQueue } from '../../jobs/queue';

export interface RevalidateNotifier {
  /** Enqueues one `revalidate` job carrying the de-duplicated, sorted tag list. */
  notify(tags: readonly string[]): Promise<string | null>;
}

export const createRevalidateNotifier = (jobs: JobQueue): RevalidateNotifier => ({
  notify: async (tags) => {
    const unique = [...new Set(tags)].sort();
    if (unique.length === 0) return null;
    return jobs.send('revalidate', { tags: unique });
  },
});
