# Análise do Projeto WiFi Viewer

## Visão Geral

**WiFi Viewer** é um aplicativo desktop (Electron) que transforma leituras de varredura Wi-Fi em um **heatmap de cobertura** sobreposto à planta de um prédio. Funciona de forma similar a ferramentas como NetSpot ou Ekahau, porém sem conta, nuvem ou custo — uso individual/acadêmico com persistência 100% local.

## Stack Tecnológica

| Camada | Tecnologia | Função |
|--------|-----------|--------|
| Desktop | **Electron 31** | Shell nativo cross-platform |
| Bundler | **electron-vite** | Build do main + preload + renderer |
| Frontend | **React 18 + TypeScript** | UI do renderer |
| Estado | **Zustand** | Estado global mínimo (ponto e rede selecionados) |
| Persistência | **IndexedDB** via `idb` | Armazenamento local de projetos, plantas, pontos e leituras |
| Heatmap | **IDW** em Web Worker | Interpolação Inverse Distance Weighting off the main thread |
| Gráfico | **SVG** (nativo, sem lib) | Canalização de frequências (ChannelChart) |
| Testes | **Vitest** | Testes unitários |

## Estrutura do Projeto

```
wifi-viewer/
├── src/
│   ├── main/                        # Processo main do Electron (Node.js)
│   │   ├── index.ts                 # Criação da janela + IPC handlers
│   │   └── wifiScan/                # Varredura Wi-Fi nativa (SO)
│   │       ├── index.ts             # Adapter pattern por plataforma
│   │       ├── linux.ts             # nmcli parser
│   │       ├── windows.ts           # netsh parser
│   │       ├── macos.ts             # macwifi-cli parser
│   │       └── signal.ts            # qualidade% → dBm
│   ├── preload/
│   │   └── index.ts                 # contextBridge (só 2 métodos expostos)
│   ├── shared/
│   │   └── networkReading.ts        # Interface NetworkReading (contrato)
│   └── renderer/                    # Processo renderer (React + Vite)
│       └── src/
│           ├── App.tsx              # Raiz: gerenciamento de projetos/plantas
│           ├── main.tsx             # Entry point
│           ├── types/domain.ts      # Tipos de domínio (Project, FloorPlan, etc.)
│           ├── store/uiStore.ts     # Zustand store
│           ├── lib/                 # Utilitários
│           │   ├── calibration.ts   # pixelsPerMeter
│           │   ├── imageDimensions.ts
│           │   └── useElementSize.ts
│           ├── components/          # UI Components
│           │   ├── Workspace.tsx    # Orquestrador principal da planta ativa
│           │   ├── FloorPlanCanvas.tsx  # Canvas + heatmap + interação
│           │   ├── Sidebar.tsx      # Navegação entre projetos/plantas
│           │   ├── Toolbar.tsx      # Controles (rede, banda, heatmap, calibração)
│           │   ├── PointPanel.tsx   # Painel lateral do ponto selecionado
│           │   ├── Legend.tsx       # Escala dBm → cor
│           │   ├── ChannelChart.tsx # Gráfico de canais (SVG)
│           │   ├── Rulers.tsx       # Réguas em metros
│           │   ├── CalibrationDialog.tsx
│           │   ├── NewFloorPlanDialog.tsx
│           │   └── ProjectSetup.tsx
│           ├── modules/             # Lógica de domínio
│           │   ├── storage/db.ts    # Schema IndexedDB
│           │   ├── projects/api.ts  # CRUD projetos e plantas
│           │   ├── points/api.ts    # CRUD pontos de medição
│           │   ├── readings/
│           │   │   ├── api.ts       # CRUD leituras
│           │   │   ├── network.ts   # Agrupamento por SSID/BSSID, filtro banda
│           │   │   └── distance.ts  # Estimativa de distância
│           │   ├── heatmap/
│           │   │   ├── idw.ts       # Algoritmo IDW
│           │   │   ├── colorScale.ts  # dBm → RGBA (térmica)
│           │   │   ├── useHeatmap.ts  # Hook → Web Worker
│           │   │   └── heatmap.worker.ts
│           │   ├── channels/
│           │   │   └── channelUsage.ts  # Agregação por BSSID para gráfico
│           │   └── import/
│           │       ├── csvParser.ts     # Parser CSV formato de referência
│           │       └── liveCapture.ts   # Bridge para preload/IPC
│           └── styles/index.css
└── docs/
    ├── 00-glossary.md
    ├── 01-prd.md
    ├── 02-arch.md
    └── 03-case-study.md
```

## Fluxo de Dados

### 1. Criação de Levantamento
O usuário cria um **Projeto** (ex.: "Prédio CIT") e faz upload da imagem da **Planta** (ex.: "1º Andar"). A imagem é armazenada como `Blob` no IndexedDB junto com suas dimensões nativas.

### 2. Marcação de Pontos de Medição
Sobre a planta, o usuário clica para criar **MeasurementPoints** (coordenadas x,y na imagem). Cada ponto representa o local físico onde uma varredura foi coletada.

### 3. Coleta de Leituras
Para cada ponto, o usuário pode:
- **Importar CSV**: formato do app WiFi Analyzer (WiFi Scout), parseado pelo `csvParser.ts`
- **Captura ao vivo**: via IPC → processo main → ferramenta nativa do SO:
  - **Windows**: `netsh wlan show networks mode=bssid` (sinal estimado em % → dBm)
  - **Linux**: `nmcli dev wifi list` (sinal estimado em % → dBm)
  - **macOS**: `macwifi-cli scan --json` (RSSI real em dBm)

As leituras seguem o contrato `NetworkReading` (definido em `shared/networkReading.ts`) e são armazenadas como `StoredNetworkReading` no IndexedDB.

### 4. Geração do Heatmap
O `Workspace` computa:
1. Filtro por **banda** (2.4GHz / 5GHz / todas)
2. Agrupamento por **rede** (SSID) — redes ocultas viram grupos individuais por BSSID
3. Para cada ponto, a leitura **mais forte** da rede selecionada (ou de todas as redes)
4. `computeSigmaPx`: espalhamento do blob — derivado da distância estimada (se calibrado) ou do dBm bruto (fallback)
5. `WeightedPoint[]` é passado para o `useHeatmap` hook

O `useHeatmap` despacha para um **Web Worker** (`heatmap.worker.ts`) que:
1. Executa `computeIdwGrid()` — interpolação IDW com potência 3
2. Converte para RGBA via `gridToRgba()` — escala térmica com 6 stops (-30 a -90 dBm)
3. Retorna um `ImageBitmap` que é desenhado no `<canvas>`

### 5. Calibração de Escala (Opcional)
Usuário clica em 2 pontos na planta, informa a distância real em metros. O sistema calcula `pixelsPerMeter` e:
- Réguas em metros ao redor do canvas
- `distanceToSigmaMeters`: espalhamento do blob baseado em distância real
- Estimativa de distância das leituras convertida para contexto espacial

### 6. Visualização de Canais
Na view "Todas as redes", um `ChannelChart` SVG mostra a distribuição das redes pelos canais (trapézios no eixo categórico de canais 2.4GHz e 5GHz). Usa `buildChannelUsage()` que agrega por **BSSID** (cada rádio individual, diferente do agrupamento por SSID do heatmap).

## Decisões Técnicas Relevantes

### Arquitetura
- **Context Isolation + preload**: segurança do Electron seguida à risca — o renderer só vê `window.wifiViewer` com `isScanAvailable()` e `scanNetworks()` (ADR-008)
- **Sem backend remoto**: tudo persistido localmente via IndexedDB, sem contas ou servidor
- **Web Worker**: IDW roda off the main thread para não travar a UI durante o cálculo do heatmap

### Heatmap (IDW)
- **Potência IDW = 3**: escolhida por simulação — reproduz o pico de cada ponto sem transições bruscas (ADR-024)
- **Sigma por ponto**: na view "todas as redes", pontos com sinal mais forte têm sigma maior (blob maior)
- **Confiança**: separada do valor dedBm — usa kernel gaussiano com sigma reduzido para esmaecer a opacidade longe dos pontos (ADR-027)
- **Interpolation Intensity**: quantas fontes independentes sustentam o valor — evita que um ponto isolado pareça tão confiável quanto vários convergindo (ADR-031)
- **Alfa decaimento gamma 4**: a cor "morre" mais rápido ao se afastar, sem corte abrupto (ADR-029)

### Gráfico de Canais
- **BSSID como entidade**: diferente do heatmap (que agrupa por SSID), o gráfico de canais mostra cada rádio individualmente, pois um AP dual-band ocupa canais diferentes em cada banda
- **Eixo categórico**: canais 5GHz têm gaps grandes na numeração — usar eixo linear deixaria o gráfico vazio
- **Layout de rótulos**: colisão evitada com algoritmo greedy — rede mais forte "ganha" o rótulo visível; as demais só aparecem no hover

### UI/UX
- **Drag-to-pan no canvas**: clique e arraste move a planta (ADR-030), clique único cria/seleciona ponto
- **Modais próprios**: em vez de `window.confirm()`/`window.prompt()` (que têm problemas no Electron empacotado — o nativo rouba foco ou não funciona)
- **Zoom**: 25% a 400% com passo 1.25x, controle via botões no canto inferior direito

## O que já foi implementado (POC funcional)

- [x] Criação de levantamentos (projetos) com múltiplas plantas
- [x] Upload de imagem da planta (qualquer formato de imagem)
- [x] Marcação/remoção de pontos de medição sobre a planta
- [x] Importação de CSV no formato WiFi Analyzer
- [x] Captura ao vivo via netsh (Windows), nmcli (Linux), macwifi-cli (macOS)
- [x] Heatmap por rede única (selecionável em dropdown)
- [x] Heatmap "Todas as redes" (melhor sinal disponível em cada ponto)
- [x] Filtro por banda (2.4GHz / 5GHz / todas)
- [x] Calibração de escala (2 pontos + distância real) com réguas em metros
- [x] Gráfico de distribuição de canais (SVG com trapézios)
- [x] Legenda dBm → cor (expansível)
- [x] Navegação entre projetos/plantas sidebar
- [x] Renomear projetos e plantas
- [x] Drag-to-pan e zoom no canvas
- [x] Testes unitários para: IDW, colorScale, channelUsage, csvParser, readings/network, readings/distance

## Fluxo de Desenvolvimento

Atualmente o repositório tem apenas um commit inicial (`6fd9e90`) na branch `main` e `origin/main`. Conforme sua orientação, toda modificação futura deve ser feita via:

1. Criar branch de feature a partir de `main`
2. Implementar as alterações
3. Abrir Pull Request para `main`
4. Revisar e mergear

---

*Documento gerado em 14/07/2026 — análise baseada no código-fonte versão 0.1.0.*
