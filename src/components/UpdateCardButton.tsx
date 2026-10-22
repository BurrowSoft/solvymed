"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { DemoGate, useDemo, useDemoSession } from "@/components/DemoGate";

// Opens the Stripe Customer Portal: "Atualizar cartão" on /subscribe after
// a failed renewal, "Gerenciar assinatura" in Settings (returnTo).
function UpdateCardButtonInner({ locale, label, returnTo }: { locale: string; label?: string; returnTo?: "settings" }) {
  const t = useTranslations("subscription");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, returnTo }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(t(data.code === "portal_unavailable" ? "portalUnavailable" : "portalError"));
    } catch {
      setError(t("errorNetwork"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className="w-full rounded-xl bg-teal-600 px-6 py-3.5 text-sm font-bold text-white shadow hover:bg-teal-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? "…" : label ?? t("updateCard")}
      </button>
      {error && <p className="text-center text-xs text-red-500">{error}</p>}
    </div>
  );
}

// Demo mode (specs/demo-mode.md, 234 §5): in a demo this is shown inert with
// "Disponível na sua conta" + the sign-up CTA; the server refuses it anyway.
export function UpdateCardButton(props: Parameters<typeof UpdateCardButtonInner>[0]) {
  const { demo } = useDemo();
  const session = useDemoSession();
  return (
    <DemoGate demo={demo || session}>
      <UpdateCardButtonInner {...props} />
    </DemoGate>
  );
}
