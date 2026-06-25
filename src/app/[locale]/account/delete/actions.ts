"use server";

import { createClient } from "@/lib/supabase/server";

export async function requestAccountDeletion(formData: FormData) {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const reason = (formData.get("reason") as string)?.trim() || null;

  if (!email) return { error: "Email is required." };

  const supabase = await createClient();

  const { error } = await supabase.from("deletion_requests").insert({
    email,
    reason,
    requested_at: new Date().toISOString(),
    status: "pending",
  });

  if (error) return { error: "Something went wrong. Please try again or email support@burrowsoft.com" };

  return { success: true };
}
