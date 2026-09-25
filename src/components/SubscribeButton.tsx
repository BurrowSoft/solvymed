"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

interface Props {
  locale: string;
  label: string;
  sublabel?: string;
  userName?: string;
  userEmail?: string;
}

const ERROR_CODE_KEY: Record<string, string> = {
  already_subscribed: "errorAlreadySubscribed",
  wrong_role: "errorWrongRole",
  check_failed: "errorCheckFailed",
  checkout_failed: "errorGeneric",
};

export function SubscribeButton({ locale, label, sublabel, userName, userEmail }: Props) {
  const t = useTranslations("subscription");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function messageFor(code: string | undefined, fallbackKey: string): string {
    const key = (code && ERROR_CODE_KEY[code]) ?? fallbackKey;
    return t(key as Parameters<typeof t>[0]);
  }

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout/stripe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, name: userName, email: userEmail }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(messageFor(data.code, "errorGeneric"));
      }
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
        {loading ? "…" : label}
      </button>
      {sublabel && <p className="text-center text-xs text-slate-400">{sublabel}</p>}
      {error && <p className="text-center text-xs text-red-500">{error}</p>}
    </div>
  );
}
