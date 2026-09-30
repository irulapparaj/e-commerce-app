/** Returns true when the honeypot field was filled — indicating a bot submission. */
export const isHoneypotFilled = (website: string | undefined): boolean =>
  typeof website === 'string' && website.length > 0;
