/**
 * CSV building — one escaper for the whole admin panel.
 *
 * There were four near-identical copies of this across the export routes, with
 * three different conventions for the BOM and the line ending. Worse, the
 * analytics export did not use its own escaper at all: four of its branches
 * built rows out of raw template literals like `"${u.name}"`, so a single
 * double-quote in somebody's name — or a comma in an address — silently
 * corrupted the file from that row onward. A finance export that a spreadsheet
 * cannot open is not a report.
 *
 * Conventions here, chosen once:
 *
 * - **CRLF line endings.** Excel on Windows is the primary reader.
 * - **UTF-8 BOM.** Without it Excel reads UTF-8 as the local codepage and
 *   mangles every Bengali character in the file.
 * - **Quote only when needed** (comma, quote, CR or LF), doubling inner quotes
 *   per RFC 4180. Quoting everything also works, but makes the raw file much
 *   harder to read when someone opens it in a text editor to debug a figure.
 */

/** Escape one cell. Null and undefined become empty, never the text "null". */
export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * A cell Excel must treat as text, not as a number or a formula.
 *
 * Phone numbers are the reason: `01734410309` loses its leading zero and
 * `+8801734410309` is interpreted as a formula. `="…"` is the standard trick.
 * Also right for any id that begins with a zero.
 */
export function csvTextCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  return `="${String(v).replace(/"/g, '""')}"`;
}

/** Deprecated alias kept so the users export reads the same as before. */
export const csvPhoneCell = csvTextCell;

export type CsvRow = Array<string | number | null | undefined>;

/** Build a full CSV document from a header row and body rows. */
export function toCsv(headers: string[], rows: CsvRow[]): string {
  return [headers, ...rows]
    .map((r) => r.map(csvCell).join(","))
    .join("\r\n");
}

/** U+FEFF — see the note on the BOM above. */
const BOM = "﻿";

/**
 * A downloadable CSV response.
 *
 * `no-store` because every one of these is a point-in-time report; a cached
 * yesterday's figures behind a filename that says today is worse than a slow
 * download.
 */
export function csvResponse(csv: string, filename: string): Response {
  return new Response(BOM + csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** `report-2026-08-25.csv` — a filename that sorts and says when it was taken. */
export function csvFilename(prefix: string, date = new Date()): string {
  return `${prefix}-${date.toISOString().slice(0, 10)}.csv`;
}
