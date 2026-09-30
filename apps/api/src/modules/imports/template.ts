import { IMPORT_COLUMNS, type ImportColumn, type ImportRawRow } from '@pe/shared';
import ExcelJS from 'exceljs';

import { csvDocument } from '../exports/csv-safe';

export const TEMPLATE_FILENAME = 'product-import-template';
export const TEMPLATE_SHEET = 'Products';
const COLUMN_WIDTH = 22;
/** Excel "Text" number format: typed digits keep their leading zeros and nothing is evaluated. */
const TEXT_FORMAT = '@';

/** Two example rows of one product so operators see how variants share product columns. */
export const TEMPLATE_EXAMPLE_ROWS: readonly ImportRawRow[] = [
  {
    sku: 'PE-AG-001',
    name: 'Sandalwood Agarbatti',
    category_slug: 'agarbatti',
    description_text: 'Hand-rolled sandalwood incense sticks with a slow, even burn.',
    how_to_use: 'Light the tip, let it glow, place in a holder away from drafts.',
    specifications: 'Quantity=20 sticks|Burn time=45 min',
    hsn_code: '3307',
    gst_rate: '5',
    tags: 'sandalwood|daily',
    is_active: 'true',
    is_featured: 'false',
    variant_sku: 'PE-AG-001-20',
    variant_label: '20 sticks',
    price_inr: '80.00',
    compare_at_price_inr: '99.00',
    stock: '120',
    weight_grams: '40',
    low_stock_threshold: '10',
    meta_title: 'Sandalwood Agarbatti',
    meta_description: 'Hand-rolled sandalwood incense sticks from Invita Company.',
  },
  {
    sku: 'PE-AG-001',
    name: 'Sandalwood Agarbatti',
    category_slug: 'agarbatti',
    description_text: 'Hand-rolled sandalwood incense sticks with a slow, even burn.',
    how_to_use: 'Light the tip, let it glow, place in a holder away from drafts.',
    specifications: 'Quantity=20 sticks|Burn time=45 min',
    hsn_code: '3307',
    gst_rate: '5',
    tags: 'sandalwood|daily',
    is_active: 'true',
    is_featured: 'false',
    variant_sku: 'PE-AG-001-50',
    variant_label: '50 sticks',
    price_inr: '180.00',
    compare_at_price_inr: '',
    stock: '60',
    weight_grams: '95',
    low_stock_threshold: '10',
    meta_title: 'Sandalwood Agarbatti',
    meta_description: 'Hand-rolled sandalwood incense sticks from Invita Company.',
  },
];

const cellsOf = (row: ImportRawRow): readonly string[] =>
  IMPORT_COLUMNS.map((column: ImportColumn) => row[column]);

/** Header straight from the schema's column list, so the template cannot drift (P07 DoD). */
export const buildCsvTemplate = (): string =>
  csvDocument(IMPORT_COLUMNS, TEMPLATE_EXAMPLE_ROWS.map(cellsOf));

export const buildXlsxTemplate = async (): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(TEMPLATE_SHEET);
  sheet.columns = IMPORT_COLUMNS.map((column) => ({
    header: column,
    key: column,
    width: COLUMN_WIDTH,
    style: { numFmt: TEXT_FORMAT },
  }));
  for (const row of TEMPLATE_EXAMPLE_ROWS) sheet.addRow([...cellsOf(row)]);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return Buffer.from(await workbook.xlsx.writeBuffer());
};
