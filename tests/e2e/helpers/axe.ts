import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from '@playwright/test';

/** WCAG 2.2 AA baseline (DESIGN.md §12): serious and critical violations block. */
const BLOCKING = new Set(['serious', 'critical']);
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

export const blockingViolations = async (page: Page): Promise<readonly string[]> => {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return results.violations
    .filter((violation) => BLOCKING.has(violation.impact ?? ''))
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
    );
};
