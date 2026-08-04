import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Toaster } from "@/components/ui/sonner";
import { AdminLogout } from "./logout";
import { AdminNav } from "./admin-nav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  // Conta logada sem permissao de admin: mostra um aviso explicito em vez de
  // redirecionar para /login. O redirect criava um loop infinito (login ->
  // /stores -> middleware manda para /admin -> layout devolve para /login),
  // fazendo parecer que o admin estava fora do ar quando na verdade era a
  // conta errada.
  if (!profile?.is_admin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <div className="w-full max-w-md rounded-xl border border-border/60 bg-card p-6 text-center">
          <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h1 className="mb-2 text-lg font-semibold">Acesso restrito</h1>
          <p className="mb-1 text-sm text-muted-foreground">
            A conta <span className="font-medium text-foreground">{user.email}</span>{" "}
            nao tem permissao de administrador.
          </p>
          <p className="mb-5 text-sm text-muted-foreground">
            Saia e entre com a conta de administrador.
          </p>
          <AdminLogout />
        </div>
        <Toaster />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-card">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <span className="font-semibold">Xcart Admin</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="hidden sm:inline">{user.email}</span>
            <AdminLogout />
          </div>
        </div>
      </header>

      <div className="flex">
        <aside className="hidden w-56 shrink-0 border-r border-border/60 p-3 md:block">
          <AdminNav />
        </aside>
        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
