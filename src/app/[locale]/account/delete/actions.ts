"use server";

import { createClient } from "@/lib/supabase/server";

// Records a public account-deletion request (RLS: clients can only insert
// a pending row). Returns stable codes; the page shows translated copy.
export async function requestAccountDeletion(formData: FormData) {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const reason = (formData.get("reason") as string)?.trim() || null;

  if (!email) return { error: "email_required" as const };

  const supabase = await createClient();

  const { error } = await supabase.from("deletion_requests").insert({
    email,
    reason,
    requested_at: new Date().toISOString(),
    status: "pending",
  });

  if (error) return { error: "generic" as const };

  return { success: true };
}
