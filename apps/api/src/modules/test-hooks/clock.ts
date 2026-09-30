if (process.env.NODE_ENV !== 'test') {
  throw new Error('[test-hook] clock.ts must not be imported outside NODE_ENV=test');
}

let override: Date | null = null;

export const getTestNow = (): Date => override ?? new Date();

export const setTestNow = (d: Date | null): void => {
  override = d;
};
