import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isDemoUser } from "@/lib/demo";
import { demoTurnstileAnswerOk, demoTurnstileKeys } from "@/lib/demoTurnstile";

// POST /api/demo/verify {token}: the demo's bot check (01 + 0e, 10-22).
// The caller's anonymous session (the web's cookie, or the app's Bearer) →
// Cloudflare's siteverify with the visitor's address → 234's
// issue_demo_ticket (service role only), bound to that anonymous uid and
// the address Vercel saw (x-real-ip: set by Vercel, never by the client).
// start_demo then needs that ticket (demo_unverified without it). Nothing
// is stored here; the token and the address go only to Cloudflare and 234.
// #604: with {country, locale} in the body (the web's /demo), the route then
// calls start_demo itself with the caller's own session (it consumes the
// single-use ticket) and answers {status:"ready"} or 409 {code} with
// start_demo's refusal: one round trip less. Without them (the app's first
// version): {status:"issued"}, as before.

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type Code = "bad_token" | "unauthorized" | "not_anonymous" | "not_configured" | "verify_unreachable" | "turnstile_failed" | "ticket_failed" | "demo_preview_closed" | "start_failed";
// start_demo's refusals (234), passed on as they are.
const START_REFUSALS = ["demo_off", "demo_busy", "unsupported_country", "demo_unverified", "not_anonymous", "not_signed_in"] as const;

function fail(code: Code, status: number) {
  return NextResponse.json({ code }, { status });
}

// The caller's verified user, and a client acting as that caller (for
// start_demo).
async function caller(request: NextRequest): Promise<{ user: { id: string; is_anonymous?: boolean } | null; db: SupabaseClient }> {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) {
    const db = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return { user: (await db.auth.getUser(bearer)).data.user, db };
  }
  const db = (await createClient()) as unknown as SupabaseClient;
  return { user: (await db.auth.getUser()).data.user, db };
}

async function previewWindowOpen(admin: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await admin.from("server_flags").select("key, enabled").in("key", ["demo_mode", "demo_test_window"]);
    if (error || !Array.isArray(data)) return false;
    const on = (key: string) => data.some((r: { key: string; enabled: boolean }) => r.key === key && r.enabled === true);
    return on("demo_test_window") && !on("demo_mode");
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { token?: unknown; country?: unknown; locale?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  if (!token || token.length > 2048) return fail("bad_token", 400);

  const who = await caller(request).catch(() => null);
  const user = who?.user ?? null;
  if (!user) return fail("unauthorized", 401);
  // Only the demo's anonymous sessions get a ticket (234 refuses others too).
  if (!isDemoUser(user)) return fail("not_anonymous", 403);

  const { secret, test } = demoTurnstileKeys();
  if (!secret) return fail("not_configured", 503);
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Off Production the check is Cloudflare's always-pass test keys, while
  // previews share Production's database (cf's #600 block): a preview mints
  // a ticket ONLY during the testers' window (demo_test_window on) and
  // never once the demo is public (demo_mode off), both read here with the
  // service role (01). Anything else, or a failed read: no ticket.
  if (test && !(await previewWindowOpen(admin))) return fail("demo_preview_closed", 403);
  const ip = request.headers.get("x-real-ip")?.trim() ?? "";

  // Server-Timing (durations only; #604, 0e's split): siteverify, ticket, start.
  const timing: string[] = [];
  const timed = async <T,>(name: string, run: () => Promise<T>): Promise<T> => {
    const t0 = performance.now();
    try { return await run(); } finally { timing.push(`${name};dur=${Math.round(performance.now() - t0)}`); }
  };
  const withTiming = (res: NextResponse) => { if (timing.length) res.headers.set("Server-Timing", timing.join(", ")); return res; };
  let success = false;
  try {
    const form = new URLSearchParams({ secret, response: token });
    if (ip) form.set("remoteip", ip);
    success = await timed("siteverify", async () => {
      const res = await fetch(SITEVERIFY, { method: "POST", body: form, signal: AbortSignal.timeout(8000) });
      return res.ok && demoTurnstileAnswerOk((await res.json()) as { success?: boolean; action?: string; hostname?: string }, test);
    });
  } catch {
    return fail("verify_unreachable", 503);
  }
  if (!success) return withTiming(fail("turnstile_failed", 403));

  const { error } = await timed("ticket", async () => admin.rpc("issue_demo_ticket", { p_user: user.id, p_ip: ip || null }));
  if (error) return (error.message ?? "").includes("not_anonymous") ? fail("not_anonymous", 403) : fail("ticket_failed", 503);
  if (typeof body?.country !== "string" || !who) return withTiming(NextResponse.json({ status: "issued" }));
  const locale = typeof body.locale === "string" ? body.locale.slice(0, 10) : "en";
  const db = who.db;
  const { error: startError } = await timed("start", async () => db.rpc("start_demo", { p_country: (body.country as string).slice(0, 2), p_locale: locale }));
  if (!startError) return withTiming(NextResponse.json({ status: "ready" }));
  const refused = START_REFUSALS.find((c) => (startError.message ?? "").includes(c));
  return withTiming(refused ? NextResponse.json({ code: refused }, { status: 409 }) : fail("start_failed", 503));
}
