// The phones of the patients an Agenda page shows, in one read, by patient
// id (G4's "Enviar Pix por WhatsApp"). Only non-empty phones; an error
// reads as none (the button just doesn't show).
type PhoneReader = {
  from: (t: "patients") => { select: (c: string) => { in: (col: string, ids: string[]) => PromiseLike<{ data: unknown; error: unknown }> } };
};

export async function patientPhones(supabase: unknown, ids: (string | null | undefined)[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return {};
  const { data, error } = await (supabase as PhoneReader).from("patients").select("id, phone").in("id", unique);
  if (error || !Array.isArray(data)) return {};
  const out: Record<string, string> = {};
  for (const r of data as { id: string; phone: string | null }[]) if (r.phone?.trim()) out[r.id] = r.phone.trim();
  return out;
}
