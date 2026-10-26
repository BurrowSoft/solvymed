import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { clientIp } from "@/lib/founders";
import { allowUnsubscribe, isWellFormedToken } from "@/lib/notices/unsubscribe";

// POST { t }: stops the Patient Channel notice e-mails for the account that
// owns the token (247's pc_email_optout_confirm, granted to anon). The RPC
// always answers true, for unknown and repeated tokens alike, so this route
// never tells whether a token exists. Codes: 400 bad_token, 429 rate_limited,
// 503 generic (the database didn't answer).
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { t?: unknown } | null;
  if (!isWellFormedToken(body?.t)) return NextResponse.json({ code: "bad_token" }, { status: 400 });
  const ip = clientIp(request.headers);
  if (!ip || !allowUnsubscribe(ip)) return NextResponse.json({ code: "rate_limited" }, { status: 429 });

  // An anonymous client: the token is the only credential.
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.rpc("pc_email_optout_confirm", { p_token: body.t });
  if (error) {
    console.error("Notice unsubscribe: RPC failed", error.code ?? "unknown");
    return NextResponse.json({ code: "generic" }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
