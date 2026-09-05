import { CreditCard, Store, Shuffle, Unplug } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StoreRole } from "@/lib/checkout-routes/store-roles";

const ROLE_STYLE: Record<
  StoreRole,
  { label: string; hint: string; icon: typeof Store; className: string }
> = {
  vitrine: {
    label: "Vitrine",
    // O que a loja FAZ, nao o que ela e. "Vitrine" sozinho nao diz a um
    // lojista novo por que existem duas lojas.
    hint: "Recebe o trafego do anuncio",
    icon: Store,
    className: "border-vitrine/35 bg-vitrine/12 text-vitrine",
  },
  checkout: {
    label: "Checkout",
    hint: "Onde o pagamento acontece",
    icon: CreditCard,
    className: "border-checkout/35 bg-checkout/12 text-checkout",
  },
  both: {
    label: "Vitrine + checkout",
    hint: "Recebe trafego numa rota e cobra em outra",
    icon: Shuffle,
    className: "border-primary/35 bg-primary/12 text-primary",
  },
  unassigned: {
    label: "Sem rota",
    hint: "Ainda nao participa de nenhuma rota",
    icon: Unplug,
    className: "border-border bg-muted/40 text-muted-foreground",
  },
};

export function roleStyle(role: StoreRole) {
  return ROLE_STYLE[role] ?? ROLE_STYLE.unassigned;
}

export function StoreRoleBadge({
  role,
  className,
  showHint = false,
}: {
  role: StoreRole;
  className?: string;
  showHint?: boolean;
}) {
  const style = roleStyle(role);
  const Icon = style.icon;
  return (
    <span
      title={style.hint}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium leading-5",
        style.className,
        className
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      <span>{style.label}</span>
      {showHint && (
        <span className="hidden font-normal opacity-70 sm:inline">
          &middot; {style.hint}
        </span>
      )}
    </span>
  );
}
