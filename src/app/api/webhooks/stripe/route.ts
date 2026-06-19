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
    await db.from("professionals").update({
      subscription_status: "active",
      subscription_provider: "stripe",
      subscription_id: subId,
      current_period_end: null, // will be set by subscription.updated
    }).eq("id", userId);
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const userId = sub.metadata?.user_id;
    if (!userId) return NextResponse.json({ ok: true });

    const isActive = sub.status === "active" || sub.status === "trialing";
    const periodEndTs = sub.items?.data?.[0]?.current_period_end;
    await db.from("professionals").update({
      subscription_status: isActive ? "active" : "expired",
      current_period_end: periodEndTs ? new Date(periodEndTs * 1000).toISOString() : null,
    }).eq("subscription_id", sub.id);
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
