import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
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

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type Code = "bad_token" | "unauthorized" | "not_anonymous" | "not_configured" | "verify_unreachable" | "turnstile_failed" | "ticket_failed";

function fail(code: Code, status: number) {
  return NextResponse.json({ code }, { status });
}

async function callerUser(request: NextRequest) {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) {
    const supabase = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return (await supabase.auth.getUser(bearer)).data.user;
  }
  return (await (await createClient()).auth.getUser()).data.user;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  if (!token || token.length > 2048) return fail("bad_token", 400);

  const user = await callerUser(request).catch(() => null);
  if (!user) return fail("unauthorized", 401);
  // Only the demo's anonymous sessions get a ticket (234 refuses others too).
  if (!isDemoUser(user)) return fail("not_anonymous", 403);

  const { secret, test } = demoTurnstileKeys();
  if (!secret) return fail("not_configured", 503);
  const ip = request.headers.get("x-real-ip")?.trim() ?? "";

  let success = false;
  try {
    const form = new URLSearchParams({ secret, response: token });
    if (ip) form.set("remoteip", ip);
    const res = await fetch(SITEVERIFY, { method: "POST", body: form, signal: AbortSignal.timeout(8000) });
    success = res.ok && demoTurnstileAnswerOk((await res.json()) as { success?: boolean; action?: string; hostname?: string }, test);
  } catch {
    return fail("verify_unreachable", 503);
  }
  if (!success) return fail("turnstile_failed", 403);

  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.rpc("issue_demo_ticket", { p_user: user.id, p_ip: ip || null });
  if (error) return (error.message ?? "").includes("not_anonymous") ? fail("not_anonymous", 403) : fail("ticket_failed", 503);
  return NextResponse.json({ status: "issued" });
}
