import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { stripe, retrieveSubscriptionOrNull } from "@/lib/stripeBilling";
import { knownDbError } from "@/lib/dbErrors";
import { planClosureNotices, stripeCloseStep, type ClosureRow } from "@/lib/accountClose";
import { sendExpoPush } from "@/lib/push";
import { routing } from "@/i18n/routing";

// Closes or deletes the caller's own account (migration 100), for the web
// settings page and the mobile app alike:
//   1. a professional's paid Stripe subscription is cancelled first, and
//      fail-closed: if Stripe fails, nothing is closed;
//   2. close_my_account() runs as the caller (a professional with clinical
//      history is closed, everyone else is deleted);
//   3. linked patients get the "clinic closed" push here and the email from
//      the notify-clinic-closed edge function; other patients with a
//      cancelled appointment get the usual cancellation push.
// Responses carry a stable `code` the client translates. Logs carry error
// codes only, never names, emails or ids.

type Code = "unauthorized" | "check_failed" | "stripe_cancel_failed" | "subscription_active" | "generic";

function fail(code: Code, status: number) {
  return NextResponse.json({ code }, { status });
}

function adminClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// The caller's Supabase client and verified user: the mobile app sends its
// access token as a Bearer header; the web uses the cookie session. The
// token is passed to getUser() explicitly (a header-only client has no
// stored session), which verifies it with Supabase Auth.
async function caller(request: NextRequest): Promise<{ supabase: SupabaseClient; userId: string | null }> {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (token) {
    const supabase = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user } } = await supabase.auth.getUser(token);
    return { supabase, userId: user?.id ?? null };
  }
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

function errorCode(err: unknown): string {
  if (err instanceof Stripe.errors.StripeError) return `${err.type}/${err.code ?? "-"}`;
  return err instanceof Error ? err.name : "unknown";
}

export async function POST(request: NextRequest) {
  const { supabase, userId } = await caller(request);
  if (!userId) return fail("unauthorized", 401);

  const requestedLocale = (await request.json().catch(() => ({})))?.locale;
  const locale = (routing.locales as readonly string[]).includes(requestedLocale)
    ? (requestedLocale as string)
    : routing.defaultLocale;

  // 1. Stripe. Only a professional's own row can hold a subscription; for
  // secretaries and patients there's no row and nothing to cancel.
  const { data: prof, error: profError } = await supabase
    .from("professionals")
    .select("subscription_status, subscription_provider, subscription_id")
    .eq("id", userId)
    .maybeSingle();
  if (profError) return fail("check_failed", 503);

  let live: Stripe.Subscription | null = null;
  if (prof?.subscription_provider === "stripe" && prof.subscription_id && prof.subscription_status !== "lifetime") {
    try {
      live = await retrieveSubscriptionOrNull(prof.subscription_id);
    } catch (err) {
      console.error("Account close: could not retrieve subscription", errorCode(err));
      return fail("check_failed", 503);
    }
  }

  const step = stripeCloseStep(userId, prof, live);
  if (step.kind === "not_owner") return fail("check_failed", 409);
  if (step.kind === "cancel") {
    try {
      await stripe.subscriptions.cancel(step.subId);
    } catch (err) {
      console.error("Account close: Stripe cancel failed", errorCode(err));
      return fail("stripe_cancel_failed", 502);
    }
  }
  if (step.kind === "cancel" || step.kind === "ended") {
    // What the webhook writes for a cancelled subscription, written now so
    // close_my_account()'s subscription guard doesn't wait for it. Pinned to
    // this subscription id; the webhook's later write is the same.
    const { error } = await adminClient()
      .from("professionals")
      .update({ subscription_status: "expired" })
      .eq("id", userId)
      .eq("subscription_id", step.subId)
      .eq("subscription_status", "active");
    if (error) return fail("check_failed", 503);
  }

  // 2. Close or delete, as the caller.
  const { data, error } = await supabase.rpc("close_my_account");
  if (error) {
    return knownDbError(error.message) === "subscription_active"
      ? fail("subscription_active", 409)
      : fail("generic", 500);
  }
  const rows = (data ?? []) as ClosureRow[];
  const outcome = rows[0]?.outcome ?? "deleted";

  // 3. Notices. Best-effort: the account is already closed.
  const plan = planClosureNotices(rows);
  if (plan.linkedPatients.length || plan.cancelledAppointments.length) {
    const t = await getTranslations({ locale, namespace: "accountClose" });
    const admin = adminClient();
    const ids = [...new Set([...plan.linkedPatients, ...plan.cancelledAppointments.map((a) => a.patientAuthId)])];
    const { data: tokenRows } = await admin.from("push_tokens").select("user_id, token").in("user_id", ids);
    const tokenOf = new Map((tokenRows ?? []).map((r: { user_id: string; token: string }) => [r.user_id, r.token]));
    const pushes: Promise<void>[] = [];
    for (const id of plan.linkedPatients) {
      const token = tokenOf.get(id);
      if (token) pushes.push(sendExpoPush([token], t("pushClosedTitle"), t("pushClosedBody")));
    }
    for (const a of plan.cancelledAppointments) {
      const token = tokenOf.get(a.patientAuthId);
      if (token) {
        pushes.push(sendExpoPush([token], t("pushCancelledTitle"), t("pushCancelledBody", { date: a.date, time: a.startTime.slice(0, 5) })));
      }
    }
    if (plan.linkedPatients.length) {
      pushes.push(
        fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notify-clinic-closed`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ patient_auth_ids: plan.linkedPatients }),
        })
          .then((res) => {
            if (!res.ok) console.error("Account close: notify-clinic-closed failed", res.status);
          })
          .catch((err) => console.error("Account close: notify-clinic-closed threw", errorCode(err))),
      );
    }
    await Promise.all(pushes);
  }

  return NextResponse.json({ outcome });
}
