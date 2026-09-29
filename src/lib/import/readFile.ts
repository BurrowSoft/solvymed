// A spreadsheet read in the browser (in a Web Worker: the file never leaves
// the device, UX): CSV/TXT as text, XLSX/XLS/ODS with SheetJS (0.20.3 from
// its own CDN, not the stale npm 0.18). The first sheet's first row is the
// header. Cells come back as shown in the sheet (so a CPF typed as text
// keeps its leading zero); date cells as Excel serial numbers, which the
// database converts.
import * as XLSX from "xlsx";
import { decodeText, detectDelimiter, parseCsv } from "./csv";

export const MAX_IMPORT_ROWS = 20000; // migration 130's cap per import
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

export type SheetCell = string | number;
export type ReadResult =
  | { ok: true; headers: string[]; rows: SheetCell[][]; encoding?: string }
  | { ok: false; error: "too_big" | "unsupported" | "zip" | "empty" | "too_many_rows" | "unreadable" };

export function readSpreadsheet(bytes: Uint8Array, fileName: string, delimiters?: string[]): ReadResult {
  if (bytes.byteLength > MAX_IMPORT_BYTES) return { ok: false, error: "too_big" };
  const ext = (fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "");
  let table: SheetCell[][];
  let encoding: string | undefined;
  try {
    if (ext === "csv" || ext === "txt") {
      const decoded = decodeText(bytes);
      encoding = decoded.encoding;
      table = parseCsv(decoded.text, detectDelimiter(decoded.text, delimiters));
    } else if (ext === "xlsx" || ext === "xls" || ext === "ods") {
      table = sheetRows(XLSX.read(bytes, { type: "array", cellDates: false, cellNF: true }));
    } else if (ext === "zip") {
      return { ok: false, error: "zip" };
    } else {
      return { ok: false, error: "unsupported" };
    }
  } catch {
    return { ok: false, error: "unreadable" };
  }
  const [header, ...rows] = table;
  if (!header || !header.some((h) => String(h).trim())) return { ok: false, error: "empty" };
  if (rows.length > MAX_IMPORT_ROWS) return { ok: false, error: "too_many_rows" };
  return { ok: true, headers: header.map((h) => String(h).trim()), rows, encoding };
}

function sheetRows(wb: XLSX.WorkBook): SheetCell[][] {
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws || !ws["!ref"]) return [];
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const out: SheetCell[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: SheetCell[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
      row.push(cellValue(cell));
    }
    if (row.some((v) => String(v).trim() !== "")) out.push(row);
  }
  return out;
}

function cellValue(cell: XLSX.CellObject | undefined): SheetCell {
  if (!cell || cell.v === undefined || cell.v === null) return "";
  if (cell.t === "n") {
    // A date cell: its serial number. A number in a custom format (a CPF
    // formatted to keep its leading zero): as displayed. Otherwise the
    // number itself: "General" shows a 13-digit phone as 5.51199E+12.
    if (cell.z && XLSX.SSF.is_date(String(cell.z))) return cell.v as number;
    if (cell.z && cell.z !== "General" && cell.w !== undefined) return cell.w;
    return String(cell.v);
  }
  if (cell.t === "b") return cell.v ? "1" : "0";
  return cell.w ?? String(cell.v);
}
