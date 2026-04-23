import { scrapeAliExpress } from "./src/lib/aliexpress/scraper";

async function run() {
  const url = "https://pt.aliexpress.com/item/1005007321650392.html";
  try {
    console.log("Scraping...");
    const product = await scrapeAliExpress(url);
    console.log("Title:", product.title);
    console.log("Price:", product.price);
    console.log("Variants count:", product.variants.length);
    if (product.variants.length > 0) {
      console.log("First variant:", product.variants[0]);
    }
  } catch (e) {
    console.error(e);
  }
}

run();
