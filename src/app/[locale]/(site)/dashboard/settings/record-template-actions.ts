"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isActiveProfessional } from "@/lib/activeAccess";
import { serverFlag } from "@/lib/myDoctors";
import { cleanTemplate, parseTemplateSections, type RecordTemplate, type TemplateSection } from "@/lib/recordTemplates";

// Settings → Record templates (1.8.0 D; migration 189). The doctor's own
// rows (RLS "record_templates: own"); the database checks the shape and the
// 50-template cap too. Behind the server flag 'record_templates'.

export type TemplateError = "notEnabled" | "notDoctor" | "name" | "sections" | "title" | "hint" | "limit" | "failed";

async function doctorClient() {
  const supabase = await createClient({ acting: false });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  if ((await isActiveProfessional(supabase, user.id)) !== true) return null;
  return { supabase, uid: user.id };
}

export async function listRecordTemplates(): Promise<{ ok: true; rows: RecordTemplate[] } | { ok: false; code: TemplateError }> {
  const c = await doctorClient();
  if (!c) return { ok: false, code: "notDoctor" };
  if (!(await serverFlag(c.supabase, "record_templates"))) return { ok: false, code: "notEnabled" };
  const { data, error } = await c.supabase
    .from("record_templates")
    .select("id, name, sections, position")
    .eq("professional_id", c.uid)
    .order("position")
    .order("created_at");
  if (error) return { ok: false, code: "failed" };
  return {
    ok: true,
    rows: (data ?? []).map((r) => ({ id: r.id as string, name: r.name as string, sections: parseTemplateSections(r.sections), position: (r.position as number) ?? 0 })),
  };
}

// id null = a new template.
export async function saveRecordTemplate(id: string | null, input: { name: string; sections: TemplateSection[] }):
  Promise<{ ok: true; row: RecordTemplate } | { ok: false; code: TemplateError }> {
  if (id !== null && (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))) return { ok: false, code: "failed" };
  const t = cleanTemplate(input);
  if (!t.ok) return { ok: false, code: t.error };
  const c = await doctorClient();
  if (!c) return { ok: false, code: "notDoctor" };
  if (!(await serverFlag(c.supabase, "record_templates"))) return { ok: false, code: "notEnabled" };

  const q = id
    ? c.supabase.from("record_templates").update({ name: t.name, sections: t.sections }).eq("id", id).eq("professional_id", c.uid)
    : c.supabase.from("record_templates").insert({ professional_id: c.uid, name: t.name, sections: t.sections });
  const { data, error } = await q.select("id, name, sections, position").maybeSingle();
  if (error) return { ok: false, code: error.message?.includes("template_limit_reached") ? "limit" : error.message?.includes("invalid_sections") ? "sections" : "failed" };
  if (!data) return { ok: false, code: "failed" };
  revalidatePath("/dashboard/settings");
  return { ok: true, row: { id: data.id as string, name: data.name as string, sections: parseTemplateSections(data.sections), position: (data.position as number) ?? 0 } };
}

export async function deleteRecordTemplate(id: string): Promise<{ ok: boolean }> {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return { ok: false };
  const c = await doctorClient();
  if (!c) return { ok: false };
  const { error } = await c.supabase.from("record_templates").delete().eq("id", id).eq("professional_id", c.uid);
  if (!error) revalidatePath("/dashboard/settings");
  return { ok: !error };
}
