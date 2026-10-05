// The daily Stripe ↔ database check (cf, "before the ads"): read-only on
// both sides. The webhook keeps professionals.subscription_* in step with
// Stripe; this catches what it missed (a lost event, a manual change) before
// a paying doctor is locked out or an unpaid one keeps access. Pure: the
// route lists Stripe and the rows, this compares them.

export type StripeSubLite = { id: string; status: string; userId: string | null; created: number };
export type ProRow = { id: string; subscription_status: string | null; subscription_id: string | null; subscription_provider: string | null };

export type Mismatch =
  // Stripe charges (active/trialing) but the account has no access, or is
  // linked to another subscription.
  | { kind: "paying_without_access"; userId: string; subscriptionId: string; stripeStatus: string; dbStatus: string | null; dbSubscriptionId: string | null }
  // The account has access through Stripe, but Stripe isn't charging.
  | { kind: "access_without_payment"; userId: string; subscriptionId: string; stripeStatus: string | null }
  // A live Stripe subscription whose user isn't a professional here.
  | { kind: "no_account"; userId: string; subscriptionId: string; stripeStatus: string }
  // A live Stripe subscription with no user_id in its metadata.
  | { kind: "no_user"; subscriptionId: string; stripeStatus: string }
  // Lifetime access, yet Stripe still charges (the webhook never touches lifetime).
  | { kind: "lifetime_still_billed"; userId: string; subscriptionId: string; stripeStatus: string };

const live = (status: string) => status === "active" || status === "trialing";

// A subscription created within the last hour may still be on its way
// through the webhook: not a mismatch yet (the next day's run sees it).
const GRACE_S = 60 * 60;

export function reconcile(subs: StripeSubLite[], rows: ProRow[], nowMs = Date.now()): Mismatch[] {
  const out: Mismatch[] = [];
  const byUser = new Map(rows.map((r) => [r.id, r]));
  const byId = new Map(subs.map((s) => [s.id, s]));
  for (const s of subs) {
    if (!live(s.status) || s.created > nowMs / 1000 - GRACE_S) continue;
    if (!s.userId) { out.push({ kind: "no_user", subscriptionId: s.id, stripeStatus: s.status }); continue; }
    const row = byUser.get(s.userId);
    if (!row) { out.push({ kind: "no_account", userId: s.userId, subscriptionId: s.id, stripeStatus: s.status }); continue; }
    if (row.subscription_status === "lifetime") {
      out.push({ kind: "lifetime_still_billed", userId: s.userId, subscriptionId: s.id, stripeStatus: s.status });
      continue;
    }
    if (row.subscription_status !== "active" || row.subscription_id !== s.id) {
      out.push({ kind: "paying_without_access", userId: s.userId, subscriptionId: s.id, stripeStatus: s.status, dbStatus: row.subscription_status, dbSubscriptionId: row.subscription_id });
    }
  }
  for (const r of rows) {
    if (r.subscription_status !== "active" || r.subscription_provider !== "stripe") continue;
    const s = r.subscription_id ? byId.get(r.subscription_id) : undefined;
    if (!s || !live(s.status)) {
      out.push({ kind: "access_without_payment", userId: r.id, subscriptionId: r.subscription_id ?? "—", stripeStatus: s?.status ?? null });
    }
  }
  return out;
}

// The support email's body: ids and statuses only (no names, emails or card data).
export function reconcileReport(mismatches: Mismatch[], counts: { stripe: number; rows: number }, mode: string): string {
  const lines = [
    `Stripe ↔ SolvyMed check (${mode}): ${mismatches.length} mismatch(es). Stripe subscriptions read: ${counts.stripe}; professional rows read: ${counts.rows}.`,
    "",
  ];
  for (const m of mismatches) {
    switch (m.kind) {
      case "paying_without_access":
        lines.push(`- PAYING WITHOUT ACCESS: user ${m.userId}, Stripe ${m.subscriptionId} (${m.stripeStatus}); DB status ${m.dbStatus ?? "—"}, DB subscription ${m.dbSubscriptionId ?? "—"}`);
        break;
      case "access_without_payment":
        lines.push(`- ACCESS WITHOUT PAYMENT: user ${m.userId}, DB subscription ${m.subscriptionId}; Stripe status ${m.stripeStatus ?? "not found"}`);
        break;
      case "no_account":
        lines.push(`- NO ACCOUNT: Stripe ${m.subscriptionId} (${m.stripeStatus}) names user ${m.userId}, who has no professional row`);
        break;
      case "no_user":
        lines.push(`- NO USER: Stripe ${m.subscriptionId} (${m.stripeStatus}) has no user_id in its metadata`);
        break;
      case "lifetime_still_billed":
        lines.push(`- LIFETIME STILL BILLED: user ${m.userId} has lifetime access; Stripe ${m.subscriptionId} is ${m.stripeStatus}`);
        break;
    }
  }
  return lines.join("\n");
}
