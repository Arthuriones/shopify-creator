export interface Store {
  id: string;
  user_id: string;
  shop_domain: string;
  client_id: string;
  client_secret: string;
  name: string;
  theme_id: string | null;
  niche: string | null;
  target_audience: string | null;
  brand_voice: string | null;
  store_description: string | null;
  logo_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface StoreContext {
  name: string;
  niche: string;
  targetAudience: string;
  brandVoice: string;
  storeDescription: string;
}

export interface StoreAsset {
  id: string;
  store_id: string;
  file_path: string;
  label: string | null;
  created_at: string;
}

export interface Product {
  id: string;
  store_id: string;
  aliexpress_url: string;
  shopify_product_id: string | null;
  title: string;
  original_title: string;
  description: string;
  original_description: string;
  price: number;
  images: string[];
  status: "pending" | "optimized" | "published" | "failed";
  created_at: string;
  updated_at: string;
}

export interface AliExpressVariantOption {
  name: string; // ex: "Cor", "Tamanho"
  values: {
    name: string; // ex: "Preto", "P"
    image?: string; // imagem da variante (ex: cor)
  }[];
}

export interface AliExpressVariant {
  sku: string;
  properties: Record<string, string>; // ex: { "Cor": "Preto", "Tamanho": "P" }
  price: number;
  originalPrice: number;
  stock: number;
}

export interface AliExpressProduct {
  title: string;
  description: string;
  price: number;
  originalPrice: number;
  images: string[];
  specs: Record<string, string>;
  rating: number;
  orders: number;
  variantOptions: AliExpressVariantOption[];
  variants: AliExpressVariant[];
}

export interface OptimizationResult {
  title: string;
  description: string;
  tags: string[];
  seoTitle: string;
  seoDescription: string;
}

export interface StorePolicy {
  type: "refund" | "privacy" | "terms" | "shipping";
  title: string;
  body: string;
}

export interface StoreSetup {
  policies: StorePolicy[];
  mainMenu: {
    title: string;
    handle: string;
    items: { title: string; url: string }[];
  };
  footerMenu: {
    title: string;
    handle: string;
    items: { title: string; url: string }[];
  };
  pages: { title: string; handle: string; body: string }[];
  copyright: string;
}
