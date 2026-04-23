import { create } from 'zustand';
import type { AliExpressProduct, OptimizationResult } from '@/types';

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

interface StoreAsset {
  id: string;
  store_id: string;
  file_path: string;
  label: string | null;
  created_at: string;
}

type LogoPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

interface ProductStoreState {
  // Global / Loading states
  url: string;
  setUrl: (url: string) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  optimizing: boolean;
  setOptimizing: (optimizing: boolean) => void;
  publishing: boolean;
  setPublishing: (publishing: boolean) => void;
  published: boolean;
  setPublished: (published: boolean) => void;
  
  // Jobs Polling
  optimizeJobId: string | null;
  setOptimizeJobId: (id: string | null) => void;
  publishJobId: string | null;
  setPublishJobId: (id: string | null) => void;
  brandJobId: string | null;
  setBrandJobId: (id: string | null) => void;
  
  // Product Data
  product: AliExpressProduct | null;
  setProduct: (product: AliExpressProduct | null) => void;
  baseImportedProduct: AliExpressProduct | null;
  setBaseImportedProduct: (product: AliExpressProduct | null) => void;
  optimized: OptimizationResult | null;
  setOptimized: (optimized: OptimizationResult | null) => void;
  
  // Store Settings
  stores: StoreOption[];
  setStores: (stores: StoreOption[]) => void;
  selectedStore: string;
  setSelectedStore: (selectedStore: string) => void;
  
  // Pricing
  priceDraft: string;
  setPriceDraft: (priceDraft: string) => void;
  comparePriceDraft: string;
  setComparePriceDraft: (comparePriceDraft: string) => void;
  bulkMarkupDraft: string;
  setBulkMarkupDraft: (bulkMarkupDraft: string) => void;
  variantPriceInputs: Record<string, string>;
  setVariantPriceInputs: (inputs: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  
  // Layout
  activeTab: string;
  setActiveTab: (tab: string) => void;
  
  // Materials / Assets
  storeAssets: StoreAsset[];
  setStoreAssets: (assets: StoreAsset[]) => void;
  materialFiles: File[];
  setMaterialFiles: (files: File[]) => void;
  materialsLoading: boolean;
  setMaterialsLoading: (loading: boolean) => void;
  materialsSaving: boolean;
  setMaterialsSaving: (saving: boolean) => void;
  autoApplyLogoOnImport: boolean;
  setAutoApplyLogoOnImport: (autoApply: boolean) => void;
  
  // Edit Form Fields
  editTitle: string;
  setEditTitle: (title: string) => void;
  editDescription: string;
  setEditDescription: (desc: string) => void;
  editTags: string;
  setEditTags: (tags: string) => void;
  editSeoTitle: string;
  setEditSeoTitle: (seoTitle: string) => void;
  editSeoDescription: string;
  setEditSeoDescription: (seoDesc: string) => void;
  publishToStorefront: boolean;
  setPublishToStorefront: (publish: boolean) => void;
  
  // Image Generation
  imagePromptOpen: boolean;
  setImagePromptOpen: (open: boolean) => void;
  imagePromptLoading: boolean;
  setImagePromptLoading: (loading: boolean) => void;
  imagePrompt: string;
  setImagePrompt: (prompt: string) => void;
  selectedImageUrl: string;
  setSelectedImageUrl: (url: string) => void;
  generatedImages: Record<string, string>;
  setGeneratedImages: (images: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  
  // Logo Customization
  logoPosition: LogoPosition;
  setLogoPosition: (pos: LogoPosition) => void;
  logoSize: number;
  setLogoSize: (size: number) => void;
  logoOpacity: number;
  setLogoOpacity: (opacity: number) => void;
  logoMargin: number;
  setLogoMargin: (margin: number) => void;
  logoApplying: boolean;
  setLogoApplying: (applying: boolean) => void;
  brandedImages: Record<string, string>;
  setBrandedImages: (images: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  selectedLogoId: string;
  setSelectedLogoId: (id: string) => void;
  selectedMainImage: number;
  setSelectedMainImage: (index: number) => void;
  previewDescription: string;
  setPreviewDescription: (desc: string) => void;
}

export const useProductStore = create<ProductStoreState>((set) => ({
  url: "",
  setUrl: (url) => set({ url }),
  loading: false,
  setLoading: (loading) => set({ loading }),
  optimizing: false,
  setOptimizing: (optimizing) => set({ optimizing }),
  publishing: false,
  setPublishing: (publishing) => set({ publishing }),
  published: false,
  setPublished: (published) => set({ published }),

  optimizeJobId: null,
  setOptimizeJobId: (optimizeJobId) => set({ optimizeJobId }),
  publishJobId: null,
  setPublishJobId: (publishJobId) => set({ publishJobId }),
  brandJobId: null,
  setBrandJobId: (brandJobId) => set({ brandJobId }),
  
  product: null,
  setProduct: (product) => set({ product }),
  baseImportedProduct: null,
  setBaseImportedProduct: (baseImportedProduct) => set({ baseImportedProduct }),
  optimized: null,
  setOptimized: (optimized) => set({ optimized }),
  
  stores: [],
  setStores: (stores) => set({ stores }),
  selectedStore: "",
  setSelectedStore: (selectedStore) => set({ selectedStore }),
  
  priceDraft: "",
  setPriceDraft: (priceDraft) => set({ priceDraft }),
  comparePriceDraft: "",
  setComparePriceDraft: (comparePriceDraft) => set({ comparePriceDraft }),
  bulkMarkupDraft: "0",
  setBulkMarkupDraft: (bulkMarkupDraft) => set({ bulkMarkupDraft }),
  variantPriceInputs: {},
  setVariantPriceInputs: (inputs) => set((state) => ({ 
    variantPriceInputs: typeof inputs === 'function' ? inputs(state.variantPriceInputs) : inputs 
  })),
  
  activeTab: "optimized",
  setActiveTab: (activeTab) => set({ activeTab }),
  
  storeAssets: [],
  setStoreAssets: (storeAssets) => set({ storeAssets }),
  materialFiles: [],
  setMaterialFiles: (materialFiles) => set({ materialFiles }),
  materialsLoading: false,
  setMaterialsLoading: (materialsLoading) => set({ materialsLoading }),
  materialsSaving: false,
  setMaterialsSaving: (materialsSaving) => set({ materialsSaving }),
  autoApplyLogoOnImport: true,
  setAutoApplyLogoOnImport: (autoApplyLogoOnImport) => set({ autoApplyLogoOnImport }),
  
  editTitle: "",
  setEditTitle: (editTitle) => set({ editTitle }),
  editDescription: "",
  setEditDescription: (editDescription) => set({ editDescription }),
  editTags: "",
  setEditTags: (editTags) => set({ editTags }),
  editSeoTitle: "",
  setEditSeoTitle: (editSeoTitle) => set({ editSeoTitle }),
  editSeoDescription: "",
  setEditSeoDescription: (editSeoDescription) => set({ editSeoDescription }),
  publishToStorefront: true,
  setPublishToStorefront: (publishToStorefront) => set({ publishToStorefront }),
  
  imagePromptOpen: false,
  setImagePromptOpen: (imagePromptOpen) => set({ imagePromptOpen }),
  imagePromptLoading: false,
  setImagePromptLoading: (imagePromptLoading) => set({ imagePromptLoading }),
  imagePrompt: "",
  setImagePrompt: (imagePrompt) => set({ imagePrompt }),
  selectedImageUrl: "",
  setSelectedImageUrl: (selectedImageUrl) => set({ selectedImageUrl }),
  generatedImages: {},
  setGeneratedImages: (images) => set((state) => ({ 
    generatedImages: typeof images === 'function' ? images(state.generatedImages) : images 
  })),
  
  logoPosition: "bottom-left",
  setLogoPosition: (logoPosition) => set({ logoPosition }),
  logoSize: 200,
  setLogoSize: (logoSize) => set({ logoSize }),
  logoOpacity: 1,
  setLogoOpacity: (logoOpacity) => set({ logoOpacity }),
  logoMargin: 15,
  setLogoMargin: (logoMargin) => set({ logoMargin }),
  logoApplying: false,
  setLogoApplying: (logoApplying) => set({ logoApplying }),
  brandedImages: {},
  setBrandedImages: (images) => set((state) => ({ 
    brandedImages: typeof images === 'function' ? images(state.brandedImages) : images 
  })),
  selectedLogoId: "",
  setSelectedLogoId: (selectedLogoId) => set({ selectedLogoId }),
  selectedMainImage: 0,
  setSelectedMainImage: (selectedMainImage) => set({ selectedMainImage }),
  previewDescription: "",
  setPreviewDescription: (previewDescription) => set({ previewDescription }),
}));
