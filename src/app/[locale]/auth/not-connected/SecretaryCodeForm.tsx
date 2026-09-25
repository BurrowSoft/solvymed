"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { normalizeSecretaryCode } from "@/lib/secretary";

// Hands a typed code off to the invite page, which previews the invite and
// offers Accept/Decline.
export function SecretaryCodeForm({ locale }: { locale: string }) {
  const t = useTranslations("secretary");
  const router = useRouter();
  const prefix = locale === "en" ? "" : `/${locale}`;
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizeSecretaryCode(code);
    if (!normalized) {
      setError(t("codeRequired"));
      return;
    }
    router.push(`${prefix}/join/secretary/${encodeURIComponent(normalized)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="secretary-code" className="field-label">{t("codeLabel")}</label>
        <input
          id="secretary-code"
          type="text"
          value={code}
          onChange={(e) => { setCode(e.target.value); setError(""); }}
          placeholder="S-XXXXXXXX"
          maxLength={20}
          autoComplete="off"
          className="w-full rounded-xl border border-teal-200 bg-white px-4 py-3 text-base font-mono tracking-widest uppercase text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        />
      </div>
      {error && <div className="error-banner">{error}</div>}
      <button
        type="submit"
        className="w-full rounded-xl bg-teal-600 px-6 py-3.5 text-base font-bold text-white shadow-md transition hover:bg-teal-700"
      >
        {t("continue")}
      </button>
    </form>
  );
}
