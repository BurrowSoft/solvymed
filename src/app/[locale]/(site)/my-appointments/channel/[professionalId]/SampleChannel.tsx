"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { SAMPLE_PAGE, samplePreview, sampleSubmit } from "@/lib/patientChannel/patientPage";
import { PatientChannelFlow } from "@/components/patientChannel/PatientChannelFlow";

// The preview test (?pc_test=1 off Production, M4a): the patient flow on the
// prototype's sample practice, /preview and the submit stubbed in the browser. Nothing
// is sent or stored. The real page (pc_patient_page, the routes) comes with 237.
export function SampleChannel() {
  const t = useTranslations("patientChannel.patient");
  const preview = useMemo(() => samplePreview(), []);
  const submit = useMemo(() => sampleSubmit(), []);
  return <PatientChannelFlow page={SAMPLE_PAGE} preview={preview} submit={submit} banner={t("sampleBanner")} />;
}
