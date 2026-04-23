"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Copy, Loader2, PlayCircle, Store } from "lucide-react";

interface StoreOption {
  id: string;
  name: string;
  shop_domain: string;
}

export default function BulkImportPage() {
  const [urls, setUrls] = useState("");
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);
  const [isPolling, setIsPolling] = useState(false);

  useEffect(() => {
    async function loadStores() {
      const supabase = createClient();
      const { data } = await supabase.from("stores").select("id, name, shop_domain");
      if (data) {
        setStores(data);
        if (data.length > 0) setSelectedStore(data[0].id);
      }
    }
    loadStores();
  }, []);

  useEffect(() => {
    if (!isPolling || jobs.length === 0) return;

    const interval = setInterval(() => {
      setJobs(currentJobs => {
        let allCompleted = true;
        const newJobs = currentJobs.map(job => {
          if (job.status === "completed" || job.status === "failed") return job;
          allCompleted = false;

          // Simulate progress
          const now = Date.now();
          const elapsed = now - job.startedAt;

          if (elapsed > 12000) {
            return { ...job, status: "completed", progress: { step: "Finalizado", title: job.progress.title } };
          } else if (elapsed > 9000) {
            return { ...job, progress: { step: "Publicando na Shopify...", title: job.progress.title } };
          } else if (elapsed > 6000) {
            return { ...job, progress: { step: "Aplicando logo nas imagens...", title: job.progress.title } };
          } else if (elapsed > 3000) {
            return { ...job, progress: { step: "Otimizando texto com IA...", title: job.progress.title } };
          }
          return job;
        });

        if (allCompleted) setIsPolling(false);
        return newJobs;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPolling, jobs.length]);

  const handleStartBulk = async () => {
    if (!selectedStore) {
      toast.error("Selecione uma loja.");
      return;
    }
    
    const urlList = urls.split("\n").map(u => u.trim()).filter(u => u.startsWith("http"));
    if (urlList.length === 0) {
      toast.error("Insira pelo menos um link valido do AliExpress.");
      return;
    }
    if (urlList.length > 20) {
      toast.error("Maximo de 20 links por vez.");
      return;
    }

    setLoading(true);
    
    // Simulate adding jobs to the queue
    const newJobs = urlList.map((url, i) => ({
      id: `job-${Date.now()}-${i}`,
      status: "processing",
      startedAt: Date.now() + (i * 2000), // Stagger start times
      progress: {
        title: url,
        step: "Buscando dados no AliExpress..."
      }
    }));

    setJobs(prev => [...newJobs, ...prev].slice(0, 20));
    toast.success(`${urlList.length} produtos enfileirados para importação em lote!`);
    setUrls("");
    setIsPolling(true);
    setLoading(false);
  };

  return (
    <div className="container max-w-4xl mx-auto py-8 space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Importação em Lote</h1>
        <p className="text-muted-foreground mt-2">
          Cole múltiplos links do AliExpress. A nossa IA vai raspar, precificar, otimizar textos e publicar na Shopify em background.
        </p>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Configuração da Importação</CardTitle>
          <CardDescription>Insira até 20 links por vez (um por linha)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Select value={selectedStore} onValueChange={(val) => setSelectedStore(val || "")}>
              <SelectTrigger className="w-full h-11 bg-background/50 border-border/50">
                <SelectValue placeholder="Selecione a Loja Shopify de destino..." />
              </SelectTrigger>
              <SelectContent>
                {stores.map((store) => (
                  <SelectItem key={store.id} value={store.id}>
                    <div className="flex items-center gap-2">
                      <Store className="h-4 w-4 text-muted-foreground" />
                      {store.name} <span className="text-xs text-muted-foreground ml-2">({store.shop_domain})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Textarea 
            placeholder="https://pt.aliexpress.com/item/123...&#10;https://pt.aliexpress.com/item/456..." 
            rows={10}
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            className="font-mono text-sm bg-background/50 border-border/50 focus:border-primary/50"
          />

          <Button 
            className="w-full h-11 font-medium text-sm transition-all duration-200"
            onClick={handleStartBulk}
            disabled={loading || !selectedStore || !urls.trim()}
            style={{
              background: loading || !selectedStore || !urls.trim() ? "oklch(0.72 0.19 155 / 30%)" : "oklch(0.72 0.19 155)",
              color: "oklch(0.13 0.02 155)"
            }}
          >
            {loading ? (
              <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Enfileirando...</span>
            ) : (
              <span className="flex items-center gap-2"><PlayCircle className="w-4 h-4" /> Iniciar Importação em Lote</span>
            )}
          </Button>
        </CardContent>
      </Card>

      {jobs.length > 0 && (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              Fila de Processamento
              {jobs.some(j => j.status === 'processing' || j.status === 'pending') && (
                <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {jobs.map(job => (
                <div key={job.id} className="flex flex-col md:flex-row md:items-center justify-between p-3 rounded-lg border border-border/50 bg-background/40">
                  <div className="space-y-1">
                    <p className="text-sm font-medium line-clamp-1">{job.progress?.title || job.id}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-md">{job.progress?.step || "Aguardando worker..."}</p>
                  </div>
                  <div className="mt-2 md:mt-0 flex items-center gap-3">
                    <span className="text-[11px] uppercase tracking-wider font-medium px-2 py-1 rounded" style={{
                      backgroundColor: job.status === 'completed' ? 'oklch(0.65 0.2 25 / 15%)' : 
                                       job.status === 'failed' ? 'oklch(0.6 0.2 20 / 15%)' : 
                                       'oklch(0.72 0.19 155 / 15%)',
                      color: job.status === 'completed' ? 'oklch(0.65 0.2 25)' : 
                             job.status === 'failed' ? 'oklch(0.6 0.2 20)' : 
                             'oklch(0.72 0.19 155)'
                    }}>
                      {job.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
