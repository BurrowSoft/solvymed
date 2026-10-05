// A doctor's colour wherever a secretary serving several doctors sees them
// side by side (166 "Todos": chips, dots, the Day view's columns; the
// switcher; Notifications per doctor). UX (6 Oct): a fixed, distinct
// palette by the doctor's place in her list (get_my_practices' order),
// never the doctor's brand colour, which can clash between two doctors.
// Always shown with the doctor's name, never colour alone. The app reuses
// these colours in this order; change both together.
// Each is readable on white (3:1 or more for a dot), and none is the
// dashboard's own teal.
export const DOCTOR_PALETTE = [
  "#1D4ED8", // blue
  "#C2410C", // orange
  "#15803D", // green
  "#7E22CE", // purple
  "#BE185D", // pink
  "#A16207", // ochre
  "#0F766E", // dark cyan
  "#475569", // slate
] as const;

export function doctorColor(index: number): string {
  const n = DOCTOR_PALETTE.length;
  return DOCTOR_PALETTE[((index % n) + n) % n];
}

// The colour of each doctor in her list, by id.
export function doctorColors(ids: readonly string[]): Map<string, string> {
  return new Map(ids.map((id, i) => [id, doctorColor(i)]));
}
