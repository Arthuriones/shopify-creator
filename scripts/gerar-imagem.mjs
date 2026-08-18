#!/usr/bin/env node
/**
 * Gera imagem com Gemini e (opcionalmente) sobe para o Shopify Files.
 *
 *   node scripts/gerar-imagem.mjs --nome hero --prompt "..." --w 1920 --h 1080
 *   node scripts/gerar-imagem.mjs --nome hero --prompt "..." --loja xyz.myshopify.com
 *   node scripts/gerar-imagem.mjs --lote pecas.json
 *
 * Regras embutidas (aprendidas na marra, ver README no fim do arquivo):
 *  - nunca pede texto na imagem: o modelo erra letra
 *  - nunca usa foto de produto de marca como referencia: ele copia a logo
 *  - reaproveita arquivo ja gerado, para nao pagar duas vezes pelo mesmo
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";

const RAIZ = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");

function env(chave) {
  if (process.env[chave]) return process.env[chave];
  for (const arq of [".env.local", ".env"]) {
    const p = resolve(RAIZ, arq);
    if (!existsSync(p)) continue;
    for (const linha of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && m[1] === chave) return m[2].replace(/^["']|["']$/g, "");
    }
  }
  return undefined;
}

function args() {
  const a = {};
  const v = process.argv.slice(2);
  for (let i = 0; i < v.length; i++) {
    if (!v[i].startsWith("--")) continue;
    const chave = v[i].slice(2);
    const val = v[i + 1] && !v[i + 1].startsWith("--") ? v[++i] : "true";
    a[chave] = val;
  }
  return a;
}

// Estetica padrao. O agent pode sobrescrever com --estetica.
const ESTETICA_PADRAO = `
Editorial photography. Soft diffused daylight from one side, gentle shadow falloff,
shallow depth of field. Calm, expensive, minimal, generous negative space.
Absolutely no text, letters, numbers, logos, watermarks or packaging labels.
No human faces. No before-and-after comparisons. No medical or income claims.
`.trim();

export async function gerar({
  nome,
  prompt,
  w = 1600,
  h = 900,
  estetica = ESTETICA_PADRAO,
  referencia = null,
  saida = resolve(RAIZ, "geradas"),
  forcar = false,
}) {
  mkdirSync(saida, { recursive: true });
  const destino = resolve(saida, `${nome}.jpg`);
  if (existsSync(destino) && !forcar) return { destino, reaproveitado: true };

  const chave = env("GEMINI_API_KEY");
  if (!chave) throw new Error("GEMINI_API_KEY nao configurada (.env.local).");
  const ai = new GoogleGenAI({ apiKey: chave });

  const partes = [];
  if (referencia) {
    // So use referencia com produto SEM marca visivel. Com marca, o modelo
    // reproduz a logo na imagem final.
    const buf = readFileSync(referencia);
    const jpg = await sharp(buf).resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
    partes.push({ inlineData: { mimeType: "image/jpeg", data: jpg.toString("base64") } });
  }
  partes.push({ text: `${prompt}\n\n${estetica}\n\nComposition target: ${w}x${h} pixels.` });

  let res;
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    try {
      res = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: [{ role: "user", parts: partes }],
        config: { responseModalities: ["IMAGE", "TEXT"] },
      });
      break;
    } catch (e) {
      const msg = String(e?.message || e);
      if (tentativa === 4 || !/429|503|500/.test(msg)) throw e;
      await new Promise((r) => setTimeout(r, 8000 * tentativa));
    }
  }

  const p = res.candidates?.[0]?.content?.parts || [];
  const img = p.find((x) => x.inlineData?.data);
  if (!img) throw new Error("sem imagem: " + p.map((x) => x.text).filter(Boolean).join(" ").slice(0, 160));

  const out = await sharp(Buffer.from(img.inlineData.data, "base64"))
    .resize(w, h, { fit: "cover", position: "centre" })
    .jpeg({ quality: 88 })
    .toBuffer();
  writeFileSync(destino, out);
  return { destino, kb: Math.round(out.length / 1024) };
}

// --- upload para o Shopify Files ------------------------------------------
export async function subirParaShopify(caminho, nomeArquivo, shopDomain) {
  const SB = env("NEXT_PUBLIC_SUPABASE_URL");
  const KEY = env("SUPABASE_SERVICE_ROLE_KEY");
  const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
  const [loja] = await (
    await fetch(`${SB}/rest/v1/stores?shop_domain=eq.${shopDomain}&select=client_id,client_secret`, { headers: H })
  ).json();
  if (!loja) throw new Error(`loja ${shopDomain} nao encontrada no Supabase`);

  const token = (
    await (
      await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "client_credentials", client_id: loja.client_id, client_secret: loja.client_secret }),
      })
    ).json()
  ).access_token;

  const G = (q, v) =>
    fetch(`https://${shopDomain}/admin/api/2024-10/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query: q, variables: v }),
    }).then((x) => x.json());

  const bytes = readFileSync(caminho);
  const st = await G(
    `mutation($i:[StagedUploadInput!]!){stagedUploadsCreate(input:$i){stagedTargets{url resourceUrl parameters{name value}} userErrors{message}}}`,
    { i: [{ filename: `${nomeArquivo}.jpg`, mimeType: "image/jpeg", resource: "IMAGE", httpMethod: "POST", fileSize: String(bytes.length) }] }
  );
  const alvo = st.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!alvo) throw new Error("staged upload falhou: " + JSON.stringify(st.errors || st.data));

  const form = new FormData();
  alvo.parameters.forEach((p) => form.append(p.name, p.value));
  form.append("file", new Blob([bytes], { type: "image/jpeg" }), `${nomeArquivo}.jpg`);
  const up = await fetch(alvo.url, { method: "POST", body: form });
  if (!up.ok) throw new Error(`upload http ${up.status}`);

  const fc = await G(
    `mutation($f:[FileCreateInput!]!){fileCreate(files:$f){files{id fileStatus} userErrors{message}}}`,
    { f: [{ originalSource: alvo.resourceUrl, contentType: "IMAGE", alt: nomeArquivo.replace(/-/g, " ") }] }
  );
  const ue = fc.data?.fileCreate?.userErrors || [];
  if (ue.length) throw new Error(JSON.stringify(ue));
  return { id: fc.data.fileCreate.files[0].id, referencia: `shopify://shop_images/${nomeArquivo}.jpg` };
}

// --- CLI -------------------------------------------------------------------
if (process.argv[1] && process.argv[1].endsWith("gerar-imagem.mjs")) {
  const a = args();
  const pecas = a.lote
    ? JSON.parse(readFileSync(resolve(a.lote), "utf8"))
    : [{ nome: a.nome, prompt: a.prompt, w: Number(a.w) || 1600, h: Number(a.h) || 900, referencia: a.referencia || null }];

  for (const peca of pecas) {
    try {
      const r = await gerar({ ...peca, estetica: a.estetica || ESTETICA_PADRAO, forcar: a.forcar === "true" });
      console.log(r.reaproveitado ? `= ${peca.nome} (ja existia)` : `+ ${peca.nome} ${r.kb}KB -> ${r.destino}`);
      if (a.loja) {
        const s = await subirParaShopify(r.destino, `seora-${peca.nome}`.replace(/^seora-seora-/, "seora-"), a.loja);
        console.log(`  shopify: ${s.referencia}`);
      }
    } catch (e) {
      console.log(`! ${peca.nome}: ${String(e.message).slice(0, 200)}`);
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
}
