// The public account-deletion request (/account/delete). Inserted from the
// browser, not a server action: migration 100 rate-limits by the caller's
// IP, and from a server action every request would come from the server's
// IP and share one limit. Its errors become stable codes the page
// translates, never raw database messages.

export type DeletionRequestError = "email_required" | "invalid_email" | "too_many_attempts" | "generic";

export function deletionRequestError(message: string | null | undefined): DeletionRequestError {
  if (message?.includes("too_many_attempts")) return "too_many_attempts";
  if (message?.includes("invalid_email")) return "invalid_email";
  return "generic";
}

export function deletionRequestRow(emailInput: string, reasonInput: string) {
  return {
    email: emailInput.trim().toLowerCase(),
    reason: reasonInput.trim() || null,
    requested_at: new Date().toISOString(),
    status: "pending",
  };
}
