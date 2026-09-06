import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * O usuário da requisição, validado uma vez só.
 *
 * `supabase.auth.getUser()` vai à rede para validar o token -- não é leitura
 * de cookie. O layout do painel chamava uma vez, a página chamava de novo, e
 * cada consulta de dados chamava mais uma: quatro idas à rede para responder
 * a mesma pergunta na mesma requisição.
 *
 * `cache` do React memoriza por requisição (não entre requisições, não entre
 * usuários), então a primeira chamada paga e as seguintes leem o resultado.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
