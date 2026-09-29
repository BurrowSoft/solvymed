import type { ScreenTarget } from "./types";

// Screen names → this website's paths (the app maps the same names to its
// own screens). Built from a fixed table plus URLSearchParams, never from
// model text (docs/assistant-api.md §5).
const BASE: Record<ScreenTarget["screen"], string | null> = {
  home: "/dashboard",
  schedule: "/dashboard/schedule",
  patients: "/dashboard/patients",
  patient: "/dashboard/patients",
  payments: "/dashboard/payments",
  settings: "/dashboard/settings",
  whatsapp: null,
};

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function webPath(prefix: string, target: ScreenTarget, highlight?: string): string | null {
  const base = BASE[target.screen];
  if (!base) return null;
  let path = `${prefix}${base}`;
  if (target.screen === "patient") {
    if (!target.id || !ID.test(target.id)) return `${prefix}${BASE.patients}`;
    path += `/${target.id}`;
  }
  const q = new URLSearchParams();
  if (target.date && DATE.test(target.date)) q.set("date", target.date);
  for (const [k, v] of Object.entries(target.params ?? {})) if (/^[a-z_]{1,20}$/.test(k)) q.set(k, v);
  if (highlight && ID.test(highlight)) q.set("highlight", highlight);
  const qs = q.toString();
  return qs ? `${path}?${qs}` : path;
}

// The contract's href rule: exactly one leading "/", no backslash, control
// characters or scheme. Anything else is never followed.
export function isInternalHref(h: unknown): h is string {
  return typeof h === "string" && h.startsWith("/") && !h.startsWith("//") && !/[\\\u0000-\u001f\u007f]/.test(h) && !/^[a-z][a-z0-9+.-]*:/i.test(h);
}
