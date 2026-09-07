"use client";

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
    <div className="flex items-center gap-0 overflow-x-auto py-1">
      <div className="shrink-0 basis-[176px] rounded-[7px] border border-border bg-surface-2 px-3 py-2.5">
        <div className="truncate text-[12.5px] font-semibold text-ink">{vitrineName}</div>
        <div className="mt-0.5 truncate font-mono text-[10.5px] text-t3">
          {vitrineDomain}
        </div>
      </div>

      <div className="h-px shrink-0 basis-8 bg-[var(--border-strong)]" aria-hidden />

      {/* A caixa preta e o xcart. O contraste diz que a decisao acontece aqui,
          e nao em mais um card igual aos outros. */}
      <div className="shrink-0 basis-[156px] rounded-[7px] border border-[var(--solid)] bg-[var(--solid)] px-3 py-2.5 text-[var(--on-solid)]">
        <div className="text-[12.5px] font-semibold">Divisão do tráfego</div>
        <div className="mt-0.5 truncate font-mono text-[10.5px] opacity-70">
          {enabled ? rotationLabel : "rota pausada"}
        </div>
      </div>

      <div className="h-px shrink-0 basis-5 bg-[var(--border-strong)]" aria-hidden />
      <div
        className="my-3.5 shrink-0 basis-px self-stretch bg-[var(--border-strong)]"
        aria-hidden
      />

      <ul className="flex min-w-[260px] flex-1 flex-col gap-1.5">
        {targets.map((alvo) => {
          const estado = targetState(alvo);
          const ocupado = busyId === alvo.id;
          return (
            <li
              key={alvo.id}
              className="relative flex items-center gap-2.5 rounded-md border border-[var(--border-subtle)] bg-surface px-[11px] py-2 transition-colors hover:border-[var(--border-strong)]"
            >
              <span
                className="absolute -left-2.5 h-px w-2.5 bg-[var(--border-strong)]"
                aria-hidden
              />
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: COR[estado] }}
                aria-hidden
              />
              <span className="min-w-0 max-w-[140px] flex-none truncate text-[12.5px] font-medium text-ink">
                {alvo.name}
              </span>
              <span className="shrink-0 text-[11.5px]" style={{ color: COR[estado] }}>
                {TEXTO[estado]}
              </span>

              <span className="h-1 min-w-[40px] flex-1 overflow-hidden rounded-[3px] bg-[var(--track)]">
                <span
                  className="block h-1 rounded-[3px] transition-[width] duration-300"
                  style={{
                    width: `${alvo.sharePercent}%`,
                    background: estado === "ok" ? "var(--solid)" : "var(--border-strong)",
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
                    className="h-[26px] w-14 rounded-md border border-[var(--control-border)] bg-surface px-2 text-right font-mono text-[11.5px] tabular-nums text-ink"
                    aria-label={`Porcentagem do tráfego para ${alvo.name}`}
                  />
                  <span className="text-[11px] text-t4">%</span>
                </span>
              ) : (
                <span className="w-[38px] shrink-0 text-right font-mono text-[11.5px] tabular-nums text-t1">
                  {alvo.sharePercent}%
                </span>
              )}

              <button
                type="button"
                disabled={ocupado}
                onClick={() => onToggle?.(alvo)}
                className="h-6 shrink-0 rounded-[5px] border border-border bg-surface px-2 text-[11.5px] font-semibold text-t2 transition-colors hover:border-[var(--border-strong)] disabled:opacity-50"
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
