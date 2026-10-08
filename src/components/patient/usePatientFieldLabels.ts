"use client";

import { useTranslations } from "next-intl";
import type { FieldKey } from "@/lib/patientFields";

// 1.8.0 C1: each registration field's label, as the forms show it (the
// practice country's ID names). `missing` names the national ID the way the
// "Fill in" message reads it: a passport also counts (cf).
export function usePatientFieldLabels(country: string) {
  const t = useTranslations("patients");
  const tf = useTranslations("patientFields");
  const tIds = useTranslations("patientIds");
  const tAddr = useTranslations("patientAddress");
  const label = (k: FieldKey): string => {
    switch (k) {
      case "email": return t("email");
      case "birth_date": return t("dateOfBirth");
      case "national_id": return country === "BR" ? tIds("cpf") : country === "TH" ? tIds("thaiId") : tIds("passportOrId");
      case "rg_passport": return country === "BR" ? tf("rg") : tIds("passport");
      case "sex": return t("sex");
      case "profession": return t("profession");
      case "address": return tf("address");
      case "emergency_contact": return t("emergencyPhone");
      case "insurance": return t("insuranceType");
      case "notes": return tAddr("notes");
      case "cns": return tAddr("cns");
    }
  };
  // Thailand: the Thai ID or a passport fills it (cf); Brazil stays CPF only.
  const missing = (k: FieldKey): string =>
    k === "national_id" && country === "TH" ? tf("orPassport", { id: tIds("thaiId") }) : label(k);
  return { label, missing };
}
