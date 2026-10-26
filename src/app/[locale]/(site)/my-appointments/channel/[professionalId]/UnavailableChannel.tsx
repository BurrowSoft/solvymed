"use client";

import { useTranslations } from "next-intl";
import { ChannelUnavailableBody } from "@/components/patientChannel/PatientChannelFlow";

// The practice closed or the patient archived (237): "this channel isn't available", the
// emergency notice still in view (01).
export function UnavailableChannel({ emergencyNumber }: { emergencyNumber: string | null }) {
  const t = useTranslations("patientChannel.patient");
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3 p-4 sm:p-6">
      <ChannelUnavailableBody emergencyNumber={emergencyNumber ?? t("localNumber")} />
    </div>
  );
}
