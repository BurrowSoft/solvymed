import { brandAccent, readableAccent } from "@/lib/readableAccent";

// The "All" schedule (166): whose appointment or request this is, as a dot
// in the doctor's colour (made readable) + their name with the brand title.
export type DoctorTagInfo = { id: string; name: string; accent: string | null };

export function DoctorTag({ info }: { info: DoctorTagInfo }) {
  const dot = readableAccent(brandAccent(info.accent), "#ffffff");
  return (
    <p data-testid="doctor-tag" className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
      <span className="truncate">{info.name}</span>
    </p>
  );
}
