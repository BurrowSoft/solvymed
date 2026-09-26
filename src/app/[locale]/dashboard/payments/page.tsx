import { createClient } from "@/lib/supabase/server";
import { getEffectiveProfId } from "@/lib/effectiveProfId";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PeriodFilter, MarkPaidButton, MarkUnpaidButton } from "./PaymentsClient";
import { clinicDate, getClinicTimeZone, previousMonthRange, weekRange } from "@/lib/clinicTime";

type Period = "week" | "month" | "last_month" | "all";

function formatBRL(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

// Ranges on the practice's calendar, not the server's (UTC).
function getDateRange(period: Period, timeZone: string): { from: string; to: string } {
  const today = clinicDate(new Date(), timeZone);
  if (period === "week") return weekRange(today);
  if (period === "month") return { from: `${today.slice(0, 7)}-01`, to: today };
  if (period === "last_month") return previousMonthRange(today);
  return { from: "2000-01-01", to: today };
}

export default async function PaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { locale } = await params;
  const { period: periodParam } = await searchParams;
  const period: Period = (["week", "month", "last_month", "all"].includes(periodParam ?? "") ? periodParam : "month") as Period;

  const [supabase, t] = await Promise.all([
    createClient(),
    getTranslations("paymentsPage"),
  ]);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale === "en" ? "" : locale + "/"}auth/login`);
  // A secretary works their doctor's payments (view, mark paid), not their
  // own (empty) id.
  const effectiveProfId = await getEffectiveProfId(supabase, user.id);
  if (!effectiveProfId) redirect(`/${locale === "en" ? "" : locale + "/"}auth/login`);
  const isSecretary = effectiveProfId !== user.id;

  const timeZone = await getClinicTimeZone(supabase, { professionalId: effectiveProfId, isSecretary });
  const { from, to } = getDateRange(period, timeZone);

  const [pendingResult, paidResult] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, patient_name, date, start_time, consultation_type, payment_amount, payment_type")
      .eq("professional_id", effectiveProfId)
      .eq("payment_status", "pending")
      .neq("status", "blocked")
      .neq("status", "cancelled")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: false }),
    supabase
      .from("appointments")
      .select("id, patient_name, date, start_time, consultation_type, payment_amount, payment_type")
      .eq("professional_id", effectiveProfId)
      .eq("payment_status", "paid")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: false }),
  ]);

  const pending = (pendingResult.data ?? []) as {
    id: string; patient_name: string; date: string; start_time: string;
    consultation_type: string; payment_amount?: number; payment_type: string;
  }[];
  const paid = (paidResult.data ?? []) as typeof pending;

  const totalPending = pending.reduce((s, p) => s + (p.payment_amount ?? 0), 0);
  const totalPaid = paid.reduce((s, p) => s + (p.payment_amount ?? 0), 0);

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900">{t("title")}</h1>
        <p className="text-sm text-slate-500 mt-0.5">{t("subtitle")}</p>
      </div>

      {/* Period filter */}
      <div className="mb-6 overflow-x-auto">
        <PeriodFilter current={period} />
      </div>

      {/* Summary cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-orange-100 bg-orange-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">{t("pendingLabel")}</p>
          <p className="mt-1 text-2xl font-extrabold text-orange-900">{formatBRL(totalPending)}</p>
          <p className="text-xs text-orange-600">{t("sessions", { n: pending.length })}</p>
        </div>
        {/* Received/total sums are the practice's revenue: doctor only. */}
        {!isSecretary && (
          <>
            <div className="rounded-2xl border border-green-100 bg-green-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-green-600">{t("receivedLabel")}</p>
              <p className="mt-1 text-2xl font-extrabold text-green-900">{formatBRL(totalPaid)}</p>
              <p className="text-xs text-green-600">{t("sessions", { n: paid.length })}</p>
            </div>
            <div className="rounded-2xl border border-teal-100 bg-teal-50 p-5 col-span-2 sm:col-span-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-600">{t("totalLabel")}</p>
              <p className="mt-1 text-2xl font-extrabold text-teal-900">{formatBRL(totalPending + totalPaid)}</p>
              <p className="text-xs text-teal-600">{t("sessions", { n: pending.length + paid.length })}</p>
            </div>
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pending */}
        <div>
          <h2 className="mb-3 text-base font-bold text-slate-900 flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">{pending.length}</span>
            {t("pendingLabel")}
          </h2>
          {pending.length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center">
              <p className="text-sm text-slate-400">{t("allPaidUp")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pending.map(p => (
                <div key={p.id} className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 text-sm truncate">{p.patient_name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{p.date} · {p.start_time?.slice(0, 5)} · {p.consultation_type}</p>
                      {p.payment_amount ? (
                        <p className="text-sm font-bold text-orange-600 mt-1">{formatBRL(p.payment_amount)}</p>
                      ) : (
                        <p className="text-xs text-slate-400 mt-1">{t("noAmountSet")}</p>
                      )}
                    </div>
                    <div className="shrink-0">
                      <MarkPaidButton id={p.id} amount={p.payment_amount} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Paid */}
        <div>
          <h2 className="mb-3 text-base font-bold text-slate-900 flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700">{paid.length}</span>
            {t("receivedLabel")}
          </h2>
          {paid.length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center">
              <p className="text-sm text-slate-400">{t("noPaidYet")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {paid.map(p => (
                <div key={p.id} className="rounded-2xl border border-green-100 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 text-sm truncate">{p.patient_name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{p.date} · {p.start_time?.slice(0, 5)} · {p.consultation_type}</p>
                      {p.payment_amount ? (
                        <p className="text-sm font-bold text-green-600 mt-1">{formatBRL(p.payment_amount)}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className="text-xs font-semibold text-green-600">{t("paidBadge")}</span>
                      <MarkUnpaidButton id={p.id} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
