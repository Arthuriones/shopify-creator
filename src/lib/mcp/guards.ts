// Guardas que rodam ANTES de qualquer escrita.
//
// O modelo, deixado solto, inventa prova social com naturalidade: "4.8 de
// 2.000 avaliacoes", "restam 3 unidades", "97% dos clientes recomendam".
// Nada disso e verdade, e nos EUA a FTC multa por unidade publicada.
// Barrar no nivel da ferramenta e o unico ponto onde a checagem e confiavel —
// pedir no prompt do sistema nao segura.

export interface GuardHit {
  padrao: string;
  trecho: string;
}

const PADROES: Array<[string, RegExp]> = [
  ["contagem de avaliacoes", /\b\d[\d.,]*\s*(reviews?|avalia[çc][õo]es|ratings?)\b/gi],
  ["nota agregada", /\b[0-5][.,]\d\s*(\/\s*5|de\s*5|out of 5|stars?|estrelas?)\b/gi],
  ["percentual de clientes", /\b\d{1,3}\s*%\s*(of\s+)?(customers?|clientes?|users?|usu[áa]rios?|buyers?)/gi],
  ["comprador verificado", /\bverified (buyer|purchase|customer)\b|\bcompra verificada\b/gi],
  ["escassez inventada", /\b(only|apenas|restam?|last)\s+\d+\s+(left|em estoque|unidades?|in stock)\b/gi],
  ["contador regressivo", /\b(ends? in|termina em|expires? in|oferta acaba)\b/gi],
  ["frete gratis absoluto", /\bfree shipping\b(?!\s+(over|on orders|acima))|\bfrete gr[áa]tis\b(?!\s+(acima|para))/gi],
  ["atendimento 24\/7", /\b24\s*[\/x]\s*7\b/gi],
];

export function checkContent(texts: Array<string | null | undefined>): GuardHit[] {
  const hits: GuardHit[] = [];
  for (const t of texts) {
    if (!t) continue;
    const plain = String(t).replace(/<[^>]+>/g, " ");
    for (const [padrao, re] of PADROES) {
      re.lastIndex = 0;
      const m = re.exec(plain);
      if (m) hits.push({ padrao, trecho: m[0].trim().slice(0, 80) });
    }
  }
  return hits;
}

export function guardError(hits: GuardHit[]) {
  const linhas = hits.map((h) => `  • ${h.padrao}: "${h.trecho}"`).join("\n");
  return (
    `Escrita bloqueada — o texto afirma coisas que a loja nao pode comprovar:\n${linhas}\n\n` +
    `Prova social precisa vir de avaliacoes reais (app de reviews), nao do texto do produto. ` +
    `Escassez e contador so podem existir se o estoque e o prazo forem reais. ` +
    `Frete gratis so pode ser afirmado se a loja realmente oferecer. ` +
    `Reescreva sem essas afirmacoes e chame a ferramenta de novo.`
  );
}

// Bloqueia mutation na ferramenta de GraphQL cru. A ideia e dar ao modelo uma
// saida para LER qualquer coisa que as ferramentas tipadas nao cobrem, sem
// abrir escrita sem validacao — foi exatamente por escrita crua sem checagem
// que quebrei tema quatro vezes na loja de teste.
export function assertReadOnlyQuery(query: string) {
  const semComentario = query.replace(/#[^\n]*/g, "");
  if (/\bmutation\b/i.test(semComentario)) {
    throw new Error(
      "Esta ferramenta e somente leitura. Para escrever, use update_product, " +
        "update_seo ou as demais ferramentas tipadas, que validam a entrada antes de enviar."
    );
  }
}
