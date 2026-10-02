// "Always say who" (Vitor, build 25; 158): the doctor and the clinic of a
// visit, "Dra. Ana Souza · Clínica Sol". One alone if only one is set, never
// the same name twice (a solo doctor whose clinic name is their own).
export function whoLine(doctor: string | null | undefined, clinic: string | null | undefined): string {
  const d = (doctor ?? "").trim();
  const c = (clinic ?? "").trim();
  if (d && c && d.toLocaleLowerCase() === c.toLocaleLowerCase()) return d;
  return [d, c].filter(Boolean).join(" · ");
}
