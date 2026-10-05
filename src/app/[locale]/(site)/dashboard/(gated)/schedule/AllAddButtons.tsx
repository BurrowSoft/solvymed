"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { RowPractice } from "@/components/RowPractice";
import { ItemCalendar } from "@/components/PracticeCalendar";
import { DoctorDot, type DoctorTagInfo } from "@/components/DoctorTag";
import { BlockTimeButton, NewAppointmentButton } from "./ScheduleClient";
import type { RowPracticeCtx } from "./ScheduleRow";

// "Todos" (166): a new appointment or a block asks for the doctor first
// (preselected from the chip filter), then uses that doctor's procedures,
// prices and hours; it's saved for that doctor (RowPractice → actForRow).
export function AllAddButtons({ doctors, defaultDate, preselected }: {
  doctors: { tag: DoctorTagInfo; ctx: RowPracticeCtx }[];
  defaultDate: string;
  preselected: string | null;
}) {
  const t = useTranslations("secretaryPractices");
  const [id, setId] = useState(preselected && doctors.some((d) => d.tag.id === preselected) ? preselected : doctors[0]?.tag.id ?? "");
  const chosen = doctors.find((d) => d.tag.id === id);
  if (!chosen) return null;
  return (
    <div data-testid="all-add" className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <span className="font-semibold">{t("doctorField")}</span>
        <DoctorDot color={chosen.tag.color} className="h-2.5 w-2.5" />
        <select value={id} onChange={(e) => setId(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-semibold text-slate-800">
          {doctors.map((d) => <option key={d.tag.id} value={d.tag.id}>{d.tag.name}</option>)}
        </select>
      </label>
      {/* Keyed by the doctor: a new choice is a fresh form for that doctor. */}
      <RowPractice key={id} id={id}>
        <ItemCalendar calendar={chosen.tag.calendar}>
          <BlockTimeButton defaultDate={defaultDate} />
          <NewAppointmentButton defaultDate={defaultDate} currency={chosen.ctx.currency} procedures={chosen.ctx.procedures} />
        </ItemCalendar>
      </RowPractice>
    </div>
  );
}
