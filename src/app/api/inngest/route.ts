import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { 
  optimizeProductText, 
  removeLogoFromImage,
  applyLogoToAllImages,
  publishToShopify,
  bulkImportProduct
} from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    optimizeProductText,
    removeLogoFromImage,
    applyLogoToAllImages,
    publishToShopify,
    bulkImportProduct
  ],
});
