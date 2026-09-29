import { NextRequest, NextResponse } from "next/server";
import { handleAssistant } from "@/lib/assistant/server/handle";
import { assistantCaller, assistantService } from "@/lib/assistant/server/caller";
import { modelFromEnv } from "@/lib/assistant/server/model";

// SolvyAI (docs/assistant-api.md): a question in, a streamed answer out
// (NDJSON, one AnswerChunk per line). Used by the website and the app.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "gru1";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const { db, userId, client } = await assistantCaller(request);
  const outcome = await handleAssistant(body as Parameters<typeof handleAssistant>[0], {
    userId,
    db,
    service: assistantService(),
    model: modelFromEnv(),
    client,
  });
  if (!("stream" in outcome)) return NextResponse.json(outcome.json, { status: outcome.status });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of outcome.stream) controller.enqueue(encoder.encode(JSON.stringify(chunk) + "\n"));
      } catch {
        controller.enqueue(encoder.encode(JSON.stringify({ kind: "error", code: "model_failed" }) + "\n"));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
