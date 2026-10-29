import { Suspense } from "react";
import type { Metadata } from "next";

// A personal link from an e-mail: never indexed, and the token in the URL is
// never sent on as a Referer (cf). Never gated (01, 10-30): the link must keep working.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

// The page reads ?t= (useSearchParams), which needs a Suspense boundary.
export default function TipsUnsubscribeLayout({ children }: { children: React.ReactNode }) {
  return <Suspense>{children}</Suspense>;
}
