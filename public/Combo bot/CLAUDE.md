# Combo Bot — Sistema de Combo Sync para Tibia

## O que e este projeto
Sistema de sincronizacao de combo para Tibia (servidores OT 8.60). Permite que um time de jogadores ataque o mesmo alvo simultaneamente, coordenado por um lider. Suporta clientes OTCv8 (via WebSocket nativo) e ElfBot (via HTTP bridge + ComboCompanion).

## Arquitetura geral

```
  OTCv8 (Lua/vBot)          ElfBot 8.60 (CiroScript)
       |                           |
   WebSocket                 ComboCompanion (Python/Tkinter)
       |                     + elfbot-bridge.bat (curl HTTP)
       |                           |
       +------ BotServer ----------+
              (Node.js)
         Express + ws lib
     Railway (producao)
```

### Fluxo do combo
1. **Lider** ataca um monstro
2. OTC envia `LeaderTarget` via WebSocket / ElfBot escreve `bridge_target_out.txt`
3. BotServer recebe e faz broadcast para todos no mesmo canal
4. **Seguidores** recebem o alvo e atacam automaticamente
5. Membros ElfBot recebem via `bridge_target_in.txt` (polling HTTP)

## Componentes

### 1. BotServer (`nodejs-botserver-main/`)
- **Stack**: Node.js + Express + ws
- **Entry**: `botserver.js` → carrega modulos via `utils.loadModules()`
- **Config**: `config.js` (host, portas, limites)
- **Deploy**: Railway (producao: `wss://nodejs-botserver-production.up.railway.app/`)
- **Web UI**: `public/` — dashboard de stats (conexoes, canais, personagens)

#### Modulos (carregados por prioridade)
| Modulo | Prioridade | Funcao |
|--------|-----------|--------|
| `system/core-logger` | 100 | Logging e redirecionamento stdout |
| `tools/plugin-validator` | 99 | Validacao de plugins |
| `server/http` | 70 | Express HTTP + API `/api/stats`, `/api/modules` |
| `server/websocket` | 60 | WebSocket server, canais, init/ping/message |
| `ws/elfbot-bridge` | 10 | HTTP bridge para ElfBot (`/api/bridge/*`) |
| `tools/uptime-logger` | 10 | Log periodico de uptime |
| `ws/template` | 0 | Template para novos plugins |

#### Protocolo WebSocket
- **Init**: `{ type: "init", name: "Player", channel: "1" }`
- **Message**: `{ type: "message", topic: "TopicName", message: ... }`
- **Topics importantes**: `LeaderTarget`, `ComboMember`, `char_info`, `list`, `trigger`, `target`, `useWith`

#### API HTTP Bridge (`/api/bridge/`)
- `GET /members?channel=1` — lista conectados (WS + bridge)
- `GET /target?channel=1&leaders=Player1,Player2` — alvo mais recente dos lideres
- `POST /target` — lider ElfBot envia alvo `{ name, channel, target }`
- `POST /heartbeat` — keep-alive do ElfBot `{ name, channel, voc }`
- `POST /mp` — ElfBot avisa MP baixa `{ name, channel, mp_percent, voc }`
- `GET /pot?channel=1&name=Char&pot_ek=268&pot_ed=268&pot_ms=268&pot_rp=268` — retorna `potId\nPlayerName` se tem pedido pendente

### 2. ElfBot Bridge v2 (`elfbot-bridge.bat`)
- Script .bat completo — substitui o ComboCompanion (sem Python, sem admin, sem pymem)
- Usa curl para polling HTTP do BotServer a cada 1s
- Funcoes: combo target, pot de mana, MP request, heartbeat
- Um .bat por personagem (cada pasta ElfBot = um char)

#### Arquivos de IPC (leitura/escrita por arquivo)
| Arquivo | Quem escreve | Quem le |
|---------|-------------|---------|
| `bridge_target_in.txt` | bridge.bat (HTTP GET) | ElfBot (`$fileline`) |
| `bridge_target_out.txt` | ElfBot (`filewrite`) | bridge.bat (HTTP POST) |
| `bridge_pot_in.txt` | bridge.bat (HTTP GET) | ElfBot (`$fileline` linha 1=itemID, linha 2=player) |
| `bridge_mp_out.txt` | ElfBot (`filewrite`) | bridge.bat (HTTP POST quando MP <= threshold) |

#### Configuracao no .bat
- `SERVER` — URL do BotServer
- `CHANNEL` — canal do time
- `MY_VOC` — vocacao (EK, ED, MS, RP)
- `MP_THRESHOLD` — % de MP pra pedir pot (0 = desativado)
- `POT_EK/ED/MS/RP` — IDs das potions de mana por vocacao

#### Hotkeys Persistent do ElfBot
```
auto 500              | exec attack $fileline.'bridge_target_in.txt'.1
auto 500 / istargeting | exec filewrite bridge_target_out.txt $target.name
auto 500              | exec useoncreature $fileline.'bridge_pot_in.txt'.1 $fileline.'bridge_pot_in.txt'.2
auto 1000             | exec filewrite bridge_mp_out.txt $mppc
```

### 3. ComboCompanion (LEGADO — `tibia-companion/`)
- Python 3 + Tkinter + pymem — **substituido pelo elfbot-bridge.bat v2**
- Mantido no repo como referencia, nao e mais necessario

### 4. OTCv8 / vBot Lua (`Pbot Wars/` e `AppData/.../PbotWars/bot/Pala/`)
- Script Lua `vBot/combo.lua` — combo bot completo para OTC v8
- Modos de ataque: COMMAND TARGET, LEADER TARGET, SERVER LEADER TARGET
- Integra com BotServer via `BotServer.send()` / `BotServer.listen()`
- Topics: `trigger`, `target`, `useWith`
- Follow leader, party join, potion request

### 5. ElfBot 8.60 CiroScript (`Elfbot 8.60 Ciroscript.com 123/`)
- ElfBot com scripts de cavebot (.elfc) e targeting (.elft)
- Scripts CiroScript para diversas caves (Dragon Lair, Frost, Medusa, etc.)

## Configuracao atual
- **Servidor producao**: `wss://nodejs-botserver-production.up.railway.app/`
- **Canal**: `1`
- **Jogador**: `Amigos Amigos` (ED)
- **Lider**: `Janja Michelle`
- **Pots MP por voc**: EK=268, ED=268, MS=268, RP=23374
- **MP request**: ativado em 50%

## Convencoes
- Comunicacao em portugues brasileiro
- Mudancas cirurgicas — nao refatorar sem pedir
- Testar localmente antes de deploy (Railway faz auto-deploy do branch main)
- Plugins do BotServer seguem o padrao de `template.js` (export async function + meta + deps)
- Config do companion em JSON (`companion-config.json`)

## Problemas conhecidos / pontos de atencao
- Bridge ElfBot depende de polling HTTP (1s interval) — latencia maior que WebSocket nativo, mas aceitavel pra OT 8.60
- `bridgeMembers` expira em 5 segundos — se heartbeat falhar, membro some da lista
- `potRequests` expira em 3 segundos e e consumido uma vez (evita potar 2x)
- Pot requests sao one-shot: primeiro ElfBot que faz GET /pot consome o pedido
