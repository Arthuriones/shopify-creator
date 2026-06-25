import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { TopNav } from "@/components/layout/top-nav";
import { Toaster } from "@/components/ui/sonner";
import { createClient } from "@/lib/supabase/server";
import { userHasAccess } from "@/lib/billing/access";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Trava de acesso: sem acesso (free nao liberado) cai na pagina /no-access.
  // So bloqueia quando ACCESS_CONTROL_ENABLED=true; senao userHasAccess()=true.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && !(await userHasAccess(user.id))) {
    redirect("/no-access");
  }

  return (
    <div className="min-h-screen font-sans bg-background">
      <TopNav />
      <Sidebar />
      <main className="min-h-screen pb-20 pt-16 md:pb-0 md:pl-[264px]">
        <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
      <Toaster />
    </div>
  );
}
