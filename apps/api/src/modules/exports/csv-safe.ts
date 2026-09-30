/**
 * CSV output guard (P07 task 8, DESIGN §11.3). Spreadsheet apps evaluate cells that start with
 * `=`, `+`, `-`, `@`, tab or carriage return; a leading apostrophe makes them literal text. Every
 * cell is quoted so commas, quotes and newlines survive a round trip through the import parser.
 */
export const CSV_BOM = '﻿';
export const CSV_LINE_BREAK = '\r\n';
const DANGEROUS_PREFIXES = ['=', '+', '-', '@', '\t', '\r'] as const;
const NEUTRALISER = "'";

export const isDangerousCell = (value: string): boolean =>
  DANGEROUS_PREFIXES.some((prefix) => value.startsWith(prefix));

export const guardCell = (value: string): string =>
  isDangerousCell(value) ? `${NEUTRALISER}${value}` : value;

export const quoteCell = (value: string): string => `"${value.replaceAll('"', '""')}"`;

/** Guarded and quoted; numbers formatted upstream never start with a dangerous character. */
export const csvCell = (value: string | number | null | undefined): string =>
  quoteCell(guardCell(value === null || value === undefined ? '' : String(value)));

export const csvLine = (cells: readonly (string | number | null | undefined)[]): string =>
  cells.map(csvCell).join(',');

/** A complete document: BOM (so Excel reads UTF-8), header, rows, CRLF line breaks. */
export const csvDocument = (
  header: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[],
): string =>
  `${CSV_BOM}${[header.map(quoteCell).join(','), ...rows.map(csvLine)].join(CSV_LINE_BREAK)}${CSV_LINE_BREAK}`;

/** Reverses `guardCell` for values that came back through an import (a genuine leading `'` is rare). */
export const unguardCell = (value: string): string =>
  value.startsWith(NEUTRALISER) && isDangerousCell(value.slice(1)) ? value.slice(1) : value;
