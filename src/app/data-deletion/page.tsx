import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Exclusão de Dados | Shopify Creator",
  description:
    "Instruções para solicitar remoção de dados conectados ao Shopify Creator, incluindo dados de Meta, Instagram e Shopify.",
};

export default function DataDeletionPage() {
  return (
    <LegalPage
      title="Instruções de Exclusão de Dados"
      description="Esta página explica como solicitar a remoção dos dados associados ao uso do Shopify Creator e às integrações conectadas."
      updatedAt="8 de maio de 2026"
      sections={[
        {
          title: "1. Como solicitar exclusão",
          body: [
            "Para solicitar a exclusão dos seus dados, envie uma solicitação pelo canal de suporte informado no painel do Shopify Creator ou pelo e-mail de suporte cadastrado no aplicativo da Meta.",
            "Na solicitação, informe o e-mail da conta usada no Shopify Creator, a loja Shopify conectada e, se aplicável, o usuário ou Página do Instagram conectada. Não envie senhas.",
          ],
        },
        {
          title: "2. O que será removido",
          body: [
            "A solicitação pode remover dados de perfil, lojas conectadas, credenciais/tokens armazenados, conexões Instagram/Meta, posts registrados, produtos importados, reviews sintéticos, imagens geradas, jobs e histórico operacional associado ao usuário.",
            "Quando a remoção envolver serviços externos, como Shopify ou Meta, também recomendamos revogar o acesso diretamente no painel desses serviços.",
          ],
        },
        {
          title: "3. Revogar acesso na Meta",
          body: [
            "Para remover o acesso do Shopify Creator na Meta, acesse as configurações de Apps e Sites da sua conta Facebook/Meta e remova o aplicativo Shopify Creator.",
            "Se a conta Instagram estiver vinculada a uma Página, revise também as permissões comerciais no Meta Business Suite.",
          ],
        },
        {
          title: "4. Revogar acesso na Shopify",
          body: [
            "Para revogar credenciais da Shopify, remova ou rotacione o app/credenciais usados na loja Shopify conectada.",
            "Produtos já criados na Shopify não são excluídos automaticamente por uma solicitação de exclusão de dados no Shopify Creator, a menos que isso seja solicitado explicitamente e seja tecnicamente possível com as permissões disponíveis.",
          ],
        },
        {
          title: "5. Prazo",
          body: [
            "Solicitações válidas serão processadas em prazo razoável. Algumas informações podem permanecer temporariamente em backups, logs de segurança ou registros necessários para prevenção de abuso e obrigações legais.",
          ],
        },
        {
          title: "6. Confirmação",
          body: [
            "Após o processamento, enviaremos uma confirmação pelo canal usado na solicitação, quando houver meio de contato disponível.",
          ],
        },
      ]}
    />
  );
}
