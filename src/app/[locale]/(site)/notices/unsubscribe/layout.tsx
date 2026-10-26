import { Suspense } from "react";
import type { Metadata } from "next";

// A personal link from an e-mail: never indexed, and the token in the URL is
// never sent on as a Referer (cf).
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

// The page reads ?t= (useSearchParams), which needs a Suspense boundary.
export default function NoticesUnsubscribeLayout({ children }: { children: React.ReactNode }) {
  return <Suspense>{children}</Suspense>;
}
