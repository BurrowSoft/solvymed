import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { liveFeatures } from "@/lib/liveFeatures";
import { mapRegisterError } from "@/lib/foundersUpload";
import { sendFounderUploadNotice } from "@/lib/foundersEmail";

// Founders stage 2: after the browser's upload, the file is registered as
// the founder's sample (founder_register_sample, as the signed-in doctor,
// with the re-confirmation). Only a path in the founder's own folder is
// accepted; unregistered uploads are purged after a day (132). The team is
// told by email (off until RESEND_API_KEY).

export async function POST(request: NextRequest) {
  if (!liveFeatures.founders) return NextResponse.json({ code: "not_found" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { path?: unknown; confirmed?: unknown } | null;
  const path = typeof body?.path === "string" ? body.path : "";
  if (body?.confirmed !== true) return NextResponse.json({ code: "confirmation_required" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ code: "not_allowed" }, { status: 401 });
  if (!path.startsWith(`${user.id}/`) || path.includes("..") || path.length > 200) return NextResponse.json({ code: "not_allowed" }, { status: 403 });

  const { data, error } = await supabase.rpc("founder_register_sample", { p_object_path: path, p_confirmed_test_only: true });
  if (error) {
    const code = mapRegisterError(error.message);
    return NextResponse.json({ code }, { status: code === "generic" ? 500 : code === "too_many_files" ? 409 : 403 });
  }
  await sendFounderUploadNotice({ userId: user.id, email: user.email ?? "", path, sampleId: String(data ?? "") });
  return NextResponse.json({ ok: true });
}
