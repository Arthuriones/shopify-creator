import React from "react";
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
import { Badge } from "@/components/ui/badge";

interface StoreOption {
  id: string;
  name: string;
  shop_domain: string;
  niche: string | null;
  logo_path: string | null;
  currency_code: string;
  auto_convert_prices: boolean;
  currency_rate: number;
  price_markup_percent: number;
}

interface StoreSettingsCardProps {
  stores: StoreOption[];
  selectedStore: string;
  setSelectedStore: (id: string) => void;
  selectedStoreData: StoreOption | undefined;
}

export function StoreSettingsCard({
  stores,
  selectedStore,
  setSelectedStore,
  selectedStoreData,
}: StoreSettingsCardProps) {
  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle>Configuracoes da Loja</CardTitle>
        <CardDescription>
          Selecione a loja de destino para carregar materiais e regras de preco.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Select
            value={selectedStore}
            onValueChange={(val) => setSelectedStore(val || "")}
          >
            <SelectTrigger className="w-full bg-background/50 border-border/50">
              <SelectValue placeholder="Selecione uma loja...">
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

        {selectedStoreData && (
          <div className="flex flex-wrap gap-2 pt-2">
            <Badge variant="outline" className="border-border/40 text-[11px]">
              {selectedStoreData.currency_code}
            </Badge>
            {selectedStoreData.auto_convert_prices && (
              <Badge variant="secondary" className="bg-primary/10 text-primary text-[11px] border-none hover:bg-primary/20">
                Conversao Automatica
              </Badge>
            )}
            {selectedStoreData.niche && (
              <Badge variant="outline" className="border-border/40 text-[11px]">
                {selectedStoreData.niche}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
