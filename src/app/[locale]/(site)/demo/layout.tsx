import type { ReactNode } from "react";

// Rendered per request: the page reads the session and the query (a static
// prerender of a useSearchParams page fails the build, #591's lesson).
export const dynamic = "force-dynamic";

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
