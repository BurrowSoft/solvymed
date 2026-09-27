"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { SetupProgress } from "@/lib/setup";
import { ackSetupCompleted, setSetupHidden } from "@/lib/setupActions";
import { ShareInviteLinkButton } from "@/components/ShareInviteLinkButton";

// The doctor's first-run checklist on Home (first-run spec §2). The state
// comes from get_setup_progress(); each CTA goes to the page that completes
// the step. "Start setup" on the welcome page opens it expanded (?setup=1).
export function SetupChecklist({ progress, locale, inviteCode, expanded: initiallyExpanded }: {
  progress: SetupProgress;
  locale: string;
  inviteCode: string | null;
  expanded: boolean;
}) {
  const t = useTranslations("setup");
  const prefix = locale === "en" ? "" : `/${locale}`;
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (initiallyExpanded) ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [initiallyExpanded]);

  const done = Math.min(progress.done_count, 6);

  // 6 of 6: the one-time "ready" message, then the card is gone for good.
  if (done >= 6) {
    return (
      <section ref={ref} className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-100 bg-teal-50 p-5">
        <p className="font-bold text-teal-900">{t("ready")}</p>
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => { await ackSetupCompleted(); })}
          className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-teal-700 disabled:opacity-60"
        >
          {t("gotIt")}
        </button>
      </section>
    );
  }

  const items: { key: string; done: boolean; cta: React.ReactNode }[] = [
    { key: "profile", done: progress.profile_done, cta: <CtaLink href={`${prefix}/dashboard/settings#profile`}>{t("profileCta")}</CtaLink> },
    { key: "hours", done: progress.hours_done, cta: <CtaLink href={`${prefix}/dashboard/settings#hours`}>{t("hoursCta")}</CtaLink> },
    { key: "procedure", done: progress.procedure_done, cta: <CtaLink href={`${prefix}/dashboard/settings#procedures`}>{t("procedureCta")}</CtaLink> },
    { key: "patient", done: progress.patient_done, cta: <CtaLink href={`${prefix}/dashboard/patients?new=1`}>{t("patientCta")}</CtaLink> },
    { key: "appointment", done: progress.appointment_done, cta: <CtaLink href={`${prefix}/dashboard/schedule?new=1`}>{t("appointmentCta")}</CtaLink> },
    { key: "invite", done: progress.invite_shared, cta: <ShareInviteLinkButton code={inviteCode} size="sm" /> },
  ];

  return (
    <section ref={ref} className="mb-8 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="flex flex-1 items-center gap-3 text-left"
        >
          <span className="text-base font-bold text-slate-900">{t("title")}</span>
          <span className="text-sm text-slate-500">{t("progress", { done })}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-4 w-4 text-slate-400 transition ${expanded ? "rotate-180" : ""}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => { await setSetupHidden(true); })}
          className="text-xs font-semibold text-slate-400 transition hover:text-slate-600"
        >
          {t("hide")}
        </button>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={6} aria-valuenow={done}>
        <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${(done / 6) * 100}%` }} />
      </div>

      {expanded && (
        <>
          <ol className="mt-4 divide-y divide-slate-100">
            {items.map((item) => (
              <li key={item.key} className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex items-center gap-2.5 text-sm">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${item.done ? "bg-teal-600 text-white" : "border border-slate-300"}`}>
                    {item.done && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3 w-3"><polyline points="20 6 9 17 4 12" /></svg>
                    )}
                  </span>
                  <span className={item.done ? "text-slate-400 line-through" : "font-medium text-slate-800"}>{t(item.key)}</span>
                </span>
                {!item.done && item.cta}
              </li>
            ))}
          </ol>
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("alsoUseful")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <CtaLink href={`${prefix}/dashboard/settings#clinic`}>{t("pix")}</CtaLink>
              <CtaLink href={`${prefix}/dashboard/settings#team`}>{t("secretary")}</CtaLink>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function CtaLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="shrink-0 rounded-xl border border-teal-600 px-3 py-1.5 text-xs font-bold text-teal-700 transition hover:bg-teal-50">
      {children}
    </Link>
  );
}
