/** Identity/schedule profile only; does not change legacy parser behaviour. */
export function parseNflSourceCsv(text: string): Record<string, string>[] {
  const records: string[][] = [];
  let record: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (c === ',' || c === '\n')) {
      record.push(cell.replace(/\r$/, '')); cell = '';
      if (c === '\n') { records.push(record); record = []; }
    } else cell += c;
  }
  if (quoted) throw Error('Incomplete NFL CSV');
  if (cell || record.length) { record.push(cell.replace(/\r$/, '')); records.push(record); }
  const headers = records.shift()?.map(s => s.replace(/^\uFEFF/, '').trim()) ?? [];
  if (!headers.length || new Set(headers).size !== headers.length) throw Error('Invalid NFL CSV header');
  return records.filter(r => r.some(Boolean)).map(row => {
    if (row.length !== headers.length) throw Error('Incomplete NFL CSV row');
    return Object.fromEntries(headers.map((header, i) => [header, row[i]]));
  });
}

/** Retain explicit identifier pairs only; names/positions never enter this fallback. */
export function parseNflIdentityPairs(text: string): Record<string,string>[] {
  return parseNflSourceCsv(text).filter(row=>/^00-\d{7}$/.test(row.gsis_id??'')&&/^[1-9]\d*$/.test(row.espn_id??'')).map(row=>({gsis_id:row.gsis_id,espn_id:row.espn_id}));
}
