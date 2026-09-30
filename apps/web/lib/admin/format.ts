const PAISE_PER_RUPEE = 100;
const SECONDS_PER_MINUTE = 60;
const MASK_CHAR = '•';

const rupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

const dateTime = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Kolkata',
});

export const formatPaise = (paise: number): string => rupees.format(paise / PAISE_PER_RUPEE);

export const formatCount = (value: number): string => new Intl.NumberFormat('en-IN').format(value);

export const formatDateTime = (iso: string | null | undefined): string => {
  if (iso === null || iso === undefined || iso === '') return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : dateTime.format(date);
};

/** `mm:ss`, floored at zero, for the step-up countdown. */
export const formatCountdown = (seconds: number): string => {
  const clamped = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(clamped / SECONDS_PER_MINUTE);
  const rest = clamped % SECONDS_PER_MINUTE;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
};

/** Seconds left until an epoch-seconds expiry; never negative. */
export const secondsUntil = (epochSeconds: number | null, nowMs: number): number =>
  epochSeconds === null ? 0 : Math.max(0, Math.ceil(epochSeconds - nowMs / 1000));

export interface MaskOptions {
  readonly keepStart?: number;
  readonly keepEnd?: number;
}

/** `9876543210` → `98•••••210` (DESIGN §11.3). Short values are fully masked. */
export const maskValue = (
  value: string,
  { keepStart = 2, keepEnd = 3 }: MaskOptions = {},
): string => {
  const chars = Array.from(value);
  if (chars.length <= keepStart + keepEnd) return MASK_CHAR.repeat(chars.length);
  const hidden = chars.length - keepStart - keepEnd;
  return `${chars.slice(0, keepStart).join('')}${MASK_CHAR.repeat(hidden)}${chars.slice(-keepEnd).join('')}`;
};

export const truncate = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`;

/** Rupee input (2 decimals) → integer paise; conversion only happens at the API boundary. */
export const toPaise = (rupees: number): number => Math.round(rupees * PAISE_PER_RUPEE);

export const toRupees = (paise: number): number => paise / PAISE_PER_RUPEE;

/** Signed count for ledger deltas: `+5`, `−3`, `0`. */
export const formatDelta = (delta: number): string =>
  delta > 0 ? `+${formatCount(delta)}` : delta < 0 ? `−${formatCount(-delta)}` : '0';
