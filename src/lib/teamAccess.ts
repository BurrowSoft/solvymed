// A secretary's teams in one string: her primary link plus, with several
// practices, every doctor she serves. When it changes (a doctor removed her,
// she joined another), the open dashboard re-renders, so she moves to her
// next practice or to "not part of any team" (cf, 6 Oct). null = unknown.
export function teamAccessKey(primary: string | null | undefined, practiceIds: string[] | null): string {
  const base = primary ?? "none";
  return practiceIds ? `${base}|${[...practiceIds].sort().join(",")}` : base;
}
