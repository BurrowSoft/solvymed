// Close-account (migration 100): the pure decisions behind
// /api/account/close, kept here so they're unit-tested.

type ProfessionalBilling = {
  subscription_status: string | null;
  subscription_provider: string | null;
  subscription_id: string | null;
};

type LiveSubscription = {
  id: string;
  status: string;
  metadata?: Record<string, string> | null;
};

export type StripeCloseStep =
  // Nothing billed through Stripe (trial, lifetime, never subscribed, or a
  // stored id Stripe doesn't know): close without touching Stripe.
  | { kind: "none" }
  // A live or recoverable subscription: cancel it now, before closing.
  | { kind: "cancel"; subId: string }
  // Already over in Stripe; the row may still say active until the webhook.
  | { kind: "ended"; subId: string }
  // The stored subscription belongs to someone else: never cancel it.
  | { kind: "not_owner" };

const ENDED = new Set(["canceled", "incomplete_expired"]);

export function stripeCloseStep(
  userId: string,
  prof: ProfessionalBilling | null,
  live: LiveSubscription | null,
): StripeCloseStep {
  if (!prof || prof.subscription_status === "lifetime") return { kind: "none" };
  if (prof.subscription_provider !== "stripe" || !prof.subscription_id) return { kind: "none" };
  if (!live) return { kind: "none" };
  if (live.metadata?.user_id !== userId) return { kind: "not_owner" };
  if (ENDED.has(live.status)) return { kind: "ended", subId: live.id };
  return { kind: "cancel", subId: live.id };
}

// The code for a failed close_my_account(). Once the subscription has been
// cancelled (in this request or an earlier attempt), the professional must
// be told so: their access has ended although the account is still open.
// A retry finds the subscription "ended", skips Stripe and closes.
export function closeFailureCode(
  step: StripeCloseStep,
  dbError: string | null,
): "subscription_active" | "cancelled_not_closed" | "generic" {
  if (dbError === "subscription_active") return "subscription_active";
  if (step.kind === "cancel" || step.kind === "ended") return "cancelled_not_closed";
  return "generic";
}

// One row of close_my_account()'s result.
export type ClosureRow = {
  outcome: "deleted" | "closed";
  kind: "linked_patient" | "cancelled_appointment" | "none";
  patient_auth_id: string | null;
  appointment_id: string | null;
  date: string | null;
  start_time: string | null;
};

export type ClosureNotices = {
  // Patient app accounts that get the "clinic closed" notice.
  linkedPatients: string[];
  // Cancelled appointments whose patient gets the normal cancellation
  // notice: only patients with an app account who aren't already getting
  // the "clinic closed" notice (one notice per person).
  cancelledAppointments: { patientAuthId: string; appointmentId: string; date: string; startTime: string }[];
};

export function planClosureNotices(rows: ClosureRow[]): ClosureNotices {
  const linked = new Set<string>();
  for (const r of rows) {
    if (r.kind === "linked_patient" && r.patient_auth_id) linked.add(r.patient_auth_id);
  }
  const cancelledAppointments: ClosureNotices["cancelledAppointments"] = [];
  for (const r of rows) {
    if (r.kind !== "cancelled_appointment" || !r.patient_auth_id || linked.has(r.patient_auth_id)) continue;
    if (!r.appointment_id || !r.date || !r.start_time) continue;
    cancelledAppointments.push({
      patientAuthId: r.patient_auth_id,
      appointmentId: r.appointment_id,
      date: r.date,
      startTime: r.start_time,
    });
  }
  return { linkedPatients: [...linked], cancelledAppointments };
}
