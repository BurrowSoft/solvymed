import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardSidebar } from "@/components/DashboardSidebar";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale === "en" ? "" : locale + "/"}auth/login`);
  }

  // Patients have no business in the professional dashboard — send them to their own page
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user!.id)
    .maybeSingle();

  if (roleRow?.role === "patient") {
    redirect(`/${locale === "en" ? "" : locale + "/"}discover`);
  }

  const { data: professional } = await supabase
    .from("professionals")
    .select("full_name, photo_url")
    .eq("id", user.id)
    .maybeSingle();

  const firstName = professional?.full_name?.split(" ")[0] ?? user.email?.split("@")[0] ?? "Doctor";

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <DashboardSidebar
        locale={locale}
        firstName={firstName}
        email={user.email ?? ""}
        photoUrl={professional?.photo_url}
      />
      <main className="flex-1 overflow-auto lg:pl-0 pt-0">
        <div className="min-h-full">
          {children}
        </div>
      </main>
    </div>
  );
}
