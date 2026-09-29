// Founders stage 2 (migration 132; spec founders-page-spec.md "Stage 2"): an
// accepted founder uploads test exports from Settings → Programa Fundadores.
// Files go straight from the browser to the private bucket with a signed
// upload URL (never through our server), under a path the server builds.

export const FOUNDER_BUCKET = "founder-samples";
export const FOUNDER_MAX_BYTES = 20 * 1024 * 1024;
// Uploads one founder may make in 24 hours, counted from the objects in
// their folder: an unregistered upload survives a day at 20 MB, so this
// bounds what a single account can park in the bucket (9a). A new signed
// URL is refused once the folder holds this many recent objects.
export const FOUNDER_DAILY_URLS = 30;

const TYPES: Record<string, string> = {
  csv: "text/csv",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
};

export const extOf = (name: string) => (name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "");
export const contentTypeFor = (name: string): string | null => TYPES[extOf(name)] ?? null;

// The stored name: letters, digits, dots, dashes and underscores only, at
// most 80 characters, the extension kept.
export function safeFileName(name: string): string {
  const ext = extOf(name);
  const base = name.slice(0, ext ? -(ext.length + 1) : undefined)
    .normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 70) || "export";
  return ext ? `${base}.${ext}` : base;
}

export type FounderUploadError = "not_allowed" | "confirmation_required" | "type" | "size" | "too_many_files" | "daily_limit" | "generic";

export function mapRegisterError(message: string | undefined): FounderUploadError {
  const m = message ?? "";
  if (m.includes("too_many_files")) return "too_many_files";
  if (m.includes("confirmation_required")) return "confirmation_required";
  if (m.includes("not_allowed")) return "not_allowed";
  return "generic";
}
