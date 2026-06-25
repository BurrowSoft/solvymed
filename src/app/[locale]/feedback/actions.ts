"use server";

import { createClient } from "@/lib/supabase/server";

export async function submitFeedback(formData: FormData) {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const name = (formData.get("name") as string)?.trim() || null;
  const message = (formData.get("message") as string)?.trim();
  const rating = (formData.get("rating") as string) || null;

  if (!email) return { error: "Email is required." };
  if (!message) return { error: "Message is required." };

  const supabase = await createClient();

  const { error } = await supabase.from("feedback").insert({
    email,
    name,
    message,
    rating: rating ? parseInt(rating) : null,
    submitted_at: new Date().toISOString(),
  });

  if (error) return { error: "Something went wrong. Please try again." };

  return { success: true };
}
