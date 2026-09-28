import { NextRequest, NextResponse } from "next/server";

// The visitor's country as Vercel sees it (ISO-3166 alpha-2), to pre-select
// the practice country at doctor signup. Only a suggestion: the doctor picks.
export function GET(request: NextRequest) {
  const raw = (request.headers.get("x-vercel-ip-country") ?? "").trim().toUpperCase();
  const country = /^[A-Z]{2}$/.test(raw) ? raw : null;
  return NextResponse.json({ country }, { headers: { "Cache-Control": "no-store" } });
}
