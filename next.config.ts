import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: { root: __dirname },
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium", "undici"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "ae01.alicdn.com" },
      { protocol: "https", hostname: "*.aliexpress.com" },
      { protocol: "https", hostname: "cdn.shopify.com" },
    ],
  },
};

export default withNextIntl(nextConfig);
