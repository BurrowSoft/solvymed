import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// The Patient Channel routes' shared server pieces (specs/patient-contact-tech.md §4.7):
// the caller (the web's cookie session, or the app's Bearer, as /api/demo/verify), the
// service-role client for 237's service-only RPCs, and the {code} error shape (the body
// never echoes health data).

export type PcCode =
  | "unauthorized" | "not_found" | "not_doctor" | "too_large" | "bad_request"
  | "invalid_rules" | "version_conflict" | "failed"
  | "out_of_scope" | "not_open" | "invalid_reply";

export function pcFail(code: PcCode, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ code, ...extra }, { status });
}

export async function pcCaller(request: NextRequest): Promise<{ user: { id: string } | null; db: SupabaseClient }> {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) {
    const db = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return { user: (await db.auth.getUser(bearer)).data.user, db };
  }
  const db = (await createClient({ acting: false })) as unknown as SupabaseClient;
  return { user: (await db.auth.getUser()).data.user, db };
}

export function pcAdmin(): SupabaseClient {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// A JSON body of at most `max` bytes, or null.
export async function pcBody<T>(request: NextRequest, max: number): Promise<T | "too_large" | null> {
  const text = await request.text().catch(() => null);
  if (text === null) return null;
  if (new TextEncoder().encode(text).length > max) return "too_large";
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
