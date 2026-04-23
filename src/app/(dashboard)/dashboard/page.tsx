"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Store, CreditCard, Activity, ArrowUpRight, CheckCircle2, TrendingUp } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="container max-w-6xl mx-auto py-8 space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-2">Visão geral do seu negócio e métricas de faturamento.</p>
      </div>

      {/* Métricas Principais */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Lojas Conectadas</CardTitle>
            <Store className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">1</div>
            <p className="text-xs text-muted-foreground mt-1">Plano Pro (Até 3 lojas)</p>
          </CardContent>
        </Card>
        
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Produtos Importados</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">12</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <ArrowUpRight className="h-3 w-3 text-emerald-500" />
              <span className="text-emerald-500">+3</span> este mês
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Imagens com Logo</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">48</div>
            <p className="text-xs text-muted-foreground mt-1">Processadas com sucesso</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Assinatura</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[oklch(0.72_0.19_155)]">Pro</div>
            <p className="text-xs text-muted-foreground mt-1">Ativa • Renovação em 15 dias</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Atividade Recente */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-muted-foreground" />
              Atividade Recente
            </CardTitle>
            <CardDescription>Suas últimas ações na plataforma</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {[
                { action: "Produto importado com sucesso", target: "Tênis Esportivo Pro", time: "Há 2 horas" },
                { action: "Otimização de texto via IA", target: "Relógio Smart", time: "Ontem" },
                { action: "Logo aplicada a 5 imagens", target: "Fone Bluetooth", time: "Há 3 dias" },
              ].map((item, i) => (
                <div key={i} className="flex items-start justify-between border-b border-border/30 pb-4 last:border-0 last:pb-0">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">{item.action}</p>
                    <p className="text-xs text-muted-foreground">{item.target}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{item.time}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Status do Faturamento */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
              Uso da Conta
            </CardTitle>
            <CardDescription>Limites do plano Pro</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Lojas Conectadas</span>
                <span className="font-medium text-foreground">1 / 3</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-[oklch(0.72_0.19_155)] rounded-full" style={{ width: "33%" }} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Importações Manuais</span>
                <span className="font-medium text-foreground">12 / Ilimitado</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: "5%" }} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Geração de Texto IA</span>
                <span className="font-medium text-foreground">4 / 100</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: "4%" }} />
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Background Jobs (Bulk)</span>
                <span className="font-medium text-foreground">0 / 50</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: "0%" }} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
