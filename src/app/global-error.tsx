"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Last-resort error boundary for errors in the root layout: reports to
// Sentry (scrubbed) and shows a minimal page. It renders outside the locale
// layout, so there are no translations here; the text is bilingual (pt/en).
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "3rem 1.5rem", textAlign: "center", color: "#0f172a" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "0.5rem" }}>Algo deu errado · Something went wrong</h1>
        <p style={{ color: "#64748b", marginBottom: "1.5rem" }}>
          Tente novamente em instantes. · Please try again in a moment.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{ background: "#0f766e", color: "#fff", border: 0, borderRadius: "0.75rem", padding: "0.75rem 1.5rem", fontWeight: 700 }}
        >
          Tentar novamente · Try again
        </button>
      </body>
    </html>
  );
}
