// Which unpaid appointments count as "to receive" (Pendente): the same rule
// as the app (help G2, one shared test table). Requests not yet accepted
// (tentative, proposal), cancelled, rejected, no-shows (absent) and blocked
// time never count.
export const RECEIVABLE_STATUSES = ["scheduled", "confirmed", "completed", "late"] as const;

export function isReceivable(status: string, paymentStatus: string): boolean {
  return paymentStatus === "pending" && (RECEIVABLE_STATUSES as readonly string[]).includes(status);
}

// An amount counts only above zero (the app's #216, UX 1 Oct): an
// appointment without one shows "Sem valor · Definir valor", stays out of
// the to-receive and received lists and totals, and is never marked paid
// until it has one.
export function hasAmount(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}
