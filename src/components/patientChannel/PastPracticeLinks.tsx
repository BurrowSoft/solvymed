"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { toPastPractices, type PastPractice } from "@/lib/patientChannel/patientPage";

// "Ver mensagens anteriores com {doctor}" (01, 10-27; replaces the ?left= one-shot link):
// every practice where the patient has their own Patient Channel requests but no connection
// any more, the latest first: disconnected, removed, a closed practice or an archived record
// (a patient can always read what they sent). Read as the patient (migration 251's
// pc_my_past_practices: own rows only, [] while the channel is paused). Each opens the
// read-only channel page. Nothing is shown when there's none.
export function PastPracticeLinks({ className = "" }: { className?: string }) {
  const t = useTranslations("patientChannel.patient");
  const { locale } = useParams<{ locale: string }>();
  const prefix = locale === "en" ? "" : `/${locale}`;
  const [practices, setPractices] = useState<PastPractice[]>([]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const { data, error } = await createClient().rpc("pc_my_past_practices");
      if (live && !error) setPractices(toPastPractices(data));
    })().catch(() => undefined);
    return () => { live = false; };
  }, []);

  if (practices.length === 0) return null;
  return (
    <ul data-testid="pc-past-practices" className={`flex flex-col gap-1 ${className}`}>
      {practices.map((p) => (
        <li key={p.id}>
          <a href={`${prefix}/my-appointments/channel/${p.id}`} className="text-sm font-semibold text-teal-700 underline">
            {t("earlierWith", { doctor: p.displayName })}
          </a>
        </li>
      ))}
    </ul>
  );
}
