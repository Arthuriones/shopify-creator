"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  Copy,
  Ellipsis,
  Image as ImageIcon,
  Loader2,
  Settings2,
  Stethoscope,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getPublicAppUrl } from "@/lib/public-url";
import { RotationPanel } from "@/components/routed-checkout/rotation-panel";

export interface InspectorRoute {
  id: string;
  name: string;
  enabled: boolean;
  publicToken: string;
  sourceStoreId: string;
  lastHeal: { at: string; ok: boolean; message?: string } | null;
}

interface HealthResult {
  ok: boolean;
  coveragePercent: number;
  noSkuCount: number;
  missingCount: number;
  wrongCount: number;
  checkedTargetName?: string;
}

function installSnippet(token: string) {
  const origin = getPublicAppUrl(process.env.NEXT_PUBLIC_APP_URL || "");
  return `<script\n  src="${origin}/routed-checkout-loader.js"\n  data-token="${token}"\n  async>\n</script>`;
}

/**
 * Painel de uma rota.
 *
 * Antes isto eram sete botoes iguais lado a lado e um textarea com o script
 * sempre aberto. O script e detalhe de implementacao: quem opera quer saber se
 * o dinheiro esta passando. Entao sobraram duas acoes -- instalar e
 * diagnosticar -- e o resto foi para o menu.
 */
export function RouteInspector({
  route,
  stores,
  onChanged,
  onDeleted,
}: {
  route: InspectorRoute;
  stores: { id: string; name: string; shopDomain: string }[];
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [busy, setBusy] = useState(false);

  // Caminho principal: o xcart escreve o script no tema da vitrine sozinho.
  // Copiar e colar a mao e a saida para quem nao pode dar essa permissao --
  // por isso so aparece quando o automatico falha, ou sob pedido.
  async function install() {
    setInstalling(true);
    try {
      const response = await fetch(`/api/checkout-routes/${route.id}/update-theme`, {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setManual(true);
        toast.error(
          data.error || "Nao consegui escrever no tema. Cole o script na mao."
        );
        return;
      }
      setInstalled(new Date().toISOString());
      toast.success(data.message || "Script instalado na vitrine.");
      onChanged();
    } catch {
      setManual(true);
      toast.error("Nao consegui escrever no tema. Cole o script na mao.");
    } finally {
      setInstalling(false);
    }
  }

  async function copyScript() {
    try {
      await navigator.clipboard.writeText(installSnippet(route.publicToken));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("O navegador bloqueou a copia. Selecione o texto e copie.");
    }
  }

  async function diagnose() {
    setChecking(true);
    setHealth(null);
    try {
      const response = await fetch("/api/checkout-routes/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: route.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error || "Falha ao verificar.");
        return;
      }
      setHealth(data);
    } finally {
      setChecking(false);
    }
  }

  async function repair() {
    setRepairing(true);
    try {
      const response = await fetch("/api/checkout-routes/repair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: route.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error || "Falha ao corrigir.");
        return;
      }
      toast.success(
        data.noop
          ? "Nada para corrigir: a rota ja estava certa."
          : `Corrigida. ${data.createdProductCount || 0} produto(s) criados, ${data.stampedSkuCount || 0} SKU(s) gravados.`
      );
      setHealth(null);
      onChanged();
    } finally {
      setRepairing(false);
    }
  }

  async function toggle() {
    setBusy(true);
    try {
      await fetch("/api/checkout-routes/toggle", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: route.id, enabled: !route.enabled }),
      });
      toast.success(route.enabled ? "Rota pausada." : "Rota ligada.");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `Apagar a rota "${route.name}"? A vitrine volta a mandar o comprador para o proprio checkout, que nao cobra.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/checkout-routes?id=${route.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        toast.error("Falha ao apagar a rota.");
        return;
      }
      toast.success("Rota apagada.");
      onDeleted();
    } finally {
      setBusy(false);
    }
  }

  const broken = route.lastHeal && !route.lastHeal.ok;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-border/60 px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate font-heading text-lg font-semibold text-foreground">
            {route.name}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {route.enabled ? "Roteando compradores agora" : "Pausada, ninguem e roteado"}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={busy}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <Ellipsis className="h-4 w-4" />
            <span className="sr-only">Mais acoes</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={toggle}>
              {route.enabled ? "Pausar rota" : "Ligar rota"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setManual((current) => !current)}>
              <Copy className="mr-2 h-3.5 w-3.5" />
              Instalar o script na mao
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <Settings2 className="mr-2 h-3.5 w-3.5" />
              Dominio e moeda do checkout
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <ImageIcon className="mr-2 h-3.5 w-3.5" />
              Refazer fotos sem marca
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <ArrowLeftRight className="mr-2 h-3.5 w-3.5" />
              Inverter vitrine e checkout
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={remove}>
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Apagar rota
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {broken && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            <p className="text-xs leading-5 text-foreground">
              {route.lastHeal?.message || "A ultima checagem automatica achou um problema."}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={install} disabled={installing} className="flex-1">
            {installing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : installed ? (
              <Check className="mr-2 h-4 w-4" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {installed ? "Instalado" : "Instalar na vitrine"}
          </Button>
          <Button variant="outline" onClick={diagnose} disabled={checking}>
            {checking ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Stethoscope className="mr-2 h-4 w-4" />
            )}
            Diagnosticar
          </Button>
        </div>

        {manual && (
          <div className="space-y-2 rounded-lg border border-border bg-muted/25 p-3">
            <p className="text-xs leading-5 text-muted-foreground">
              Cole no <code className="font-mono text-[11px]">theme.liquid</code> da
              vitrine, antes de <code className="font-mono text-[11px]">&lt;/head&gt;</code>.
            </p>
            <pre className="overflow-x-auto rounded-md bg-background/70 p-2.5 font-mono text-[11px] leading-5 text-foreground">
              {installSnippet(route.publicToken)}
            </pre>
            <Button variant="outline" size="sm" className="h-7" onClick={copyScript}>
              {copied ? (
                <Check className="mr-1.5 h-3 w-3" />
              ) : (
                <Copy className="mr-1.5 h-3 w-3" />
              )}
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
        )}

        {health && (
          <div
            className={cn(
              "space-y-2 rounded-lg border px-3 py-3",
              health.ok
                ? "border-checkout/35 bg-checkout/8"
                : "border-destructive/40 bg-destructive/10"
            )}
          >
            <p className="flex items-baseline gap-2">
              <span className="font-heading text-2xl font-semibold tabular-nums text-foreground">
                {health.coveragePercent}%
              </span>
              <span className="text-xs text-muted-foreground">
                das variantes tem destino
                {health.checkedTargetName ? ` em ${health.checkedTargetName}` : ""}
              </span>
            </p>
            {!health.ok && (
              <>
                <ul className="space-y-0.5 text-xs leading-5 text-muted-foreground">
                  {health.noSkuCount > 0 && (
                    <li>{health.noSkuCount} variante(s) sem SKU nunca roteiam.</li>
                  )}
                  {health.missingCount > 0 && (
                    <li>{health.missingCount} SKU(s) sem par na loja de checkout.</li>
                  )}
                  {health.wrongCount > 0 && (
                    <li>
                      {health.wrongCount} SKU(s) apontam para a variante errada, o que
                      manda o comprador para outro produto.
                    </li>
                  )}
                </ul>
                <Button size="sm" className="h-7" onClick={repair} disabled={repairing}>
                  {repairing ? (
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  ) : null}
                  Corrigir agora
                </Button>
              </>
            )}
          </div>
        )}

        <RotationPanel
          routeId={route.id}
          sourceStoreId={route.sourceStoreId}
          stores={stores}
          onChanged={onChanged}
        />
      </div>
    </div>
  );
}
