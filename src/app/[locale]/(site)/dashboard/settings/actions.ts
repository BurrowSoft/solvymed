"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isProfessionalRole, getEffectiveProfId } from "@/lib/effectiveProfId";
import { normalizePromptPayId } from "@/lib/promptpay";
import { isValidThaiId } from "@/lib/patientIds";
import { formatCnpj, isValidCnpj } from "@/lib/cnpj";
import { cardLinkInput } from "@/lib/cardLink";
import { parseMoney } from "@/lib/money";

export async function updateProfile(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  // Doctor-only: a secretary may view but never edit these.
  if ((await isProfessionalRole(supabase, user.id)) !== true) return { error: "Only the doctor can change these settings" };

  const { error } = await supabase.from("professionals").upsert({
    id: user.id,
    email: user.email!,
    full_name: (formData.get("full_name") as string)?.trim() || "",
    specialty: (formData.get("specialty") as string)?.trim() || null,
    // Optional; the database caps it at 100 characters (migration 103).
    professional_registration: ((formData.get("professional_registration") as string) ?? "").trim().slice(0, 100) || null,
  });

  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  return { success: true };
}

export async function updateClinic(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  // Doctor-only: a secretary may view but never edit these.
  if ((await isProfessionalRole(supabase, user.id)) !== true) return { error: "Only the doctor can change these settings" };

  // Only Thai practices have the PromptPay field (the database refuses it
  // for any other country: 'promptpay_requires_th'). Empty clears it.
  let promptPay: { promptpay_id?: string | null } = {};
  if (formData.has("promptpay_id")) {
    const raw = ((formData.get("promptpay_id") as string) ?? "").trim();
    const id = raw ? normalizePromptPayId(raw) : null;
    if (raw && !id) return { error: "invalid_promptpay" };
    promptPay = { promptpay_id: id };
  }

  // The Thai clinic tax ID (migration 112; Thai practices only, 13 digits
  // with the Thai ID checksum, as the database checks). Empty clears it.
  let taxId: { clinic_tax_id?: string | null } = {};
  if (formData.has("clinic_tax_id")) {
    const digits = ((formData.get("clinic_tax_id") as string) ?? "").replace(/\D/g, "");
    if (digits && !isValidThaiId(digits)) return { error: "invalid_tax_id" };
    taxId = { clinic_tax_id: digits || null };
  }

  // Only Brazilian practices have the CNPJ field; a form without it leaves
  // the stored value untouched. Checked (the app's rule, alphanumeric CNPJ
  // included) and saved formatted only when it changed from what's stored,
  // so an old bad value never blocks other edits (UX, as the app).
  let cnpj: { clinic_cnpj?: string | null } = {};
  if (formData.has("clinic_cnpj")) {
    const raw = ((formData.get("clinic_cnpj") as string) ?? "").trim();
    const { data: current } = await supabase.from("professionals").select("clinic_cnpj").eq("id", user.id).maybeSingle();
    const stored = ((current as { clinic_cnpj?: string | null } | null)?.clinic_cnpj ?? "").trim();
    if (formatCnpj(raw) !== formatCnpj(stored)) {
      if (raw && !isValidCnpj(raw)) return { error: "invalid_cnpj" };
      cnpj = { clinic_cnpj: raw ? formatCnpj(raw) : null };
    }
  }

  // 1.8.0 E: the card payment link (migration 210), only when the form has
  // the field; https only, ≤ 500 (the database checks the same).
  let cardLink: { card_payment_url?: string | null } = {};
  if (formData.has("card_payment_url")) {
    const v = cardLinkInput(formData.get("card_payment_url") as string);
    if (!v.ok) return { error: "invalid_card_link" };
    cardLink = { card_payment_url: v.value };
  }

  const { error } = await supabase.from("professionals").update({
    clinic_name: (formData.get("clinic_name") as string)?.trim() || null,
    ...cnpj,
    clinic_phone: (formData.get("clinic_phone") as string)?.trim() || null,
    clinic_website: (formData.get("clinic_website") as string)?.trim() || null,
    clinic_address: (formData.get("clinic_address") as string)?.trim() || null,
    clinic_city: (formData.get("clinic_city") as string)?.trim() || null,
    clinic_state: (formData.get("clinic_state") as string)?.trim() || null,
    // Only Brazilian practices have the Pix field; a form without it (a
    // practice in another country) leaves the stored key untouched.
    ...(formData.has("pix_key") ? { pix_key: (formData.get("pix_key") as string)?.trim() || null } : {}),
    ...promptPay,
    ...taxId,
    ...cardLink,
  }).eq("id", user.id);

  if (error) return { error: error.message?.includes("invalid_tax_id") ? "invalid_tax_id" : error.message?.includes("card_payment_url") ? "invalid_card_link" : error.message };
  revalidatePath("/dashboard/settings");
  return { success: true };
}

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export async function updateWorkingHours(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  // Doctor-only: a secretary may view but never edit these.
  if ((await isProfessionalRole(supabase, user.id)) !== true) return { error: "Only the doctor can change these settings" };

  const workingHours: Record<string, { enabled: boolean; start: string; end: string; location_id?: string | null }> = {};
  for (const day of DAY_KEYS) {
    workingHours[day] = {
      enabled: formData.get(`${day}_enabled`) === "on",
      start: (formData.get(`${day}_start`) as string) || "08:00",
      end: (formData.get(`${day}_end`) as string) || "18:00",
    };
    // 1.8.0 F: a day's location only when the form shows the picker; without
    // the field the key stays out and the database keeps the day's (200).
    // An id that isn't one of the doctor's counts as the primary there.
    const loc = formData.get(`${day}_location`);
    if (typeof loc === "string") workingHours[day].location_id = /^[0-9a-f-]{36}$/i.test(loc) ? loc : null;
  }

  const { error } = await supabase.from("professionals").update({ working_hours: workingHours }).eq("id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true };
}

export async function createProcedure(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  // Doctor-only: a secretary may view but never edit these.
  if ((await isProfessionalRole(supabase, user.id)) !== true) return { error: "Only the doctor can change these settings" };

  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Name is required" };

  // The same rule as the form (lib/money parseMoney): parseFloat("150,50")
  // is 150, and a bad value must be refused, never saved as another one.
  const priceText = ((formData.get("price") as string) ?? "").trim();
  const price = priceText ? parseMoney(priceText) : null;
  if (priceText && price === null) return { error: "invalid_price" };

  const { error } = await supabase.from("procedures").insert({
    professional_id: user.id,
    name,
    duration_minutes: parseInt(formData.get("duration_minutes") as string) || 30,
    price: price || null,
    payment_type: (formData.get("payment_type") as string) || "private",
    active: true,
  });

  if (error) return { error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true };
}

export async function toggleProcedure(id: string, active: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  // Doctor-only: a secretary may view but never edit these.
  if ((await isProfessionalRole(supabase, user.id)) !== true) return { error: "Only the doctor can change these settings" };

  const { error } = await supabase.from("procedures").update({ active }).eq("id", id).eq("professional_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true };
}

export async function updateSchedulingRules(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  // Doctor-only: a secretary may view but never edit these.
  if ((await isProfessionalRole(supabase, user.id)) !== true) return { error: "Only the doctor can change these settings" };

  const raw = (formData.get("max_concurrent_bookings") as string)?.trim();
  const parsed = parseInt(raw);
  const value = !raw || isNaN(parsed) || parsed <= 0 ? null : parsed;

  const { error } = await supabase
    .from("professionals")
    .update({ max_concurrent_bookings: value })
    .eq("id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true };
}

export async function deleteProcedure(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  // Doctor-only: a secretary may view but never edit these.
  if ((await isProfessionalRole(supabase, user.id)) !== true) return { error: "Only the doctor can change these settings" };

  const { error } = await supabase.from("procedures").delete().eq("id", id).eq("professional_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true };
}

export async function generatePublicInviteCode() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data, error } = await supabase.rpc("generate_public_invite_code");
  if (error) return { error: error.message };

  revalidatePath("/dashboard/settings");
  return { code: data as string };
}

export async function unblockPatient(patientId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  // Patient management: a secretary acts on their doctor's patients.
  const effectiveProfId = await getEffectiveProfId(supabase, user.id);
  if (!effectiveProfId) return { error: "Could not verify account" };

  const { error } = await supabase
    .from("patients")
    .update({ booking_blocked: false })
    .eq("id", patientId)
    .eq("professional_id", effectiveProfId);

  if (error) return { error: error.message };
  revalidatePath("/dashboard/settings");
  revalidatePath(`/dashboard/patients/${patientId}`);
  return { success: true };
}
