"use client";

import type {
  CSSProperties,
  ForwardRefExoticComponent,
  RefAttributes,
} from "react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, LogOut, Store, Terminal } from "lucide-react";
import { LayoutPanelTopIcon } from "@/components/ui/layout-panel-top";
import { DownloadIcon } from "@/components/ui/download";
import { WorkflowIcon } from "@/components/ui/workflow";
import { BoxesIcon } from "@/components/ui/boxes";
import { BoxIcon } from "@/components/ui/box";
import { SparklesIcon } from "@/components/ui/sparkles";
import { MessageSquareMoreIcon } from "@/components/ui/message-square-more";
import { InstagramIcon } from "@/components/ui/instagram";
import { CreditCardIcon } from "@/components/ui/credit-card";
import { SettingsGearIcon } from "@/components/ui/settings-gear";

// Contrato comum dos icones animados (lucide-animated): handle imperativo
// para disparar a animacao no hover da LINHA inteira do menu.
type AnimatedIconHandle = { startAnimation: () => void; stopAnimation: () => void };
type NavIconProps = { size?: number; className?: string; style?: CSSProperties };
type NavIcon = ForwardRefExoticComponent<
  NavIconProps & RefAttributes<AnimatedIconHandle>
>;

// Adapta o Store (lucide, estatico) ao mesmo contrato — sem animacao.
const StoreIcon = forwardRef<AnimatedIconHandle, NavIconProps>(
  function StoreIcon(props, ref) {
    useImperativeHandle(ref, () => ({ startAnimation() {}, stopAnimation() {} }));
    return <Store {...props} />;
  }
);

// Mesmo adaptador do Store: lucide estatico no contrato dos animados.
const TerminalIcon = forwardRef<AnimatedIconHandle, NavIconProps>(
  function TerminalIcon(props, ref) {
    useImperativeHandle(ref, () => ({ startAnimation() {}, stopAnimation() {} }));
    return <Terminal {...props} />;
  }
);

interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  badge?: string;
  disabled?: boolean;
  children?: { href: string; label: string }[];
}

interface NavSection {
  label: string;
  items: NavItem[];
}

// Os "label" guardam CHAVES de traducao (namespace nav.*), resolvidas no
// render com useTranslations("nav").
const navSections: NavSection[] = [
  {
    label: "operations",
    items: [
      { href: "/dashboard", label: "overview", icon: LayoutPanelTopIcon },
      {
        href: "/clone/shopify",
        label: "importProducts",
        icon: DownloadIcon,
        children: [
          { href: "/clone/export", label: "exportCatalog" },
        ],
      },
      {
        href: "/clone/routed-checkout",
        label: "showcaseStore",
        icon: WorkflowIcon,
        children: [
          { href: "/clone/routed-checkout", label: "connectStores" },
          { href: "/clone/routed-checkout/active-routes", label: "routesAndTokens" },
        ],
      },
    ],
  },
  {
    label: "shopify",
    items: [
      { href: "/stores", label: "connectedStores", icon: StoreIcon },
      { href: "/products/catalog", label: "productCatalog", icon: BoxesIcon },
      { href: "/products", label: "products", icon: BoxIcon },
    ],
  },
  {
    label: "automations",
    items: [
      { href: "/optimizer", label: "aiOptimizer", icon: SparklesIcon },
      { href: "/reviews", label: "aiReviews", icon: MessageSquareMoreIcon },
    ],
  },
  {
    label: "channels",
    items: [
      { href: "/instagram", label: "instagram", icon: InstagramIcon, badge: "beta" },
      { href: "/claude", label: "claude", icon: TerminalIcon, badge: "novo" },
    ],
  },
  {
    label: "account",
    items: [
      { href: "/billing", label: "billing", icon: CreditCardIcon },
      { href: "/store-setup", label: "settings", icon: SettingsGearIcon },
    ],
  },
];

const mobileNavItems: NavItem[] = [
  navSections[0].items[0],
  navSections[0].items[1],
  navSections[1].items[0],
  navSections[2].items[0],
  navSections[3].items[0],
];

function splitHref(href: string) {
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  return { path, section: params.get("section") || "" };
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("nav");
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  // Handles dos icones animados, por item — a animacao dispara no hover da
  // linha inteira do menu (nao so do icone).
  const iconRefs = useRef(new Map<string, AnimatedIconHandle | null>());

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      const user = data?.user;
      const meta = user?.user_metadata ?? {};
      const name =
        (typeof meta.name === "string" && meta.name) ||
        (typeof meta.full_name === "string" && meta.full_name) ||
        (user?.email ? user.email.split("@")[0] : "");
      setUserName(name);
      setUserEmail(user?.email ?? "");
    })();
    return () => {
      active = false;
    };
  }, []);

  const displayName = userName || t("account");
  const userInitial = (userName || userEmail || "?").charAt(0).toUpperCase();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  function isHrefActive(href: string, exact = false) {
    const target = splitHref(href);
    if (exact) return pathname === target.path;
    if (pathname !== target.path && !pathname.startsWith(`${target.path}/`)) return false;
    return true;
  }

  function isItemExpanded(item: NavItem) {
    const target = splitHref(item.href);
    return pathname === target.path || pathname.startsWith(`${target.path}/`);
  }

  return (
    <>
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[264px] flex-col border-r border-sidebar-border bg-sidebar md:flex">
        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center px-5">
          <Link href="/dashboard" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Logo" className="h-13 w-auto" />
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-1">
          <div className="space-y-6">
            {navSections.map((section) => (
              <div key={section.label} className="space-y-1">
                <div className="px-3 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
                  {t(section.label)}
                </div>
                {section.items.map((item) => {
                  const isActive = isHrefActive(item.href, true);
                  const isExpanded = item.children ? isItemExpanded(item) : false;
                  const hasActiveChild = item.children?.some((child) =>
                    isHrefActive(child.href, true)
                  );
                  const highlighted = isActive;
                  const itemKey = `${section.label}-${item.label}`;
                  return (
                    <div key={itemKey} className="space-y-1">
                      <Link
                        href={item.disabled ? "#" : item.href}
                        aria-disabled={item.disabled}
                        onMouseEnter={() =>
                          iconRefs.current.get(itemKey)?.startAnimation()
                        }
                        onMouseLeave={() =>
                          iconRefs.current.get(itemKey)?.stopAnimation()
                        }
                        className={cn(
                          "group relative flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition-all",
                          item.disabled && "pointer-events-none opacity-50",
                          highlighted
                            ? "bg-gradient-to-r from-primary/90 to-[oklch(0.52_0.2_290)] text-white shadow-[0_8px_20px_-8px_oklch(0.58_0.19_272)]"
                            : hasActiveChild || isExpanded
                              ? "bg-white/[0.04] text-foreground"
                              : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                        )}
                      >
                        <item.icon
                          ref={(handle) => {
                            iconRefs.current.set(itemKey, handle);
                          }}
                          size={18}
                          className={cn(
                            "inline-flex shrink-0 transition-colors",
                            highlighted
                              ? "text-white"
                              : hasActiveChild
                                ? "text-primary"
                                : "text-muted-foreground group-hover:text-foreground"
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate">{t(item.label)}</span>
                        {item.badge && (
                          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            {item.badge}
                          </span>
                        )}
                        {item.children && (
                          <ChevronDown
                            className={cn(
                              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                              (isExpanded || hasActiveChild) && "rotate-180"
                            )}
                          />
                        )}
                      </Link>
                      {item.children && (isExpanded || hasActiveChild) && (
                        <div className="ml-[1.65rem] space-y-0.5 border-l border-sidebar-border pb-1 pl-3 pt-0.5">
                          {item.children.map((child, index) => {
                            const childActive = isHrefActive(child.href, true);
                            return (
                              <Link
                                key={`${child.label}-${index}`}
                                href={child.href}
                                className={cn(
                                  "block rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                                  childActive
                                    ? "bg-white/[0.05] text-foreground"
                                    : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                                )}
                              >
                                {t(child.label)}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </nav>

        {/* Profile */}
        <div className="shrink-0 border-t border-sidebar-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-xl border border-sidebar-border bg-white/[0.02] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.05] focus:outline-none">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-[oklch(0.52_0.2_290)] text-[13px] font-bold text-white">
                {userInitial}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-foreground">{displayName}</span>
                {userEmail && (
                  <span className="block truncate text-[11px] text-muted-foreground">{userEmail}</span>
                )}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-[238px]">
              <DropdownMenuGroup>
                <DropdownMenuLabel>{t("myAccount")}</DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="text-red-400 focus:text-red-400"
              >
                <LogOut className="h-4 w-4" />
                {t("logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Mobile nav bar at bottom */}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex h-16 items-center justify-around border-t border-border bg-card/95 px-2 backdrop-blur md:hidden">
        {mobileNavItems.map((item) => {
          const isActive = item.children
            ? isItemExpanded(item)
            : isHrefActive(item.href, true);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex h-full min-w-[60px] flex-col items-center justify-center gap-1 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon size={20} className="inline-flex" />
              <span className="text-[10px] font-semibold">{t(item.label)}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
