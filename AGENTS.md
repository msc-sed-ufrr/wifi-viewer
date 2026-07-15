# WiFi Viewer — Contexto do Projeto

## Sobre

Aplicativo desktop (Electron + React + TypeScript) para criar heatmaps de cobertura Wi-Fi sobrepostos à planta de um prédio. Persistência local via IndexedDB, cálculo de heatmap via IDW em Web Worker.

## Stack

- **Desktop**: Electron 31 + electron-vite
- **Frontend**: React 18 + TypeScript + Vite
- **Estado**: Zustand (mínimo — ponto e rede selecionados)
- **Persistência**: IndexedDB (via `idb`)
- **Heatmap**: IDW (Inverse Distance Weighting) em Web Worker
- **Gráfico canais**: SVG nativo (sem lib externa)
- **Testes**: Vitest

## Estrutura

```
src/
├── main/              # Processo main (Node.js)
│   ├── index.ts       # Janela + IPC
│   └── wifiScan/      # Adaptadores por SO (netsh, nmcli, macwifi-cli)
├── preload/
│   └── index.ts       # contextBridge (só isScanAvailable + scanNetworks)
├── shared/
│   └── networkReading.ts  # Interface NetworkReading (contrato main↔renderer)
└── renderer/
    └── src/
        ├── App.tsx         # Raiz: projetos/plantas
        ├── components/     # UI (Workspace, FloorPlanCanvas, Sidebar, etc.)
        ├── modules/        # Lógica de domínio
        │   ├── storage/db.ts     # Schema IndexedDB
        │   ├── projects/api.ts   # CRUD projetos/plantas
        │   ├── points/api.ts     # CRUD pontos medição
        │   ├── readings/         # network.ts, distance.ts, api.ts
        │   ├── heatmap/          # idw.ts, colorScale.ts, useHeatmap.ts, worker
        │   ├── channels/         # channelUsage.ts
        │   └── import/           # csvParser.ts, liveCapture.ts
        ├── store/uiStore.ts # Zustand store
        ├── lib/             # calibration, imageDimensions, useElementSize
        └── types/domain.ts  # Tipos de domínio
```

## Gitflow

O projeto segue este fluxo de branches:

```
main     ────────────●──────────●────── (produção, releases)
                      ↑          ↑
                      │          │ PR merge
staging  ─────●──────●──────●────●────── (pré-produção, base de features)
              ↑      ↑      ↑
              │      │      │ PR merge
feature/*  ──┘      │      │
                     │      │
dev      ────────────┴──────┴─────────── (homologação isolada)
```

### Regras

- **`main`**: código em produção. Apenas recebe merge de PRs vindos de `staging`. Cada release recebe uma tag semântica (`v0.1.0`, `v0.2.0`, etc).
- **`staging`**: **base de TODAS as feature branches**. Código em pré-produção. PRs de `feature/*` são mergeados aqui após aprovação.
- **`dev`**: ambiente de homologação isolado. Serve para testar combinações de features. **NUNCA fazer merge de `dev` em feature branches nem em `staging`/`main`.**
- **`feature/*`**: branches de trabalho. Nome padrão: `feature/<descricao-curta>` (ex.: `feature/export-png-heatmap`). Nascem de `staging` e são mergeadas de volta em `staging` via PR.

### Fluxo de Desenvolvimento

1. Criar branch a partir de `staging`:
   ```bash
   git checkout staging
   git pull origin staging
   git checkout -b feature/minha-feature
   ```
2. Desenvolver e commitar na feature branch
3. Abrir Pull Request para `staging`
4. Após aprovação, mergear em `staging`
5. Periodicamente, criar PR de `staging` → `main` para release

### Convenções

- **Commits**: mensagens em inglês ou português, formato imperativo. Ex.: `feat: add PNG export`, `fix: correct IDW grid size`
- **PRs**: usar o template em `.github/PULL_REQUEST_TEMPLATE.md`
- **Testes**: rodar `npm run typecheck && npm test` antes de abrir PR
- **Labels**: usar labels do projeto GitHub para categorizar issues/PRs

## Comandos

```bash
npm run dev         # Desenvolvimento (electron-vite)
npm run build       # Build produção
npm run typecheck   # Checagem de tipos (main + renderer)
npm test            # Testes unitários (Vitest)
```
