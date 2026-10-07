import { getTranslations } from "next-intl/server";
import { NewAppointmentButton, AppointmentStatusSelect, DeleteAppointmentButton, RescheduleButton, PixQrButton, PromptPayQrButton } from "./ScheduleClient";
import { MOVABLE_STATUSES, offersPaymentQr } from "@/lib/scheduleChecks";
import { hasAmount, showsPayment } from "@/lib/paymentRules";
import { SetAmountButton } from "../payments/PaymentsClient";
import type { CalendarAppt } from "./CalendarView";
import { formatMoney } from "@/lib/money";
import { countryProfile, type Currency } from "@/lib/country";
import { ConsultTypeLabel } from "@/components/ConsultTypeLabel";
import { DoctorTag, type DoctorTagInfo } from "@/components/DoctorTag";

// What a row needs from its practice: the money in its currency, its
// payment QR, its procedures (the suggested amount, "book again").
export type RowPracticeCtx = {
  currency: Currency;
  pixKey: string | null;
  promptPayId: string | null;
  clinicName: string;
  clinicCity: string;
  procedures: { id: string; name: string; duration_minutes: number; price?: number; payment_type: string }[];
  // The practice country (the registry's paymentShare, the wa.me number).
  country?: string;
  // The shown patients' phones, by patient id (G4's "Enviar Pix por
  // WhatsApp"); read only when the practice can share its payment code.
  phones?: Record<string, string>;
};

function statusBadge(status: string) {
  switch (status) {
    case "blocked": return "bg-slate-100 text-slate-500";
    default: return "bg-slate-100 text-slate-600";
  }
}

// One appointment of the Agenda's list. doctor: the "All" schedule's (166)
// doctor tag; the row's actions then act for that doctor (RowPractice).
// city: "Todos" across time zones, the doctor's city after the time (cf).
export async function ScheduleRow({ appt, ctx, today, doctor, city }: { appt: CalendarAppt; ctx: RowPracticeCtx; today: string; doctor?: DoctorTagInfo; city?: string }) {
  const t = await getTranslations("schedule");
  const { currency, pixKey, promptPayId, clinicName, clinicCity, procedures } = ctx;
  // G4: the Pix code to the patient's WhatsApp, when the practice country
  // shares payments there (registry) and the patient has a phone.
  const phone = appt.patient_id ? ctx.phones?.[appt.patient_id] : undefined;
  const pixShare = countryProfile(ctx.country).paymentShare === "whatsapp" && phone?.trim()
    ? { phone, country: ctx.country!, date: appt.date, time: appt.start_time }
    : null;
  return (
    <div
      data-highlight-id={appt.id}
      className={`group flex items-start gap-4 rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md ${
        appt.status === "blocked" ? "border-slate-100 opacity-75" : "border-slate-100 hover:border-slate-200"
      }`}
    >
      <div className="shrink-0 text-right min-w-[52px]">
        <p className="text-sm font-bold text-slate-900 whitespace-nowrap">
          {appt.start_time?.slice(0, 5)}
          {city && <span data-testid="row-city" className="ml-1 text-xs font-medium text-slate-500">({city})</span>}
        </p>
        <p className="text-xs text-slate-400">{appt.end_time?.slice(0, 5)}</p>
        <p className="text-xs text-slate-400 mt-0.5">{t("durationMinutes", { n: appt.duration_minutes ?? 0 })}</p>
      </div>
      <div className={`mt-1 h-full w-0.5 self-stretch rounded-full min-h-10 ${appt.status === "blocked" ? "bg-slate-200" : "bg-teal-200"}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold text-slate-900 truncate">{appt.patient_name}</p>
            {doctor && <DoctorTag info={doctor} />}
            <p className="text-sm text-slate-500 mt-0.5">
              <ConsultTypeLabel value={appt.consultation_type} />
              {appt.location_name && <span data-testid="appt-location"> · {appt.location_name}</span>}
              {appt.type === "online" && <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600 font-semibold">{t("onlineBadge")}</span>}
            </p>
            {appt.patient_note && <p className="text-xs text-slate-500 mt-1 truncate"><span className="font-semibold">{t("patientMessage")}:</span> {appt.patient_note}</p>}
            {appt.notes && <p className="text-xs text-slate-400 mt-1 truncate">{appt.notes}</p>}
            {(appt as { status_reason?: string | null }).status_reason && (
              <p className="text-xs text-slate-500 mt-1 truncate"><span className="font-semibold">{t("reasonShort")}:</span> {(appt as { status_reason?: string | null }).status_reason}</p>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-2">
            {appt.status !== "blocked" && <AppointmentStatusSelect id={appt.id} current={appt.status} />}
            {appt.status === "blocked" && (
              <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusBadge(appt.status)}`}>{t("blockedLabel")}</span>
            )}
            {pixKey && offersPaymentQr(appt) && (
              <PixQrButton pixKey={pixKey} clinicName={clinicName} clinicCity={clinicCity} amount={appt.payment_amount} share={pixShare} />
            )}
            {promptPayId && offersPaymentQr(appt) && (
              <PromptPayQrButton promptPayId={promptPayId} amount={appt.payment_amount} />
            )}
            {MOVABLE_STATUSES.includes(appt.status) && <RescheduleButton id={appt.id} date={appt.date} start={appt.start_time} durationMin={appt.duration_minutes ?? undefined} />}
            {/* A no-show is never moved (UX 36): book again instead (in
                "Todos", for this row's doctor). */}
            {appt.status === "absent" && (
              <NewAppointmentButton defaultDate={today} currency={currency} procedures={procedures}
                prefill={{ patientId: appt.patient_id ?? null, patientName: appt.patient_name, procedureName: appt.consultation_type, duration: appt.duration_minutes }} />
            )}
            <DeleteAppointmentButton id={appt.id} />
          </div>
        </div>
        {showsPayment(appt.status, appt.payment_status) && (
          <div className="mt-2 flex items-center gap-3">
            {appt.payment_status !== "paid" && !hasAmount(appt.payment_amount) ? (
              // No amount yet (the app's #216): not to-receive; set one here,
              // prefilled with the same-named procedure's price.
              <>
                <SetAmountButton
                  id={appt.id}
                  currency={currency}
                  suggested={procedures.find((p) => p.name === appt.consultation_type && hasAmount(p.price))?.price ?? null}
                />
                {/* No QR without a value (e7): say why it's missing. */}
                {(pixKey || promptPayId) && <span className="text-xs text-slate-400">{t("qrNeedsAmount")}</span>}
              </>
            ) : (
              <span className={`text-xs font-semibold ${appt.payment_status === "paid" ? "text-green-600" : "text-orange-500"}`}>
                {appt.payment_status === "paid" ? t("paidLabel") : t("pendingLabel")}
                {appt.payment_amount ? ` · ${formatMoney(appt.payment_amount, currency)}` : ""}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
