/** Reading `window.localStorage` itself throws in some private modes; `undefined` means "no storage". */
export const safeLocalStorage = (): Storage | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};
