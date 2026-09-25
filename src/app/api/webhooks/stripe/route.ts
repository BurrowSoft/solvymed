import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient as createServerClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-05-27.dahlia" });

function adminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const db = adminClient();

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const subRef = session.subscription;
    const subId = typeof subRef === "string" ? subRef : subRef?.id ?? null;
    // Card checkouts complete as "paid", but an async method completes the
    // session as "unpaid" before any money moves. Record nothing until
    // it's actually paid.
    if (session.payment_status !== "paid" || !subId) return NextResponse.json({ ok: true });
    // Same live-state sync as the subscription events, never a direct write
    // from this payload: a late or replayed checkout for an old subscription
    // must not put that old id back on the row (a later event for it would
    // then pass the dead-subscription guard and expire the live one).
    return syncSubscription(db, subId);
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    return syncSubscription(db, sub.id);
  }

  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const subRef = invoice.parent?.subscription_details?.subscription;
    const subId = typeof subRef === "string" ? subRef : subRef?.id ?? null;
    if (subId) return syncSubscription(db, subId);
  }

  return NextResponse.json({ ok: true });
}

type DesiredState =
  | { kind: "skip" }
  | { kind: "active"; userId: string; subId: string; periodEnd: string }
  | { kind: "expired"; userId: string; subId: string; neverActive: boolean };

// Only active/trialing grant access. incomplete (checkout not paid),
// incomplete_expired, canceled and unpaid never do. past_due is cut
// immediately too: by the time a renewal fails, Stripe has already moved
// current_period_end to the NEW period's end, so "keep access until period
// end" would hand out a free month if the retries never succeed. A
// successful retry flips it back to active, and access returns.
function desiredState(sub: Stripe.Subscription): DesiredState {
  const userId = sub.metadata?.user_id;
  if (!userId) return { kind: "skip" };
  if (sub.status === "active" || sub.status === "trialing") {
    const periodEndTs = sub.items?.data?.[0]?.current_period_end;
    // Never mark active without a real period end — isAccessAllowed() reads
    // "active" + null current_period_end as unlimited access.
    if (!periodEndTs) return { kind: "skip" };
    return { kind: "active", userId, subId: sub.id, periodEnd: new Date(periodEndTs * 1000).toISOString() };
  }
  // incomplete / incomplete_expired: the first payment never succeeded, so
  // this subscription was never active.
  const neverActive = sub.status === "incomplete" || sub.status === "incomplete_expired";
  return { kind: "expired", userId, subId: sub.id, neverActive };
}

function sameState(a: DesiredState, b: DesiredState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Writes the subscription's CURRENT state as Stripe reports it, never the
// event payload: Stripe doesn't guarantee delivery order, and a late event
// (e.g. "created" arriving after a cancellation) carries a stale snapshot
// that re-granted access until the old period end.
//
// Reading live state alone isn't enough under concurrency: two deliveries
// can each read, then write in the opposite order, leaving the older
// read's state on the row (either re-granting access after a cancellation,
// or locking out a successful payment retry). So after writing, re-read,
// and write again if Stripe moved on, until a read matches what was
// written. The last write to the row is then always followed by its
// handler reading that same state from Stripe, so once events stop
// arriving, the row matches Stripe. No lock or version column needed.
async function syncSubscription(db: ReturnType<typeof adminClient>, subId: string) {
  let written: DesiredState | null = null;
  for (let round = 0; round < 3; round++) {
    let sub: Stripe.Subscription;
    try {
      sub = await stripe.subscriptions.retrieve(subId);
    } catch (err) {
      // Non-2xx so Stripe retries. Never fall back to the event payload.
      console.error(`Stripe webhook: could not retrieve subscription ${subId}`, err);
      return NextResponse.json({ error: "Could not fetch subscription" }, { status: 500 });
    }

    const desired = desiredState(sub);
    if (desired.kind === "skip") return NextResponse.json({ ok: true });
    if (written && sameState(written, desired)) return NextResponse.json({ ok: true });

    if (desired.kind === "active") {
      // Matched by user_id (from subscription metadata), not subscription_id:
      // a resubscribe's event can arrive before its id is stored. A genuinely
      // active subscription owns the row.
      const { data, error } = await db.from("professionals").update({
        subscription_provider: "stripe",
        subscription_id: desired.subId,
        subscription_status: "active",
        current_period_end: desired.periodEnd,
      }).eq("id", desired.userId).select("id");
      if (error) return NextResponse.json({ error: "DB update failed" }, { status: 500 });
      if (!data?.length) {
        // No professionals row for this user. Retrying can't create one, so
        // don't make Stripe retry for days. Log it loudly instead.
        console.error(`Stripe webhook: active subscription ${desired.subId} but no professionals row for ${desired.userId}`);
        return NextResponse.json({ ok: true });
      }
    } else {
      // A dead subscription may only expire the row if it's the one stored
      // (or nothing is stored yet). Otherwise a late event for an old,
      // cancelled subscription would expire the newer one the professional
      // resubscribed with. Enforced in the UPDATE's own WHERE.
      // First record which Stripe subscription the row tracks, even when its
      // status must not change (trial rule below): the checkout guard reads
      // this id to refuse a second checkout while a pending one exists.
      const { data: owned, error: idError } = await db.from("professionals").update({
        subscription_provider: "stripe",
        subscription_id: desired.subId,
      })
        .eq("id", desired.userId)
        .or(`subscription_id.is.null,subscription_id.eq.${desired.subId}`)
        .select("id");
      if (idError) return NextResponse.json({ error: "DB update failed" }, { status: 500 });
      // 0 rows: the row belongs to a different (newer) subscription, or
      // doesn't exist. Either way this subscription has nothing to change.
      if (!owned?.length) return NextResponse.json({ ok: true });

      // Then the status, pinned to this subscription id so a concurrent
      // resubscribe that changed the row in between isn't expired. A
      // subscription that was never active must not end a running trial:
      // the professional keeps the trial until its original trial_ends_at
      // (no extra days, so nothing to abuse). Only a subscription that was
      // once active expires the row when it dies.
      let expire = db.from("professionals").update({ subscription_status: "expired" })
        .eq("id", desired.userId)
        .eq("subscription_id", desired.subId);
      if (desired.neverActive) expire = expire.neq("subscription_status", "trial");
      const { error: statusError } = await expire;
      if (statusError) return NextResponse.json({ error: "DB update failed" }, { status: 500 });
    }
    written = desired;
  }
  // Stripe kept changing across every round. Let Stripe retry later.
  return NextResponse.json({ error: "Subscription state still changing" }, { status: 500 });
}
