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
    const userId = session.metadata?.user_id ?? session.client_reference_id;
    const subId = session.subscription as string | null;
    if (!userId) return NextResponse.json({ ok: true });
    // Deliberately doesn't touch current_period_end — Stripe webhooks are
    // at-least-once delivery, and a replay of this event after
    // customer.subscription.updated already set the real period end would
    // null it back out. A null current_period_end with status "active"
    // reads as unlimited access in isAccessAllowed(), so this isn't just
    // stale data, it's an open-ended free-access hole on every replay.
    // subscription.updated (which Stripe sends right after checkout
    // completes for a new subscription) owns this field exclusively.
    await db.from("professionals").update({
      subscription_status: "active",
      subscription_provider: "stripe",
      subscription_id: subId,
    }).eq("id", userId);
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const userId = sub.metadata?.user_id;
    if (!userId) return NextResponse.json({ ok: true });

    const isActive = sub.status === "active" || sub.status === "trialing";
    const periodEndTs = sub.items?.data?.[0]?.current_period_end;
    const update: Record<string, unknown> = { subscription_status: isActive ? "active" : "expired" };
    // Only write current_period_end when Stripe actually gave us one. isAccessAllowed()
    // ignores this field for any non-"active" status, so there's nothing to clear on
    // cancellation/expiry — and forcing it to null while still active (e.g. an
    // unexpected empty items array) would reopen the exact unlimited-access gap the
    // checkout.session.completed handler above was fixed to avoid.
    if (periodEndTs) update.current_period_end = new Date(periodEndTs * 1000).toISOString();
    await db.from("professionals").update(update).eq("subscription_id", sub.id);
  }

  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const subRef = invoice.parent?.subscription_details?.subscription;
    const subId = typeof subRef === "string" ? subRef : subRef?.id ?? null;
    if (subId) {
      await db.from("professionals").update({
        subscription_status: "expired",
      }).eq("subscription_id", subId);
    }
  }

  return NextResponse.json({ ok: true });
}
