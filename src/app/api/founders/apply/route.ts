import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { liveFeatures } from "@/lib/liveFeatures";
import { ATTRIBUTION_COOKIE, parseAttribution } from "@/lib/attribution";
import { clientIp, founderPayload, mapApplyError } from "@/lib/founders";
import { sendFounderEmails } from "@/lib/foundersEmail";
import { routing } from "@/i18n/routing";

// The Founders Program application (founders-page-spec.md, stage 1).
// Public: no account. The database (migration 129's founder_apply, server
// key only) validates, rate-limits per IP and allows one active
// application per email; this route adds the visitor's IP, drops bots
// (the honeypot), and answers with the status only: never an id or
// anything about other applicants. Off until liveFeatures.founders.

export async function POST(request: NextRequest) {
  if (!liveFeatures.founders) return NextResponse.json({ code: "not_found" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return NextResponse.json({ code: "invalid", field: "payload" }, { status: 400 });
  // A bot filled the hidden field: pretend it worked, store nothing.
  if (typeof body.website === "string" && body.website.trim() !== "") return NextResponse.json({ status: "new" });
  const ip = clientIp(request.headers);
  if (!ip) return NextResponse.json({ code: "generic" }, { status: 400 });

  const attribution = parseAttribution(request.cookies.get(ATTRIBUTION_COOKIE)?.value);
  const db = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const payload = founderPayload(body, attribution);
  const { data, error } = await db.rpc("founder_apply", { p_payload: payload, p_client_ip: ip });
  if (error) {
    const e = mapApplyError(error.message);
    const status = e.code === "too_many_attempts" ? 429 : e.code === "already_applied" ? 409 : e.code === "invalid" ? 400 : 500;
    return NextResponse.json(e, { status });
  }
  // A jsonb object or a one-row table, whichever 129 returns.
  const row = (Array.isArray(data) ? data[0] : data) as { id?: string; status?: string } | null;
  const locale = (routing.locales as readonly string[]).includes(String(payload.locale)) ? String(payload.locale) : routing.defaultLocale;
  const status = row?.status === "waitlist" ? "waitlist" : "new";
  // The confirmation + the team summary (no-op until Resend is set up).
  await sendFounderEmails({
    locale, email: String(payload.email), fullName: String(payload.full_name),
    system: String(payload.system), systemOther: String(payload.system_other), country: String(payload.country), status, id: row?.id,
  });
  // The browser gets the status only, never the id (38).
  return NextResponse.json({ status });
}
