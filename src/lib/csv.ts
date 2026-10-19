export interface ParsedRow {
  rowNumber: number;
  values: string[];
  errors: string[];
}

export interface ParseResult {
  headers: string[];
  rows: ParsedRow[];
  totalErrors: number;
}

export function parseCSV(text: string): ParseResult {
  const normalized = text.replace(/^\uFEFF/, '');
  const lines = normalized.trim().split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { headers: [], rows: [], totalErrors: 0 };
  }

  const headers = splitCSVLine(lines[0]);
  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCSVLine(lines[i]);
    rows.push({
      rowNumber: i + 1,
      values,
      errors: [],
    });
  }

  return { headers, rows, totalErrors: 0 };
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function getField(row: string[], headers: string[], name: string): string {
  const idx = headers.findIndex((header) => normalizeHeader(header) === normalizeHeader(name));
  if (idx === -1 || idx >= row.length) return '';
  return row[idx] || '';
}

export function getFieldAny(row: string[], headers: string[], names: string[]): string {
  for (const name of names) {
    const value = getField(row, headers, name);
    if (value) return value;
  }
  return '';
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '_');
}

export function downloadCSVTemplate(headers: string[], filename: string, sampleRows: string[][] = []): void {
  const lines = [headers.join(',')];
  for (const row of sampleRows) {
    lines.push(row.map((value) => `"${value.replace(/"/g, '""')}"`).join(','));
  }
  const csv = `\uFEFF${lines.join('\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
