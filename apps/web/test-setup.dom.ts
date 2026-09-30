import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/** Vitest has no globals, so Testing Library's automatic cleanup never registers itself. */
afterEach(() => {
  cleanup();
});
