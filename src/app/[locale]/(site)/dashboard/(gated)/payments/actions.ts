"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveProfId } from "@/lib/activeAccess";
import { hasAmount } from "@/lib/paymentRules";

function isValidAmount(amount: number): boolean {
  return Number.isFinite(amount) && amount >= 0 && amount <= 1_000_000;
}

export async function markPaid(id: string, amount?: number) {
  // Returns a stable code, not raw error text — the caller renders this
  // through next-intl, and error.message can be an arbitrary Supabase/DB
  // string that was never meant to be shown to the user directly, let
  // alone in their locale.
  if (amount !== undefined && !isValidAmount(amount)) return { error: "Invalid amount", code: "invalid_amount" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", code: "generic" };
  const effectiveProfId = await getActiveProfId(supabase, user.id);
  if (!effectiveProfId) return { error: "Could not verify account", code: "generic" };

  // Never paid without an amount (the app's #216, UX): the amount given,
  // else the one already stored, must be above zero.
  if (amount !== undefined && !hasAmount(amount)) return { error: "No amount", code: "no_amount" };
  if (amount === undefined) {
    const { data: row } = await supabase.from("appointments").select("payment_amount").eq("id", id).eq("professional_id", effectiveProfId).maybeSingle();
    if (!hasAmount((row as { payment_amount?: number | null } | null)?.payment_amount)) return { error: "No amount", code: "no_amount" };
  }

  const update: Record<string, unknown> = { payment_status: "paid" };
  if (amount !== undefined) update.payment_amount = amount;

  const { error } = await supabase
    .from("appointments")
    .update(update)
    .eq("id", id)
    .eq("professional_id", effectiveProfId);

  if (error) return { error: error.message, code: "generic" };
  revalidatePath("/dashboard/payments");
  return { success: true };
}

export async function markUnpaid(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", code: "generic" };
  const effectiveProfId = await getActiveProfId(supabase, user.id);
  if (!effectiveProfId) return { error: "Could not verify account", code: "generic" };

  const { error } = await supabase
    .from("appointments")
    .update({ payment_status: "pending" })
    .eq("id", id)
    .eq("professional_id", effectiveProfId);

  if (error) return { error: error.message, code: "generic" };
  revalidatePath("/dashboard/payments");
  return { success: true };
}

// "Definir valor" (the app's #216): an amount above zero; the appointment
// then counts as to-receive (or stays paid).
export async function setPaymentAmount(id: string, amount: number) {
  if (!isValidAmount(amount)) return { error: "Invalid amount", code: "invalid_amount" };
  if (!hasAmount(amount)) return { error: "No amount", code: "no_amount" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", code: "generic" };
  const effectiveProfId = await getActiveProfId(supabase, user.id);
  if (!effectiveProfId) return { error: "Could not verify account", code: "generic" };

  const { error } = await supabase
    .from("appointments")
    .update({ payment_amount: amount })
    .eq("id", id)
    .eq("professional_id", effectiveProfId);

  if (error) return { error: error.message, code: "generic" };
  revalidatePath("/dashboard/payments");
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard");
  return { success: true };
}
