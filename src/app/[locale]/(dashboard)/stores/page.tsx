
"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { StoreRoleBadge } from "@/components/routed-checkout/store-role-badge";
import type { StoreRole } from "@/lib/checkout-routes/store-roles";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  ExternalLink,
  Store,
  Trash2,
  Pencil,
  Upload,
  ImageIcon,
  Loader2,
  AlertCircle,
  X,
  HelpCircle,
  ChevronDown,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getPublicAppUrl } from "@/lib/public-url";
import { normalizeShopDomain } from "@/lib/shopify/domain";
import { SHOPIFY_SCOPES_STRING } from "@/lib/shopify/scopes";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { PageHeader } from "@/components/layout/page-header";

interface ConnectedStore {
  id: string;
  name: string;
  shop_domain: string;
  theme_id: string | null;
  niche: string | null;
  target_audience: string | null;
  brand_voice: string | null;
  store_description: string | null;
  logo_path: string | null;
  target_language: string;
  currency_code: string;
  auto_convert_prices: boolean;
  currency_rate: number;
  price_markup_percent: number;
  created_at: string;
}

interface StoreAsset {
  id: string;
  store_id: string;
  file_path: string;
  label: string | null;
  created_at: string;
}

const BRAND_VOICE_OPTIONS = [
  { value: "casual", label: "Casual e Amigável" },
  { value: "professional", label: "Profissional e Confiante" },
  { value: "luxurious", label: "Luxuoso e Exclusivo" },
  { value: "energetic", label: "Energético e Empoderador" },
  { value: "minimal", label: "Minimalista e Direto" },
  { value: "fun", label: "Divertido e Descontraído" },
  { value: "custom", label: "Personalizado..." },
];

const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD - Dolar americano" },
  { value: "BRL", label: "BRL - Real brasileiro" },
  { value: "EUR", label: "EUR - Euro" },
  { value: "GBP", label: "GBP - Libra esterlina" },
  { value: "JPY", label: "JPY - Iene japonês" },
];

const LANGUAGE_OPTIONS = [
  { value: "pt-BR", label: "Português do Brasil" },
  { value: "en-US", label: "English" },
  { value: "es-ES", label: "Español" },
  { value: "fr-FR", label: "Français" },
  { value: "de-DE", label: "Deutsch" },
  { value: "it-IT", label: "Italiano" },
  { value: "ja-JP", label: "日本語" },
];

// Bloco de texto que o usuario precisa colar no painel da Shopify (escopos,
// URL de redirecionamento, URL do app). Antes era so um <p> em fonte 10.5px com
// break-all e o usuario tinha que selecionar o texto a mao — o passo mais
// propenso a erro de todo o onboarding.
function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copiado`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Selecione e copie manualmente.");
    }
  }

  return (
    <div className="flex items-start gap-2 rounded-md border border-border/40 bg-background/50 px-2 py-1.5">
      <code className="min-w-0 flex-1 break-all font-mono text-[10.5px] leading-relaxed text-foreground/80">
        {value}
      </code>
      <button
        type="button"
        onClick={copy}
        title={`Copiar ${label}`}
        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-primary" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

function StoreSkeleton() {
  return (
    <Card className="overflow-hidden border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="skeleton h-5 w-32" />
          <div className="skeleton h-5 w-20 rounded-full" />
        </div>
        <div className="skeleton mt-2 h-4 w-48" />
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton h-8 w-8 rounded-md" />
        </div>
      </CardContent>
    </Card>
  );
}

function getLogoUrl(logoPath: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return `${supabaseUrl}/storage/v1/object/public/store-logos/${logoPath}`;
}

function getAssetUrl(filePath: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return `${supabaseUrl}/storage/v1/object/public/store-assets/${filePath}`;
}

function isProfileComplete(store: ConnectedStore): boolean {
  return !!(store.niche && store.logo_path);
}

async function ensureStorageBuckets() {
  const res = await fetch("/api/storage/ensure-buckets", { method: "POST" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Nao foi possivel preparar o storage.");
  }
}

function normalizeStorePricingDefaults(
  store: Omit<
    ConnectedStore,
    "target_language" | "currency_code" | "auto_convert_prices" | "currency_rate" | "price_markup_percent"
  > &
    Partial<
      Pick<
        ConnectedStore,
        "target_language" | "currency_code" | "auto_convert_prices" | "currency_rate" | "price_markup_percent"
      >
    >
): ConnectedStore {
  return {
    ...store,
    target_language: store.target_language || "pt-BR",
    currency_code: store.currency_code || "USD",
    auto_convert_prices: Boolean(store.auto_convert_prices),
    currency_rate: Number(store.currency_rate) > 0 ? Number(store.currency_rate) : 1,
    price_markup_percent: Number(store.price_markup_percent) || 0,
  };
}

export default function StoresPage() {
  const t = useTranslations("stores");
  const [stores, setStores] = useState<ConnectedStore[]>([]);
  const [loadingStores, setLoadingStores] = useState(true);
  // Papel de cada loja no roteamento (vitrine / checkout). Nao e coluna da
  // loja: sai das rotas, entao vem do mesmo endpoint que desenha o mapa.
  const [storeRoles, setStoreRoles] = useState<Record<string, StoreRole>>({});
  const [shopDomain, setShopDomain] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const publicAppUrl =
    typeof window !== "undefined"
      ? getPublicAppUrl(window.location.origin)
      : getPublicAppUrl();
  const [showTutorial, setShowTutorial] = useState(false);
  // Guarda se ja abrimos o tutorial automaticamente, para nao reabrir depois que
  // o usuario fechar.
  const tutorialAutoOpenedRef = useRef(false);
  // Sinaliza que voltamos do OAuth (?installed=1) e devemos abrir o perfil da
  // loja recem-instalada assim que a lista carregar.
  const pendingProfileAfterInstallRef = useRef(false);

  // Profile editing
  const [profileOpen, setProfileOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<ConnectedStore | null>(null);
  const [profileNiche, setProfileNiche] = useState("");
  const [profileAudience, setProfileAudience] = useState("");
  const [profileVoice, setProfileVoice] = useState("");
  const [profileCustomVoice, setProfileCustomVoice] = useState("");
  const [profileDescription, setProfileDescription] = useState("");
  const [profileTargetLanguage, setProfileTargetLanguage] = useState("pt-BR");
  const [profileCurrencyCode, setProfileCurrencyCode] = useState("USD");
  const [profileAutoConvertPrices, setProfileAutoConvertPrices] = useState(false);
  const [profileCurrencyRate, setProfileCurrencyRate] = useState("1");
  const [profilePriceMarkupPercent, setProfilePriceMarkupPercent] = useState("0");
  const [profileName, setProfileName] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [storeAssets, setStoreAssets] = useState<StoreAsset[]>([]);
  const [assetFiles, setAssetFiles] = useState<File[]>([]);
  const [assetUploading, setAssetUploading] = useState(false);
  const [materialsStoreId, setMaterialsStoreId] = useState("");
  const [quickAssetFiles, setQuickAssetFiles] = useState<File[]>([]);
  const [quickAssetsSaving, setQuickAssetsSaving] = useState(false);
  const [additionalLogoFiles, setAdditionalLogoFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const additionalLogoInputRef = useRef<HTMLInputElement>(null);
  const assetsInputRef = useRef<HTMLInputElement>(null);
  const quickAssetsInputRef = useRef<HTMLInputElement>(null);
  const normalizedShopDomain = normalizeShopDomain(shopDomain);
  const isShopDomainValid =
    shopDomain.trim().length === 0 || normalizedShopDomain !== null;

  useEffect(() => {
    loadStores();
  }, []);

  // Feedback do callback de OAuth (?installed=1 ou ?error=...)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const installed = params.get("installed");
    const errorMessage = params.get("error");
    if (installed) {
      toast.success("Loja instalada e conectada com sucesso!");
      // Marca para abrir o perfil assim que a lista de lojas carregar. Sem isso
      // o usuario terminava toda a instalacao e caia num card "Perfil
      // incompleto" sem nenhuma acao sugerida — e o perfil (nicho) e o que
      // destrava toda a IA do produto.
      pendingProfileAfterInstallRef.current = true;
    }
    if (errorMessage) {
      toast.error(errorMessage);
    }
    if (installed || errorMessage) {
      const url = new URL(window.location.href);
      url.search = "";
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  useEffect(() => {
    if (loadingStores || !pendingProfileAfterInstallRef.current) return;
    if (stores.length === 0) return;
    pendingProfileAfterInstallRef.current = false;
    // Prioriza a loja sem perfil completo (a que acabou de ser instalada);
    // se todas estiverem completas, nao abre nada.
    const target = stores.find((store) => !isProfileComplete(store));
    if (target) void openProfileEditor(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingStores, stores]);

  useEffect(() => {
    // Primeira loja do usuario: o passo a passo da Shopify e a unica coisa que
    // desbloqueia o produto, entao abre aberto em vez de escondido atras de um
    // clique. Depois que existe ao menos uma loja, volta a ficar recolhido.
    if (
      !loadingStores &&
      stores.length === 0 &&
      open &&
      !tutorialAutoOpenedRef.current
    ) {
      tutorialAutoOpenedRef.current = true;
      setShowTutorial(true);
    }
  }, [loadingStores, stores.length, open]);

  useEffect(() => {
    if (!loadingStores && stores.length > 0 && !materialsStoreId) {
      setMaterialsStoreId(stores[0].id);
    }
  }, [loadingStores, stores, materialsStoreId]);

  useEffect(() => {
    if (!materialsStoreId) return;
    void loadStoreAssets(materialsStoreId);
  }, [materialsStoreId]);

  // Best-effort: a lista de lojas nao pode depender disso. Sem os papeis as
  // lojas caem todas no grupo "sem rota", que e a verdade quando nao ha rota.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/checkout-routes/map")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !data?.stores) return;
        const next: Record<string, StoreRole> = {};
        for (const store of data.stores as { id: string; role: StoreRole }[]) {
          next[store.id] = store.role;
        }
        setStoreRoles(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // As lojas agrupadas por papel. A ordem e deliberada: vitrine primeiro
  // porque e por onde o trafego entra, depois quem cobra, e por ultimo o que
  // ainda nao esta em rota nenhuma.
  const storeGroups = useMemo(() => {
    const order: { role: StoreRole; title: string; hint: string }[] = [
      {
        role: "vitrine",
        title: "Vitrines",
        hint: "Recebem o trafego do anuncio e carregam a marca. O comprador navega e monta o carrinho aqui.",
      },
      {
        role: "both",
        title: "Vitrine e checkout",
        hint: "Recebem trafego numa rota e cobram em outra.",
      },
      {
        role: "checkout",
        title: "Lojas de checkout",
        hint: "Catalogo neutralizado, onde o pagamento acontece. Titulo, descricao e imagem podem mudar a vontade; SKU e variante, nunca.",
      },
      {
        role: "unassigned",
        title: "Fora de rota",
        hint: "Conectadas, mas ainda sem participar de nenhum roteamento.",
      },
    ];

    return order
      .map((group) => ({
        ...group,
        stores: stores.filter(
          (store) => (storeRoles[store.id] || "unassigned") === group.role
        ),
      }))
      .filter((group) => group.stores.length > 0);
  }, [stores, storeRoles]);

  async function loadStores() {
    setLoadingStores(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("stores")
      .select("id, name, shop_domain, theme_id, niche, target_audience, brand_voice, store_description, logo_path, target_language, currency_code, auto_convert_prices, currency_rate, price_markup_percent, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      const fallback = await supabase
        .from("stores")
        .select("id, name, shop_domain, theme_id, niche, target_audience, brand_voice, store_description, logo_path, created_at")
        .order("created_at", { ascending: false });

      if (fallback.data) {
        setStores(fallback.data.map((store) => normalizeStorePricingDefaults(store)));
      }
      setLoadingStores(false);
      return;
    }

    if (data) setStores(data.map((store) => normalizeStorePricingDefaults(store)));
    setLoadingStores(false);
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();

    if (!normalizedShopDomain) {
      toast.error("Por favor, insira um domínio válido (ex: loja.myshopify.com ou loja.com).");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/shopify/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopDomain: normalizedShopDomain,
          clientId,
          clientSecret,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Erro ao conectar loja");
        return;
      }

      // App ainda nao instalado nessa loja: redireciona pro OAuth do Shopify
      if (data.needsInstall && data.installUrl) {
        toast.message("Abrindo a tela de autorizacao do Shopify...");
        window.location.href = data.installUrl;
        return;
      }

      await loadStores();
      toast.success(`Loja "${data.shop.name}" conectada! Configure o perfil para usar a IA.`);
      setOpen(false);
      setShopDomain("");
      setClientId("");
      setClientSecret("");

      // Auto-abrir edição de perfil da loja recém-conectada
      const updatedStores = await loadStoresAndReturn();
      const newStore = updatedStores?.find((s) => s.shop_domain === data.store.shop_domain);
      if (newStore) {
        await openProfileEditor(newStore);
      }
    } catch {
      toast.error("Erro ao conectar loja");
    } finally {
      setLoading(false);
    }
  }

  async function loadStoresAndReturn(): Promise<ConnectedStore[] | null> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("stores")
      .select("id, name, shop_domain, theme_id, niche, target_audience, brand_voice, store_description, logo_path, target_language, currency_code, auto_convert_prices, currency_rate, price_markup_percent, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      const fallback = await supabase
        .from("stores")
        .select("id, name, shop_domain, theme_id, niche, target_audience, brand_voice, store_description, logo_path, created_at")
        .order("created_at", { ascending: false });

      if (!fallback.data) return null;
      const normalized = fallback.data.map((store) => normalizeStorePricingDefaults(store));
      setStores(normalized);
      return normalized;
    }

    if (!data) return null;
    const normalized = data.map((store) => normalizeStorePricingDefaults(store));
    setStores(normalized);
    return normalized;
  }

  async function loadStoreAssets(storeId: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from("store_assets")
      .select("id, store_id, file_path, label, created_at")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false });
    setStoreAssets(data || []);
  }

  async function openProfileEditor(store: ConnectedStore) {
    setEditingStore(store);
    setProfileName(store.name || "");
    setProfileNiche(store.niche || "");
    setProfileAudience(store.target_audience || "");
    const isPreset = BRAND_VOICE_OPTIONS.some((o) => o.value === store.brand_voice);
    if (isPreset) {
      setProfileVoice(store.brand_voice || "");
      setProfileCustomVoice("");
    } else if (store.brand_voice) {
      setProfileVoice("custom");
      setProfileCustomVoice(store.brand_voice);
    } else {
      setProfileVoice("");
      setProfileCustomVoice("");
    }
    setProfileDescription(store.store_description || "");
    setProfileTargetLanguage(store.target_language || "pt-BR");
    setProfileCurrencyCode(store.currency_code || "USD");
    setProfileAutoConvertPrices(Boolean(store.auto_convert_prices));
    setProfileCurrencyRate(
      Number.isFinite(store.currency_rate) ? String(store.currency_rate) : "1"
    );
    setProfilePriceMarkupPercent(
      Number.isFinite(store.price_markup_percent)
        ? String(store.price_markup_percent)
        : "0"
    );
    setLogoPreview(store.logo_path ? getLogoUrl(store.logo_path) : null);
    setLogoFile(null);
    setAdditionalLogoFiles([]);
    setAssetFiles([]);
    await loadStoreAssets(store.id);
    setProfileOpen(true);
  }

  function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo deve ter no máximo 2MB");
      return;
    }

    if (!["image/png", "image/svg+xml", "image/webp", "image/jpeg"].includes(file.type)) {
      toast.error("Formato aceito: PNG, SVG, WEBP ou JPG");
      return;
    }

    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  function handleAdditionalLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const validFiles: File[] = [];
    for (const file of files) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error(`Logo muito grande: ${file.name}. Max 2MB.`);
        continue;
      }
      if (!["image/png", "image/svg+xml", "image/webp", "image/jpeg"].includes(file.type)) {
        toast.error(`Formato invalido: ${file.name}`);
        continue;
      }
      validFiles.push(file);
    }
    if (validFiles.length > 0) {
      setAdditionalLogoFiles((prev) => [...prev, ...validFiles].slice(0, 5));
    }
  }

  function handleAssetsSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const allowedTypes = ["image/png", "image/webp", "image/jpeg", "image/jpg"];
    const validFiles: File[] = [];

    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        toast.error(`Formato nao suportado: ${file.name}`);
        continue;
      }
      if (file.size > 6 * 1024 * 1024) {
        toast.error(`Arquivo muito grande (${file.name}). Max 6MB por imagem.`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    setAssetFiles((prev) => {
      const next = [...prev, ...validFiles].slice(0, 12);
      if (next.length < prev.length + validFiles.length) {
        toast.error("Limite de 12 materiais por vez.");
      }
      return next;
    });
  }

  function handleQuickAssetsSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const allowedTypes = ["image/png", "image/webp", "image/jpeg", "image/jpg"];
    const validFiles: File[] = [];

    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        toast.error(`Formato nao suportado: ${file.name}`);
        continue;
      }
      if (file.size > 6 * 1024 * 1024) {
        toast.error(`Arquivo muito grande (${file.name}). Max 6MB por imagem.`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    setQuickAssetFiles((prev) => {
      const next = [...prev, ...validFiles].slice(0, 12);
      if (next.length < prev.length + validFiles.length) {
        toast.error("Limite de 12 materiais por vez.");
      }
      return next;
    });
  }

  async function handleSaveQuickAssets() {
    if (!materialsStoreId) {
      toast.error("Selecione uma loja para salvar os materiais.");
      return;
    }
    if (quickAssetFiles.length === 0) {
      toast.error("Adicione ao menos um material.");
      return;
    }

    const supabase = createClient();
    setQuickAssetsSaving(true);

    try {
      await ensureStorageBuckets();

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Nao autenticado");

      const recordsToInsert: { store_id: string; file_path: string; label: string }[] = [];

      for (const [index, file] of quickAssetFiles.entries()) {
        const ext = file.name.split(".").pop() || "png";
        const path = `${user.id}/${materialsStoreId}/${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("store-assets")
          .upload(path, file, { upsert: false });

        if (uploadError) {
          throw new Error(`Erro no upload dos materiais: ${uploadError.message}`);
        }

        recordsToInsert.push({
          store_id: materialsStoreId,
          file_path: path,
          label: file.name,
        });
      }

      if (recordsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from("store_assets")
          .insert(recordsToInsert);
        if (insertError) {
          throw new Error(`Erro ao salvar materiais: ${insertError.message}`);
        }
      }

      await loadStoreAssets(materialsStoreId);
      setQuickAssetFiles([]);
      toast.success("Materiais salvos na loja!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar materiais";
      toast.error(msg);
    } finally {
      setQuickAssetsSaving(false);
    }
  }

  async function handleRemoveAsset(asset: StoreAsset) {
    if (!confirm("Remover este material da marca?")) return;

    const supabase = createClient();

    const [{ error: dbError }, { error: storageError }] = await Promise.all([
      supabase.from("store_assets").delete().eq("id", asset.id),
      supabase.storage.from("store-assets").remove([asset.file_path]),
    ]);

    if (dbError) {
      toast.error("Nao foi possivel remover o material.");
      return;
    }

    if (storageError) {
      toast.error("Material removido do cadastro, mas houve erro ao excluir arquivo.");
    } else {
      toast.success("Material removido.");
    }

    setStoreAssets((prev) => prev.filter((a) => a.id !== asset.id));
  }

  async function handleSaveProfile() {
    if (!editingStore) return;

    const parsedCurrencyRate = Number(profileCurrencyRate.replace(",", "."));
    if (!Number.isFinite(parsedCurrencyRate) || parsedCurrencyRate <= 0) {
      toast.error("Taxa de conversao deve ser maior que zero.");
      return;
    }
    const parsedMarkupPercent = Number(
      profilePriceMarkupPercent.replace(",", ".")
    );
    if (!Number.isFinite(parsedMarkupPercent) || parsedMarkupPercent < -100) {
      toast.error("Markup invalido. Use um valor maior que -100.");
      return;
    }

    setProfileSaving(true);
    const supabase = createClient();

    try {
      if (logoFile || assetFiles.length > 0) {
        await ensureStorageBuckets();
      }

      let logoPath = editingStore.logo_path;
      let userId: string | null = null;

      if (logoFile || assetFiles.length > 0) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Nao autenticado");
        userId = user.id;
      }

      // Upload logo se selecionou novo arquivo
      if (logoFile) {
        setLogoUploading(true);
        if (!userId) throw new Error("Nao autenticado");
        const ext = logoFile.name.split(".").pop() || "png";
        const path = `${userId}/${editingStore.id}/logo.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("store-logos")
          .upload(path, logoFile, { upsert: true });

        if (uploadError) {
          throw new Error(`Erro no upload: ${uploadError.message}`);
        }

        logoPath = path;
        setLogoUploading(false);
      }

      // Upload additional logos as store_assets with label "logo"
      if (additionalLogoFiles.length > 0) {
        if (!userId) throw new Error("Nao autenticado");
        const logoRecords: { store_id: string; file_path: string; label: string }[] = [];

        for (const [idx, file] of additionalLogoFiles.entries()) {
          const ext = file.name.split(".").pop() || "png";
          const path = `${userId}/${editingStore.id}/logo-${Date.now()}-${idx}.${ext}`;

          const { error: upErr } = await supabase.storage
            .from("store-logos")
            .upload(path, file, { upsert: false });

          if (upErr) {
            console.warn("Additional logo upload error:", upErr.message);
            continue;
          }

          logoRecords.push({
            store_id: editingStore.id,
            file_path: path,
            label: `logo:${file.name.replace(/\.[^.]+$/, "")}`,
          });
        }

        if (logoRecords.length > 0) {
          await supabase.from("store_assets").insert(logoRecords);
        }
        setAdditionalLogoFiles([]);
      }

      if (assetFiles.length > 0) {
        setAssetUploading(true);
        if (!userId) throw new Error("Nao autenticado");

        const recordsToInsert: { store_id: string; file_path: string; label: string }[] = [];

        for (const [index, file] of assetFiles.entries()) {
          const ext = file.name.split(".").pop() || "png";
          const path = `${userId}/${editingStore.id}/${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

          const { error: uploadError } = await supabase.storage
            .from("store-assets")
            .upload(path, file, { upsert: false });

          if (uploadError) {
            throw new Error(`Erro no upload dos materiais: ${uploadError.message}`);
          }

          recordsToInsert.push({
            store_id: editingStore.id,
            file_path: path,
            label: file.name,
          });
        }

        if (recordsToInsert.length > 0) {
          const { error: insertError } = await supabase
            .from("store_assets")
            .insert(recordsToInsert);
          if (insertError) {
            throw new Error(`Erro ao salvar materiais: ${insertError.message}`);
          }
        }
      }

      const brandVoice = profileVoice === "custom" ? profileCustomVoice : profileVoice;

      const profilePayload = {
        name: profileName.trim() || editingStore.name,
        niche: profileNiche.trim(),
        target_audience: profileAudience.trim() || null,
        brand_voice: brandVoice || null,
        store_description: profileDescription.trim() || null,
        logo_path: logoPath,
        target_language: profileTargetLanguage,
        currency_code: profileCurrencyCode,
        auto_convert_prices: profileAutoConvertPrices,
        currency_rate: parsedCurrencyRate,
        price_markup_percent: parsedMarkupPercent,
      };

      const { error } = await supabase
        .from("stores")
        .update(profilePayload)
        .eq("id", editingStore.id);

      if (error && /target_language/i.test(error.message)) {
        const fallbackPayload: Partial<typeof profilePayload> = { ...profilePayload };
        delete fallbackPayload.target_language;
        const { error: fallbackError } = await supabase
          .from("stores")
          .update(fallbackPayload)
          .eq("id", editingStore.id);

        if (fallbackError) throw new Error(fallbackError.message);
        toast.warning("Perfil salvo, mas aplique a migration 010 para salvar o idioma da loja.");
      } else if (error) {
        throw new Error(error.message);
      }

      await loadStores();
      await loadStoreAssets(editingStore.id);
      setAssetFiles([]);
      setProfileOpen(false);
      toast.success("Perfil da loja salvo!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar perfil";
      toast.error(msg);
    } finally {
      setProfileSaving(false);
      setLogoUploading(false);
      setAssetUploading(false);
    }
  }

  async function handleRemove(storeId: string, storeName: string) {
    if (!confirm(`Remover a loja "${storeName}"?`)) return;

    const res = await fetch(`/api/stores/${encodeURIComponent(storeId)}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast.error(data.error || "Erro ao remover loja");
      return;
    }

    setStores((prev) => prev.filter((s) => s.id !== storeId));
    toast.success("Loja removida");
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={t("title")}
        description={t("description")}
      >
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            className={cn(
              buttonVariants({ size: "lg" }),
              "text-[13px] font-medium transition-all duration-200 bg-brand-gradient"
            )}
          >
            <Plus className="mr-2 h-3.5 w-3.5" />
            {t("connect_btn")}
          </DialogTrigger>
          <DialogContent className="border-border/50 bg-card max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle
                className="text-lg font-semibold"
                style={{ letterSpacing: "-0.02em" }}
              >
                {t("connect_dialog_title")}
              </DialogTitle>
            </DialogHeader>

            <div className="rounded-lg border border-border/40 bg-background/40">
              <button
                type="button"
                onClick={() => setShowTutorial((v) => !v)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-[13px] text-foreground/90 hover:bg-background/60 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                  {t("tutorial_toggle")}
                </span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
                    showTutorial && "rotate-180"
                  )}
                />
              </button>
              {showTutorial && (
                <div className="border-t border-border/40 px-4 py-3 space-y-2.5 text-[12px] text-muted-foreground leading-relaxed">
                  <p>
                    <strong className="text-foreground/90">1.</strong> Acesse{" "}
                    <a
                      href="https://dev.shopify.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-foreground transition-colors"
                    >
                      dev.shopify.com
                    </a>{" "}
                    &rarr; Apps &rarr; <strong className="text-foreground/90">Create app</strong>. Da um nome qualquer.
                  </p>
                  <p>
                    <strong className="text-foreground/90">2.</strong> No app criado, va em{" "}
                    <strong className="text-foreground/90">Configuration</strong> e em{" "}
                    <strong className="text-foreground/90">Acesso &rarr; Selecionar escopos</strong>, cole:
                  </p>
                  <CopyField value={SHOPIFY_SCOPES_STRING} label="Escopos" />
                  <p className="rounded-md border border-amber-500/30 bg-amber-500/8 px-2.5 py-2">
                    A Shopify trata <strong className="text-foreground/90">envio, descontos, estoque e mercados</strong>{" "}
                    como escopos protegidos: depois de colar a lista, ela pede
                    sua aprovacao na propria tela. Aprove todos. Sem eles a loja
                    conecta do mesmo jeito, mas voce vai ter que configurar zona
                    de envio, desconto e estoque na mao no admin da Shopify.
                  </p>
                  <p>
                    <strong className="text-foreground/90">3.</strong> Em{" "}
                    <strong className="text-foreground/90">URLs de redirecionamento</strong>, cole exatamente:
                  </p>
                  <CopyField
                    value={`${publicAppUrl}/api/shopify/auth`}
                    label="URL de redirecionamento"
                  />
                  <p>
                    <strong className="text-foreground/90">4.</strong> Em{" "}
                    <strong className="text-foreground/90">URL do app</strong>, cole apenas o dominio (sem o /api/shopify/auth):
                  </p>
                  <CopyField value={publicAppUrl} label="URL do app" />
                  <p>
                    Marque <strong className="text-foreground/90">Usar fluxo de instalacao legado</strong> e clica em <strong className="text-foreground/90">Lancar</strong> a versao no topo da pagina.
                  </p>
                  <p>
                    <strong className="text-foreground/90">5.</strong> Em{" "}
                    <strong className="text-foreground/90">API credentials</strong>, copie o{" "}
                    <strong className="text-foreground/90">Client ID</strong> e o{" "}
                    <strong className="text-foreground/90">Client Secret</strong>.
                  </p>
                  <p>
                    <strong className="text-foreground/90">6.</strong> Cole o dominio + Client ID + Client Secret abaixo e clique em <strong className="text-foreground/90">Conectar</strong>.
                    Se o app ainda nao estiver instalado nessa loja, voce sera redirecionado para autorizar na Shopify automaticamente.
                  </p>
                </div>
              )}
            </div>

            <form onSubmit={handleConnect} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[13px] text-muted-foreground">
                  {t("domain_label")}
                </Label>
                <Input
                  placeholder={t("domain_placeholder")}
                  value={shopDomain}
                  onChange={(e) => setShopDomain(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  className={`h-10 bg-background/50 border-border/50 text-sm transition-colors duration-200 focus:border-primary/50 ${!isShopDomainValid ? "border-destructive/60 focus:border-destructive" : ""}`}
                />
                <p className="text-xs text-muted-foreground/70">
                  Use o dominio interno da Shopify, exemplo:{" "}
                  <span className="font-mono">sualoja.myshopify.com</span>.
                </p>
                {!isShopDomainValid && (
                  <p className="text-xs text-destructive">
                    Domínio inválido. Use um formato como loja.myshopify.com ou seu domínio próprio (loja.com).
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-[13px] text-muted-foreground">
                  {t("client_id_label")}
                </Label>
                <Input
                  placeholder="ID do cliente do app"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  required
                  className="h-10 bg-background/50 border-border/50 text-sm transition-colors duration-200 focus:border-primary/50"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[13px] text-muted-foreground">
                  {t("client_secret_label")}
                </Label>
                <Input
                  type="password"
                  placeholder="shpss_..."
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  required
                  className="h-10 bg-background/50 border-border/50 text-sm transition-colors duration-200 focus:border-primary/50"
                />
                <p className="text-xs text-muted-foreground/70">
                  Encontre em{" "}
                  <a
                    href="https://dev.shopify.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-foreground transition-colors duration-200"
                  >
                    dev.shopify.com
                  </a>{" "}
                  &rarr; seu app &rarr; Credenciais
                </p>
              </div>
              <Button
                type="submit"
                className="w-full h-10 text-sm font-medium transition-all duration-200"
                style={{
                  background: loading
                    ? "color-mix(in oklch, var(--action) 70%, transparent)"
                    : "var(--action)",
                  color: "var(--action-foreground)",
                }}
                disabled={loading || !isShopDomainValid}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t("connect_submit")
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {!loadingStores && stores.length > 0 && (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle
              className="text-[13px] font-medium uppercase text-muted-foreground"
              style={{ letterSpacing: "0.05em" }}
            >
              {t("brand_materials_title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <Label className="text-[13px] text-muted-foreground">
                  {t("store_label")}
                </Label>
                <Select value={materialsStoreId} onValueChange={(value) => setMaterialsStoreId(value ?? "")}>
                  <SelectTrigger className="h-10 bg-background/50 border-border/50 text-sm">
                    <SelectValue placeholder="Selecione a loja">
                      {(value: string) => stores.find((store) => store.id === value)?.name ?? value}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 border-border/50"
                  onClick={() => quickAssetsInputRef.current?.click()}
                >
                  <Upload className="mr-2 h-3.5 w-3.5" />
                  {t("add_materials_btn")}
                </Button>
                <Button
                  type="button"
                  className="h-10"
                  style={{
                    background: quickAssetsSaving
                      ? "color-mix(in oklch, var(--action) 40%, transparent)"
                      : "var(--action)",
                    color: "var(--action-foreground)",
                  }}
                  disabled={quickAssetsSaving || quickAssetFiles.length === 0 || !materialsStoreId}
                  onClick={handleSaveQuickAssets}
                >
                  {quickAssetsSaving ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("saving")}
                    </span>
                  ) : (
                    t("save_materials_btn")
                  )}
                </Button>
                <input
                  ref={quickAssetsInputRef}
                  type="file"
                  accept="image/png,image/webp,image/jpeg,image/jpg"
                  onChange={handleQuickAssetsSelect}
                  multiple
                  className="hidden"
                />
              </div>
            </div>

            {quickAssetFiles.length > 0 && (
              <div className="rounded-lg border border-border/30 bg-background/50 p-2.5">
                <p className="text-[11px] font-medium text-muted-foreground mb-1.5">
                  {t("ready_to_save", { count: quickAssetFiles.length })}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {quickAssetFiles.map((file, index) => (
                    <Badge key={`${file.name}-${index}`} variant="outline" className="text-[10px] border-border/40">
                      {file.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {materialsStoreId && (
              storeAssets.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                  {storeAssets.map((asset) => (
                    <div key={asset.id} className="relative group">
                      <div className="relative aspect-square overflow-hidden rounded-md border border-border/50 bg-background/40">
                        <Image
                          src={getAssetUrl(asset.file_path)}
                          alt={asset.label || "Material da marca"}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleRemoveAsset(asset)}
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-card border border-border/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remover material"
                      >
                        <X className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("no_materials")}
                </p>
              )
            )}
          </CardContent>
        </Card>
      )}

      {loadingStores ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <StoreSkeleton />
          <StoreSkeleton />
          <StoreSkeleton />
        </div>
      ) : stores.length === 0 ? (
        <div className="animate-fade-in flex flex-col items-center justify-center rounded-xl border border-dashed border-border/50 py-16">
          <div
            className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl"
            style={{ background: "color-mix(in oklch, var(--action) 8%, transparent)" }}
          >
            <Store
              className="h-6 w-6"
              style={{ color: "var(--action)" }}
            />
          </div>
          <p
            className="text-base font-medium text-foreground"
            style={{ letterSpacing: "-0.01em" }}
          >
            {t("no_stores_title")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("no_stores_body")}
          </p>
          <Button
            onClick={() => setOpen(true)}
            className="mt-5 h-9 text-[13px] font-medium transition-all duration-200"
          >
            <Plus className="mr-2 h-3.5 w-3.5" />
            {t("connect_btn")}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 stagger-children">
          {storeGroups.map((group) => (
            <Fragment key={group.role}>
              {/* Cabecalho de grupo ocupando a linha inteira do grid: separa
                  quem recebe trafego de quem cobra sem precisar de duas telas. */}
              <div className="col-span-full mt-2 first:mt-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border/60 pb-2">
                  <h2 className="text-sm font-semibold text-foreground">{group.title}</h2>
                  <StoreRoleBadge role={group.role} />
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {group.stores.length}
                  </span>
                </div>
                <p className="mt-1.5 max-w-2xl text-xs leading-5 text-muted-foreground">
                  {group.hint}
                </p>
              </div>
              {group.stores.map((store) => (
            <Card
              key={store.id}
              className={cn(
                "group border-border/50 bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-border",
                // Faixa lateral na cor do papel: depois de rolar a pagina e
                // perder o cabecalho do grupo de vista, ela ainda diz se esta
                // loja recebe trafego ou cobra.
                "border-l-2",
                group.role === "vitrine" && "border-l-vitrine/70",
                group.role === "checkout" && "border-l-checkout/70",
                group.role === "both" && "border-l-primary/70",
                group.role === "unassigned" && "border-l-border"
              )}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  {/* Logo thumbnail */}
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/50 overflow-hidden"
                    style={{ background: "var(--muted)" }}
                  >
                    {store.logo_path ? (
                      <Image
                        src={getLogoUrl(store.logo_path)}
                        alt={store.name}
                        width={40}
                        height={40}
                        className="object-contain"
                        unoptimized
                      />
                    ) : (
                      <Store className="h-4 w-4 text-muted-foreground/50" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <CardTitle
                        className="text-[15px] font-semibold truncate"
                        style={{ letterSpacing: "-0.01em" }}
                      >
                        {store.name}
                      </CardTitle>
                      {isProfileComplete(store) ? (
                        <Badge
                          className="text-[10px] font-medium shrink-0"
                          style={{
                            background: "color-mix(in oklch, var(--action) 10%, transparent)",
                            color: "var(--action)",
                            border: "none",
                          }}
                        >
                          {t("store_badge_configured")}
                        </Badge>
                      ) : (
                        <Badge
                          className="text-[10px] font-medium shrink-0"
                          style={{
                            background: "color-mix(in oklch, var(--warning) 10%, transparent)",
                            color: "var(--warning)",
                            border: "none",
                          }}
                        >
                          <AlertCircle className="mr-1 h-3 w-3" />
                          {t("store_badge_incomplete")}
                        </Badge>
                      )}
                    </div>
                    <a
                      href={`https://${store.shop_domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors duration-200"
                    >
                      {store.shop_domain}
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                    {group.role !== "unassigned" && (
                      <StoreRoleBadge role={group.role} className="mt-1.5" showHint />
                    )}
                  </div>
                </div>
                {store.niche && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="w-fit text-[11px] border-border/30">
                      {store.niche}
                    </Badge>
                    <Badge variant="outline" className="w-fit text-[11px] border-border/30">
                      {store.currency_code || "USD"}
                    </Badge>
                    <Badge variant="outline" className="w-fit text-[11px] border-border/30">
                      {LANGUAGE_OPTIONS.find((option) => option.value === store.target_language)?.label ||
                        store.target_language ||
                        "Português do Brasil"}
                    </Badge>
                    {store.auto_convert_prices && (
                      <Badge
                        className="w-fit text-[10px] font-medium"
                        style={{
                          background: "color-mix(in oklch, var(--action) 10%, transparent)",
                          color: "var(--action)",
                          border: "none",
                        }}
                      >
                        {t("auto_conversion")}
                      </Badge>
                    )}
                  </div>
                )}
              </CardHeader>
              <CardContent className="flex items-center justify-between pt-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void openProfileEditor(store)}
                  className="h-8 text-[12px] border-border/50 hover:border-border"
                >
                  <Pencil className="mr-1.5 h-3 w-3" />
                  {isProfileComplete(store) ? t("edit_profile_btn") : t("configure_profile_btn")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemove(store.id, store.name)}
                  className="h-8 w-8 p-0 text-muted-foreground/50 opacity-0 group-hover:opacity-100 hover:text-destructive transition-all duration-200"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
              ))}
            </Fragment>
          ))}
        </div>
      )}

      {/* Profile Editor Dialog */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="border-border/50 bg-card max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle
              className="text-lg font-semibold"
              style={{ letterSpacing: "-0.02em" }}
            >
              {t("profile_dialog_title", { name: editingStore?.name ?? "" })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {/* Store Name */}
            <div className="space-y-2">
              <Label className="text-[13px] text-muted-foreground">
                Store Name
              </Label>
              <Input
                placeholder="My Store"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="h-10 bg-background/50 border-border/50 text-sm"
              />
            </div>

            {/* Logo upload */}
            <div className="space-y-2">
              <Label className="text-[13px] text-muted-foreground">
                {t("logo_label")}
              </Label>
              <div className="flex items-center gap-4">
                <div
                  className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-border/50 overflow-hidden cursor-pointer hover:border-border transition-colors duration-200"
                  style={{ background: "var(--background)" }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {logoPreview ? (
                    <Image
                      src={logoPreview}
                      alt="Logo"
                      width={80}
                      height={80}
                      className="object-contain"
                      unoptimized
                    />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-muted-foreground/30" />
                  )}
                </div>
                <div className="space-y-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-[12px] border-border/50"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="mr-1.5 h-3 w-3" />
                    {logoPreview ? t("change_logo") : t("upload_logo")}
                  </Button>
                  <p className="text-[11px] text-muted-foreground/50">
                    PNG, SVG, WEBP ou JPG. Max 2MB.
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/svg+xml,image/webp,image/jpeg"
                  onChange={handleLogoSelect}
                  className="hidden"
                />
              </div>
            </div>

            {/* Logos adicionais */}
            <div className="space-y-2">
              <Label className="text-[13px] text-muted-foreground">
                {t("additional_logos_label")}
              </Label>
              <p className="text-[11px] text-muted-foreground/50">
                {t("additional_logos_hint")}
              </p>

              {/* Existing additional logos from store_assets */}
              {storeAssets.filter((a) => (a.label || "").toLowerCase().startsWith("logo")).length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {storeAssets
                    .filter((a) => (a.label || "").toLowerCase().startsWith("logo"))
                    .map((asset) => (
                      <div key={asset.id} className="relative group">
                        <div className="aspect-square rounded-md border border-border/40 overflow-hidden" style={{ background: "var(--background)" }}>
                          <Image
                            src={getLogoUrl(asset.file_path)}
                            alt={asset.label || "Logo"}
                            width={80}
                            height={80}
                            className="w-full h-full object-contain"
                            unoptimized
                          />
                        </div>
                        <span className="text-[9px] text-muted-foreground/60 truncate block mt-0.5">
                          {(asset.label || "Logo").replace(/^logo:?/i, "").trim() || "Logo"}
                        </span>
                      </div>
                    ))}
                </div>
              )}

              {/* Pending uploads */}
              {additionalLogoFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {additionalLogoFiles.map((file, i) => (
                    <Badge key={`${file.name}-${i}`} variant="outline" className="text-[10px] border-border/40">
                      {file.name}
                    </Badge>
                  ))}
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[11px] border-border/50"
                onClick={() => additionalLogoInputRef.current?.click()}
              >
                <Upload className="mr-1.5 h-3 w-3" />
                {t("add_logo_btn")}
              </Button>
              <input
                ref={additionalLogoInputRef}
                type="file"
                accept="image/png,image/svg+xml,image/webp,image/jpeg"
                onChange={handleAdditionalLogoSelect}
                multiple
                className="hidden"
              />
            </div>

            {/* Materiais da marca */}
            <div className="space-y-2">
              <Label className="text-[13px] text-muted-foreground">
                {t("brand_materials_label")}
              </Label>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-[12px] border-border/50"
                  onClick={() => assetsInputRef.current?.click()}
                >
                  <Upload className="mr-1.5 h-3 w-3" />
                  {t("add_materials_btn")}
                </Button>
                <span className="text-[11px] text-muted-foreground/60">
                  Up to 12 images (PNG, JPG, WEBP)
                </span>
                <input
                  ref={assetsInputRef}
                  type="file"
                  accept="image/png,image/webp,image/jpeg,image/jpg"
                  onChange={handleAssetsSelect}
                  multiple
                  className="hidden"
                />
              </div>

              {assetFiles.length > 0 && (
                <div className="rounded-lg border border-border/30 bg-background/50 p-2.5">
                  <p className="text-[11px] font-medium text-muted-foreground mb-1.5">
                    {`New files (${assetFiles.length})`}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {assetFiles.map((file, index) => (
                      <Badge key={`${file.name}-${index}`} variant="outline" className="text-[10px] border-border/40">
                        {file.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {storeAssets.length > 0 ? (
                <div className="grid grid-cols-4 gap-2">
                  {storeAssets.map((asset) => (
                    <div key={asset.id} className="relative group">
                      <div className="relative aspect-square overflow-hidden rounded-md border border-border/50 bg-background/40">
                        <Image
                          src={getAssetUrl(asset.file_path)}
                          alt={asset.label || "Material da marca"}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleRemoveAsset(asset)}
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-card border border-border/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remover material"
                      >
                        <X className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground/50">
                  No extra materials yet. These files will be used as visual references for image recreation.
                </p>
              )}
            </div>

            {/* Nicho */}
            <div className="space-y-2">
              <Label className="text-[13px] text-muted-foreground">
                {t("niche_label")}
              </Label>
              <Input
                placeholder={t("niche_placeholder")}
                value={profileNiche}
                onChange={(e) => setProfileNiche(e.target.value)}
                className="h-10 bg-background/50 border-border/50 text-sm"
              />
              <p className="text-[11px] text-muted-foreground/50">
                {t("niche_hint")}
              </p>
            </div>

            {/* Público-alvo */}
            <div className="space-y-2">
              <Label className="text-[13px] text-muted-foreground">
                {t("audience_label")}
              </Label>
              <Textarea
                placeholder="e.g. Women 25-40 who practice yoga and pilates, looking for quality and convenience"
                value={profileAudience}
                onChange={(e) => setProfileAudience(e.target.value)}
                rows={2}
                className="bg-background/50 border-border/50 text-sm"
              />
            </div>

            {/* Voz da marca */}
            <div className="space-y-2">
              <Label className="text-[13px] text-muted-foreground">
                {t("brand_voice_label")}
              </Label>
              <Select value={profileVoice} onValueChange={(v) => setProfileVoice(v ?? "")}>
                <SelectTrigger className="h-10 bg-background/50 border-border/50 text-sm">
                  <SelectValue placeholder="How does your brand communicate?" />
                </SelectTrigger>
                <SelectContent>
                  {BRAND_VOICE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {profileVoice === "custom" && (
                <Input
                  placeholder="Describe your brand voice..."
                  value={profileCustomVoice}
                  onChange={(e) => setProfileCustomVoice(e.target.value)}
                  className="h-10 bg-background/50 border-border/50 text-sm"
                />
              )}
            </div>

            {/* Descrição da loja */}
            <div className="space-y-2">
              <Label className="text-[13px] text-muted-foreground">
                {t("store_description_label")}
              </Label>
              <Textarea
                placeholder="e.g. We sell premium fitness accessories for women who train at home. Focus on practicality, comfort and beautiful design."
                value={profileDescription}
                onChange={(e) => setProfileDescription(e.target.value)}
                rows={3}
                className="bg-background/50 border-border/50 text-sm"
              />
              <p className="text-[11px] text-muted-foreground/50">
                {t("store_description_hint")}
              </p>
            </div>

            <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/8 p-3">
              <Label className="text-[13px] text-muted-foreground">
                {t("language_label")}
              </Label>
              <Select
                value={profileTargetLanguage}
                onValueChange={(value) => setProfileTargetLanguage(value ?? "pt-BR")}
              >
                <SelectTrigger className="h-10 bg-background/60 border-border/50 text-sm">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map((language) => (
                    <SelectItem key={language.value} value={language.value}>
                      {language.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] leading-5 text-muted-foreground/80">
                {t("language_hint")}
              </p>
            </div>

            <div className="space-y-3 rounded-lg border border-border/40 bg-background/40 p-3.5">
              <p className="text-[12px] font-medium uppercase text-muted-foreground" style={{ letterSpacing: "0.05em" }}>
                {t("price_currency_title")}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-[12px] text-muted-foreground">
                    {t("currency_label")}
                  </Label>
                  <Select
                    value={profileCurrencyCode}
                    onValueChange={(value) => setProfileCurrencyCode(value ?? "USD")}
                  >
                    <SelectTrigger className="h-10 bg-background/60 border-border/50 text-sm">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCY_OPTIONS.map((currency) => (
                        <SelectItem key={currency.value} value={currency.value}>
                          {currency.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[12px] text-muted-foreground">
                    {t("rate_label")}
                  </Label>
                  <Input
                    value={profileCurrencyRate}
                    onChange={(e) => setProfileCurrencyRate(e.target.value)}
                    placeholder="Ex: 5.65"
                    inputMode="decimal"
                    className="h-10 bg-background/60 border-border/50 text-sm"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-[12px] text-muted-foreground">
                    {t("markup_label")}
                  </Label>
                  <Input
                    value={profilePriceMarkupPercent}
                    onChange={(e) => setProfilePriceMarkupPercent(e.target.value)}
                    placeholder="Ex: 25"
                    inputMode="decimal"
                    className="h-10 bg-background/60 border-border/50 text-sm"
                  />
                </div>

                <div className="space-y-1.5 rounded-md border border-border/40 bg-background/60 p-2.5">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={profileAutoConvertPrices}
                      onChange={(e) => setProfileAutoConvertPrices(e.target.checked)}
                      className="h-4 w-4 rounded border-border/70 bg-background"
                    />
                    <span className="text-foreground/90">
                      {t("auto_convert_label")}
                    </span>
                  </label>
                  <p className="text-[11px] text-muted-foreground/80">
                    {t("auto_convert_hint")}
                  </p>
                </div>
              </div>
            </div>

            <Button
              onClick={handleSaveProfile}
              disabled={profileSaving}
              className="w-full h-10 text-sm font-medium transition-all duration-200"
              style={{
                background: profileSaving
                  ? "color-mix(in oklch, var(--action) 30%, transparent)"
                  : "var(--action)",
                color: "var(--action-foreground)",
              }}
            >
              {profileSaving ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {logoUploading
                    ? t("uploading_logo")
                    : assetUploading
                      ? t("uploading_materials")
                      : t("saving")}
                </span>
              ) : (
                t("save_profile_btn")
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

