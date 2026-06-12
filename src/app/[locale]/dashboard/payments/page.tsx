import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PeriodFilter, MarkPaidButton, MarkUnpaidButton } from "./PaymentsClient";

type Period = "week" | "month" | "last_month" | "all";

function formatBRL(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function getDateRange(period: Period): { from: string; to: string } {
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  if (period === "week") {
    const mon = new Date(now);
    mon.setDate(now.getDate() - now.getDay() + 1);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { from: mon.toISOString().split("T")[0], to: sun.toISOString().split("T")[0] };
  }
  if (period === "month") {
    return { from: `${today.slice(0, 7)}-01`, to: today };
  }
  if (period === "last_month") {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: d.toISOString().split("T")[0], to: last.toISOString().split("T")[0] };
  }
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

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale === "en" ? "" : locale + "/"}auth/login`);

  const { from, to } = getDateRange(period);

  const [pendingResult, paidResult] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, patient_name, date, start_time, consultation_type, payment_amount, payment_type")
      .eq("professional_id", user.id)
      .eq("payment_status", "pending")
      .neq("status", "blocked")
      .neq("status", "cancelled")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: false }),
    supabase
      .from("appointments")
      .select("id, patient_name, date, start_time, consultation_type, payment_amount, payment_type")
      .eq("professional_id", user.id)
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
        <h1 className="text-2xl font-extrabold text-slate-900">Payments</h1>
        <p className="text-sm text-slate-500 mt-0.5">Track and manage consultation payments</p>
      </div>

      {/* Period filter */}
      <div className="mb-6 overflow-x-auto">
        <PeriodFilter current={period} />
      </div>

      {/* Summary cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-orange-100 bg-orange-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Pending</p>
          <p className="mt-1 text-2xl font-extrabold text-orange-900">{formatBRL(totalPending)}</p>
          <p className="text-xs text-orange-600">{pending.length} session{pending.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="rounded-2xl border border-green-100 bg-green-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-green-600">Received</p>
          <p className="mt-1 text-2xl font-extrabold text-green-900">{formatBRL(totalPaid)}</p>
          <p className="text-xs text-green-600">{paid.length} session{paid.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="rounded-2xl border border-teal-100 bg-teal-50 p-5 col-span-2 sm:col-span-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-600">Total</p>
          <p className="mt-1 text-2xl font-extrabold text-teal-900">{formatBRL(totalPending + totalPaid)}</p>
          <p className="text-xs text-teal-600">{pending.length + paid.length} sessions</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pending */}
        <div>
          <h2 className="mb-3 text-base font-bold text-slate-900 flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">{pending.length}</span>
            Pending
          </h2>
          {pending.length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center">
              <p className="text-sm text-slate-400">All paid up! 🎉</p>
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
                        <p className="text-xs text-slate-400 mt-1">No amount set</p>
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
            Received
          </h2>
          {paid.length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center">
              <p className="text-sm text-slate-400">No paid sessions yet</p>
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
                      <span className="text-xs font-semibold text-green-600">✓ Paid</span>
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
