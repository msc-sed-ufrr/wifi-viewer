# WiFi Viewer — Contexto do Projeto

## Sobre

Aplicativo desktop (Electron + React + TypeScript) para criar heatmaps de cobertura Wi-Fi sobrepostos à planta de um prédio.

Contexto de produto (personas, regras de negócio, casos de uso, roadmap) em [docs/01-prd.md](docs/01-prd.md). Arquitetura técnica completa (componentes, stack, fluxo de dados, módulos de domínio, ADRs) em [docs/02-arch.md](docs/02-arch.md).

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

O projeto segue o modelo padrão de mercado ([Gitflow, Vincent Driessen](https://nvie.com/posts/a-successful-git-branching-model/)):

```
main      ──────────────●────────────────────●──────── (produção, tags semânticas)
                         ↑                    ↑
                         │ merge release/*    │ merge hotfix/*
release/*        ●──────┘                    │
                  ↑                           │
develop   ───●───●───●────●──────●────────────●──────── (integração, base de features)
              ↑       ↑    ↑                   │
              │       │    │ merge release/*   │ merge hotfix/*
feature/*  ──┘       │    │                    │
hotfix/*   ──────────┴────┴────────────────────┘ (nasce de main, volta p/ main + develop)
```

### Regras

- **`main`**: código em produção. Recebe merge apenas de `release/*` (fim de ciclo) ou `hotfix/*` (correção urgente). Todo merge em `main` recebe uma tag semântica (`v0.1.0`, `v0.2.0`, etc).
- **`develop`**: branch de integração, **base de TODAS as feature branches**. PRs de `feature/*` são mergeados aqui após aprovação.
- **`feature/*`**: branches de trabalho. Nome padrão: `feature/<descricao-curta>` (ex.: `feature/export-png-heatmap`). Nascem de `develop` e voltam para `develop` via PR.
- **`release/*`**: preparação de release. Nome padrão: `release/<versao>` (ex.: `release/0.2.0`). Nascem de `develop` quando o conjunto de features do ciclo fecha; só recebem bugfix, ajuste de versão ou docs — não novas features. Ao concluir: merge em `main` (com tag) e de volta em `develop`.
- **`hotfix/*`**: correção urgente em produção. Nome padrão: `hotfix/<descricao-curta>`. Nascem de `main`; ao concluir, merge de volta em `main` (nova tag) e em `develop`, para não perder a correção no próximo release.

### Fluxo de Desenvolvimento

**Feature** (caso comum):
1. Criar branch a partir de `develop`:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/minha-feature
   ```
2. Desenvolver e commitar na feature branch
3. Abrir Pull Request para `develop`
4. Após aprovação, mergear em `develop`

**Release**:
1. `develop` com o conjunto de features do ciclo fechado: `git checkout -b release/x.y.z develop`
2. Só ajustes finais na branch de release (versão, changelog, bugfix pontual)
3. Merge em `main`, tag `vX.Y.Z`, merge de volta em `develop`

**Hotfix**:
1. Bug crítico em produção: `git checkout -b hotfix/descricao main`
2. Corrigir, mergear em `main` (nova tag de patch) e em `develop`

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
