import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { isAccessAllowed, type EffectiveSub } from "@/lib/subscription";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-05-27.dahlia" });

const PRICE_USD_CENTS = 1900; // $19.00

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // This route only checked authentication, not role — a patient or
  // secretary could initiate a real Stripe charge under their own identity
  // for a feature meant only for professionals (get_effective_subscription
  // resolves a secretary's DELEGATED professional's subscription, but the
  // checkout below would still bill and tag the secretary's own user_id,
  // so the webhook could never activate the actual owning account).
  const { data: roleRow, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (roleError) {
    return NextResponse.json({ error: "Could not verify account role", code: "check_failed" }, { status: 503 });
  }
  if (roleRow?.role !== "professional") {
    // Exact match, not "has a role and it isn't professional" — the
    // previous check let a role-less authenticated account straight
    // through (roleRow?.role is falsy, so the whole condition was false).
    // A role-less caller could still complete a real Stripe charge, but
    // there's no guarantee a professionals row exists for the webhook to
    // activate against.
    return NextResponse.json({ error: "Only professionals can subscribe", code: "wrong_role" }, { status: 403 });
  }

  // /subscribe redirects an already-active user away from this button, but
  // that's a page-level convenience, not a boundary — this route is
  // directly callable (bookmark, back button, double-click racing the
  // redirect) and previously created a brand new Stripe subscription
  // regardless of an existing one, leaving the professional billed twice
  // with only the most recently webhook-processed subscription tracked.
  const { data: subRows, error: subError } = await supabase.rpc("get_effective_subscription", { p_user_id: user.id });
  if (subError) {
    // Fail closed — a lookup error must never be treated the same as "no
    // subscription found", or a transient failure lets an already-paying
    // professional create a second one.
    return NextResponse.json({ error: "Could not verify subscription status", code: "check_failed" }, { status: 503 });
  }
  const sub = (subRows?.[0] ?? null) as EffectiveSub | null;
  if (sub?.subscription_status === "active" && isAccessAllowed(sub)) {
    return NextResponse.json({ error: "Already subscribed", code: "already_subscribed" }, { status: 409 });
  }

  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  const locale = (await request.json().catch(() => ({}))).locale ?? "en";

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: PRICE_USD_CENTS,
              recurring: { interval: "month" },
              product_data: { name: "SolvyMed Pro" },
            },
            quantity: 1,
          },
        ],
        // Session metadata is NOT copied to the resulting Subscription object
        // by Stripe — subscription_data.metadata is the only way the
        // webhook's customer.subscription.* handlers (which receive the
        // Subscription, not the Session) can resolve which professional this
        // belongs to. Without this, current_period_end could never be set,
        // and an active subscription with a null period end reads as
        // unlimited access.
        subscription_data: { metadata: { user_id: user.id } },
        metadata: { user_id: user.id },
        success_url: `${origin}/${locale === "en" ? "" : locale + "/"}subscribe?success=1`,
        cancel_url: `${origin}/${locale === "en" ? "" : locale + "/"}subscribe?cancelled=1`,
        client_reference_id: user.id,
      },
      {
        // Collapses concurrent duplicate requests (double-click racing the
        // redirect, a retried request) into the same Checkout Session
        // instead of creating two. Scoped to a short window since a
        // legitimate resubscribe after cancellation should get a fresh
        // session, not be blocked by an old key.
        idempotencyKey: `checkout-stripe-${user.id}-${Math.floor(Date.now() / (10 * 60 * 1000))}`,
      },
    );

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error", err);
    return NextResponse.json({ error: "Checkout failed", code: "checkout_failed" }, { status: 500 });
  }
}
