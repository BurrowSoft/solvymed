import { NextRequest, NextResponse } from "next/server";
import { assistantApiEnabled, assistantCaller } from "@/lib/assistant/server/caller";

// Today's SolvyAI usage for the usage bar (docs/assistant-api.md §4):
// {used, limit, extra, resetsAt, mode}. Before migration 115 exists: 503.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "gru1";

export async function GET(request: NextRequest) {
  if (!assistantApiEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { db, userId } = await assistantCaller(request);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await db.rpc("assistant_usage_today");
  if (error || !data || typeof data !== "object") return NextResponse.json({ error: "model_unavailable" }, { status: 503 });
  const u = data as { reason?: string; used?: number; limit?: number; resets_at?: string; actions?: boolean };
  if (u.reason === "not_doctor") return NextResponse.json({ error: "not_doctor" }, { status: 403 });
  return NextResponse.json(
    { used: u.used ?? 0, limit: u.limit ?? 0, extra: 0, resetsAt: u.resets_at ?? null, mode: u.actions ? "actions" : "help" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
