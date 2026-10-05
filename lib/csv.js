/**
 * CSV generation for report exports.
 *
 * Everything is escaped defensively: a member name containing a comma, quote or
 * a leading `=` must not be able to break the export or, worse, inject a formula
 * when the file is opened in Excel / Google Sheets.
 */

/** Neutralise spreadsheet formula injection (leading =, +, -, @, tab, CR). */
export function escapeCsvValue(value) {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return text;
}

export function escapeCsvField(value) {
  const text = escapeCsvValue(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * @param {Array<{key: string, label: string, map?: (row: any) => any}>} columns
 * @param {Array<object>} rows
 */
export function rowsToCsv(columns, rows = []) {
  const header = columns.map((column) => escapeCsvField(column.label)).join(',');
  const body = rows
    .map((row) =>
      columns
        .map((column) => escapeCsvField(column.map ? column.map(row) : row[column.key]))
        .join(','),
    )
    .join('\r\n');
  return rows.length ? `${header}\r\n${body}` : header;
}

/** RFC 4180 compliant filename for a report export. */
export function reportFilename(baseName, extension = 'csv') {
  const safe = String(baseName ?? 'export')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const stamp = new Date().toISOString().slice(0, 10);
  return `${safe || 'export'}-${stamp}.${extension}`;
}

/** UTF-8 BOM so Excel reads ₱ and accented names correctly. */
export const CSV_BOM = '\uFEFF';

export function csvResponseBody(columns, rows) {
  return CSV_BOM + rowsToCsv(columns, rows);
}