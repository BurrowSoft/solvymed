import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";

function adminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(request: NextRequest) {
  // Token verification is the only thing standing between this endpoint and
  // anyone on the internet being able to activate or expire an arbitrary
  // user's subscription (externalReference is caller-supplied JSON, not
  // cryptographically tied to Asaas). It must never be optional: if the env
  // var isn't configured, fail closed rather than silently accepting every
  // unauthenticated request.
  if (!process.env.ASAAS_WEBHOOK_TOKEN) {
    console.error("ASAAS_WEBHOOK_TOKEN is not configured — rejecting webhook");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }
  const token = request.headers.get("asaas-access-token");
  if (token !== process.env.ASAAS_WEBHOOK_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: true });

  const event = body.event as string;
  const payment = body.payment;
  if (!payment) return NextResponse.json({ ok: true });

  const db = adminClient();

  if (event === "PAYMENT_CONFIRMED" || event === "PAYMENT_RECEIVED") {
    const userId = payment.externalReference as string | undefined;
    const subscriptionId = payment.subscription as string | undefined;
    if (!userId) return NextResponse.json({ ok: true });

    // Compute next period end (30 days from now)
    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + 31);

    await db.from("professionals").update({
      subscription_status: "active",
      subscription_provider: "asaas",
      subscription_id: subscriptionId ?? null,
      current_period_end: periodEnd.toISOString(),
    }).eq("id", userId);
  }

  if (event === "PAYMENT_OVERDUE" || event === "SUBSCRIPTION_INACTIVATED") {
    const userId = payment.externalReference as string | undefined;
    const subscriptionId = payment.subscription as string | undefined;
    if (!userId && !subscriptionId) return NextResponse.json({ ok: true });

    if (userId) {
      await db.from("professionals").update({
        subscription_status: "expired",
      }).eq("id", userId);
    } else if (subscriptionId) {
      await db.from("professionals").update({
        subscription_status: "expired",
      }).eq("subscription_id", subscriptionId);
    }
  }

  return NextResponse.json({ ok: true });
}
