import type { NextRequest, NextResponse } from "next/server";

// Expires every Supabase auth cookie the request carried (sb-<ref>-auth-token,
// its .0/.1 chunks and the PKCE verifier) on the response, so the browser is
// signed out whatever Auth's own logout call does.
export function clearAuthCookies(request: NextRequest, res: NextResponse): void {
  for (const c of request.cookies.getAll()) {
    if (c.name.startsWith("sb-")) res.cookies.set(c.name, "", { path: "/", maxAge: 0 });
  }
}
