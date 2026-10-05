import type { ReactNode } from "react";

// Rendered per request, as before the landing went static (the layouts now
// set the locale from the route, which would otherwise prerender this page;
// it reads the query with useSearchParams).
export const dynamic = "force-dynamic";

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
