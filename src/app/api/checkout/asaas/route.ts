import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAccessAllowed, type EffectiveSub } from "@/lib/subscription";

const ASAAS_BASE = "https://api.asaas.com/v3";
const ASAAS_API_KEY = process.env.ASAAS_API_KEY!;
const VALUE_BRL = 89.0;

async function asaas(path: string, method: string, body?: unknown) {
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      access_token: ASAAS_API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, data: json };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Same reasoning as the Stripe checkout route: only authentication was
  // checked, not role — a patient or secretary could initiate a real
  // charge under their own identity for a professionals-only feature.
  const { data: roleRow, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (roleError) {
    return NextResponse.json({ error: "Could not verify account role" }, { status: 503 });
  }
  if (roleRow?.role && roleRow.role !== "professional") {
    return NextResponse.json({ error: "Only professionals can subscribe" }, { status: 403 });
  }

  // Same reasoning as the Stripe checkout route: this route is directly
  // callable regardless of the /subscribe page's redirect-away logic, and
  // previously created a brand new Asaas subscription unconditionally,
  // even for a professional who already has an active one.
  const { data: subRows, error: subError } = await supabase.rpc("get_effective_subscription", { p_user_id: user.id });
  if (subError) {
    // Fail closed — see the matching comment in the Stripe route.
    return NextResponse.json({ error: "Could not verify subscription status" }, { status: 503 });
  }
  const effectiveSub = (subRows?.[0] ?? null) as EffectiveSub | null;
  if (effectiveSub?.subscription_status === "active" && isAccessAllowed(effectiveSub)) {
    return NextResponse.json({ error: "Already subscribed" }, { status: 409 });
  }

  const { name, email } = await request.json().catch(() => ({}));

  try {
    // 1. Create or retrieve customer
    const searchRes = await asaas(`/customers?email=${encodeURIComponent(user.email ?? email ?? "")}`, "GET");
    if (!searchRes.ok) {
      return NextResponse.json({ error: "Could not reach Asaas" }, { status: 503 });
    }
    let customerId: string;
    if (searchRes.data?.data?.length) {
      customerId = searchRes.data.data[0].id;
    } else {
      const customerRes = await asaas("/customers", "POST", {
        name: name ?? user.email,
        email: user.email ?? email,
        externalReference: user.id,
      });
      if (!customerRes.ok || !customerRes.data?.id) {
        return NextResponse.json({ error: "Could not create Asaas customer", detail: customerRes.data }, { status: 502 });
      }
      customerId = customerRes.data.id;
    }

    // 1b. Narrow (not eliminate — still a check-then-create race under true
    // concurrency, but this is a real DB round-trip apart, unlike the two
    // requests both reading the same Postgres row above) the window for a
    // double-click or duplicate tab: bail if this customer already has an
    // active/pending Asaas subscription rather than creating a second one.
    // Fail closed on a non-2xx response instead of treating it as "no
    // existing subscriptions" — the parsed body of an error response
    // normally has no .data array, so this would otherwise silently
    // proceed to create a second paid subscription on an Asaas outage.
    const existingSubsRes = await asaas(`/subscriptions?customer=${customerId}&status=ACTIVE`, "GET");
    if (!existingSubsRes.ok) {
      return NextResponse.json({ error: "Could not verify existing Asaas subscriptions" }, { status: 503 });
    }
    if (existingSubsRes.data?.data?.length) {
      return NextResponse.json({ error: "Already subscribed" }, { status: 409 });
    }

    // 2. Create subscription (first charge is PIX, recurring is BOLETO or PIX)
    const nextDue = new Date();
    nextDue.setDate(nextDue.getDate() + 1);
    const nextDueDate = nextDue.toISOString().split("T")[0];

    const subRes = await asaas("/subscriptions", "POST", {
      customer: customerId,
      billingType: "PIX",
      cycle: "MONTHLY",
      value: VALUE_BRL,
      nextDueDate,
      description: "SolvyMed Pro — Plano Mensal",
      externalReference: user.id,
    });

    if (!subRes.ok || !subRes.data?.id) {
      return NextResponse.json({ error: "Asaas subscription creation failed", detail: subRes.data }, { status: 500 });
    }
    const sub = subRes.data;

    // 3. Fetch the first payment's PIX link. The subscription already
    // exists at this point (the customer will be charged) — a failure
    // here is a distinct situation from checkout never starting, so it's
    // reported with subscriptionId still present rather than as a plain
    // failure, letting the client tell the two apart.
    const paymentsRes = await asaas(`/subscriptions/${sub.id}/payments`, "GET");
    if (!paymentsRes.ok) {
      console.error(`Asaas subscription ${sub.id} created but payment lookup failed`, paymentsRes.data);
      return NextResponse.json({
        subscriptionId: sub.id,
        error: "Subscription created, but we couldn't load the payment link. Please check your email or contact support.",
      });
    }
    const firstPayment = paymentsRes.data?.data?.[0];
    const paymentUrl = firstPayment?.invoiceUrl ?? null;

    return NextResponse.json({ url: paymentUrl, subscriptionId: sub.id });
  } catch (err) {
    console.error("Asaas checkout error", err);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
