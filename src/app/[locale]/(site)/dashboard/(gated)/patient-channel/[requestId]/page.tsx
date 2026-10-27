import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { staffContext } from "@/lib/patientChannel/staff";
import { logChannelRequestOpen } from "@/lib/accessLog";
import { pcAdmin } from "@/lib/patientChannel/server";
import { fromStoredRules } from "@/lib/patientChannel/rules";
import {
  detailHighlights, detailLineLabel, detailNames, highlightParts, toDetailAnswers, toInboxRow, toLines, toShownMessages, warningFloorCause,
} from "@/lib/patientChannel/inbox";
import { AI_STATUSES, type AiStatus } from "@/lib/patientChannel/aiDb";
import { toStoredAiLines } from "@/lib/patientChannel/aiRead";
import { BandTag } from "../../../settings/patient-channel/BandTag";
import { AiPanel } from "./AiPanel";
import { ReplyBox } from "./ReplyBox";
import { formatPhone } from "@/lib/phoneFormat";
import { isUnscored } from "@/lib/patientChannel/unscored";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DETAIL_COLUMNS = "id, professional_id, patient_id, destination, reason_snapshot, answers, text, score_total, band, lines, warning_shown, floor_applied, auto_messages_shown, status, reply_text, replied_at, created_at, patients(full_name, phone)";
// M7's columns, read apart: before the M7 migration is live they don't exist, and the detail
// above must keep working (a failed read = no AI section).
const AI_COLUMNS = "ai_status, ai_lines, ai_confirmed_at";
// The earlier requests: no message text (each opens its own access-logged detail).
const HISTORY_COLUMNS = "id, patient_id, destination, band, score_total, status, created_at, reason_snapshot, patients(full_name)";

// Patient Channel M5 (specs/patient-contact-tech.md §6): one request. The answers, chips and
// the automatic messages the patient saw; the text with the list's words highlighted; the
// breakdown "Como chegou a N pontos" from the stored snapshot; the patient's earlier
// requests; the reply. Read under RLS as the caller. The symptom names and the highlights
// come from the practice's rules, read here with the service role ONLY after that read
// succeeded, and only the names and positions reach the page (never the weights: a
// secretary can't read the rules, cf's M0 point 4). A secretary reads a doctor-destination
// request (when the doctor allows) but can't answer it (01's call 10; pc_reply refuses too).
// Opening it is logged in the patient's Access tab (241).
export default async function PatientChannelRequestPage({
  params,
}: {
  params: Promise<{ locale: string; requestId: string }>;
}) {
  const { locale, requestId } = await params;
  if (!UUID.test(requestId)) notFound();
  const { supabase, prefix, profId, isSecretary, country, doctorName, formatWhen } = await staffContext(locale);
  const t = await getTranslations({ locale, namespace: "patientChannel" });
  // Who it goes to, from the viewer's side: the doctor reads "To you"; a secretary, the doctor's name
  // (01: no gendered "médico").
  const destination = (d: "doctor" | "secretary") =>
    d === "secretary" ? t("inbox.toSecretary") : isSecretary ? t("inbox.toDoctor", { doctor: doctorName || "—" }) : t("reasons.to.doctor");

  const { data: raw } = await supabase.from("pc_requests").select(DETAIL_COLUMNS).eq("id", requestId).maybeSingle();
  const q = raw as Record<string, unknown> | null;
  if (!q || q.professional_id !== profId) notFound();
  const row = toInboxRow(q);
  // An administrative request: no band, points or breakdown (launch polish 29).
  const unscored = isUnscored(q.reason_snapshot);
  const patient = (Array.isArray(q.patients) ? q.patients[0] : q.patients) as { phone?: string | null } | null;

  const [, history, settings, aiRead] = await Promise.all([
    // The patient's Access tab (241; 01, 10-26): who opened this request, and when. Never throws.
    logChannelRequestOpen(supabase, row.patientId, row.id).then(() => null),
    supabase.from("pc_requests").select(HISTORY_COLUMNS).eq("professional_id", profId).eq("patient_id", row.patientId)
      .neq("id", row.id).order("created_at", { ascending: false }).limit(20),
    pcAdmin().from("pc_settings").select("rules, ai_mapping").eq("professional_id", profId).maybeSingle(),
    // Under RLS like the row above (secretaries who may read it see the lines too).
    supabase.from("pc_requests").select(AI_COLUMNS).eq("id", requestId).maybeSingle(),
  ]);
  const ai = aiRead.error ? null : (aiRead.data as { ai_status?: unknown; ai_lines?: unknown; ai_confirmed_at?: unknown } | null);
  const aiStatus: AiStatus = AI_STATUSES.find((x) => x === ai?.ai_status) ?? "none";
  const aiConfirmedAt = typeof ai?.ai_confirmed_at === "string" ? ai.ai_confirmed_at : null;
  const s = settings.data as { rules?: unknown; ai_mapping?: boolean } | null;
  const config = s?.rules ? fromStoredRules(s.rules, country, s.ai_mapping === true) : null;
  const answers = toDetailAnswers(q.answers);
  const lines = toLines(q.lines);
  const aiLines = aiStatus === "done" ? toStoredAiLines(ai?.ai_lines) : [];
  const names = detailNames(config, lines, [
    ...(answers.kind === "form" ? [...answers.symptomIds, ...answers.chips.filter((c) => c.kind === "symptom").map((c) => c.ref)] : []),
    ...aiLines.map((l) => l.symptomId),
  ]);
  const parts = highlightParts(row.text, detailHighlights(config, row.text));
  const shownMessages = toShownMessages(q.auto_messages_shown);
  // The safety floor's reason: the warning symptoms (ids only, from the rules read above) vs
  // what the patient chose or wrote, or the AI's lines.
  const warningIds = (config?.symptoms ?? []).filter((x) => x.immediateWarning).map((x) => x.id);
  const patientIds = answers.kind === "form"
    ? [...answers.symptomIds, ...answers.chips.filter((c) => c.kind === "symptom").map((c) => c.ref), ...detailHighlights(config, row.text).filter((m) => m.kind === "symptom").map((m) => m.ref)]
    : [];
  const floorCause = warningFloorCause(warningIds, patientIds, lines, row.band);
  const tl = (key: string, values?: Record<string, string | number>) => t(key as never, values as never);
  const symptomName = (id: string) => names.symptoms[id] ?? "?";
  const readOnly = isSecretary && row.destination === "doctor";
  const phone = typeof patient?.phone === "string" ? patient.phone.trim() : "";

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl" data-testid="pc-detail">
      <Link href={`${prefix}/dashboard/patient-channel`} className="text-sm font-medium text-teal-700 hover:underline">{t("detail.back")}</Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {/* The patient's file (launch polish 31): the same page the patient list opens. */}
        <h1 className="text-2xl font-extrabold text-slate-900">
          {row.patientId
            ? <Link href={`${prefix}/dashboard/patients/${row.patientId}`} className="hover:underline" data-testid="pc-detail-patient">{row.patientName}</Link>
            : row.patientName}
        </h1>
        {!unscored && <BandTag band={row.band} />}
        {!unscored && <span className="font-bold tabular-nums text-slate-700" data-testid="pc-detail-total">{t("inbox.points", { n: row.score })}</span>}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        {t("detail.sentAt", { date: formatWhen(row.createdAt) })} · {destination(row.destination)} · {t(`inbox.status.${row.status}`)}
      </p>
      {phone && (
        <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="mt-2 inline-block text-sm font-bold text-teal-700 hover:underline" data-testid="pc-detail-call">
          {t("detail.call", { phone: formatPhone(phone, country) })}
        </a>
      )}

      {/* A secretary reading the doctor's request: said first (launch polish 30), not at the end. */}
      {row.status === "open" && readOnly && doctorName && (
        <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600" data-testid="pc-detail-readonly">{t("detail.readOnly", { doctor: doctorName })}</p>
      )}
      {q.warning_shown === true && (
        <p className="mt-4 border-l-4 border-red-600 pl-3 text-sm text-slate-700" data-testid="pc-detail-warning">{t("detail.warningShown")}</p>
      )}

      <section className="mt-6 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <p className="text-xs font-bold uppercase text-slate-500">{t("detail.reason")}</p>
        <p className="font-bold text-slate-900">{row.reasonTitle}</p>
        {answers.kind === "option" ? (
          <p className="mt-3 text-sm text-slate-700"><span className="text-slate-500">{t("detail.option")}:</span> {answers.option}</p>
        ) : (
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
            {answers.symptomIds.length > 0 && (<><dt className="text-slate-500">{t("detail.ticked")}</dt><dd className="text-slate-800">{answers.symptomIds.map(symptomName).join(", ")}</dd></>)}
            {answers.chips.length > 0 && (<><dt className="text-slate-500">{t("detail.chips")}</dt><dd className="text-slate-800">{answers.chips.map((c) => (c.kind === "symptom" ? symptomName(c.ref) : c.text)).join(", ")}</dd></>)}
            <dt className="text-slate-500">{t("answers.whenQ")}</dt><dd className="text-slate-800">{tl(`answers.when${answers.when}`)}</dd>
            <dt className="text-slate-500">{t("answers.intensityQ")}</dt><dd className="text-slate-800">{tl(`answers.intensity${answers.intensity}`)}</dd>
            <dt className="text-slate-500">{t("answers.stillTakingQ")}</dt><dd className="text-slate-800">{tl(`answers.stillTaking${answers.stillTaking}`)}</dd>
          </dl>
        )}
        {row.text && (
          <div className="mt-4">
            <p className="text-xs font-bold uppercase text-slate-500">{t("detail.text")}</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800" data-testid="pc-detail-text">
              {parts.map((p, i) => (p.mark ? <mark key={i} className="rounded bg-amber-100 px-0.5 text-slate-900">{p.text}</mark> : <span key={i}>{p.text}</span>))}
            </p>
            {!config?.aiMapping && (
              <p className="mt-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900" data-testid="pc-detail-keywords-only">{t("detail.keywordsOnly")}</p>
            )}
          </div>
        )}
      </section>

      {shownMessages.length > 0 && (
        <section className="mt-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm" data-testid="pc-detail-auto">
          <p className="text-xs font-bold uppercase text-slate-500">{t("detail.autoShown")}</p>
          <ul className="mt-2 flex flex-col gap-2">
            {shownMessages.map((m) => (
              <li key={m.id} className={`rounded-xl border-l-4 p-3 text-sm ${m.tone === "attention" ? "border-amber-500 bg-amber-50" : "border-teal-600 bg-teal-50"}`}>{m.text}</li>
            ))}
          </ul>
        </section>
      )}

      {!unscored && <section className="mt-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm" data-testid="pc-detail-breakdown">
        <p className="text-sm font-bold text-slate-900">{t("detail.breakdown", { n: row.score })}</p>
        <ul className="mt-2 flex flex-col gap-1 text-sm tabular-nums">
          {lines.length === 0 && <li className="text-xs text-slate-500">{t("test.noSymptom")}</li>}
          {lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-3 border-b border-dotted border-slate-200 pb-1">
              <span className="min-w-0 break-words">{detailLineLabel(names, l, tl)}</span>
              <b className={l.points > 0 ? "text-red-700" : "text-green-700"}>{l.points > 0 ? `+${l.points}` : l.points}</b>
            </li>
          ))}
        </ul>
        {q.floor_applied === true && config && <p className="mt-2 text-xs text-slate-600">{t("detail.floor", { band: t(`bands.${config.minBandForTextOnly}`) })}</p>}
        {/* The safety floor (01, 10-26): Urgent because of a symptom with the immediate warning. */}
        {floorCause && <p className="mt-2 text-xs font-semibold text-red-700" data-testid="pc-detail-warning-floor">{t(floorCause === "ai" ? "detail.warningFloorAi" : "detail.warningFloor")}</p>}
      </section>}

      {/* M7: the SolvyAI reading. Only the doctor confirms or undoes it (a secretary reads it). */}
      <AiPanel
        requestId={row.id}
        status={aiStatus}
        lines={aiLines.map((l) => ({ ...l, name: symptomName(l.symptomId) }))}
        confirmedAt={aiConfirmedAt ? formatWhen(aiConfirmedAt) : null}
        canAct={!isSecretary}
      />

      {row.status === "open" && !readOnly && <ReplyBox requestId={row.id} />}
      {(row.status === "answered" || row.status === "call_back") && (
        <section className="mt-6 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm" data-testid="pc-detail-replied">
          <p className="text-xs text-slate-500">
            {t(row.status === "answered" ? "detail.answeredAt" : "detail.callBackAt", { date: formatWhen(typeof q.replied_at === "string" ? q.replied_at : "") })}
          </p>
          {typeof q.reply_text === "string" && q.reply_text && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{q.reply_text}</p>}
        </section>
      )}
      {row.status === "substituted" && <p className="mt-6 text-sm text-slate-600">{t("detail.replacedBy")}</p>}

      {(history.data?.length ?? 0) > 0 && (
        <section className="mt-6" data-testid="pc-detail-history">
          <p className="text-sm font-bold text-slate-900">{t("detail.history")}</p>
          <ul className="mt-2 flex flex-col gap-2">
            {(history.data ?? []).map((h) => {
              const r = toInboxRow(h as Record<string, unknown>);
              return (
                <li key={r.id}>
                  <Link href={`${prefix}/dashboard/patient-channel/${r.id}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-white p-3 text-sm hover:bg-slate-50">
                    <BandTag band={r.band} />
                    <span className="text-slate-700">{r.reasonTitle}</span>
                    <span className="text-xs text-slate-500">{formatWhen(r.createdAt)} · {t(`inbox.status.${r.status}`)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
