"use client";

import { useState } from "react";

interface Props {
  provider: "stripe" | "asaas";
  locale: string;
  label: string;
  sublabel?: string;
  userName?: string;
  userEmail?: string;
}

export function SubscribeButton({ provider, locale, label, sublabel, userName, userEmail }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const endpoint = provider === "stripe" ? "/api/checkout/stripe" : "/api/checkout/asaas";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, name: userName, email: userEmail }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError("Could not initiate checkout. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
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
        {loading ? "…" : label}
      </button>
      {sublabel && <p className="text-center text-xs text-slate-400">{sublabel}</p>}
      {error && <p className="text-center text-xs text-red-500">{error}</p>}
    </div>
  );
}
