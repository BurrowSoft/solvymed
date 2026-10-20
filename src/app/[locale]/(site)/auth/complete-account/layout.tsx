import type { ReactNode } from "react";

// Rendered per request, like the login and sign-up: the page reads the query
// with useSearchParams, which a static prerender can't (the preview build
// failed without this).
export const dynamic = "force-dynamic";

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
