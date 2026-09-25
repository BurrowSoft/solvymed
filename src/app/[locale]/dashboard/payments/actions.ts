"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

  const update: Record<string, unknown> = { payment_status: "paid" };
  if (amount !== undefined) update.payment_amount = amount;

  const { error } = await supabase
    .from("appointments")
    .update(update)
    .eq("id", id)
    .eq("professional_id", user.id);

  if (error) return { error: error.message, code: "generic" };
  revalidatePath("/dashboard/payments");
  return { success: true };
}

export async function markUnpaid(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", code: "generic" };

  const { error } = await supabase
    .from("appointments")
    .update({ payment_status: "pending" })
    .eq("id", id)
    .eq("professional_id", user.id);

  if (error) return { error: error.message, code: "generic" };
  revalidatePath("/dashboard/payments");
  return { success: true };
}

export async function setPaymentAmount(id: string, amount: number) {
  if (!isValidAmount(amount)) return { error: "Invalid amount", code: "invalid_amount" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", code: "generic" };

  const { error } = await supabase
    .from("appointments")
    .update({ payment_amount: amount })
    .eq("id", id)
    .eq("professional_id", user.id);

  if (error) return { error: error.message, code: "generic" };
  revalidatePath("/dashboard/payments");
  return { success: true };
}
