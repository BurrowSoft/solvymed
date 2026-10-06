import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripeBilling";
import { conditionMet } from "@/lib/conditions";
import { reconcile, reconcileReport, type ProRow, type StripeSubLite } from "@/lib/stripeReconcile";

// The daily Stripe ↔ database check (cf, "before the ads"; vercel.json
// crons). Read-only on both sides: it lists, compares and reports; it never
// changes a subscription or a row. Vercel Cron calls it with
// "Authorization: Bearer $CRON_SECRET"; without that secret configured it
// refuses every call (401) and logs once, so it is harmless until Vitor sets
// it. The support email goes out only once stripe-reconcile-email is met
// (after the dry runs) and never with ?dry=1; otherwise the report is the
// response (and a one-line log), ids and statuses only.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SUPPORT = "support@solvymed.com";
const FROM = "SolvyMed <noreply@solvymed.com>";
let warnedNoSecret = false;

function authorized(header: string | null, secret: string): boolean {
  const want = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header ?? "");
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    if (!warnedNoSecret) {
      console.warn("[stripe-reconcile] CRON_SECRET is not set: refusing every call");
      warnedNoSecret = true;
    }
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!authorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.STRIPE_SECRET_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }
  const dry = request.nextUrl.searchParams.get("dry") === "1" || !conditionMet("stripe-reconcile-email");

  // Every subscription Stripe has (any status), read-only.
  const subs: StripeSubLite[] = [];
  for await (const s of stripe.subscriptions.list({ status: "all", limit: 100 })) {
    subs.push({ id: s.id, status: s.status, userId: (s.metadata?.user_id as string | undefined) ?? null, created: s.created });
  }

  // Every professional's subscription fields (service role, read-only).
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const rows: ProRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("professionals")
      .select("id, subscription_status, subscription_id, subscription_provider")
      .order("id")
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: "db" }, { status: 500 });
    rows.push(...((data ?? []) as ProRow[]));
    if (!data || data.length < 1000) break;
  }

  const mismatches = reconcile(subs, rows);
  const mode = dry ? "dry run" : "live";
  const report = reconcileReport(mismatches, { stripe: subs.length, rows: rows.length }, mode);
  console.log(`[stripe-reconcile] ${mode}: ${mismatches.length} mismatch(es); stripe=${subs.length} rows=${rows.length}`);

  let emailed = false;
  const key = process.env.RESEND_API_KEY?.trim();
  if (!dry && mismatches.length > 0 && key) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [SUPPORT], subject: `[SolvyMed] Stripe check: ${mismatches.length} mismatch(es)`, text: report }),
    }).catch(() => null);
    emailed = !!res?.ok;
  }
  return NextResponse.json({ mode, mismatches, counts: { stripe: subs.length, rows: rows.length }, emailed });
}
