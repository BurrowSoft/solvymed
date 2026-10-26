"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { doctorDisplayName } from "@/lib/doctorName";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// After "Desconectar" (01, 10-26): the connect page is opened with ?left=<that doctor>. When
// the patient has Patient Channel messages there, "Ver mensagens anteriores com {doctor}"
// leads to them (read-only, #634). Only the patient's OWN rows decide it (237's
// pc_my_requests, as the caller); the doctor's name is read only after that, so an id they
// had no requests with shows nothing. A later visit without ?left= shows nothing either
// (accepted for now: there is no "practices where I have requests" read).
export function LeftDoctorMessages() {
  const t = useTranslations("patientChannel.patient");
  const { locale } = useParams<{ locale: string }>();
  const prefix = locale === "en" ? "" : `/${locale}`;
  const left = useSearchParams()?.get("left") ?? "";
  const [doctor, setDoctor] = useState<string | null>(null);

  useEffect(() => {
    if (!UUID.test(left)) return;
    let live = true;
    void (async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("pc_my_requests", { p_prof: left });
      if (!live || error || !Array.isArray(data) || data.length === 0) return;
      const { data: info } = await supabase.rpc("get_professional_public_info", { p_professional_id: left }).maybeSingle();
      const name = (info as { full_name?: string | null } | null)?.full_name?.trim();
      if (live && name) setDoctor(doctorDisplayName(name));
    })().catch(() => undefined);
    return () => { live = false; };
  }, [left]);

  if (!doctor) return null;
  return (
    <a href={`${prefix}/my-appointments/channel/${left}`} data-testid="pc-left-messages"
      className="mt-4 block text-center text-sm font-semibold text-teal-700 underline">
      {t("earlierWith", { doctor })}
    </a>
  );
}
