// Exports the Thai review sheet for the native reviewer (Sprint TH, TH-2):
// one row per message key with the English text, the current Thai text and
// context. Usage: node scripts/th-review-sheet.mjs [out.csv]
// Default output: th-review-sheet.csv in the current directory. The file has
// a UTF-8 BOM so Excel and Google Sheets show Thai correctly.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const load = (locale) => JSON.parse(readFileSync(resolve("src/messages", `${locale}.json`), "utf8").replace(/^﻿/, ""));

function flatten(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, String(v)]],
  );
}

// Where the key is used, in words the reviewer understands.
const AREAS = {
  auth: "Sign-in / sign-up screens", confirm: "Email confirmation / password reset", consent: "Cookie banner",
  schedule: "Doctor's schedule", patients: "Patient list", patientDetail: "Patient record",
  settings: "Doctor's settings", book: "Patient booking page", myAppointments: "Patient's appointments",
  clinics: "Clinic locations", subscription: "Subscription / plan", hero: "Home page (top)", cta: "Home page (bottom)",
  features: "Home page (features)", highlights: "Home page (highlights)", footer: "Page footer", feedback: "Feedback page",
  legal: "Privacy / Terms note", setup: "First-run checklist", onboarding: "Welcome cards", accountDelete: "Account deletion",
  secretary: "Secretary screens", payments: "Payments", dashboard: "Dashboard home",
};

function context(key, en, th) {
  const notes = [AREAS[key.split(".")[0]] ?? key.split(".")[0]];
  const vars = [...new Set(en.match(/\{[a-zA-Z_]+/g) ?? [])].map((v) => `${v}}`);
  if (vars.length) notes.push(`Keep placeholders exactly: ${vars.join(" ")}`);
  if (/\{[a-zA-Z_]+, plural/.test(en)) notes.push("English has singular/plural forms; Thai needs one form with the number, e.g. {n} ครั้ง");
  if (th === en) notes.push("NOT TRANSLATED YET (same as English)");
  return notes.join(". ");
}

const csv = (s) => `"${String(s).replace(/"/g, '""')}"`;
const en = new Map(flatten(load("en")));
const th = new Map(flatten(load("th")));
const rows = [["key", "english", "thai", "context", "reviewer_suggestion"]];
for (const [key, enText] of en) {
  const thText = th.get(key) ?? "";
  rows.push([key, enText, thText, context(key, enText, thText), ""]);
}
const out = resolve(process.argv[2] ?? "th-review-sheet.csv");
writeFileSync(out, "﻿" + rows.map((r) => r.map(csv).join(",")).join("\r\n") + "\r\n", "utf8");
const untranslated = rows.slice(1).filter((r) => r[3].includes("NOT TRANSLATED")).length;
console.log(`Wrote ${rows.length - 1} keys to ${out} (${untranslated} identical to English).`);
