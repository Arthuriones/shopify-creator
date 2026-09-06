/**
 * Para onde vai quem entra no app sem pedir uma tela especifica: raiz do
 * dominio, pos-login, saida do paywall.
 *
 * E a visao geral: quem abre o app quer saber se a operacao esta rodando,
 * nao cair direto na tela de configurar rota. Quem ainda nao tem rota ve o
 * convite para configurar.
 *
 * Existe como constante porque estava escrito a mao em tres lugares. Quando a
 * tela de visao geral saiu, dois deles continuaram apontando para /dashboard e
 * o app passou a receber o usuario com "This page could not be found".
 */
export const APP_HOME = "/overview";
