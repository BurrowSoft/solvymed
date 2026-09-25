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
    // subscription_status and current_period_end are deliberately NOT
    // written here — they're owned exclusively by the
    // customer.subscription.updated/deleted handler below (which Stripe
    // sends right after checkout completes for a new subscription, now
    // reliably matchable by user_id thanks to subscription_data.metadata
    // on the checkout route). Splitting subscription state across two
    // handlers is what caused the earlier replay bugs: a replayed
    // checkout.session.completed after cancellation could reactivate
    // status="active" with no way to know the subscription was since
    // cancelled. This handler only records bookkeeping fields that are
    // safe to set unconditionally on every delivery.
    await db.from("professionals").update({
      subscription_provider: "stripe",
      subscription_id: subId,
    }).eq("id", userId);
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    // Stripe sends "created" (not "updated") for a brand new subscription —
    // without handling it here too, checkout.session.completed no longer
    // writing subscription_status itself (see above) meant a new
    // subscriber's status/period_end would never get set at all.
    const sub = event.data.object as Stripe.Subscription;
    const userId = sub.metadata?.user_id;
    if (!userId) return NextResponse.json({ ok: true });

    const isActive = sub.status === "active" || sub.status === "trialing";
    const periodEndTs = sub.items?.data?.[0]?.current_period_end;

    const update: Record<string, unknown> = { subscription_id: sub.id };
    if (isActive) {
      // Never mark active without a real period end in the same write —
      // isAccessAllowed() reads "active" + null current_period_end as
      // unlimited access, so if Stripe's payload is ever missing it (an
      // empty items array on an active subscription would be abnormal,
      // but not writing anything is safer than guessing), skip the whole
      // update rather than risk it.
      if (!periodEndTs) return NextResponse.json({ ok: true });
      update.subscription_status = "active";
      update.current_period_end = new Date(periodEndTs * 1000).toISOString();
    } else {
      update.subscription_status = "expired";
    }
    // Matched by user_id (from subscription metadata), not subscription_id —
    // Stripe doesn't guarantee delivery order, and matching by
    // subscription_id would silently no-op if this event arrives before
    // checkout.session.completed has stored it.
    await db.from("professionals").update(update).eq("id", userId);
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
