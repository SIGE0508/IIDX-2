/** Small RFC 4180-compatible parser used for local CSV files and pasted text. */
export function parseCsv(text: string): string[][] {
  const value = text.replace(/^\uFEFF/, ""); const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let index = 0; index < value.length; index += 1) { const char = value[index]; if (quoted) { if (char === '"' && value[index + 1] === '"') { field += '"'; index += 1; } else if (char === '"') quoted = false; else field += char; continue; } if (char === '"') { if (field !== "") { field += char; } else quoted = true; } else if (char === ",") { row.push(field); field = ""; } else if (char === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; } else field += char; }
  if (quoted) throw new Error("CSV has an unterminated quoted field."); if (field !== "" || row.length > 0) { row.push(field.replace(/\r$/, "")); rows.push(row); } return rows.filter((candidate) => candidate.some((cell) => cell !== ""));
}
export const escapeCsv = (value: string | number): string => { const text = String(value); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
