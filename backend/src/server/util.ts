import crypto from "node:crypto";

export function crypto_randomUUID(): string {
  return crypto.randomUUID();
}

export function maskMobile(m: string): string {
  return m.length <= 6 ? m : `${m.slice(0, 3)}${"*".repeat(m.length - 6)}${m.slice(-3)}`;
}

/** Escape a value for CSV and neutralise spreadsheet formula injection. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\r\n");
}
