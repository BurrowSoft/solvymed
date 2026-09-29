import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { liveFeatures } from "@/lib/liveFeatures";
import { ATTRIBUTION_COOKIE, parseAttribution } from "@/lib/attribution";
import { clientIp, founderPayload, mapApplyError } from "@/lib/founders";

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
  const { data, error } = await db.rpc("founder_apply", { p_payload: founderPayload(body, attribution), p_client_ip: ip });
  if (error) {
    const e = mapApplyError(error.message);
    const status = e.code === "too_many_attempts" ? 429 : e.code === "already_applied" ? 409 : e.code === "invalid" ? 400 : 500;
    return NextResponse.json(e, { status });
  }
  const status = (data as { status?: string } | null)?.status === "waitlist" ? "waitlist" : "new";
  return NextResponse.json({ status });
}
