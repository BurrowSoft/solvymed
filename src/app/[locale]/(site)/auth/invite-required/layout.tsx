import type { ReactNode } from "react";

// Rendered per request, as the login (it reads ?code= with useSearchParams:
// why the code saved at sign-up didn't link).
export const dynamic = "force-dynamic";

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
