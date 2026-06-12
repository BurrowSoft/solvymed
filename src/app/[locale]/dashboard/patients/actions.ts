"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createPatient(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const fullName = (formData.get("full_name") as string)?.trim();
  if (!fullName) return { error: "Full name is required" };

  const email = (formData.get("email") as string)?.trim().toLowerCase() || null;

  // Duplicate email check
  if (email) {
    const { data: existing } = await supabase
      .from("patients")
      .select("id, full_name")
      .eq("professional_id", user.id)
      .ilike("email", email)
      .limit(1);
    if (existing?.length) return { error: `A patient with this email already exists: ${existing[0].full_name}` };
  }

  const { error } = await supabase.from("patients").insert({
    professional_id: user.id,
    full_name: fullName,
    email,
    phone: (formData.get("phone") as string)?.trim() || null,
    cpf: (formData.get("cpf") as string)?.trim() || null,
    sex: (formData.get("sex") as string) || null,
    birth_date: (formData.get("birth_date") as string) || null,
    profession: (formData.get("profession") as string)?.trim() || null,
    emergency_phone: (formData.get("emergency_phone") as string)?.trim() || null,
    convenio_type: (formData.get("convenio_type") as string) || null,
  });

  if (error) {
    if (error.code === "23505") return { error: "A patient with this email already exists." };
    return { error: error.message };
  }
  revalidatePath("/dashboard/patients");
  return { success: true };
}

export async function updatePatient(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const fullName = (formData.get("full_name") as string)?.trim();
  if (!fullName) return { error: "Full name is required" };

  const { error } = await supabase.from("patients").update({
    full_name: fullName,
    email: (formData.get("email") as string)?.trim().toLowerCase() || null,
    phone: (formData.get("phone") as string)?.trim() || null,
    cpf: (formData.get("cpf") as string)?.trim() || null,
    sex: (formData.get("sex") as string) || null,
    birth_date: (formData.get("birth_date") as string) || null,
    profession: (formData.get("profession") as string)?.trim() || null,
    emergency_phone: (formData.get("emergency_phone") as string)?.trim() || null,
    convenio_type: (formData.get("convenio_type") as string) || null,
  }).eq("id", id).eq("professional_id", user.id);

  if (error) return { error: error.message };
  revalidatePath(`/dashboard/patients/${id}`);
  revalidatePath("/dashboard/patients");
  return { success: true };
}

export async function deletePatient(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase.from("patients").delete().eq("id", id).eq("professional_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/patients");
  return { success: true };
}

export async function createRecord(patientId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const content = (formData.get("content") as string)?.trim();
  if (!content) return { error: "Record content is required" };

  const now = new Date();
  const { error } = await supabase.from("medical_records").insert({
    patient_id: patientId,
    professional_id: user.id,
    date: now.toISOString().split("T")[0],
    time: now.toTimeString().slice(0, 5),
    content,
    record_type: (formData.get("record_type") as string) || "free_text",
  });

  if (error) return { error: error.message };
  revalidatePath(`/dashboard/patients/${patientId}`);
  return { success: true };
}

export async function deleteRecord(id: string, patientId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase.from("medical_records").delete().eq("id", id).eq("professional_id", user.id);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/patients/${patientId}`);
  return { success: true };
}

export async function createPrescription(patientId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const notes = (formData.get("notes") as string)?.trim() || null;
  const date = new Date().toISOString().split("T")[0];

  const { data: prescription, error: pError } = await supabase
    .from("prescriptions")
    .insert({ patient_id: patientId, professional_id: user.id, date, notes })
    .select()
    .single();

  if (pError) return { error: pError.message };

  // Parse medications from form (name_0, dosage_0, frequency_0, duration_0, ...)
  const items: { prescription_id: string; name: string; dosage: string; frequency: string; duration: string }[] = [];
  let i = 0;
  while (formData.get(`name_${i}`) !== null) {
    const name = (formData.get(`name_${i}`) as string)?.trim();
    if (name) {
      items.push({
        prescription_id: prescription.id,
        name,
        dosage: (formData.get(`dosage_${i}`) as string)?.trim() || "",
        frequency: (formData.get(`frequency_${i}`) as string)?.trim() || "",
        duration: (formData.get(`duration_${i}`) as string)?.trim() || "",
      });
    }
    i++;
  }

  if (items.length === 0) {
    await supabase.from("prescriptions").delete().eq("id", prescription.id);
    return { error: "Add at least one medication" };
  }

  const { error: iError } = await supabase.from("prescription_items").insert(items);
  if (iError) return { error: iError.message };

  revalidatePath(`/dashboard/patients/${patientId}`);
  return { success: true };
}

export async function toggleBookingBlock(patientId: string, blocked: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("patients")
    .update({ booking_blocked: blocked })
    .eq("id", patientId)
    .eq("professional_id", user.id);

  if (error) return { error: error.message };
  revalidatePath(`/dashboard/patients/${patientId}`);
  revalidatePath("/dashboard/patients");
  return { success: true };
}

export async function deletePrescription(id: string, patientId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  await supabase.from("prescription_items").delete().eq("prescription_id", id);
  const { error } = await supabase.from("prescriptions").delete().eq("id", id).eq("professional_id", user.id);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/patients/${patientId}`);
  return { success: true };
}
