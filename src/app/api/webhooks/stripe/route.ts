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

// Writes the subscription's CURRENT state as Stripe reports it now, never
// the event payload. Stripe doesn't guarantee delivery order, so a late or
// retried event (e.g. "created" arriving after a cancellation) carries a
// stale snapshot. Trusting it re-granted access until the old period end.
// Fetching live state makes event order irrelevant.
async function syncSubscription(db: ReturnType<typeof adminClient>, subId: string) {
  let sub: Stripe.Subscription;
  try {
    sub = await stripe.subscriptions.retrieve(subId);
  } catch (err) {
    // Non-2xx so Stripe retries. Never fall back to the event payload.
    console.error(`Stripe webhook: could not retrieve subscription ${subId}`, err);
    return NextResponse.json({ error: "Could not fetch subscription" }, { status: 500 });
  }

  const userId = sub.metadata?.user_id;
  if (!userId) return NextResponse.json({ ok: true });

  // Only active/trialing grant access. incomplete (checkout not paid),
  // incomplete_expired, canceled and unpaid never do. past_due is cut
  // immediately too: by the time a renewal fails, Stripe has already moved
  // current_period_end to the NEW period's end, so "keep access until
  // period end" would hand out a free month if the retries never succeed.
  // A successful retry flips it back to active, and access returns.
  const isActive = sub.status === "active" || sub.status === "trialing";

  if (isActive) {
    const periodEndTs = sub.items?.data?.[0]?.current_period_end;
    // Never mark active without a real period end in the same write —
    // isAccessAllowed() reads "active" + null current_period_end as
    // unlimited access.
    if (!periodEndTs) return NextResponse.json({ ok: true });
    // Matched by user_id (from subscription metadata), not subscription_id:
    // a resubscribe's event can arrive before checkout.session.completed
    // has stored the new id. A genuinely active subscription owns the row.
    const { error } = await db.from("professionals").update({
      subscription_provider: "stripe",
      subscription_id: sub.id,
      subscription_status: "active",
      current_period_end: new Date(periodEndTs * 1000).toISOString(),
    }).eq("id", userId);
    if (error) return NextResponse.json({ error: "DB update failed" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // A dead subscription may only expire the row if it's the one stored (or
  // nothing is stored yet). Otherwise a late event for an old, cancelled
  // subscription would expire the newer one the professional resubscribed
  // with. Enforced in the UPDATE's own WHERE, not a separate read.
  const { error } = await db.from("professionals").update({
    subscription_provider: "stripe",
    subscription_id: sub.id,
    subscription_status: "expired",
  })
    .eq("id", userId)
    .or(`subscription_id.is.null,subscription_id.eq.${sub.id}`);
  if (error) return NextResponse.json({ error: "DB update failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
