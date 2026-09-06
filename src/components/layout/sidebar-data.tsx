import { getSetupStatus } from "@/lib/setup/status";
import { getCurrentUser } from "@/lib/supabase/current-user";
import { Sidebar } from "./sidebar";

/**
 * Busca os dados da sidebar no servidor e entrega prontos.
 *
 * Vive separado do layout de proposito: o layout renderiza isto dentro de um
 * <Suspense>, entao a pagina aparece sem esperar as consultas do medidor de
 * progresso. Quando estava no proprio layout, esses tres arredondamentos ao
 * banco seguravam a TELA INTEIRA a cada navegacao -- o menu, o conteudo,
 * tudo -- para desenhar uma barrinha.
 */
export async function SidebarData() {
  const [user, status] = await Promise.all([getCurrentUser(), getSetupStatus()]);
  const meta = (user?.user_metadata || {}) as { full_name?: string; name?: string };

  return (
    <Sidebar
      dados={{
        nome: meta.full_name || meta.name || user?.email || "",
        email: user?.email || "",
        stores: status.storeCount,
        credits: status.credits,
        percent: status.percent,
        nextLabel: status.nextLabel,
      }}
    />
  );
}

/** O menu enquanto os números não chegaram: mesma largura, sem pulo. */
export function SidebarSkeleton() {
  return (
    <aside
      className="fixed left-0 top-0 z-40 hidden h-screen w-[216px] flex-col border-r border-border bg-surface md:flex"
      aria-hidden
    />
  );
}
