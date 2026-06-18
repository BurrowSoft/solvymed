import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  return res.json();
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, email } = await request.json().catch(() => ({}));

  try {
    // 1. Create or retrieve customer
    const searchRes = await asaas(`/customers?email=${encodeURIComponent(user.email ?? email ?? "")}`, "GET");
    let customerId: string;
    if (searchRes?.data?.length) {
      customerId = searchRes.data[0].id;
    } else {
      const customer = await asaas("/customers", "POST", {
        name: name ?? user.email,
        email: user.email ?? email,
        externalReference: user.id,
      });
      customerId = customer.id;
    }

    // 2. Create subscription (first charge is PIX, recurring is BOLETO or PIX)
    const nextDue = new Date();
    nextDue.setDate(nextDue.getDate() + 1);
    const nextDueDate = nextDue.toISOString().split("T")[0];

    const sub = await asaas("/subscriptions", "POST", {
      customer: customerId,
      billingType: "PIX",
      cycle: "MONTHLY",
      value: VALUE_BRL,
      nextDueDate,
      description: "SolvyMed Pro — Plano Mensal",
      externalReference: user.id,
    });

    if (!sub.id) {
      return NextResponse.json({ error: "Asaas subscription creation failed", detail: sub }, { status: 500 });
    }

    // 3. Fetch the first payment's PIX link
    const payments = await asaas(`/subscriptions/${sub.id}/payments`, "GET");
    const firstPayment = payments?.data?.[0];
    const paymentUrl = firstPayment?.invoiceUrl ?? null;

    return NextResponse.json({ url: paymentUrl, subscriptionId: sub.id });
  } catch (err) {
    console.error("Asaas checkout error", err);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
