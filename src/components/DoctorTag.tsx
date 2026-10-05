// The "All" schedule (166): whose appointment or request this is, as a dot
// in the doctor's colour (lib/doctorPalette: by her list's order, never the
// brand colour) + their name with the brand title. short: the title, first
// and last name (shortDoctorName), for the week and month views. calendar: that doctor's practice
// calendar, for the row's own dates.
import type { DateCalendar } from "@/lib/dateLabels";

export type DoctorTagInfo = { id: string; name: string; short: string; color: string; calendar?: DateCalendar };

export function DoctorDot({ color, className = "h-2 w-2" }: { color: string; className?: string }) {
  return <span aria-hidden="true" className={`${className} shrink-0 rounded-full`} style={{ backgroundColor: color }} />;
}

export function DoctorTag({ info, short = false }: { info: DoctorTagInfo; short?: boolean }) {
  return (
    <p data-testid="doctor-tag" className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
      <DoctorDot color={info.color} />
      <span className="truncate">{short ? info.short : info.name}</span>
    </p>
  );
}
