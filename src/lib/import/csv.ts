// Reading a CSV export in the browser (the file never leaves it): the
// encoding (UTF-8, else Windows-1252: Brazilian exports are often Latin-1),
// the delimiter, then RFC 4180 fields (quotes, doubled quotes, newlines in
// quotes). Cells come back exactly as written; the database normalises.

export function decodeText(bytes: Uint8Array): { text: string; encoding: "utf-8" | "windows-1252" } {
  let text: string;
  let encoding: "utf-8" | "windows-1252" = "utf-8";
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes);
    encoding = "windows-1252";
  }
  return { text: text.replace(/^﻿/, ""), encoding };
}

// The delimiter that splits the first lines into the most columns,
// consistently (quoted text ignored).
export function detectDelimiter(text: string, candidates: string[] = [";", ",", "\t"]): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  const count = (line: string, d: string) => {
    let n = 0, quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === d && !quoted) n++;
    }
    return n;
  };
  let best = candidates[0], bestScore = -1;
  for (const d of candidates) {
    const counts = lines.map((l) => count(l, d));
    if (!counts.length || counts[0] === 0) continue;
    // Lines that agree with the header's count, then the count itself.
    const score = counts.filter((c) => c === counts[0]).length * 1000 + counts[0];
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}

export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  // Blank lines (a trailing newline, empty rows) aren't rows.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
