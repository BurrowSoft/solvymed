"use server";

import { createClient } from "@/lib/supabase/server";

// Errors are codes; the page translates them.
export async function submitFeedback(formData: FormData) {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const name = (formData.get("name") as string)?.trim() || null;
  const message = (formData.get("message") as string)?.trim();
  const rating = (formData.get("rating") as string) || null;

  if (!email) return { error: "email_required" as const };
  if (!message) return { error: "message_required" as const };

  const supabase = await createClient();

  const { error } = await supabase.from("feedback").insert({
    email,
    name,
    message,
    rating: rating ? parseInt(rating) : null,
    submitted_at: new Date().toISOString(),
  });

  if (error) return { error: "failed" as const };

  return { success: true };
}
