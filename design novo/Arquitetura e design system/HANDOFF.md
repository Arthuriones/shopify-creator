# XCART — handoff

Arquivo único: `XCART.dc.html`. Template (markup) + classe `Component` (estado e dados) no mesmo arquivo.
Todos os dados são mock e ficam **em um único lugar**: os campos no topo da classe.

## Modelo mental
`LOJA VITRINE → XCART → LOJAS CHECKOUT`. Aparece na tela de auth, no onboarding, na Visão Geral e no Roteamento.

## Arquitetura de navegação
- **Configuração** (onboarding, 7 passos) — visível enquanto a operação não está 100%
- **Visão Geral** — saúde, 4 métricas, topologia, requer atenção, atividade recente
- **Operação**: Lojas · Vendas · Roteamento · Importar
- **Atividade** · **Assinatura** · **ADMIN → Clientes** · **Configurações** (+ Conta)

Detalhe de loja não é item de menu: é página filha com breadcrumb.

Não há listagem de produtos nem listagem pedido-a-pedido — por decisão de peso. Vendas é agregado
por período e por loja; nada itera sobre o catálogo ou sobre pedidos individuais.

## Estado (`this.state`)
| chave | uso |
|---|---|
| `authed`, `authScreen` | login / cadastro |
| `mode` | `'new'` (conta nova, tudo vazio) ou `'mature'` (5 checkouts, 482 produtos) |
| `screen` | `onboarding, overview, stores, store, products, product, routing, routingConfig, import, activity, settings, account, error` |
| `storeId`, `storeTab` | página de detalhe da loja |
| `period` | período de vendas: `'7' \| '30' \| '90'` |
| `salesStore` | loja selecionada no dashboard: `'all'` ou id do checkout |
| `theme` | `'light' \| 'dark'` — escrito em `localStorage['xcart.theme']` e aplicado como `data-theme` no `<html>` |
| `pack` | pacote de créditos selecionado (índice em `BILLING.packs`) |
| `adminQ`, `adminPlan` | busca e filtro de plano no painel admin |
| `routing` | override de status por checkout (pausar/retomar) |
| `method` | `round_robin \| weight \| priority` |
| `wizard`, `importSel`, `importPct` | wizard de importação (1–5 = passos, 6 = progresso, 7 = resultado) |
| `modal`, `drawer`, `toast` | `connect \| pause \| palette`, drawer de inspeção, toast |

## Onde plugar a API
Substitua os campos de dados por payloads reais; a UI não precisa mudar.

| campo (classe) | endpoint sugerido | shape |
|---|---|---|
| `VITRINE` | `GET /stores/vitrine` | `{id,name,domain,products,variants,sync,status}` |
| `CHECKOUTS` | `GET /stores/checkouts` | `[{id,name,domain,status,products,weight,sync,orders}]` |
| `SALES` | `GET /sales?period=7\|30\|90` | `{total:{orders,revenue,prev}, byStore:{[storeId]:{orders,revenue}}}` — valores em **centavos** |
| `ACTIVITY` | `GET /activity` | `[{k,title,desc,time,dot,tech}]` |
| `SOURCE` | `GET /import/source/:storeId/products` | `[{id,name,vars,price}]` |
| `METHODS` | estático | `[{id,l,d}]` |
| `BILLING` | `GET /billing` | `{plan,planNote,proPrice,credits,used,cost,packs[],history[]}` |
| `ADMIN` | `GET /admin/customers` | `[{id,name,email,plan,stores,credits,recharged,used,revenue,last,status}]` — `revenue` em reais inteiros |

Status: `CHECKOUTS[].status ∈ active|paused|warn|err` (mapa `ST`).
Vendas: participações usam maior resto, então somam exatamente 100%.

## Ações que hoje só notificam (`this.notify`)
`reconnect`, `disconnect`, `remapAll`, `saveGeneric`, `testRouting`, `exportSales`, `c.more`.
São os pontos de integração: troque por chamadas reais mantendo o toast como feedback.

## Convenções visuais
**Tema:** todas as cores são CSS custom properties definidas em `:root` e sobrescritas em
`html[data-theme="dark"]` (helmet). Nenhum hex literal no markup nem no JS — use os tokens
(`--bg --surface --surface-2 --hover --track --border --border-subtle --border-strong --nav-active
--ink --t1..--t5 --solid --solid-hover --on-solid --brand --ok/--warn/--err + `-bg`/`-border`
--scrim --header-bg --shadow --shadow-panel`). Para adicionar cor, crie o par claro/escuro nos dois blocos.

Public Sans (UI) + IBM Plex Mono (IDs, domínios, números técnicos). Cinzas neutros, acento terracota `#b04a2f`
apenas como marca/foco. Status nunca depende só de cor: sempre ponto + rótulo.
Raio 6–8px, borda `#e6e5e3`, sem sombras exceto overlays. Linhas de tabela 44px.

## Props (Tweaks)
`demoMode` (Conta nova / Operação madura), `defaultMethod`.
O seletor **DEMO** no rodapé da sidebar troca conta nova ⇄ operação madura e abre Erro / Login — é
andaime de protótipo, remover na integração.

## Atalhos
`⌘K` / `Ctrl+K` abre a paleta de navegação. `Esc` fecha modal e drawer.
