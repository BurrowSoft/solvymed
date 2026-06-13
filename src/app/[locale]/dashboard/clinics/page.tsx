import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClinicsClient } from "./ClinicsClient";

export default async function ClinicsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: clinics } = await supabase
    .from("clinics")
    .select("id, name, address, city, state, country, phone, lat, lng")
    .eq("professional_id", user.id)
    .order("created_at", { ascending: false });

  return <ClinicsClient clinics={clinics ?? []} />;
}
