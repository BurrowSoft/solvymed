import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { liveFeatures } from "@/lib/liveFeatures";
import { FOUNDER_BUCKET, FOUNDER_DAILY_URLS, FOUNDER_MAX_BYTES, contentTypeFor, safeFileName } from "@/lib/foundersUpload";

// Founders stage 2 (migration 132): a signed upload URL for one test export.
// As the signed-in doctor: founder_upload_check says whether they're an
// accepted founder with uploads left and gives their folder; the founder
// must re-confirm "only test patients" for every file. The object path is
// built here (folder + time + a safe name), never taken from the browser;
// a founder gets at most FOUNDER_DAILY_URLS URLs a day (counted from the
// bucket itself, so it holds across servers). Then the service key signs
// the upload; the file never passes through this server (Vercel's 4.5 MB).

export async function POST(request: NextRequest) {
  if (!liveFeatures.founders) return NextResponse.json({ code: "not_found" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { fileName?: unknown; size?: unknown; confirmed?: unknown } | null;
  const fileName = typeof body?.fileName === "string" ? body.fileName.trim() : "";
  const size = typeof body?.size === "number" ? body.size : NaN;
  if (body?.confirmed !== true) return NextResponse.json({ code: "confirmation_required" }, { status: 400 });
  const contentType = contentTypeFor(fileName);
  if (!fileName || !contentType) return NextResponse.json({ code: "type" }, { status: 400 });
  if (!Number.isFinite(size) || size <= 0 || size > FOUNDER_MAX_BYTES) return NextResponse.json({ code: "size" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ code: "not_allowed" }, { status: 401 });
  const { data, error } = await supabase.rpc("founder_upload_check");
  const check = (Array.isArray(data) ? data[0] : data) as { allowed?: boolean; folder?: string; uploads_left?: number } | null;
  if (error || !check) return NextResponse.json({ code: "generic" }, { status: 500 });
  if (check.allowed !== true) return NextResponse.json({ code: (check.uploads_left ?? 1) <= 0 ? "too_many_files" : "not_allowed" }, { status: 403 });
  // The folder is the founder's own ("<uid>/"): refuse anything else.
  const folder = `${user.id}/`;
  if (check.folder !== folder) return NextResponse.json({ code: "generic" }, { status: 500 });

  const service = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bucket = service.storage.from(FOUNDER_BUCKET);
  // The last 24 hours' objects in the folder (uploaded or still waiting to
  // be registered): every name starts with the time its URL was issued.
  const { data: objects, error: listError } = await bucket.list(user.id, { limit: 1000 });
  if (listError) return NextResponse.json({ code: "generic" }, { status: 500 });
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const recent = (objects ?? []).filter((o) => Number(String(o.name).split("-")[0]) > since).length;
  if (recent >= FOUNDER_DAILY_URLS) return NextResponse.json({ code: "daily_limit" }, { status: 429 });

  const path = `${folder}${Date.now()}-${safeFileName(fileName)}`;
  const { data: signed, error: signError } = await bucket.createSignedUploadUrl(path);
  if (signError || !signed) return NextResponse.json({ code: "generic" }, { status: 500 });
  return NextResponse.json({ path, token: signed.token, contentType, uploadsLeft: check.uploads_left ?? null });
}
