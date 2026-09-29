"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card } from "./SettingsClient";

// Settings → "Exportar pacientes (CSV)" (Help P10, doctor only). The file
// comes from /api/patients/export, which logs every exported patient first
// and refuses when it can't (UX 36): then the message says so.
export function ExportPatientsCard({ locale }: { locale: string }) {
  const t = useTranslations("settings");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function exportCsv() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/patients/export?locale=${encodeURIComponent(locale)}`, { credentials: "same-origin" });
      if (!res.ok) {
        const code = (await res.json().catch(() => ({}))).code;
        setError(code === "access_log_failed" ? t("exportAccessLogFailed") : t("exportFailed"));
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `solvymed-${t("exportFileName")}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError(t("exportFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={t("exportTitle")} description={t("exportHint")}>
      <button type="button" disabled={busy} onClick={() => void exportCsv()} className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-60">
        {busy ? "…" : t("exportButton")}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </Card>
  );
}
