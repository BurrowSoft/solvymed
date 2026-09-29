import { NextRequest, NextResponse } from "next/server";
import { handleAssistant } from "@/lib/assistant/server/handle";
import { assistantApiEnabled, assistantCaller, assistantService } from "@/lib/assistant/server/caller";
import { modelFromEnv } from "@/lib/assistant/server/model";

// SolvyAI (docs/assistant-api.md): a question in, a streamed answer out
// (NDJSON, one AnswerChunk per line). Used by the website and the app.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "gru1";

export async function POST(request: NextRequest) {
  // SolvyAI off: 404 before reading anything (a9).
  if (!assistantApiEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const { db, userId, client } = await assistantCaller(request);
  const outcome = await handleAssistant(body as Parameters<typeof handleAssistant>[0], {
    enabled: assistantApiEnabled(),
    userId,
    db,
    service: assistantService(),
    model: modelFromEnv(),
    client,
  });
  if (!("stream" in outcome)) return NextResponse.json(outcome.json, { status: outcome.status });

  // Pull-based, so a client that goes away cancels the answer: return()
  // stops the model's stream and the handler settles the message (a9).
  const encoder = new TextEncoder();
  const it = outcome.stream[Symbol.asyncIterator]();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await it.next();
        if (done) controller.close();
        else controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
      } catch {
        controller.enqueue(encoder.encode(JSON.stringify({ kind: "error", code: "model_failed" }) + "\n"));
        controller.close();
      }
    },
    async cancel() {
      await it.return?.();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
