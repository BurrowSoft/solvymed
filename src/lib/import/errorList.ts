// "Baixar lista de erros": the rows the doctor should look at (an error, a
// warning, a repeat in the file), with the sheet's line number and the
// reasons in their language. Built in the browser from the staged rows.
import { csvCell } from "./template";
import type { PreviewRow } from "./api";

export function errorListCsv(
  rows: PreviewRow[],
  labels: { row: string; name: string; reason: string },
  reason: (code: string) => string,
  repeated: (row: number) => string,
  sep = ";",
): string {
  const line = (cells: string[]) => cells.map(csvCell).join(sep);
  const out = [line([labels.row, labels.name, labels.reason])];
  for (const r of rows) {
    const reasons = [
      ...r.errors.map(reason),
      ...(r.outcome === "duplicate_in_file" && r.duplicate_of_row ? [repeated(r.duplicate_of_row)] : []),
      ...r.warnings.map(reason),
    ];
    if (!reasons.length) continue;
    // A name that starts like a formula is neutralised (it's the file's own text).
    const name = String(r.input?.full_name ?? "").replace(/^([=+\-@\t\r])/, "'$1");
    out.push(line([String(r.row_no), name, reasons.join(" · ")]));
  }
  return "﻿" + out.join("\r\n") + "\r\n";
}
