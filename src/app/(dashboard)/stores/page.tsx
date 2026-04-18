"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";

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

function isProfileComplete(store: ConnectedStore): boolean {
  return !!(store.niche && store.logo_path);
}

export default function StoresPage() {
  const [stores, setStores] = useState<ConnectedStore[]>([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [shopDomain, setShopDomain] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  // Profile editing
  const [profileOpen, setProfileOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<ConnectedStore | null>(null);
  const [profileNiche, setProfileNiche] = useState("");
  const [profileAudience, setProfileAudience] = useState("");
  const [profileVoice, setProfileVoice] = useState("");
  const [profileCustomVoice, setProfileCustomVoice] = useState("");
  const [profileDescription, setProfileDescription] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadStores();
  }, []);

  async function loadStores() {
    setLoadingStores(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("stores")
      .select("id, name, shop_domain, theme_id, niche, target_audience, brand_voice, store_description, logo_path, created_at")
      .order("created_at", { ascending: false });
    if (data) setStores(data);
    setLoadingStores(false);
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/shopify/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopDomain: shopDomain.replace(/https?:\/\//, "").replace(/\/$/, ""),
          clientId,
          clientSecret,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Erro ao conectar loja");
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
        openProfileEditor(newStore);
      }
    } catch {
      toast.error("Erro ao conectar loja");
    } finally {
      setLoading(false);
    }
  }

  async function loadStoresAndReturn(): Promise<ConnectedStore[] | null> {
    const supabase = createClient();
    const { data } = await supabase
      .from("stores")
      .select("id, name, shop_domain, theme_id, niche, target_audience, brand_voice, store_description, logo_path, created_at")
      .order("created_at", { ascending: false });
    if (data) setStores(data);
    return data;
  }

  function openProfileEditor(store: ConnectedStore) {
    setEditingStore(store);
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
    setLogoPreview(store.logo_path ? getLogoUrl(store.logo_path) : null);
    setLogoFile(null);
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

  async function handleSaveProfile() {
    if (!editingStore) return;
    if (!profileNiche.trim()) {
      toast.error("Nicho é obrigatório");
      return;
    }

    setProfileSaving(true);
    const supabase = createClient();

    try {
      let logoPath = editingStore.logo_path;

      // Upload logo se selecionou novo arquivo
      if (logoFile) {
        setLogoUploading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Não autenticado");

        const ext = logoFile.name.split(".").pop() || "png";
        const path = `${user.id}/${editingStore.id}/logo.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("store-logos")
          .upload(path, logoFile, { upsert: true });

        if (uploadError) {
          throw new Error(`Erro no upload: ${uploadError.message}`);
        }

        logoPath = path;
        setLogoUploading(false);
      }

      const brandVoice = profileVoice === "custom" ? profileCustomVoice : profileVoice;

      const { error } = await supabase
        .from("stores")
        .update({
          niche: profileNiche.trim(),
          target_audience: profileAudience.trim() || null,
          brand_voice: brandVoice || null,
          store_description: profileDescription.trim() || null,
          logo_path: logoPath,
        })
        .eq("id", editingStore.id);

      if (error) throw new Error(error.message);

      await loadStores();
      setProfileOpen(false);
      toast.success("Perfil da loja salvo!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar perfil";
      toast.error(msg);
    } finally {
      setProfileSaving(false);
      setLogoUploading(false);
    }
  }

  async function handleRemove(storeId: string, storeName: string) {
    if (!confirm(`Remover a loja "${storeName}"?`)) return;

    const supabase = createClient();
    const { error } = await supabase.from("stores").delete().eq("id", storeId);

    if (error) {
      toast.error("Erro ao remover loja");
      return;
    }

    setStores((prev) => prev.filter((s) => s.id !== storeId));
    toast.success("Loja removida");
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2
            className="text-3xl font-semibold text-foreground"
            style={{ letterSpacing: "-0.03em" }}
          >
            Lojas
          </h2>
          <p
            className="mt-1 text-base text-muted-foreground"
            style={{ letterSpacing: "-0.01em" }}
          >
            Conecte e configure suas lojas Shopify
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger>
            <Button
              className="h-9 text-[13px] font-medium transition-all duration-200"
              style={{
                background: "oklch(0.72 0.19 155)",
                color: "oklch(0.13 0.02 155)",
              }}
            >
              <Plus className="mr-2 h-3.5 w-3.5" />
              Conectar Loja
            </Button>
          </DialogTrigger>
          <DialogContent className="border-border/50 bg-card">
            <DialogHeader>
              <DialogTitle
                className="text-lg font-semibold"
                style={{ letterSpacing: "-0.02em" }}
              >
                Conectar Loja Shopify
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleConnect} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[13px] text-muted-foreground">
                  Dominio da Loja
                </Label>
                <Input
                  placeholder="minha-loja.myshopify.com"
                  value={shopDomain}
                  onChange={(e) => setShopDomain(e.target.value)}
                  required
                  className="h-10 bg-background/50 border-border/50 text-sm transition-colors duration-200 focus:border-primary/50"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[13px] text-muted-foreground">
                  Client ID
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
                  Client Secret
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
                    ? "oklch(0.72 0.19 155 / 70%)"
                    : "oklch(0.72 0.19 155)",
                  color: "oklch(0.13 0.02 155)",
                }}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Conectar"
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

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
            style={{ background: "oklch(0.72 0.19 155 / 8%)" }}
          >
            <Store
              className="h-6 w-6"
              style={{ color: "oklch(0.72 0.19 155)" }}
            />
          </div>
          <p
            className="text-base font-medium text-foreground"
            style={{ letterSpacing: "-0.01em" }}
          >
            Conecte sua primeira loja
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Importe produtos e publique com IA
          </p>
          <Button
            onClick={() => setOpen(true)}
            className="mt-5 h-9 text-[13px] font-medium transition-all duration-200"
            style={{
              background: "oklch(0.72 0.19 155)",
              color: "oklch(0.13 0.02 155)",
            }}
          >
            <Plus className="mr-2 h-3.5 w-3.5" />
            Conectar Loja
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 stagger-children">
          {stores.map((store) => (
            <Card
              key={store.id}
              className="group border-border/50 bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-border"
            >
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  {/* Logo thumbnail */}
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/50 overflow-hidden"
                    style={{ background: "oklch(0.15 0.005 260)" }}
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
                            background: "oklch(0.72 0.19 155 / 10%)",
                            color: "oklch(0.72 0.19 155)",
                            border: "none",
                          }}
                        >
                          Configurada
                        </Badge>
                      ) : (
                        <Badge
                          className="text-[10px] font-medium shrink-0"
                          style={{
                            background: "oklch(0.75 0.15 75 / 10%)",
                            color: "oklch(0.75 0.15 75)",
                            border: "none",
                          }}
                        >
                          <AlertCircle className="mr-1 h-3 w-3" />
                          Perfil incompleto
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
                  </div>
                </div>
                {store.niche && (
                  <Badge variant="outline" className="mt-2 w-fit text-[11px] border-border/30">
                    {store.niche}
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="flex items-center justify-between pt-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openProfileEditor(store)}
                  className="h-8 text-[12px] border-border/50 hover:border-border"
                >
                  <Pencil className="mr-1.5 h-3 w-3" />
                  {isProfileComplete(store) ? "Editar Perfil" : "Configurar Perfil"}
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
              Perfil da Loja — {editingStore?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {/* Logo upload */}
            <div className="space-y-2">
              <Label className="text-[13px] text-muted-foreground">
                Logo da Loja
              </Label>
              <div className="flex items-center gap-4">
                <div
                  className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-border/50 overflow-hidden cursor-pointer hover:border-border transition-colors duration-200"
                  style={{ background: "oklch(0.12 0.005 260)" }}
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
                    {logoPreview ? "Trocar logo" : "Enviar logo"}
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

            {/* Nicho */}
            <div className="space-y-2">
              <Label className="text-[13px] text-muted-foreground">
                Nicho da Loja <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="ex: Fitness feminino, Pet, Tecnologia, Casa e Decoração"
                value={profileNiche}
                onChange={(e) => setProfileNiche(e.target.value)}
                className="h-10 bg-background/50 border-border/50 text-sm"
              />
              <p className="text-[11px] text-muted-foreground/50">
                Define o contexto para toda a IA: otimização de produtos, políticas, SEO
              </p>
            </div>

            {/* Público-alvo */}
            <div className="space-y-2">
              <Label className="text-[13px] text-muted-foreground">
                Público-alvo
              </Label>
              <Textarea
                placeholder="ex: Mulheres 25-40 que praticam yoga e pilates, buscam qualidade e praticidade"
                value={profileAudience}
                onChange={(e) => setProfileAudience(e.target.value)}
                rows={2}
                className="bg-background/50 border-border/50 text-sm"
              />
            </div>

            {/* Voz da marca */}
            <div className="space-y-2">
              <Label className="text-[13px] text-muted-foreground">
                Voz da Marca
              </Label>
              <Select value={profileVoice} onValueChange={(v) => setProfileVoice(v ?? "")}>
                <SelectTrigger className="h-10 bg-background/50 border-border/50 text-sm">
                  <SelectValue placeholder="Como sua marca se comunica?" />
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
                  placeholder="Descreva a voz da sua marca..."
                  value={profileCustomVoice}
                  onChange={(e) => setProfileCustomVoice(e.target.value)}
                  className="h-10 bg-background/50 border-border/50 text-sm"
                />
              )}
            </div>

            {/* Descrição da loja */}
            <div className="space-y-2">
              <Label className="text-[13px] text-muted-foreground">
                Descrição da Loja
              </Label>
              <Textarea
                placeholder="ex: Vendemos acessórios fitness premium para mulheres que treinam em casa. Foco em praticidade, conforto e design bonito."
                value={profileDescription}
                onChange={(e) => setProfileDescription(e.target.value)}
                rows={3}
                className="bg-background/50 border-border/50 text-sm"
              />
              <p className="text-[11px] text-muted-foreground/50">
                Quanto mais contexto, melhor a IA gera textos e descrições
              </p>
            </div>

            <Button
              onClick={handleSaveProfile}
              disabled={profileSaving || !profileNiche.trim()}
              className="w-full h-10 text-sm font-medium transition-all duration-200"
              style={{
                background: profileSaving || !profileNiche.trim()
                  ? "oklch(0.72 0.19 155 / 30%)"
                  : "oklch(0.72 0.19 155)",
                color: "oklch(0.13 0.02 155)",
              }}
            >
              {profileSaving ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {logoUploading ? "Enviando logo..." : "Salvando..."}
                </span>
              ) : (
                "Salvar Perfil"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
