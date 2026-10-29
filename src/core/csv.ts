/** Parseur CSV minimal (RFC 4180 : guillemets, guillemets doublés, retours ligne dans les champs). */
export function parseCsv(text: string, delimiter = ','): string[][] {
  const t = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quoted) {
      if (c === '"') {
        if (t[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0] !== '');
}

export function parseCsvObjects(text: string, delimiter = ','): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text, delimiter);
  if (!header) return [];
  return rows.map((r) => Object.fromEntries(header.map((k, i) => [k.trim(), r[i] ?? ''])));
}
