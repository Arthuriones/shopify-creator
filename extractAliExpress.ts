import * as fs from 'fs';
import * as cheerio from 'cheerio';

async function run() {
  const url = "https://pt.aliexpress.com/item/1005007321650392.html";
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      }
    });
    const html = await res.text();
    const $ = cheerio.load(html);
    
    let found = false;
    $("script").each((_, el) => {
      const text = $(el).html() || "";
      if (text.includes("skuPriceList")) {
        console.log("Found skuPriceList in script tag! Length of text:", text.length);
        console.log("Preview:", text.substring(0, 200));
        found = true;
      }
    });

    if (!found) {
        console.log("Could not find skuPriceList anywhere in the script tags.");
        // Maybe it's not even loaded in the initial HTML?
        // Let's check the raw HTML for "skuPriceList"
        if (html.includes("skuPriceList")) {
            console.log("BUT it IS in the raw HTML!");
        } else {
            console.log("Not in the raw HTML at all. It might be loaded via API or blocked.");
            fs.writeFileSync("failed_html.html", html);
        }
    }
  } catch (e) {
    console.error(e);
  }
}

run();
