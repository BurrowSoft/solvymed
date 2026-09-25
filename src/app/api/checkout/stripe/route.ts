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

  // /subscribe redirects an already-active user away from this button, but
  // that's a page-level convenience, not a boundary — this route is
  // directly callable (bookmark, back button, double-click racing the
  // redirect) and previously created a brand new Stripe subscription
  // regardless of an existing one, leaving the professional billed twice
  // with only the most recently webhook-processed subscription tracked.
  const { data: subRows } = await supabase.rpc("get_effective_subscription", { p_user_id: user.id });
  const sub = (subRows?.[0] ?? null) as EffectiveSub | null;
  if (sub?.subscription_status === "active" && isAccessAllowed(sub)) {
    return NextResponse.json({ error: "Already subscribed" }, { status: 409 });
  }

  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  const locale = (await request.json().catch(() => ({}))).locale ?? "en";

  try {
    const session = await stripe.checkout.sessions.create({
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
      metadata: { user_id: user.id },
      success_url: `${origin}/${locale === "en" ? "" : locale + "/"}subscribe?success=1`,
      cancel_url: `${origin}/${locale === "en" ? "" : locale + "/"}subscribe?cancelled=1`,
      client_reference_id: user.id,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error", err);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
