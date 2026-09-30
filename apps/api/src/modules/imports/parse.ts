import { AppError, IMPORT_COLUMNS, type ImportColumn, type ImportRawRow } from '@pe/shared';
import ExcelJS from 'exceljs';
import { fileTypeFromBuffer } from 'file-type';
import Papa from 'papaparse';

export type ImportFormat = 'csv' | 'xlsx';

export interface ParsedRow {
  /** Spreadsheet row number (the header is row 1), reported back in error reports. */
  readonly line: number;
  readonly cells: ImportRawRow;
}

export interface ParsedFile {
  readonly format: ImportFormat;
  readonly rows: readonly ParsedRow[];
}

export const IMPORT_FORMAT_BY_TYPE: Readonly<Record<string, ImportFormat>> = {
  'text/csv': 'csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const XLSX_EXTENSION = 'xlsx';
/** Zip entry names that only appear in macro-enabled or externally linked workbooks. */
const FORBIDDEN_WORKBOOK_ENTRIES = ['xl/vbaProject.bin', 'xl/externalLinks/'] as const;
const HEAD_BYTES = 4_100;
const BOM = '﻿';
const COLUMN_SET: ReadonlySet<string> = new Set(IMPORT_COLUMNS);

export interface ParseOptions {
  readonly maxRows: number;
}

const isText = (bytes: Buffer): boolean => {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
};

/** Magic bytes decide the parser: a real XLSX zip, or UTF-8 text without any binary signature. */
export const detectFormat = async (bytes: Buffer): Promise<ImportFormat | null> => {
  if (bytes.subarray(0, ZIP_MAGIC.length).equals(ZIP_MAGIC)) {
    const detected = await fileTypeFromBuffer(bytes);
    return detected?.ext === XLSX_EXTENSION ? 'xlsx' : null;
  }
  const detected = await fileTypeFromBuffer(bytes.subarray(0, HEAD_BYTES));
  if (detected !== undefined) return null;
  return isText(bytes) ? 'csv' : null;
};

export const hasForbiddenWorkbookParts = (bytes: Buffer): boolean =>
  FORBIDDEN_WORKBOOK_ENTRIES.some((entry) => bytes.includes(Buffer.from(entry, 'latin1')));

const normaliseHeader = (cell: string): string => cell.replace(BOM, '').trim().toLowerCase();

/** The header must be exactly the template columns, in any order; anything else is refused. */
export const mapHeader = (header: readonly string[]): readonly ImportColumn[] => {
  const columns = header.map(normaliseHeader).filter((cell) => cell !== '');
  const unknown = columns.filter((column) => !COLUMN_SET.has(column));
  if (unknown.length > 0) {
    throw new AppError('IMPORT_UNKNOWN_COLUMN', `Unknown column(s): ${unknown.join(', ')}`, {
      details: { unknown },
    });
  }
  const missing = IMPORT_COLUMNS.filter((column) => !columns.includes(column));
  if (missing.length > 0) {
    throw new AppError('VALIDATION', `Missing column(s): ${missing.join(', ')}`, {
      details: { missing },
    });
  }
  if (new Set(columns).size !== columns.length)
    throw new AppError('VALIDATION', 'Duplicate column in header');
  return columns as ImportColumn[];
};

const isBlank = (cells: readonly string[]): boolean => cells.every((cell) => cell.trim() === '');

const toRow = (
  columns: readonly ImportColumn[],
  cells: readonly string[],
  line: number,
): ParsedRow => ({
  line,
  cells: Object.fromEntries(
    columns.map((column, index) => [column, cells[index] ?? '']),
  ) as ImportRawRow,
});

const assemble = (
  records: readonly (readonly string[])[],
  options: ParseOptions,
  format: ImportFormat,
): ParsedFile => {
  const [header, ...body] = records;
  if (header === undefined) throw new AppError('VALIDATION', 'The file has no header row');
  const columns = mapHeader(header);
  const rows = body
    .map((cells, index) => ({ cells, line: index + 2 }))
    .filter(({ cells }) => !isBlank(cells));
  if (rows.length > options.maxRows) {
    throw new AppError('IMPORT_TOO_MANY_ROWS', undefined, {
      details: { rows: rows.length, max: options.maxRows },
    });
  }
  if (rows.length === 0) throw new AppError('VALIDATION', 'The file has no data rows');
  return { format, rows: rows.map(({ cells, line }) => toRow(columns, cells, line)) };
};

/** papaparse without dynamic typing: every cell is the string that was in the file. */
const parseCsv = (bytes: Buffer, options: ParseOptions): ParsedFile => {
  const text = bytes.toString('utf8').replace(BOM, '');
  if (text.trim() === '') throw new AppError('VALIDATION', 'The file has no header row');
  const result = Papa.parse<string[]>(text, {
    delimiter: ',',
    dynamicTyping: false,
    skipEmptyLines: false,
  });
  const fatal = result.errors.find((error) => error.type !== 'FieldMismatch');
  if (fatal !== undefined)
    throw new AppError('VALIDATION', `Could not parse CSV: ${fatal.message}`);
  return assemble(result.data, options, 'csv');
};

/**
 * Formula cells are never evaluated: exceljs exposes the formula text and a cached result, and the
 * cached result is what a spreadsheet app would show — so we emit `=formula` as literal text.
 */
export const cellText = (cell: ExcelJS.Cell): string => {
  if (cell.formula !== undefined && cell.formula !== '') return `=${cell.formula}`;
  return cell.text;
};

const sheetRecords = (
  sheet: ExcelJS.Worksheet,
  maxRows: number,
): readonly (readonly string[])[] => {
  if (sheet.rowCount - 1 > maxRows) {
    throw new AppError('IMPORT_TOO_MANY_ROWS', undefined, {
      details: { rows: sheet.rowCount - 1, max: maxRows },
    });
  }
  const records: (readonly string[])[] = [];
  const width = sheet.columnCount;
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const cells = Array.from({ length: width }, (_, index) => cellText(row.getCell(index + 1)));
    records.push(cells);
  });
  return records;
};

const parseXlsx = async (bytes: Buffer, options: ParseOptions): Promise<ParsedFile> => {
  if (hasForbiddenWorkbookParts(bytes))
    throw new AppError('VALIDATION', 'Workbooks with macros or external links are not accepted');
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  } catch {
    throw new AppError('VALIDATION', 'Could not read the workbook');
  }
  const sheet = workbook.worksheets[0];
  if (sheet === undefined) throw new AppError('VALIDATION', 'The workbook has no sheets');
  return assemble(sheetRecords(sheet, options.maxRows), options, 'xlsx');
};

/** Entry point for both jobs: magic bytes must agree with the declared type before anything is parsed. */
export const parseImportFile = async (
  bytes: Buffer,
  declaredType: string,
  options: ParseOptions,
): Promise<ParsedFile> => {
  const declared = IMPORT_FORMAT_BY_TYPE[declaredType];
  if (declared === undefined) throw new AppError('VALIDATION', 'Unsupported import type');
  const detected = await detectFormat(bytes);
  if (detected !== declared) {
    throw new AppError(
      'VALIDATION',
      `File content is not a ${declared === 'csv' ? 'UTF-8 CSV' : 'XLSX workbook'}`,
    );
  }
  return declared === 'csv' ? parseCsv(bytes, options) : parseXlsx(bytes, options);
};
