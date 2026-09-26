import type { Metadata } from "next";
import { VerifyClient } from "./VerifyClient";

// Email links land here (via /api/auth/callback) with a one-time token.
// Nothing is verified on load: link scanners open URLs before people do,
// so the token is only used when the person clicks Continue or sets their
// new password.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function VerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const { locale } = await params;
  const { token_hash: tokenHash, type } = await searchParams;
  // appHandoff: an account created in the app goes back to the app after the
  // click (email links for every client land here via /api/auth/callback).
  return <VerifyClient locale={locale} tokenHash={tokenHash ?? null} type={type ?? "signup"} appHandoff />;
}
