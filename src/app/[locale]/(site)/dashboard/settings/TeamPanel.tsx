"use client";

import { useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card } from "./SettingsClient";
import { createSecretaryInvite, revokeSecretaryInvite, removeSecretary } from "./team-actions";

export type TeamRow = {
  kind: "secretary" | "invite";
  id: string;
  email: string;
  name: string | null;
  created_at: string;
  expires_at: string | null;
};

export const TEAM_LIMIT = 3;

const ERROR_KEY: Record<string, string> = {
  invalid_email: "teamInvalidEmail",
  cannot_invite_self: "teamCannotInviteSelf",
  team_limit_reached: "teamLimitReached",
  invite_not_found: "teamInviteNotFound",
  secretary_not_found: "teamSecretaryNotFound",
};

type Created = { code: string; email: string };

// Settings → Team (doctor only). Invites are bound to an email,
// single-use, and expire in 7 days. Nothing is emailed: the doctor shares
// the link or code (copy / WhatsApp). The code is only shown right after
// creating it; "Resend" creates a fresh one for the same email.
export function TeamPanel({ rows, loadFailed }: { rows: TeamRow[]; loadFailed: boolean }) {
  const t = useTranslations("secretary");
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState<"" | "link" | "code">("");
  const [pending, start] = useTransition();

  const full = rows.length >= TEAM_LIMIT;
  const members = rows.filter((r) => r.kind === "secretary");
  const invites = rows.filter((r) => r.kind === "invite");

  // No email in the link: URLs end up in history, logs and referrers. The
  // invite page shows a masked hint instead, and the server matches the
  // email on accept. Unprefixed, like every link shared with someone else:
  // the recipient's own browser language decides.
  const shareLink = (c: Created) =>
    `${window.location.origin}/join/secretary/${encodeURIComponent(c.code)}`;

  function invite(targetEmail: string) {
    setError("");
    setCreated(null);
    start(async () => {
      const result = await createSecretaryInvite(targetEmail);
      if (!result.ok) {
        setError(t(ERROR_KEY[result.code] ?? "genericError"));
        return;
      }
      setCreated({ code: result.code, email: targetEmail.trim().toLowerCase() });
      setEmail("");
      router.refresh();
    });
  }

  function revoke(id: string) {
    if (!window.confirm(t("teamRevokeConfirm"))) return;
    setError("");
    start(async () => {
      const result = await revokeSecretaryInvite(id);
      if (!result.ok) setError(t(ERROR_KEY[result.code] ?? "genericError"));
      else router.refresh();
    });
  }

  function remove(row: TeamRow) {
    if (!window.confirm(t("teamRemoveConfirm", { name: row.name ?? row.email }))) return;
    setError("");
    start(async () => {
      const result = await removeSecretary(row.id);
      if (!result.ok) setError(t(ERROR_KEY[result.code] ?? "genericError"));
      else router.refresh();
    });
  }

  function copy(text: string, what: "link" | "code") {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(""), 2000);
    }).catch(() => {});
  }

  return (
    <Card id="team" title={t("teamTitle")} description={t("teamSub")}>
      {loadFailed && <div className="error-banner mb-4">{t("teamLoadError")}</div>}

      {members.length > 0 && (
        <ul className="mb-4 divide-y divide-slate-100 rounded-xl border border-slate-100">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{m.name ?? m.email}</p>
                {m.name && <p className="truncate text-xs text-slate-500">{m.email}</p>}
              </div>
              <button
                type="button"
                onClick={() => remove(m)}
                disabled={pending}
                className="shrink-0 text-sm font-semibold text-red-600 hover:text-red-700 disabled:opacity-60"
              >
                {t("teamRemove")}
              </button>
            </li>
          ))}
        </ul>
      )}

      {invites.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("teamPending")}</p>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {invites.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-900">{inv.email}</p>
                  {inv.expires_at && (
                    <p className="text-xs text-slate-500">
                      {t("teamExpires", { date: new Date(inv.expires_at).toLocaleDateString(locale) })}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-3">
                  <button
                    type="button"
                    onClick={() => { if (window.confirm(t("teamResendConfirm", { email: inv.email }))) invite(inv.email); }}
                    disabled={pending}
                    className="text-sm font-semibold text-teal-600 hover:text-teal-700 disabled:opacity-60"
                  >
                    {t("teamResend")}
                  </button>
                  <button
                    type="button"
                    onClick={() => revoke(inv.id)}
                    disabled={pending}
                    className="text-sm font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-60"
                  >
                    {t("teamRevoke")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {created && (
        <div className="mb-4 rounded-xl border border-teal-100 bg-teal-50/60 p-4">
          <p className="mb-2 text-sm font-semibold text-teal-800">{t("teamCreated", { email: created.email })}</p>
          <p className="mb-3 text-xs text-teal-700">{t("teamCreatedHint")}</p>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-teal-200 bg-white px-3 py-1.5 font-mono text-sm font-bold tracking-widest text-slate-900">
              {created.code}
            </span>
            <button type="button" onClick={() => copy(created.code, "code")} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              {copied === "code" ? t("copied") : t("copyCode")}
            </button>
            <button type="button" onClick={() => copy(shareLink(created), "link")} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              {copied === "link" ? t("copied") : t("copyLink")}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(t("teamWhatsAppText", { link: shareLink(created) }))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              WhatsApp
            </a>
          </div>
        </div>
      )}

      {error && <div className="error-banner mb-4">{error}</div>}

      <form
        onSubmit={(e) => { e.preventDefault(); if (email.trim()) invite(email); }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("teamEmailPlaceholder")}
          aria-label={t("teamEmailPlaceholder")}
          disabled={full || pending}
          className="w-full flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-100 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={full || pending}
          className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-60"
        >
          {pending ? "…" : t("teamInvite")}
        </button>
      </form>
      {full && <p className="mt-2 text-xs text-slate-500">{t("teamFull", { n: TEAM_LIMIT })}</p>}
    </Card>
  );
}
