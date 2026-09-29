"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card } from "./SettingsClient";
import { UpdateCardButton } from "@/components/UpdateCardButton";
import type { PlanSummary } from "@/lib/subscription";

// Settings → Assinatura (doctor only): the plan's status and, for a Stripe
// subscription, the way into the Stripe portal (card, invoices). Before
// this an active subscriber had no way in: /subscribe sends them to the
// dashboard and "Atualizar cartão" only shows after a failed renewal.
export function SubscriptionPanel({ plan, canManage, locale }: { plan: PlanSummary; canManage: boolean; locale: string }) {
  const t = useTranslations("settings");
  const prefix = locale === "en" ? "" : `/${locale}`;
  const status =
    plan.kind === "active" ? t("subscriptionActive")
    : plan.kind === "lifetime" ? t("subscriptionLifetime")
    : plan.kind === "trial" ? t("subscriptionTrial", { n: plan.daysLeft })
    : t("subscriptionInactive");

  return (
    <Card title={t("subscriptionTitle")}>
      <p className="text-sm font-semibold text-slate-900">{status}</p>
      <div className="mt-4 max-w-xs">
        {canManage ? (
          <UpdateCardButton locale={locale} label={t("manageSubscription")} returnTo="settings" />
        ) : plan.kind === "trial" || plan.kind === "inactive" ? (
          <Link href={`${prefix}/subscribe`} className="inline-block rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-700">
            {t("subscriptionSubscribe")}
          </Link>
        ) : null}
      </div>
    </Card>
  );
}
