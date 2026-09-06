"use client";

import { cn } from "@/lib/utils";

export interface StripTarget {
  id: string;
  name: string;
  domain: string;
  enabled: boolean;
  weight: number;
  sharePercent: number;
  mappedSkuCount: number;
}

export type TargetState = "ok" | "paused" | "attention";

export function targetState(alvo: StripTarget): TargetState {
  // Ligada e sem nenhum produto ligado e o caso silencioso: mesmo em 0% ela
  // esta configurada errado, e basta alguem dar fatia para os carrinhos
  // comecarem a falhar. Vale o aviso antes disso acontecer.
  if (alvo.enabled && alvo.mappedSkuCount === 0) return "attention";
  return alvo.enabled && alvo.weight > 0 ? "ok" : "paused";
}

const COR: Record<TargetState, string> = {
  ok: "var(--ok)",
  paused: "var(--t4)",
  attention: "var(--warn)",
};

const TEXTO: Record<TargetState, string> = {
  ok: "Ativo",
  paused: "Pausado",
  attention: "Atenção",
};

/**
 * A operação numa faixa: de onde vem o comprador, quem decide, para onde vai.
 *
 * Substitui o grafo bipartido. O grafo mostrava a topologia, mas quem opera
 * não precisa dela -- precisa de quanto cada loja está levando e qual está
 * parada, e isso uma lista com barra responde melhor e em menos espaço.
 */
export function RouteStrip({
  vitrineName,
  vitrineDomain,
  rotationLabel,
  enabled,
  targets,
  busyId,
  onToggle,
  editando,
  onChangePercent,
}: {
  vitrineName: string;
  vitrineDomain: string;
  rotationLabel: string;
  enabled: boolean;
  targets: StripTarget[];
  busyId?: string | null;
  onToggle?: (alvo: StripTarget) => void;
  editando?: boolean;
  onChangePercent?: (alvo: StripTarget, valor: number) => void;
}) {
  return (
    <div className="grid items-center gap-x-6 gap-y-5 px-4 py-6 lg:grid-cols-[minmax(0,190px)_minmax(0,168px)_minmax(0,1fr)]">
      <div className="rounded-lg border border-border bg-surface px-3.5 py-3">
        <span className="block truncate text-[12.5px] font-medium text-ink">
          {vitrineName}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[10.5px] text-t3">
          {vitrineDomain}
        </span>
      </div>

      {/* A caixa preta e o xcart. O contraste diz que a decisao acontece aqui,
          e nao em mais um card igual aos outros. */}
      <div className="rounded-lg bg-[var(--solid)] px-3.5 py-3 text-[var(--on-solid)]">
        <span className="block text-[12.5px] font-medium">Divisão do tráfego</span>
        <span className="mt-0.5 block font-mono text-[10.5px] opacity-70">
          {enabled ? rotationLabel : "rota pausada"}
        </span>
      </div>

      {/* A régua vertical à esquerda substitui as curvas do grafo: mesma
          informação de "sai de um, chega em vários", sem geometria. */}
      <ul className="relative flex flex-col gap-px border-l border-border pl-4">
        {targets.map((alvo) => {
          const estado = targetState(alvo);
          const ocupado = busyId === alvo.id;
          return (
            <li key={alvo.id} className="relative flex items-center gap-3 py-[7px]">
              <span
                className="absolute -left-4 top-1/2 h-px w-3 bg-border"
                aria-hidden
              />
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: COR[estado] }}
                aria-hidden
              />
              <span className="w-[104px] shrink-0 truncate text-[12.5px] text-ink">
                {alvo.name}
              </span>
              <span
                className="w-[54px] shrink-0 text-[11px]"
                style={{ color: COR[estado] }}
              >
                {TEXTO[estado]}
              </span>

              <span className="h-[3px] min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--track)]">
                <span
                  className="block h-full rounded-full transition-[width] duration-300"
                  style={{
                    width: `${alvo.sharePercent}%`,
                    background: estado === "ok" ? "var(--ink)" : "var(--t4)",
                  }}
                />
              </span>

              {editando ? (
                <span className="flex shrink-0 items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={alvo.sharePercent}
                    disabled={!alvo.enabled || ocupado}
                    onChange={(e) => onChangePercent?.(alvo, Number(e.target.value))}
                    className="h-7 w-14 rounded-md border border-[var(--control-border)] bg-surface px-2 text-right font-mono text-[11px] tabular-nums text-ink"
                    aria-label={`Porcentagem do tráfego para ${alvo.name}`}
                  />
                  <span className="text-[11px] text-t3">%</span>
                </span>
              ) : (
                <span className="w-10 shrink-0 text-right font-mono text-[11.5px] tabular-nums text-t2">
                  {alvo.sharePercent}%
                </span>
              )}

              <button
                type="button"
                disabled={ocupado}
                onClick={() => onToggle?.(alvo)}
                className={cn(
                  "w-[52px] shrink-0 rounded-md border border-border bg-surface py-1 text-[11.5px] text-t1 transition-colors",
                  "hover:border-[var(--border-strong)] hover:text-ink disabled:opacity-50"
                )}
              >
                {alvo.enabled ? "Parar" : "Voltar"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
