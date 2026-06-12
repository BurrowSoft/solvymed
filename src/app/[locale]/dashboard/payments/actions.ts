"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function markPaid(id: string, amount?: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const update: Record<string, unknown> = { payment_status: "paid" };
  if (amount !== undefined) update.payment_amount = amount;

  const { error } = await supabase
    .from("appointments")
    .update(update)
    .eq("id", id)
    .eq("professional_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/dashboard/payments");
  return { success: true };
}

export async function markUnpaid(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("appointments")
    .update({ payment_status: "pending" })
    .eq("id", id)
    .eq("professional_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/dashboard/payments");
  return { success: true };
}

export async function setPaymentAmount(id: string, amount: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("appointments")
    .update({ payment_amount: amount })
    .eq("id", id)
    .eq("professional_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/dashboard/payments");
  return { success: true };
}
