# Phase 02: Atualizar seções 2 (Components), 3 (Data Flow) e 6 (Stack) do arch doc

Refletir o i18n como preocupação de runtime nas três seções do `docs/02-arch.md` que descrevem a arquitetura como ela está hoje. A reescrita precisa ser cirúrgica: o usuário (escopo confirmado) pediu mudanças só nessas três seções, sem mexer nas outras. O ADR-047 (Phase 01) já cobre a justificativa histórica/decisionária — aqui o objetivo é só deixar os diagramas e listas de stack em sincronia com o que o código já faz.

## Tasks

- [x] Confirmar o ponto de partida lendo o working tree:
  - `git diff docs/02-arch.md` deve mostrar APENAS a reformatação da tabela da seção 2 (largura das colunas, sem mudança semântica) — esse diff já existe, vindo de uma sessão anterior, e NÃO deve ser desfeito
  - As seções 2, 3 e 6 atualmente não mencionam i18n em lugar nenhum — é o que vamos corrigir
  - **Nota (Phase 02 execução):** no checkout atual o `git diff docs/02-arch.md` está limpo (working tree sem reformatação prévia não-comitada); as seções 2, 3 e 6 não mencionam i18n, conforme esperado. Procedido sem preservar nenhum diff de reformat — a tabela da seção 2 mantém o formato `| ----------- |` que já estava no HEAD/commit, intacto.

- [x] Atualizar a seção 2 (Components) — atualizar só a linha do `renderer/` na tabela:
  - Adicionar à célula de Responsabilidade uma menção curta, no mesmo padrão de prosa corrida da frase atual, ex.: "...cálculo e renderização do heatmap (IDW), visão de canais/interferência, **i18n com `i18next`/`react-i18next` (PT-BR default + EN, persistido em `localStorage`)**, persistência local"
  - Manter a linha do `main/` e do `IndexedDB` inalteradas — i18n é puramente runtime do renderer, não cruza IPC nem persiste em IndexedDB
  - Manter a frase após a tabela ("Não há backend remoto...") inalterada
  - Preservar a reformatação de colunas que já está no working tree (a versão larga com `| ----------- |` etc. que veio do diff anterior)

- [x] Atualizar a seção 3 (Data Flow) — adicionar um nó i18n em AMBOS os diagramas Mermaid (3a e 3b), sem mexer no fluxo principal:
  - No diagrama 3a (`Captura e persistência`): dentro do subgraph `renderer1`, adicionar um nó `I18n["i18n.ts<br/>(i18next init +<br/>locales/*.json)"]`
  - Adicionar uma aresta `UI1 -->|"t('toolbar.*')<br/>(re-render<br/>em changeLanguage)"| I18n` (ou direção equivalente) — o objetivo é só deixar visível que a UI lê do i18n, não reescrever o fluxo de captura
  - No diagrama 3b (`Geração do heatmap e visão de canais`): i18n NÃO precisa entrar — o caminho de geração do heatmap é puro lógico/matemático, sem strings traduzidas no caminho. Documentar isso implicitamente: o diagrama continua sem o nó (o ADR-047 já explica que i18n é só camada de apresentação)
  - Adicionar uma subseção curta `### 3.3 Resolução de idioma (i18n)` logo após a `3.2 Captura ao vivo via IPC no processo main`, com texto corrido explicando:
    1. `main.tsx` importa `./i18n` antes de montar `<App />` — init roda sync, sem Suspense
    2. Idioma inicial resolvido em `detectInitialLanguage()` (`i18n.ts`): `localStorage[LANGUAGE_STORAGE_KEY]` se for `pt-BR` ou `en`; senão, `navigator.language` começando com `pt` → `pt-BR`; senão `en`
    3. Componentes consomem via `useTranslation()` e `t('namespace.key')`; troca de idioma pelo `Toolbar` dispara `i18n.changeLanguage(lang)`, que re-renderiza toda a árvore via Context do react-i18next
    4. Listener `i18n.on('languageChanged')` persiste a escolha em `localStorage` na mesma chave
    5. `fallbackLng: 'en'` — qualquer chave ausente cai em inglês
    6. Nenhum dado do projeto (planta/ponto/leitura) carrega informação de locale; troca de idioma é puramente camada de apresentação

- [x] Atualizar a seção 6 (Stack) — adicionar i18n à lista de libs do `renderer/`, na mesma posição onde aparece a de outras libs (alfabética ou por agrupamento, seguindo o estilo da lista atual):
  - Adicionar uma linha nova na lista `- **\`i18next\` + \`react-i18next\`** — runtime de internacionalização no renderer; locales em `src/renderer/src/locales/<lang>.json` (PT-BR default + EN), detecção via `localStorage`/`navigator.language`, persistência da escolha em `localStorage`; ver ADR-047.`
  - Posicionar a linha em um lugar que não quebre o agrupamento atual (a lista hoje segue: React+Vite, Canvas, Web Worker, idb, parser próprio, Zustand, SVG nativo — i18n cabe logo após Zustand, antes de SVG, mantendo agrupamento conceitual de "dependência externa")
  - Atualizar a tabela `Linguagens e runtimes` se e somente se a versão do i18next for relevante para reprodutibilidade: `i18next ^26.3.6` e `react-i18next ^17.0.11` (valores do `package.json` confirmado na Phase 01). Adicionar uma sub-tabela `### Bibliotecas adicionais do renderer` ou, mais simples, uma linha inline no parágrafo do React+Vite indicando a versão exata. Preferir a forma menos invasiva: nota inline no item do i18next
  - Atualizar a subseção `### Convenções` se houver algo de i18n a registrar:
    - Adicionar uma linha curta: "Strings de UI residem em `src/renderer/src/locales/<lang>.json`; nunca hardcoded em componentes (`t('namespace.key')` via `useTranslation`). Locale persiste em `localStorage`, não no schema de projeto."

- [x] Verificar consistência do doc inteiro:
  - Ler `docs/02-arch.md` do início ao fim e confirmar que:
    - Seção 2 menciona i18n na linha do renderer
    - Seção 3a tem o nó I18n no diagrama + subseção 3.3 textual
    - Seção 6 lista i18n na pilha do renderer
    - Seção 9 termina com o ADR-047 inserido após o ADR-046 (Phase 01)
    - Nenhuma das seções 1, 4, 5, 7, 8 foi tocada
  - Conferir que os links internos `[ADR-XXX](#adr-xxx--…)` para outros ADRs ainda funcionam (o título do ADR-047 gerado deve estar no formato kebab-case que o GitHub usa como âncora)
  - Conferir que o `git diff docs/02-arch.md` final mostra: (a) as edições desta phase, (b) a reformatação de coluna da seção 2 já existente inalterada, (c) o ADR-047 da Phase 01, (d) NADA mais
