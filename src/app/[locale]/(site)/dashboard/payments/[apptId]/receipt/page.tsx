import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { formatCnpj } from "@/lib/cnpj";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveProfId } from "@/lib/effectiveProfId";
import { lookupPracticeCountry } from "@/lib/practiceCountry";
import { AccessLogFailed } from "@/components/printAccess";
import { countryProfile } from "@/lib/country";
import { formatMoney } from "@/lib/money";
import { PRINT_CSS, docDate, docTime, toDocTemplate } from "@/lib/prescriptionDoc";
import { readPracticeHeader } from "@/lib/practiceHeader";
import { PrintToolbar } from "@/components/PrintToolbar";
import { ReceiptDocument } from "./ReceiptDocument";

// The recibo's print view (Help G5 on the website; UX 36): the app's simple
// recibo, for the doctor AND the secretary (payments are their job). A Thai
// practice gets no unnumbered recibo here: its receipt is the numbered legal
// one, issued in the app. Dates and money in the practice country's format.

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

export default async function ReceiptPrintPage({
  params,
}: {
  params: Promise<{ locale: string; apptId: string }>;
}) {
  const { locale, apptId } = await params;
  const prefix = locale === "en" ? "" : `/${locale}`;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`${prefix}/auth/login`);
  const profId = await getEffectiveProfId(supabase, user.id);
  if (!profId) notFound();

  // Read as the user (RLS): it must be this practice's appointment. That is
  // also what lets the header be read for a secretary (lib/practiceHeader).
  const { data: appt } = await supabase.from("appointments").select("*").eq("id", apptId).eq("professional_id", profId).maybeSingle();
  const a = appt as Row | null;
  if (!a || a.status === "blocked") notFound();

  const [t, tIds] = await Promise.all([
    getTranslations({ locale, namespace: "prescriptionDoc" }),
    getTranslations({ locale, namespace: "patientIds" }),
  ]);
  const back = `${prefix}/dashboard/payments`;
  // The practice country decides the recibo (currency, IDs, dates; Thai →
  // none). Unknown: an error, never a guessed Brazilian recibo (9a).
  const lookup = await lookupPracticeCountry(supabase, user.id, profId);
  if (!lookup.ok) return <AccessLogFailed backHref={back} text={t("countryFailed")} backLabel={t("back")} />;
  const country = lookup.country;

  if (country === "TH") {
    return (
      <div data-theme="light" className="min-h-screen bg-slate-50 px-4 py-8">
        <PrintToolbar backHref={back} />
        <p className="mx-auto max-w-[680px] rounded-2xl bg-white p-6 text-sm text-slate-600 shadow-sm">{t("receiptThaiHint")}</p>
      </div>
    );
  }

  const [patientResult, header] = await Promise.all([
    str(a.patient_id)
      ? supabase.from("patients").select("full_name, cpf, passport_number").eq("id", a.patient_id as string).eq("professional_id", profId).maybeSingle()
      : Promise.resolve({ data: null }),
    readPracticeHeader(profId, "invoice"),
  ]);
  const patient = patientResult.data as { full_name: string; cpf: string | null; passport_number: string | null } | null;
  const idLines: string[] = [];
  if (country === "BR" && str(patient?.cpf)) idLines.push(`${tIds("cpf")}: ${patient!.cpf}`);
  if (country !== "BR" && str(patient?.passport_number)) idLines.push(`${tIds("passportOrId")}: ${patient!.passport_number}`);

  const { currency } = countryProfile(country);
  const money = (n: number) => formatMoney(n, currency);
  const base = typeof a.payment_amount === "number" ? a.payment_amount : 0;
  const extras = (Array.isArray(a.extra_items) ? a.extra_items : []) as { name?: unknown; price?: unknown }[];
  const extrasTotal = extras.reduce((s, x) => s + (typeof x.price === "number" ? x.price : 0), 0);
  const date = String(a.date ?? "");

  return (
    <div data-theme="light" className="min-h-screen bg-slate-50 px-4 py-8">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <PrintToolbar backHref={back} />
      <div className="mx-auto max-w-[680px] shadow-sm ring-1 ring-slate-100">
        <ReceiptDocument
          template={toDocTemplate(header.template)}
          labels={{
            title: t("receiptTitle"), patient: t("patient"), services: t("services"), description: t("description"), amount: t("amount"),
            total: t("total"), payment: t("payment"), online: t("online"), inPerson: t("inPerson"), privatePay: t("privatePay"),
            insurance: t("insurance"), paid: t("paid"), pending: t("pending"), footer: t("footer"),
          }}
          patientName={patient?.full_name ?? String(a.patient_name ?? "")}
          idLines={idLines}
          number={`${date.replace(/-/g, "")}-${apptId.slice(0, 6).toUpperCase()}`}
          date={docDate(country, date)}
          provider={[header.fullName, header.specialty].filter(Boolean).join(" — ")}
          clinic={[header.clinicName, country === "BR" && header.clinicCnpj ? `CNPJ ${formatCnpj(header.clinicCnpj)}` : null].filter(Boolean).join(" · ")}
          address={[header.address, header.city, header.state].filter(Boolean).join(", ")}
          service={String(a.consultation_type ?? "")}
          serviceDetail={`${a.type === "online" ? t("online") : t("inPerson")} · ${docTime(a.start_time as string)}`}
          amount={base > 0 ? money(base) : "—"}
          extras={extras.map((x) => ({ name: String(x.name ?? ""), amount: typeof x.price === "number" ? money(x.price) : "—" }))}
          total={money(base + extrasTotal)}
          privatePay={a.payment_type === "private"}
          paid={a.payment_status === "paid"}
        />
      </div>
    </div>
  );
}
