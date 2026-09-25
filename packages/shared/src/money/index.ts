import { AppError } from '../errors';

export type Paise = number & { readonly __brand: 'Paise' };

const MAX_SAFE_PAISE = Number.MAX_SAFE_INTEGER;
const RUPEES_PATTERN = /^(\d{1,13})(?:\.(\d{1,2}))?$/;

const assertInteger = (value: number, label: string): void => {
  if (!Number.isInteger(value) || Math.abs(value) > MAX_SAFE_PAISE) {
    throw new AppError('VALIDATION', `${label} must be an integer amount of paise`);
  }
};

export const paise = (value: number): Paise => {
  assertInteger(value, 'Amount');
  return value as Paise;
};

export const rupeesToPaise = (rupees: string): Paise => {
  const match = RUPEES_PATTERN.exec(rupees.trim());
  if (match === null) {
    throw new AppError('VALIDATION', `Invalid rupee amount: ${JSON.stringify(rupees)}`);
  }
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? '').padEnd(2, '0'));
  return paise(whole * 100 + fraction);
};

const groupIndian = (digits: string): string => {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
};

export const formatINR = (amount: Paise | number): string => {
  assertInteger(amount, 'Amount');
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  const rupees = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, '0');
  return `${sign}₹${groupIndian(String(rupees))}.${fraction}`;
};

export const add = (a: Paise, b: Paise): Paise => {
  assertInteger(a, 'Left operand');
  assertInteger(b, 'Right operand');
  return paise(a + b);
};

export const sub = (a: Paise, b: Paise): Paise => {
  assertInteger(a, 'Left operand');
  assertInteger(b, 'Right operand');
  return paise(a - b);
};

export const mulQty = (unit: Paise, quantity: number): Paise => {
  assertInteger(unit, 'Unit price');
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new AppError('VALIDATION', 'Quantity must be a non-negative integer');
  }
  return paise(unit * quantity);
};
