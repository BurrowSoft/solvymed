// Which unpaid appointments count as "to receive" (Pendente): the same rule
// as the app (help G2, one shared test table). Requests not yet accepted
// (tentative, proposal), cancelled, rejected, no-shows (absent) and blocked
// time never count.
export const RECEIVABLE_STATUSES = ["scheduled", "confirmed", "completed", "late"] as const;

export function isReceivable(status: string, paymentStatus: string): boolean {
  return paymentStatus === "pending" && (RECEIVABLE_STATUSES as readonly string[]).includes(status);
}
