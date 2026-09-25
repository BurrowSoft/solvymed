import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe, retrieveSubscriptionOrNull } from "@/lib/stripeBilling";
import { routing } from "@/i18n/routing";

// Opens the Stripe Customer Portal so a professional can update the card on
// their own subscription (e.g. after a failed renewal). Stripe then retries
// the unpaid invoice, and the webhook's live sync restores access.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized", code: "generic" }, { status: 401 });

  // Only the paying professional manages billing. A secretary resolves to
  // their doctor's subscription elsewhere, but must never get a portal
  // session for the doctor's Stripe customer.
  const { data: roleRow, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (roleError) return NextResponse.json({ error: "Could not verify account role", code: "check_failed" }, { status: 503 });
  if (roleRow?.role !== "professional") {
    return NextResponse.json({ error: "Only professionals can manage billing", code: "wrong_role" }, { status: 403 });
  }

  const { data: prof, error: profError } = await supabase
    .from("professionals")
    .select("subscription_provider, subscription_id")
    .eq("id", user.id)
    .maybeSingle();
  if (profError) return NextResponse.json({ error: "Could not load subscription", code: "check_failed" }, { status: 503 });
  if (prof?.subscription_provider !== "stripe" || !prof.subscription_id) {
    return NextResponse.json({ error: "No subscription to manage", code: "no_subscription" }, { status: 404 });
  }

  const requestedLocale = (await request.json().catch(() => ({}))).locale;
  const locale = (routing.locales as readonly string[]).includes(requestedLocale)
    ? (requestedLocale as string)
    : routing.defaultLocale;
  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "";

  let customerId: string;
  try {
    const live = await retrieveSubscriptionOrNull(prof.subscription_id as string);
    // Unknown to Stripe (e.g. a test-mode id under live keys), or not this
    // professional's own subscription: nothing to manage. Never open a
    // portal for someone else's customer.
    if (!live || live.metadata?.user_id !== user.id) {
      return NextResponse.json({ error: "No subscription to manage", code: "no_subscription" }, { status: 404 });
    }
    customerId = typeof live.customer === "string" ? live.customer : live.customer.id;
  } catch (err) {
    console.error("Billing portal: could not retrieve subscription", err);
    return NextResponse.json({ error: "Could not load subscription", code: "check_failed" }, { status: 503 });
  }

  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/${locale === "en" ? "" : locale + "/"}subscribe`,
    });
    return NextResponse.json({ url: portal.url });
  } catch (err) {
    // Most likely the Customer Portal isn't enabled in the Stripe Dashboard
    // for this mode. The client shows "contact support". It must never fall
    // back to a new checkout, which would bill a second subscription.
    console.error("Billing portal: could not create session", err);
    return NextResponse.json({ error: "Card management unavailable", code: "portal_unavailable" }, { status: 503 });
  }
}
