import type { PrismaTx } from './prisma';

export const ORDER_NUMBER_PREFIX = 'PE-';
const MIN_DIGITS = 4;
const IST_OFFSET_MINUTES = 330;
const MS_PER_MINUTE = 60_000;

/** Mirrors the SQL function next_order_number(): PE-YYYYNNNN, never truncating past 9999. */
export const formatOrderNumber = (year: number, sequence: number): string =>
  `${ORDER_NUMBER_PREFIX}${year}${String(sequence).padStart(MIN_DIGITS, '0')}`;

export const istYear = (at: Date): number =>
  new Date(at.getTime() + IST_OFFSET_MINUTES * MS_PER_MINUTE).getUTCFullYear();

export const ORDER_NUMBER_PATTERN = /^PE-(\d{4})(\d{4,})$/;

type OrderNumberTx = Pick<PrismaTx, '$queryRaw'>;

/** Allocates the next number inside the caller's transaction; there is no application counter (R17). */
export const nextOrderNumber = async (tx: OrderNumberTx): Promise<string> => {
  const rows = await tx.$queryRaw<{ n: string }[]>`SELECT next_order_number() AS n`;
  const number = rows[0]?.n;
  if (number === undefined) throw new Error('next_order_number() returned no row');
  return number;
};
