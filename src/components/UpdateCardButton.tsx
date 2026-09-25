"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export function UpdateCardButton({ locale }: { locale: string }) {
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
        body: JSON.stringify({ locale }),
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
        {loading ? "…" : t("updateCard")}
      </button>
      {error && <p className="text-center text-xs text-red-500">{error}</p>}
    </div>
  );
}
