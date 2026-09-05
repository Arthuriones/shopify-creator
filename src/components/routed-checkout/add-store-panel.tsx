"use client";

import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Conectar uma loja Shopify sem sair do console.
 *
 * Antes isto obrigava a ir para /stores, conectar, e voltar -- no meio de
 * criar uma rota, que e justamente quando a pessoa descobre que falta uma
 * loja. As credenciais sao de um app customizado da propria loja: o texto
 * explica onde achar, porque e a duvida que trava todo mundo aqui.
 */
export function AddStorePanel({
  onConnected,
  onCancel,
}: {
  onConnected: () => void;
  onCancel: () => void;
}) {
  const [shopDomain, setShopDomain] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);

  const pronto = shopDomain.trim() && clientId.trim() && clientSecret.trim();

  async function connect() {
    setSaving(true);
    try {
      const response = await fetch("/api/shopify/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopDomain: shopDomain.trim(),
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error || "Nao consegui conectar a loja.");
        return;
      }
      toast.success(`${data.store?.name || shopDomain.trim()} conectada.`);
      setShopDomain("");
      setClientId("");
      setClientSecret("");
      onConnected();
    } catch {
      toast.error("Nao consegui conectar a loja.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/60 px-5 py-4">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          Conectar uma loja
        </h2>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
          Vale para vitrine e para loja de checkout. O papel de cada uma vem da
          rota, nao de uma escolha aqui.
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <div className="space-y-1.5">
          <Label htmlFor="add-store-domain" className="text-xs">
            Dominio da loja
          </Label>
          <Input
            id="add-store-domain"
            value={shopDomain}
            onChange={(event) => setShopDomain(event.target.value)}
            placeholder="minhaloja.myshopify.com"
            autoComplete="off"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="add-store-client-id" className="text-xs">
            Client ID
          </Label>
          <Input
            id="add-store-client-id"
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="add-store-client-secret" className="text-xs">
            Client Secret
          </Label>
          <Input
            id="add-store-client-secret"
            type="password"
            value={clientSecret}
            onChange={(event) => setClientSecret(event.target.value)}
            autoComplete="off"
          />
        </div>

        <p className="rounded-lg border border-border bg-muted/25 px-3 py-2.5 text-[11px] leading-5 text-muted-foreground">
          Na Shopify: Configuracoes, Apps e canais de venda, Desenvolver apps,
          criar um app, e em Credenciais da API copiar o Client ID e o Client
          Secret.{" "}
          <a
            href="https://admin.shopify.com/settings/apps/development"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-foreground underline underline-offset-2"
          >
            Abrir na Shopify
            <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </div>

      <div className="flex gap-2 border-t border-border/60 px-5 py-3">
        <Button onClick={connect} disabled={!pronto || saving} className="flex-1">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Conectar loja
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
