"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// After "Desconectar" (01, 10-26): the connect page is opened with ?left=<that doctor>. When
// the patient has Patient Channel messages there, "Ver mensagens anteriores" leads to them
// (read-only, #634). Only the patient's OWN rows decide it (237's pc_my_requests, as the
// caller), and no name is looked up: the public doctor lookup answers nothing once the
// patient is disconnected, and it must not be widened (01; #636 ❌). A later visit without
// ?left= shows nothing (accepted for now: there is no "practices where I have requests" read).
export function LeftDoctorMessages() {
  const t = useTranslations("patientChannel.patient");
  const { locale } = useParams<{ locale: string }>();
  const prefix = locale === "en" ? "" : `/${locale}`;
  const left = useSearchParams()?.get("left") ?? "";
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!UUID.test(left)) return;
    let live = true;
    void (async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("pc_my_requests", { p_prof: left });
      if (live && !error && Array.isArray(data) && data.length > 0) setShow(true);
    })().catch(() => undefined);
    return () => { live = false; };
  }, [left]);

  if (!show) return null;
  return (
    <a href={`${prefix}/my-appointments/channel/${left}`} data-testid="pc-left-messages"
      className="mt-4 block text-center text-sm font-semibold text-teal-700 underline">
      {t("earlierLink")}
    </a>
  );
}
