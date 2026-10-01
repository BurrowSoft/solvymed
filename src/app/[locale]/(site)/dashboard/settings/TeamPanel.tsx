"use client";

import { useEffect, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card } from "./SettingsClient";
import { createSecretaryInvite, revokeSecretaryInvite, removeSecretary, sendSecretaryInviteEmail, type InviteEmailResult } from "./team-actions";
import { conditionMet } from "@/lib/conditions";
import { dateLocale } from "@/lib/dateLabels";
import { withCountryHint } from "@/lib/signupCountry";

export type TeamRow = {
  kind: "secretary" | "invite";
  id: string;
  email: string;
  name: string | null;
  created_at: string;
  expires_at: string | null;
  // The last invite email (151's list_my_team): "Reenviar convite" waits 1 h.
  sent_at?: string | null;
};

const RESEND_GAP_MS = 60 * 60 * 1000;

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
// single-use, and expire in 7 days. The doctor shares the link or code
// (copy / WhatsApp); the code is only shown right after creating it, and
// "Resend" creates a fresh one for the same email. With
// secretary-invite-email-live (151 + the privacy text) the invite is also
// emailed on create, and "Reenviar convite" emails a fresh one (once an hour).
// whatsapp: the share button only where the practice uses WhatsApp (not
// in Thailand, item 12).
export function TeamPanel({ rows, loadFailed, whatsapp = true, country = null }: { rows: TeamRow[]; loadFailed: boolean; whatsapp?: boolean; country?: string | null }) {
  const t = useTranslations("secretary");
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState<"" | "link" | "code">("");
  const [pending, start] = useTransition();
  const emailLive = conditionMet("secretary-invite-email-live");
  const [notice, setNotice] = useState("");
  // "Now" after mount (no hydration mismatch), ticking so a waiting
  // "Reenviar convite" turns on by itself.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!emailLive) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [emailLive]);
  const time = (iso: string) => new Date(iso).toLocaleTimeString(dateLocale(locale), { hour: "2-digit", minute: "2-digit" });
  const nextAt = (r: TeamRow) => (r.sent_at ? new Date(new Date(r.sent_at).getTime() + RESEND_GAP_MS).toISOString() : null);
  // The function's refusals (151): too soon / already sent / the daily cap.
  const emailError = (r: Extract<InviteEmailResult, { ok: false }>) => {
    if ((r.code === "resend_too_soon" || r.code === "already_sent") && r.nextAt) return t("teamAlreadySent", { time: time(r.nextAt) });
    if (r.code === "daily_limit" && r.nextAt) return t("teamDailyLimit", { time: time(r.nextAt) });
    return t("teamSendFailed");
  };

  const full = rows.length >= TEAM_LIMIT;
  const members = rows.filter((r) => r.kind === "secretary");
  const invites = rows.filter((r) => r.kind === "invite");

  // No email in the link: URLs end up in history, logs and referrers. The
  // invite page shows a masked hint instead, and the server matches the
  // email on accept. Unprefixed, like every link shared with someone else:
  // the recipient's own browser language decides.
  const shareLink = (c: Created) =>
    withCountryHint(`${window.location.origin}/join/secretary/${encodeURIComponent(c.code)}`, country);

  function invite(targetEmail: string) {
    setError("");
    setNotice("");
    setCreated(null);
    start(async () => {
      const result = await createSecretaryInvite(targetEmail);
      if (!result.ok) {
        setError(t(ERROR_KEY[result.code] ?? "genericError"));
        return;
      }
      const to = targetEmail.trim().toLowerCase();
      setCreated({ code: result.code, email: to });
      setEmail("");
      // The first email goes out by itself; the share buttons stay.
      if (emailLive) {
        const sent = await sendSecretaryInviteEmail({ code: result.code });
        if (sent.ok) setNotice(t("teamEmailSent", { email: to }));
        else setError(emailError(sent));
      }
      router.refresh();
    });
  }

  // "Reenviar convite": a fresh invite emailed to the same address (the old
  // code stops working); its new code shows once, as on create.
  function resendEmail(row: TeamRow) {
    if (!window.confirm(t("teamResendConfirm", { email: row.email }))) return;
    setError("");
    setNotice("");
    setCreated(null);
    start(async () => {
      const sent = await sendSecretaryInviteEmail({ resend_email: row.email });
      if (!sent.ok) {
        setError(emailError(sent));
        // The email failed (not a wait): a fresh code to share right here,
        // as the message says ("…ou compartilhe o link"; e7).
        if (!sent.nextAt) {
          const fresh = await createSecretaryInvite(row.email);
          if (fresh.ok) setCreated({ code: fresh.code, email: row.email });
        }
      } else {
        if (sent.code) setCreated({ code: sent.code, email: row.email });
        setNotice(t("teamEmailSent", { email: row.email }));
      }
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
            {invites.map((inv) => {
              const waitUntil = emailLive ? nextAt(inv) : null;
              const tooSoon = !!waitUntil && (now === null || now < new Date(waitUntil).getTime());
              return (
              <li key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-900">{inv.email}</p>
                  {inv.expires_at && (
                    <p className="text-xs text-slate-500">
                      {t("teamExpires", { date: new Date(inv.expires_at).toLocaleDateString(dateLocale(locale)) })}
                    </p>
                  )}
                  {tooSoon && waitUntil && <p data-testid="resend-wait" className="text-xs text-slate-500">{t("teamResendAt", { time: time(waitUntil) })}</p>}
                </div>
                <div className="flex shrink-0 gap-3">
                  <button
                    type="button"
                    onClick={() => { if (emailLive) resendEmail(inv); else if (window.confirm(t("teamResendConfirm", { email: inv.email }))) invite(inv.email); }}
                    disabled={pending || tooSoon}
                    className="text-sm font-semibold text-teal-600 hover:text-teal-700 disabled:opacity-60"
                  >
                    {emailLive ? t("teamResendEmail") : t("teamResend")}
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
              );
            })}
          </ul>
        </div>
      )}

      {notice && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-800">{notice}</p>}

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
            {whatsapp && (
              <a
                href={`https://wa.me/?text=${encodeURIComponent(t("teamWhatsAppText", { link: shareLink(created) }))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                WhatsApp
              </a>
            )}
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
