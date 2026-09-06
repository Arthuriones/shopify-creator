"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Copy,
  Ellipsis,
  Loader2,
  Plus,
  SlidersHorizontal,
  Stethoscope,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getPublicAppUrl } from "@/lib/public-url";
import { RouteStrip, targetState, type StripTarget } from "@/components/routed-checkout/route-strip";
import { RotationPanel } from "@/components/routed-checkout/rotation-panel";
import { AddStorePanel } from "@/components/routed-checkout/add-store-panel";

interface Alvo {
  id: string;
  storeId: string;
  weight: number;
  enabled: boolean;
  sharePercent: number;
  mappedSkuCount: number;
}

interface Rota {
  id: string;
  name: string;
  enabled: boolean;
  publicToken: string;
  sourceStoreId: string;
  rotationStrategy: "sticky" | "each_checkout";
  lastHeal: { at: string; ok: boolean; message?: string } | null;
  targets: Alvo[];
}

interface Loja {
  id: string;
  name: string;
  shopDomain: string;
}

interface Grafo {
  stores: Loja[];
  routes: Rota[];
}

interface Diagnostico {
  ok: boolean;
  coveragePercent: number;
  noSkuCount: number;
  missingCount: number;
  wrongCount: number;
  checkedTargetName?: string;
}

function snippet(token: string) {
  const origem = getPublicAppUrl(process.env.NEXT_PUBLIC_APP_URL || "");
  return `<script\n  src="${origem}/routed-checkout-loader.js"\n  data-token="${token}"\n  async>\n</script>`;
}

export function RoutingConsole({ onConnectStores }: { onConnectStores: () => void }) {
  const [grafo, setGrafo] = useState<Grafo>({ stores: [], routes: [] });
  const [carregando, setCarregando] = useState(true);
  const [rotaId, setRotaId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/checkout-routes/map");
      if (!r.ok) throw new Error();
      const d = (await r.json()) as Grafo;
      setGrafo(d);
      setRotaId((atual) =>
        atual && d.routes.some((x) => x.id === atual) ? atual : (d.routes[0]?.id ?? null)
      );
    } catch {
      toast.error("Não consegui carregar as rotas.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (carregando) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-[12.5px] text-t3">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Carregando o roteamento
      </div>
    );
  }

  return (
    <ConsoleView
      grafo={grafo}
      rotaId={rotaId}
      onSelecionar={setRotaId}
      onConnectStores={onConnectStores}
      onRecarregar={carregar}
    />
  );
}

/** O desenho, sem busca de dados: dá para renderizar com qualquer estado. */
export function ConsoleView({
  grafo,
  rotaId,
  onSelecionar,
  onConnectStores,
  onRecarregar,
}: {
  grafo: Grafo;
  rotaId: string | null;
  onSelecionar: (id: string) => void;
  onConnectStores: () => void;
  onRecarregar: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [conectandoLoja, setConectandoLoja] = useState(false);
  const [instalando, setInstalando] = useState(false);
  const [instalado, setInstalado] = useState(false);
  const [manual, setManual] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [checando, setChecando] = useState(false);
  const [diagnostico, setDiagnostico] = useState<Diagnostico | null>(null);
  const [consertando, setConsertando] = useState(false);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const [alvosLocais, setAlvosLocais] = useState<Alvo[] | null>(null);

  const rota = grafo.routes.find((r) => r.id === rotaId) ?? null;
  const porId = new Map(grafo.stores.map((s) => [s.id, s]));

  if (grafo.routes.length === 0) {
    const semLojas = grafo.stores.length < 2;
    return (
      <div className="mx-auto flex min-h-[55vh] max-w-md flex-col items-center justify-center text-center">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">
          Ligue a vitrine ao checkout
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-t2">
          A vitrine recebe o tráfego do anúncio. A loja de checkout cobra. O xcart leva
          o carrinho de uma para a outra casando os SKUs.
        </p>
        <button
          type="button"
          onClick={semLojas ? () => setConectandoLoja(true) : onConnectStores}
          className="mt-5 rounded-md bg-[var(--solid)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--on-solid)] transition-colors hover:bg-[var(--solid-hover)]"
        >
          {semLojas ? "Conectar uma loja Shopify" : "Criar a primeira rota"}
        </button>
        {conectandoLoja && (
          <div className="mt-6 w-full rounded-xl border border-border bg-surface text-left">
            <AddStorePanel
              onConnected={() => {
                setConectandoLoja(false);
                onRecarregar();
              }}
              onCancel={() => setConectandoLoja(false)}
            />
          </div>
        )}
      </div>
    );
  }

  if (!rota) return null;

  const alvos: StripTarget[] = (alvosLocais ?? rota.targets).map((t) => ({
    id: t.id,
    name: porId.get(t.storeId)?.name || "loja removida",
    domain: porId.get(t.storeId)?.shopDomain || "",
    enabled: t.enabled,
    weight: t.weight,
    sharePercent: t.sharePercent,
    mappedSkuCount: t.mappedSkuCount,
  }));

  const cobrando = alvos.filter((a) => targetState(a) === "ok").length;
  const vitrine = porId.get(rota.sourceStoreId);
  const quebrada = rota.lastHeal && !rota.lastHeal.ok;

  async function salvarAlvos(mudancas: { id: string; weight?: number; enabled?: boolean }[]) {
    const resposta = await fetch(`/api/checkout-routes/${rota!.id}/targets`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targets: mudancas }),
    });
    if (!resposta.ok) {
      toast.error("Não consegui salvar. Recarregue a página.");
      setAlvosLocais(null);
      return;
    }
    onRecarregar();
  }

  /** Mexer numa fatia redistribui o resto, para a soma continuar 100. */
  function mudarFatia(alvo: StripTarget, valor: number) {
    const base = alvosLocais ?? rota!.targets;
    const novo = Math.max(0, Math.min(100, Math.round(valor)));
    const outros = base.filter((t) => t.id !== alvo.id && t.enabled);
    const soma = outros.reduce((s, t) => s + t.weight, 0);
    const sobra = 100 - novo;

    const proximo = base.map((t) => {
      if (t.id === alvo.id) return { ...t, weight: novo, sharePercent: novo };
      if (!t.enabled) return t;
      const parte =
        soma > 0 ? Math.round((t.weight / soma) * sobra) : Math.round(sobra / outros.length);
      return { ...t, weight: Math.max(0, parte), sharePercent: Math.max(0, parte) };
    });
    setAlvosLocais(proximo);
    salvarAlvos(proximo.filter((t) => t.enabled).map((t) => ({ id: t.id, weight: t.weight })));
  }

  async function alternar(alvo: StripTarget) {
    setOcupadoId(alvo.id);
    try {
      await salvarAlvos([{ id: alvo.id, weight: alvo.weight, enabled: !alvo.enabled }]);
      setAlvosLocais(null);
    } finally {
      setOcupadoId(null);
    }
  }

  function dividirIgual() {
    const base = (alvosLocais ?? rota!.targets).filter((t) => t.enabled);
    if (base.length === 0) return;
    const parte = Math.floor(100 / base.length);
    const resto = 100 - parte * base.length;
    const mudancas = base.map((t, i) => ({ id: t.id, weight: parte + (i < resto ? 1 : 0) }));
    setAlvosLocais(
      (alvosLocais ?? rota!.targets).map((t) => {
        const m = mudancas.find((x) => x.id === t.id);
        return m ? { ...t, weight: m.weight, sharePercent: m.weight } : t;
      })
    );
    salvarAlvos(mudancas);
  }

  async function instalar() {
    setInstalando(true);
    try {
      const r = await fetch(`/api/checkout-routes/${rota!.id}/update-theme`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setManual(true);
        toast.error(d.error || "Não consegui escrever no tema. Cole o script na mão.");
        return;
      }
      setInstalado(true);
      toast.success(d.message || "Script instalado na vitrine.");
      onRecarregar();
    } finally {
      setInstalando(false);
    }
  }

  async function diagnosticar() {
    setChecando(true);
    setDiagnostico(null);
    try {
      const r = await fetch("/api/checkout-routes/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rota!.id }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(d.error || "Falha ao verificar.");
        return;
      }
      setDiagnostico(d);
    } finally {
      setChecando(false);
    }
  }

  async function corrigir() {
    setConsertando(true);
    try {
      const r = await fetch("/api/checkout-routes/repair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rota!.id }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(d.error || "Falha ao corrigir.");
        return;
      }
      toast.success(
        d.noop
          ? "Nada para corrigir: a rota já estava certa."
          : `Corrigida. ${d.createdProductCount || 0} produtos criados, ${d.stampedSkuCount || 0} SKUs gravados.`
      );
      setDiagnostico(null);
      onRecarregar();
    } finally {
      setConsertando(false);
    }
  }

  async function alternarRota() {
    await fetch("/api/checkout-routes/toggle", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rota!.id, enabled: !rota!.enabled }),
    });
    toast.success(rota!.enabled ? "Rota pausada." : "Rota ligada.");
    onRecarregar();
  }

  async function apagar() {
    if (
      !window.confirm(
        `Apagar a rota "${rota!.name}"? A vitrine volta a mandar o comprador para o próprio checkout, que não cobra.`
      )
    )
      return;
    const r = await fetch(`/api/checkout-routes?id=${rota!.id}`, { method: "DELETE" });
    if (!r.ok) {
      toast.error("Falha ao apagar a rota.");
      return;
    }
    toast.success("Rota apagada.");
    onRecarregar();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {grafo.routes.length > 1 &&
            grafo.routes.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setAlvosLocais(null);
                  setDiagnostico(null);
                  onSelecionar(r.id);
                }}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-[12px] transition-colors",
                  r.id === rota.id
                    ? "border-[var(--border-strong)] bg-[var(--nav-active)] text-ink"
                    : "border-border text-t2 hover:text-ink"
                )}
              >
                {r.name}
              </button>
            ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setConectandoLoja((v) => !v)}
            className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] font-medium text-ink transition-colors hover:border-[var(--border-strong)]"
          >
            Conectar loja
          </button>
          <button
            type="button"
            onClick={onConnectStores}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--solid)] px-3 py-1.5 text-[12px] font-medium text-[var(--on-solid)] transition-colors hover:bg-[var(--solid-hover)]"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Nova rota
          </button>
        </div>
      </div>

      {conectandoLoja && (
        <div className="rounded-xl border border-border bg-surface">
          <AddStorePanel
            onConnected={() => {
              setConectandoLoja(false);
              onRecarregar();
            }}
            onCancel={() => setConectandoLoja(false)}
          />
        </div>
      )}

      <section className="rounded-xl border border-border bg-surface">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-ink">
              {rota.name}
              <span className="text-t3"> — </span>
              <span style={{ color: rota.enabled ? "var(--ok)" : "var(--t3)" }}>
                {rota.enabled ? "ativo" : "pausado"}
              </span>
            </p>
            <p className="mt-0.5 text-[11.5px] text-t3">
              {cobrando} de {alvos.length} lojas de checkout recebendo comprador
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={diagnosticar}
              disabled={checando}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] font-medium text-ink transition-colors hover:border-[var(--border-strong)] disabled:opacity-50"
            >
              {checando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Stethoscope className="h-3.5 w-3.5" aria-hidden />
              )}
              Testar
            </button>
            <button
              type="button"
              onClick={() => setEditando((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                editando
                  ? "border-[var(--border-strong)] bg-[var(--nav-active)] text-ink"
                  : "border-border bg-surface text-ink hover:border-[var(--border-strong)]"
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
              Configurar
            </button>
            <button
              type="button"
              onClick={instalar}
              disabled={instalando}
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--solid)] px-3 py-1.5 text-[12px] font-medium text-[var(--on-solid)] transition-colors hover:bg-[var(--solid-hover)] disabled:opacity-50"
            >
              {instalando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : instalado ? (
                <Check className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Upload className="h-3.5 w-3.5" aria-hidden />
              )}
              {instalado ? "Instalado" : "Instalar na vitrine"}
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-md border border-border bg-surface text-t2 transition-colors hover:border-[var(--border-strong)] hover:text-ink focus-visible:outline-none">
                <Ellipsis className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">Mais ações</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={alternarRota}>
                  {rota.enabled ? "Pausar rota" : "Ligar rota"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setManual((v) => !v)}>
                  <Copy className="mr-2 h-3.5 w-3.5" />
                  Instalar o script na mão
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={apagar}>
                  Apagar rota
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {quebrada && (
          <p className="border-b border-[var(--err-border)] bg-[var(--err-bg)] px-4 py-2.5 text-[12px] text-ink">
            {rota.lastHeal?.message || "A última checagem automática achou um problema."}
          </p>
        )}

        <RouteStrip
          vitrineName={vitrine?.name || "vitrine removida"}
          vitrineDomain={vitrine?.shopDomain || ""}
          rotationLabel={
            rota.rotationStrategy === "each_checkout"
              ? "sorteia toda vez"
              : "sempre a mesma loja"
          }
          enabled={rota.enabled}
          targets={alvos}
          busyId={ocupadoId}
          onToggle={alternar}
          editando={editando}
          onChangePercent={mudarFatia}
        />

        {editando && (
          <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-2.5">
            <button
              type="button"
              onClick={dividirIgual}
              className="text-[12px] text-t2 underline underline-offset-4 hover:text-ink"
            >
              Dividir igual
            </button>
            <span className="text-[11.5px] text-t3">
              Mexer numa fatia redistribui as outras para somar 100%.
            </span>
          </div>
        )}
      </section>

      <p className="px-1 text-[11.5px] text-t3">
        Loja parada não recebe comprador e continua conectada. Os produtos ligados são
        preservados.
      </p>

      {manual && (
        <div className="rounded-xl border border-border bg-surface px-4 py-3.5">
          <p className="text-[12px] text-t2">
            Cole no <code className="font-mono text-[11px] text-ink">theme.liquid</code> da
            vitrine, antes de{" "}
            <code className="font-mono text-[11px] text-ink">&lt;/head&gt;</code>.
          </p>
          <pre className="mt-2 overflow-x-auto rounded-md bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-ink">
            {snippet(rota.publicToken)}
          </pre>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(snippet(rota.publicToken));
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2000);
              } catch {
                toast.error("O navegador bloqueou a cópia. Selecione o texto e copie.");
              }
            }}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] text-ink hover:border-[var(--border-strong)]"
          >
            {copiado ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copiado ? "Copiado" : "Copiar"}
          </button>
        </div>
      )}

      {diagnostico && (
        <div
          className={cn(
            "rounded-xl border px-4 py-3.5",
            diagnostico.ok
              ? "border-[var(--ok-border)] bg-[var(--ok-bg)]"
              : "border-[var(--err-border)] bg-[var(--err-bg)]"
          )}
        >
          <p className="flex items-baseline gap-2">
            <span className="font-mono text-[20px] font-medium tabular-nums text-ink">
              {diagnostico.coveragePercent}%
            </span>
            <span className="text-[12px] text-t2">
              das variantes têm destino
              {diagnostico.checkedTargetName ? ` em ${diagnostico.checkedTargetName}` : ""}
            </span>
          </p>
          {!diagnostico.ok && (
            <>
              <ul className="mt-1.5 flex flex-col gap-0.5 text-[12px] text-t2">
                {diagnostico.noSkuCount > 0 && (
                  <li>{diagnostico.noSkuCount} variantes sem SKU nunca roteiam.</li>
                )}
                {diagnostico.missingCount > 0 && (
                  <li>{diagnostico.missingCount} SKUs sem par na loja de checkout.</li>
                )}
                {diagnostico.wrongCount > 0 && (
                  <li>
                    {diagnostico.wrongCount} SKUs apontam para a variante errada, o que
                    manda o comprador para outro produto.
                  </li>
                )}
              </ul>
              <button
                type="button"
                onClick={corrigir}
                disabled={consertando}
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-[var(--solid)] px-3 py-1.5 text-[12px] font-medium text-[var(--on-solid)] disabled:opacity-50"
              >
                {consertando && <Loader2 className="h-3 w-3 animate-spin" />}
                Corrigir agora
              </button>
            </>
          )}
        </div>
      )}

      {editando && (
        <div className="rounded-xl border border-border bg-surface px-4 py-4">
          <RotationPanel
            routeId={rota.id}
            sourceStoreId={rota.sourceStoreId}
            stores={grafo.stores}
            onChanged={onRecarregar}
            esconderLista
          />
        </div>
      )}
    </div>
  );
}
