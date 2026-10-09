import * as Sentry from "@sentry/nextjs";
import { dateLocale, plainSpaces } from "./dateLabels";

// The record access log (Sprint TH, TH-3; migration 111): who opened a
// patient's record, and when. The web logs server-side, in the page that
// renders the patient (the chart with its records and prescriptions), so
// a client can't skip it. Only the practice's doctor can read the log.

type Rpc = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
};

// The function doesn't exist yet (before 111 is applied): nothing to log.
export function isMissingFunction(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}

// A genuine refusal to log the access: the database answered with an error
// code (Postgres / PostgREST, e.g. 42501, P0001). A network failure, such as
// a fetch that never reached the database, has no code: then the caller shows
// its generic failure (with "Tentar de novo"), not "couldn't record the
// access" (b2, 1.8.1; the app's logAccessStrict uses the same rule).
export function isAccessLogRefusal(error: { code?: string | null } | null | undefined): boolean {
  return !!error && typeof error.code === "string" && error.code.trim() !== "";
}

// Logs the opening of a patient's chart. Never blocks the page: a failure
// is reported to Sentry (the code only, no patient data) instead.
export async function logPatientOpen(db: unknown, patientId: string): Promise<void> {
  try {
    const { error } = await (db as Rpc).rpc("log_record_access", { p_patient_id: patientId, p_kind: "patient" });
    if (error && !isMissingFunction(error)) {
      Sentry.captureMessage("access_log_failed", { level: "error", tags: { code: error.code ?? "unknown" } });
    }
  } catch {
    Sentry.captureMessage("access_log_failed", { level: "error", tags: { code: "exception" } });
  }
}

export type AccessLogRow = {
  // Formatted on the server, in the practice's time zone.
  when: string;
  at: string;
  actorName: string;
  actorRole: "professional" | "secretary" | "patient" | string;
  kind: "patient" | "record" | "prescription" | "exam" | "file" | "export" | "imported" | "merged" | string;
  objectRef: string | null;
};

// The label for a kind shown without details: the CSV export (126),
// opening a patient's imported data (131) and a merge (133, "Mesclou com
// «{name}»": pass the row's object_ref, the removed record's name, as
// {name}) have their own; anything else not described by the caller is the
// patient's record.
// 189's 'document' (a certificate, declaration…), 190's shared-document kinds
// (written by the patient-document function) and 193's file_deleted have
// their own labels (cf's wording, the same in the app).
const KIND_LABELS = {
  export: "accessKindExport",
  imported: "accessKindImported",
  merged: "accessKindMerged",
  document: "accessKindDocument",
  shared_document: "accessKindSharedDocument",
  patient_upload: "accessKindPatientUpload",
  patient_upload_removed: "accessKindUploadRemoved",
  file_deleted: "accessKindFileDeleted",
} as const;
export function accessKindLabelKey(kind: string): (typeof KIND_LABELS)[keyof typeof KIND_LABELS] | "accessKindPatient" {
  return (KIND_LABELS as Record<string, (typeof KIND_LABELS)[keyof typeof KIND_LABELS]>)[kind] ?? "accessKindPatient";
}

export type AccessLogPage = { rows: AccessLogRow[]; hasMore: boolean };

export const ACCESS_LOG_PAGE = 50;

// One page of a patient's log, newest first. null = the log doesn't exist
// yet (before 111) or the caller isn't the practice's doctor: no tab.
// "failed" = a real error (the tab says so).
export async function readAccessLog(
  db: unknown,
  patientId: string,
  opts: { before?: string | null; locale: string; timeZone: string },
): Promise<AccessLogPage | "failed" | null> {
  const { data, error } = await (db as Rpc).rpc("get_patient_access_log", {
    p_patient_id: patientId,
    p_limit: ACCESS_LOG_PAGE + 1,
    p_before: opts.before ?? null,
  });
  if (error) {
    if (isMissingFunction(error) || /not_allowed/.test(error.message ?? "")) return null;
    return "failed";
  }
  const raw = (Array.isArray(data) ? data : []) as {
    accessed_at: string; actor_name: string; actor_role: string; kind: string; object_ref: string | null;
  }[];
  const fmt = new Intl.DateTimeFormat(dateLocale(opts.locale), { dateStyle: "medium", timeStyle: "short", timeZone: opts.timeZone });
  return {
    rows: raw.slice(0, ACCESS_LOG_PAGE).map((r) => ({
      when: plainSpaces(fmt.format(new Date(r.accessed_at))),
      at: r.accessed_at,
      actorName: r.actor_name,
      actorRole: r.actor_role,
      kind: r.kind,
      objectRef: r.object_ref,
    })),
    hasMore: raw.length > ACCESS_LOG_PAGE,
  };
}

// A file's name from its storage path (<practice>/<patient>/<name>).
export function fileNameFromRef(ref: string | null): string | null {
  if (!ref) return null;
  const name = ref.split("/").slice(2).join("/");
  return name || null;
}
