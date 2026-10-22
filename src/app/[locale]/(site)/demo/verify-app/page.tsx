import type { Metadata } from "next";
import { demoTurnstileKeys } from "@/lib/demoTurnstile";
import { VerifyAppClient } from "./VerifyAppClient";

// The app's demo bot check (01's option B, 0e): the app opens this page in a
// WebView, gets the Turnstile token, then POSTs /api/demo/verify with its
// own anonymous Bearer. Per request (the demo layout is force-dynamic), so
// the key is the server's: test keys off Production.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function VerifyAppPage() {
  return <VerifyAppClient siteKey={demoTurnstileKeys().siteKey} />;
}
