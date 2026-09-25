import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { isAccessAllowed, getPlanPrice, type EffectiveSub } from "@/lib/subscription";
import { retrieveStoredStripeSubscription } from "@/lib/stripeBilling";
import { routing } from "@/i18n/routing";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-05-27.dahlia" });

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

  // The DB row can lag Stripe, and it stores a failed renewal as plain
  // "expired", so ask Stripe about the stored subscription directly. Only a
  // terminal one (canceled, incomplete_expired) may be replaced by a new
  // checkout:
  // - active/trialing: already paying, even if the webhook hasn't landed
  //   yet (e.g. a retry just succeeded while the row still says expired).
  // - past_due/unpaid/incomplete/paused: Stripe still holds this
  //   subscription and may yet collect on it. A second one would bill
  //   twice, so the fix is the card on the existing subscription (portal).
  try {
    const stored = await retrieveStoredStripeSubscription(sub);
    if (stored) {
      if (stored.status === "active" || stored.status === "trialing") {
        return NextResponse.json({ error: "Already subscribed", code: "already_subscribed" }, { status: 409 });
      }
      if (stored.status !== "canceled" && stored.status !== "incomplete_expired") {
        return NextResponse.json({ error: "Last payment failed", code: "payment_failed" }, { status: 409 });
      }
    }
  } catch (err) {
    console.error("Stripe checkout: could not check stored subscription", err);
    return NextResponse.json({ error: "Could not verify subscription status", code: "check_failed" }, { status: 503 });
  }

  // The DB only learns about a new subscription from the webhook. Between a
  // successful payment and that delivery (seconds normally, hours if
  // deliveries are failing and being retried), the check above still sees
  // no subscription, and the success page still shows the Subscribe
  // button, so a second checkout could charge twice. Ask Stripe directly:
  // any recently completed, paid checkout of this professional's whose
  // subscription is live blocks a new one. Scoped by the checkout email,
  // which createSession below pins to the account email, so this is per
  // professional rather than a scan of every sale. The client_reference_id
  // check still decides ownership.
  try {
    for await (const done of stripe.checkout.sessions.list({
      status: "complete",
      created: { gte: Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60 },
      ...(user.email ? { customer_details: { email: user.email } } : {}),
      limit: 100,
    })) {
      if (done.client_reference_id !== user.id || done.payment_status !== "paid" || !done.subscription) continue;
      const doneSubId = typeof done.subscription === "string" ? done.subscription : done.subscription.id;
      const live = await stripe.subscriptions.retrieve(doneSubId);
      if (live.status === "active" || live.status === "trialing") {
        return NextResponse.json({ error: "Already subscribed", code: "already_subscribed" }, { status: 409 });
      }
    }
  } catch (err) {
    // Fail closed, same as the DB check above.
    console.error("Stripe checkout: could not check completed checkouts", err);
    return NextResponse.json({ error: "Could not verify subscription status", code: "check_failed" }, { status: 503 });
  }

  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  // The client only picks a locale, never an amount: the price comes from
  // the fixed getPlanPrice table. The locale is also interpolated into the
  // redirect URLs below, so anything that isn't a real app locale falls
  // back to the default.
  const requestedLocale = (await request.json().catch(() => ({}))).locale;
  const locale = (routing.locales as readonly string[]).includes(requestedLocale)
    ? (requestedLocale as string)
    : routing.defaultLocale;
  const plan = getPlanPrice(locale);

  // Collapses concurrent duplicate requests (double-click racing the
  // redirect, a retried request) into the same Checkout Session. Scoped to
  // a short window so a legitimate resubscribe after cancellation gets a
  // fresh session. The locale is in the key because Stripe rejects a reused
  // key whose parameters differ (currency, URLs). Everything derived from
  // time below comes from the window start, not Date.now(), for the same
  // reason.
  const WINDOW_MS = 10 * 60 * 1000;
  const windowStart = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
  const idempotencyKey = `checkout-stripe-${user.id}-${locale}-${windowStart / WINDOW_MS}`;
  // 70 min after the window start = 60-70 min from now, inside Stripe's
  // allowed 30 min to 24 h.
  const expiresAt = Math.floor(windowStart / 1000) + 70 * 60;

  // At most one payable Checkout Session per professional. Two open ones
  // (an abandoned tab, a retry in a later window, a language switch) can
  // both be completed, leaving the professional billed twice. Expire any
  // of theirs still open before creating a new one. No created-date filter:
  // sessions from before expires_at was set live up to Stripe's default
  // 24 h, and "open" already excludes anything older, so the list stays
  // small. Sessions from this request's own key family (see below) are left
  // alone: one of them is the session this request will hand back.
  const isOwnKey = (k: string | undefined) => k === idempotencyKey || !!k?.startsWith(`${idempotencyKey}-r`);
  try {
    for await (const open of stripe.checkout.sessions.list({ status: "open", limit: 100 })) {
      if (open.client_reference_id === user.id && !isOwnKey(open.metadata?.checkout_key)) {
        await stripe.checkout.sessions.expire(open.id);
      }
    }
  } catch (err) {
    // Fail closed: proceeding could leave a second payable session open.
    console.error("Stripe checkout: could not expire open sessions", err);
    return NextResponse.json({ error: "Could not verify open checkouts", code: "check_failed" }, { status: 503 });
  }

  // A key can replay a session that's since been expired. Example: en, then
  // pt-BR (which expires the en session), then en again in the same window.
  // Stripe replays the ORIGINAL cached create response, which still says
  // "open", so the session is re-read, and if it's no longer open the next
  // key in a fixed sequence is tried (key, key-r1, key-r2, ...). The
  // sequence is deterministic, so concurrent double-clicks still walk the
  // same keys and collapse into one session.
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const key = attempt === 0 ? idempotencyKey : `${idempotencyKey}-r${attempt}`;
      const created = await createSession(key, user.id, user.email);
      const current = await stripe.checkout.sessions.retrieve(created.id);
      if (current.status === "open" && current.url) {
        return NextResponse.json({ url: current.url });
      }
    }
    console.error(`Stripe checkout: no open session after 5 keys for ${user.id}`);
    return NextResponse.json({ error: "Checkout failed", code: "checkout_failed" }, { status: 500 });
  } catch (err) {
    console.error("Stripe checkout error", err);
    return NextResponse.json({ error: "Checkout failed", code: "checkout_failed" }, { status: 500 });
  }

  function createSession(key: string, userId: string, email: string | undefined) {
    return stripe.checkout.sessions.create(
      {
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: plan.currency,
              unit_amount: plan.unitAmount,
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
        subscription_data: { metadata: { user_id: userId } },
        metadata: { user_id: userId, checkout_key: key },
        success_url: `${origin}/${locale === "en" ? "" : locale + "/"}subscribe?success=1`,
        cancel_url: `${origin}/${locale === "en" ? "" : locale + "/"}subscribe?cancelled=1`,
        client_reference_id: userId,
        // Pinned (read-only in Checkout) so completed sessions can be looked
        // up per professional by email in the already-subscribed guard.
        ...(email ? { customer_email: email } : {}),
        expires_at: expiresAt,
      },
      { idempotencyKey: key },
    );
  }
}
