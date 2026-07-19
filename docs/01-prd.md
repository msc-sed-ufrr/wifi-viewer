# Product Requirements Document — WiFi Viewer

## 1. Contexto

WiFi Viewer é um aplicativo desktop (Electron) para uso pessoal que transforma leituras de varredura Wi-Fi (importadas de arquivos de scan ou capturadas ao vivo) em um **heatmap de cobertura** sobreposto à planta de um prédio. O usuário marca manualmente, sobre a imagem da planta, o ponto onde cada leitura está sendo coletada; o sistema interpola essas leituras para gerar mapas de calor por rede (SSID/BSSID), permitindo enxergar zonas de sinal fraco, sobreposição de canais e redes concorrentes — de forma semelhante a ferramentas de site survey como NetSpot ou Ekahau, porém com escopo simplificado para uso acadêmico.

WiFi Viewer **não** é uma ferramenta de administração de rede: não configura, reinicia ou gerencia access points; **não** realiza posicionamento indoor automático (GPS/BLE/triangulação); **não** é um produto multiusuário/corporativo com contas e permissões; e **não** oferece monitoramento contínuo em tempo real com alertas.

---

## 2. Personas

| Persona             | Core need                                                                                                                               | Interfaces                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Usuário  (surveyor) | Mapear a cobertura Wi-Fi de um espaço (casa, escritório, prédio) para identificar pontos cegos, interferência de canal e redes visíveis | Aplicativo desktop instalável (Electron — Windows/macOS/Linux), importação de arquivo CSV, captura ao vivo nativa integrada |

---

## 3. Problema

Ferramentas de varredura Wi-Fi (ex.: WiFi Analyzer) produzem tabelas densas de SSIDs, BSSIDs, força de sinal, canal e distância estimada — mas nenhum contexto espacial. Para entender *onde* a cobertura falha dentro de um prédio, o usuário precisa cruzar mentalmente dezenas de linhas de dados com a planta física do local, o que não escala além de poucos pontos de medição e não revela padrões (zonas mortas, sobreposição de canais entre APs vizinhos, redes ocultas concorrentes). Soluções comerciais de site survey (NetSpot, Ekahau) resolvem isso, mas são pagas, voltadas a uso profissional/corporativo e não pensadas para um levantamento pontual e individual de um único prédio ou residência.

### Panorama Competitivo

#### Concorrentes comerciais

| Produto | Modelo | Preço (aprox.) | Plataforma | Diferenciais-chave |
| --- | --- | --- | --- | --- |
| Ekahau Connect | Enterprise (Accenture) | ~US$3.000/ano + hardware | Win/Mac + iOS/Android | AI Pro planning, Sidekick 2 (HW), cloud sync, integrações com APIs de fabricante, WiFi 7 |
| NetSpot | Prosumer pago | US$49–149 | Win/Mac + Android | 20+ tipos de heatmap, planning mode, active survey (iPerf), report builder |
| Acrylic Wi-Fi Heatmaps | Profissional pago | US$99–499 | Windows | WiFi 7, sniffer, spectrum analysis, BLE analyzer |
| Acrylic Wi-Fi Analyzer | Profissional pago | US$49–199 | Windows | Troubleshooting ao vivo, detecção de APs, métricas de performance |
| TamoGraph Site Survey | Profissional pago | ~US$1.000 | Windows | Site survey enterprise completo |

#### Concorrentes open-source

| Projeto | Estrelas | Stack | Funcionalidades |
| --- | --- | --- | --- |
| python-wifi-survey-heatmap (jantman) | ~480 | Python, CLI | Survey Linux-only, heatmap matplotlib |
| wifi-planner (mmereu) | ~1 | React + FastAPI + Docker | AP placement, predição de sinal, paredes, AI wall detection |
| wifi-heatmap (ribaldorafael) | ~1 | Python/Flask | Survey multi-plataforma, mesh support |
| WiFi Viewer (este projeto) | — | Electron + React + Vite | O mais completo tecnicamente entre os open-source |

No espaço open-source, o WiFi Viewer é hoje o único projeto que combina simultaneamente captura ao vivo nativa multi-SO (Windows/Linux/macOS), heatmap IDW em Web Worker, UI desktop em React e persistência 100% local — alternativas como `python-wifi-survey-heatmap` (CLI, Linux-only), `wifi-planner` (foco em predição/AI wall detection, sem captura ao vivo multi-SO) e `wifi-heatmap` não reúnem esse conjunto.

#### Matriz de gaps vs. concorrentes comerciais

| Funcionalidade | Ekahau | NetSpot | Acrylic | WiFi Viewer |
| --- | --- | --- | --- | --- |
| Heatmap por SSID | ✅ | ✅ | ✅ | ✅ |
| Calibração de escala | ✅ | ✅ | ✅ | ✅ |
| Captura ao vivo | ✅ (Sidekick) | ✅ | ✅ | ✅ |
| Múltiplas plantas | ✅ | ✅ | ✅ | ✅ |
| Gráfico de canais | ✅ | ✅ | ✅ | ✅ |
| Planning preditivo (AP placement) | ✅ | ✅ | ✅ | ❌ |
| Active survey (throughput) | ✅ | ✅ | ❌ | ❌ |
| Export relatório PDF | ✅ | ✅ | ✅ | ❌ |
| Suporte 6GHz / WiFi 6E-7 | ✅ | ✅ | ✅ | ❌ |
| App mobile de coleta | ✅ | ✅ | ❌ | ❌ |
| Cloud sync / colaboração | ✅ | ❌ | ❌ | ❌ |
| Integração APIs de fabricante | ✅ | ❌ | ❌ | ❌ |
| Auto-positioning (GPS/fingerprint) | ✅ | ❌ | ❌ | ❌ |

Gaps aceitos deliberadamente frente às ferramentas comerciais (orientam o backlog na Seção 9, não são compromisso de paridade): planning preditivo de AP, active survey de throughput, export de relatório PDF, suporte a 6GHz/WiFi 6E-7, app mobile de coleta, cloud sync/colaboração, integração com APIs de fabricante e auto-positioning — os três últimos, em particular, tensionam com os não-objetivos da Seção 11 e exigiriam uma decisão explícita de mudança de escopo antes de entrar em desenvolvimento.

#### Critérios de priorização do roadmap

Os itens da Seção 9 são ordenados por estes critérios, nesta ordem:

1. **Valor de usuário**: o quanto a funcionalidade melhora a experiência de uso.
2. **Diferenciação**: o quanto nos destaca de outros open-source.
3. **Esforço de implementação**: estimativa de complexidade técnica.
4. **Dependências**: o que precisa estar pronto antes.

---

## 4. Objetivos

- Permitir capturar leituras ao vivo nativamente via varredura Wi-Fi do sistema operacional (sem depender de processos externos), associando-as ao ponto onde o usuário está no momento da captura.
- Permitir importar um arquivo de scan Wi-Fi (formato exemplificado no CSV de referência) e associar cada leitura a um ponto físico na planta do prédio.
- Gerar um heatmap visual de força de sinal (dBm) por rede (SSID) e, quando necessário, por rádio/banda individual (BSSID), sobreposto à planta.
- Evidenciar sobreposição de canais e conflitos entre redes nas bandas 2.4GHz e 5GHz.
- Permitir múltiplas plantas (por prédio ou por andar) dentro do mesmo levantamento.

---

## 5. Escopo

### Estado Atual

| Capability                          | Status | Notes                                                                                                                                                                 |
| ----------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Definição de requisitos (este PRD)  | ✅ 100% | —                                                                                                                                                                     |
| Upload/gestão de planta do prédio   | ✅ 100% | Criação de levantamento + upload de imagem (UC-001)                                                                                                                   |
| Importação de CSV de scan           | ✅ 100% | Validação estrita do formato de referência (UC-002)                                                                                                                   |
| Exportação de CSV + reimportação    | ✅ 100% | Por ponto, planta ou levantamento inteiro; reimportação consolidada recria pontos pela posição, casando planta por nome no nível de levantamento, com reescala proporcional (ou aviso) quando a imagem escolhida difere da original (ver Regras de Negócio, ADR-033/034/036) |
| Marcação manual de pontos na planta | ✅ 100% | Criar/selecionar/remover pontos, resetar todos de uma vez, reposicionar um ponto por arraste e todos de uma vez via Shift+arraste com confirmação (UC-004) funcionam  |
| Captura ao vivo                     | ✅ 100% | Nativa via processo principal do Electron (IPC) em Windows/Linux. No macOS depende de `macwifi-cli` (ferramenta externa via Homebrew) — ver docs/02-arch.md (ADR-010) |
| Geração de heatmap                  | ✅ 100% | IDW clássico (potência) pro valor + confiança gaussiana separada pra opacidade, gradiente contínuo sem bandas, legenda dBm→cor térmica (ADR-024/028/029)              |
| Visualização por SSID / por BSSID   | 🔶 70% | Agrupamento por SSID + visão "todas as redes" (cores por rede) prontos; drill-down explícito por BSSID individual dentro de um SSID ainda não                         |
| Filtro por banda (2.4GHz/5GHz)      | ✅ 100% | Filtra leituras antes de agrupar redes e calcular o heatmap                                                                                                           |
| Calibração de escala + réguas       | ✅ 100% | Clique em 2 pontos + distância real; réguas horizontal/vertical em metros                                                                                             |
| Legenda ampliável                   | ✅ 100% | Clique na legenda (gradiente ou lista de redes) alterna entre modo compacto e ampliado                                                                                |
| Múltiplos levantamentos/plantas     | ✅ 100% | Sidebar (colapsável) lista levantamentos e suas plantas; criação, renomeação e exclusão (com confirmação) de planta, troca entre elas (ADR-015, ADR-018, ADR-037). Exclusão de levantamento inteiro ainda não |
| Layout responsivo                   | ✅ 100% | Sidebar colapsável e painel de ponto flutuante sobre a planta — nenhum dos dois disputa espaço com a planta, que sempre ocupa a largura toda disponível (ADR-018)     |
| Navegação na planta (zoom/mover)    | ✅ 100% | Zoom 25%–400% (+/−) e mover por clique-e-arraste; réguas se realinham automaticamente com o zoom (ADR-030)                                                            |

### Bloqueios do produto

| Blocker                                                        | Severity | Area              |
| ---------------------------------------------------------------- | -------- | ------------------ |
| Formato de CSV de origem pode variar entre apps de scan          | Medium   | Importação de dados |

---

## 6. Regras de Negócio

### Planta do prédio
- Um levantamento (*survey*) é composto por uma ou mais plantas, cada uma representando um andar ou área do prédio.
- Cada planta é uma imagem estática enviada pelo usuário; opcionalmente, o usuário define uma escala (distância real entre dois pontos clicados na imagem) usada para calibrar o heatmap.
- Sem calibração, o heatmap é gerado em coordenadas relativas de pixel, sem conversão para metros.

### Pontos de medição
- Um ponto de medição é criado quando o usuário clica na planta para indicar onde uma leitura (ou lote de leituras) foi coletada.
- Um ponto de medição pode ser preenchido por (a) importação de um arquivo de scan associado a esse ponto, ou (b) captura ao vivo disparada com o ponto já selecionado na planta.
- Cada ponto armazena todas as leituras de rede capturadas naquele local: SSID, BSSID, força de sinal (dBm), canal, frequência, largura de banda, segurança, padrão 802.11 e timestamp da leitura.
- O campo "Distance" presente nos arquivos de scan (ou, quando ausente, uma estimativa equivalente calculada a partir do dBm pelo próprio app) é uma estimativa de atenuação de sinal (sem direção) até a origem; é exibida ao usuário na tabela de leituras do ponto e usada para influenciar o alcance visual do heatmap (leituras de origem estimada mais próxima espalham mais no mapa de calor; mais distante, menos), mas **não** é usada para posicionar automaticamente o ponto ou o AP na planta — a posição continua sendo sempre um clique manual do usuário.

### Identidade de rede
- BSSIDs são agrupados por SSID para a visão padrão do heatmap (ex.: "CIT_Alunos" agrega todos os BSSIDs com esse SSID, em 2.4GHz e 5GHz).
- O usuário pode alternar para visão por BSSID individual, já que um mesmo equipamento físico frequentemente expõe rádios/bandas distintos sob o mesmo SSID (ex.: `Starlink_CIT` em 2.4GHz e 5GHz com BSSIDs diferentes).
- Redes com SSID "hidden"/oculto são listadas separadamente por BSSID, pois não podem ser agrupadas por nome.

### Importação de dados
- A importação aceita arquivos delimitados no formato de referência: `Time Stamp | SSID | BSSID | Strength | Primary Channel | Primary Frequency | Center Channel | Center Frequency | Width (Range) | Distance | 802.11mc | Security | Standard | FastRoaming`.
- Todas as linhas de um mesmo arquivo importado em uma única operação são associadas ao mesmo ponto de medição, selecionado previamente pelo usuário na planta.
- Múltiplas importações podem ser feitas para múltiplos pontos, compondo o conjunto de dados do heatmap.

### Exportação de dados
- O usuário pode exportar as leituras de um ponto (`PointPanel`), de uma planta inteira ou de um levantamento inteiro (menu "⋮" da planta ou do levantamento na sidebar) como CSV no mesmo formato de referência da importação, com colunas adicionais (`Floor Plan`, `Point Label`, `Point X`, `Point Y`, `Floor Plan Width`, `Floor Plan Height`) identificando de qual planta/ponto/posição cada leitura veio e as dimensões (px) da imagem da planta de origem. A exportação de levantamento produz um único arquivo consolidando todas as plantas do projeto, não um arquivo por planta. Não há exportação em outros formatos (JSON, XML) — fora de escopo.
- Nome do arquivo: `<levantamento>-<planta>[-<ponto>]-<data>.csv` (exportação de ponto/planta) ou `<levantamento>-<data>.csv` (exportação de levantamento inteiro).
- Um CSV exportado é reimportável: pelo fluxo normal de importação (por ponto, ignora as colunas extras) ou, se tiver as colunas de posição (`Floor Plan`/`Point Label`/`Point X`/`Point Y` — as de dimensão são opcionais), pelo "Importar" do menu da planta (recria um ponto por posição presente no arquivo), do levantamento (mesma reconstrução, casando cada linha com uma planta existente do projeto pelo nome em `Floor Plan`) na sidebar, ou já na criação de uma planta/levantamento novo. Reimportar sobre uma planta que já tem pontos duplica os pontos: não há deduplicação por posição. No "Importar" de levantamento, linhas cuja planta não existe no projeto são ignoradas (nenhuma planta é criada automaticamente) e os nomes ignorados aparecem num aviso — criar a planta faltante automaticamente é melhoria futura, não implementada.
- Se o CSV carrega as dimensões da planta de origem e elas diferem da planta alvo (a que está sendo criada ou a que já existe), a posição de cada ponto é reescalada proporcionalmente para caber na planta alvo — preserva a posição relativa mesmo numa imagem de tamanho diferente. Sem essa informação (CSV exportado antes desse recurso existir) ou quando a posição resultante ainda assim excede os limites, o ponto nasce preso à borda da planta — visível, ainda que na posição errada, em vez de desaparecer silenciosamente fora da área visível (ver Regras de Negócio, ADR-036). Na criação de uma planta/levantamento novo, um aviso mostra isso antes de "Criar" e permite trocar a imagem escolhida.
- `signalSource` e `noise` não sobrevivem a um ciclo de exportar→reimportar: o formato de referência não tem coluna para nenhum dos dois, então uma leitura volta sempre como `"measured"` e sem `noise`, mesmo que a origem fosse captura ao vivo estimada.
- Ao criar uma planta (ou levantamento) nova, o formulário já aceita opcionalmente um CSV consolidado: os pontos são recriados assim que a planta é salva, sem precisar de um "Importar" separado depois (ver ADR-035/036).

### Heatmap
- O heatmap é recalculado sempre que um ponto de medição é adicionado, editado ou removido.
- A interpolação de sinal entre pontos usa apenas os pontos marcados na mesma planta (não mistura dados de plantas/andares diferentes).
- Áreas da planta sem cobertura de pontos próximos são exibidas como "dados insuficientes", não como sinal zero/ausente.

---

## 7. Use Cases

### UC-001 — Criar levantamento e enviar planta do prédio

**Actor:** Usuário

**Flow:**
1. Usuário cria um novo levantamento.
2. Usuário envia uma imagem da planta (por andar/área).
3. Opcionalmente, define dois pontos de referência e a distância real entre eles para calibrar escala.

**Acceptance criteria:**
- Levantamento criado com ao menos uma planta associada.
- Se calibração for informada, escala (pixel↔metro) é armazenada e usada nos heatmaps daquela planta.

---

### UC-002 — Importar arquivo de scan em um ponto da planta

**Actor:** Usuário

**Pre-conditions:** Levantamento e planta já existem.

**Flow:**
1. Usuário clica na planta para indicar o local da coleta.
2. Usuário importa o arquivo de scan (formato de referência) para esse ponto.
3. Sistema associa todas as redes do arquivo a esse ponto de medição.

**Acceptance criteria:**
- Ponto de medição criado com todas as leituras do arquivo vinculadas.
- Arquivos fora do formato esperado são rejeitados com mensagem clara indicando o problema.

---

### UC-003 — Capturar scan ao vivo em um ponto da planta

**Actor:** Usuário

**Pre-conditions:** O sistema operacional do usuário suporta o comando nativo de varredura Wi-Fi (verificado automaticamente pelo app na inicialização).

**Flow:**
1. Usuário clica na planta indicando sua posição atual.
2. Usuário dispara a captura ao vivo.
3. Sistema registra as redes detectadas naquele instante como leituras do ponto.

**Acceptance criteria:**
- Ponto de medição populado com as leituras capturadas no momento do disparo.
- Se o comando nativo de varredura falhar ou não existir no SO do usuário, o sistema exibe um erro claro e orienta o uso de importação de arquivo (UC-002) em vez de falhar silenciosamente.

---

### UC-004 — Editar ou remover um ponto de medição

**Actor:** Usuário

**Flow:**
1. Usuário seleciona um ponto existente na planta.
2. Usuário reposiciona o ponto, adiciona nova leitura, ou remove o ponto. Alternativamente, remove todos os pontos da planta de uma vez, ou reposiciona todos de uma vez arrastando com Shift.

**Acceptance criteria:**
- Heatmap é recalculado automaticamente após a alteração.
- Remoção de um ponto remove todas as leituras associadas a ele.
- Remoção em lote ("resetar pontos") exige confirmação explícita antes de executar, por ser destrutiva e irreversível.
- Reposicionar um ponto: clique-e-arraste começando em cima do marcador move o ponto (com preview ao vivo); a posição só é persistida ao soltar, e o ponto nunca sai dos limites da planta.
- Reposicionar todos os pontos de uma vez: Shift+clique-e-arraste em qualquer lugar da planta desloca todos os pontos juntos — visualmente, os pontos ficam parados e a imagem de fundo desliza sob eles, pra facilitar avaliar o deslocamento antes de aplicá-lo. Ao soltar, exige confirmação explícita (mostrando quantos pontos serão afetados) antes de persistir; cancelar descarta o preview sem alterar nada. Nenhum ponto sai dos limites da planta.

---

### UC-005 — Visualizar heatmap por rede

**Actor:** Usuário

**Pre-conditions:** Ao menos dois pontos de medição existem na planta.

**Flow:**
1. Usuário seleciona uma rede (SSID agregando BSSIDs), uma banda (2.4GHz/5GHz/todas) para filtrar, ou "todas as redes" para ver a cobertura combinada.
2. Sistema renderiza o heatmap de força de sinal sobre a planta, com legenda indicando a leitura das cores.

**Acceptance criteria:**
- Modo rede única: escala de cor consistente por dBm (verde = sinal forte, vermelho = sinal fraco/ausente), com bandas de contorno perceptíveis para deixar claro onde o sinal sobe/desce entre pontos (ex.: atravessando uma parede).
- Modo "todas as redes": cada rede recebe uma cor própria e estável; sobreposições misturam as cores em vez de escolher uma vencedora. Legenda lista cor→rede.
- Em ambos os modos, o alcance visual (raio de espalhamento) de cada ponto acompanha a distância estimada até a origem daquela rede (com planta calibrada, em metros reais; sem calibração, aproximado pelo dBm) — leituras de origem mais próxima espalham mais no mapa; mais distante, menos.
- Filtro de banda restringe quais redes aparecem no seletor e entram no cálculo do heatmap, sem afetar os dados armazenados.
- Áreas sem dados suficientes são visualmente distintas de áreas com sinal fraco confirmado.

---

### UC-006 — Comparar canais e identificar interferência

**Actor:** Usuário

**Pre-conditions:** Levantamento contém múltiplas redes na mesma planta.

**Flow:**
1. Usuário abre a visão de canais.
2. Sistema lista os canais/bandas em uso pelas redes detectadas e destaca sobreposições (ex.: múltiplos APs no canal 6 de 2.4GHz).

**Acceptance criteria:**
- Redes na mesma banda e canal (ou canais sobrepostos) são agrupadas/destacadas visualmente.
- 2.4GHz e 5GHz são exibidos em visões separadas, dado que não competem entre si.

---

## 8. Riscos & Mitigações

| Risk                                                                    | Impact | Mitigation                                                                                                                                                                       |
| ----------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Comandos de varredura Wi-Fi variam entre SOs (Windows/Linux/macOS) e retornam formatos diferentes | Medium | Um adaptador por SO no processo principal do Electron, normalizando a saída para o mesmo formato de leitura; falha em um SO não afeta a importação de arquivo, que continua funcionando |
| Captura ao vivo no macOS depende de uma ferramenta externa (`macwifi-cli`, via Homebrew) em vez de um binário próprio — `airport` foi removido pela Apple e um helper CoreWLAN próprio se mostrou inviável sem assinatura Developer ID paga (confirmado empiricamente: Gatekeeper rejeita binários ad-hoc, `spctl --add` foi descontinuado) | Medium | Aceito: `macwifi-cli` já é assinado/notarizado pelo autor, resolvendo o problema sem custo para este projeto. Se a ferramenta for descontinuada, a UI já trata "mecanismo indisponível" graciosamente (UC-003) e importação de arquivo continua funcionando |
| Distribuição de instaladores não assinados pode gerar avisos do SO (Gatekeeper/SmartScreen) | Low | Fora de escopo por ora — uso a partir do código-fonte; revisitar apenas se houver necessidade de distribuir a terceiros |
| Formato de CSV varia entre ferramentas de scan diferentes do usuário    | Medium | Validar e documentar claramente o formato de referência aceito; rejeitar com mensagem específica em vez de falhar silenciosamente                                                |
| Ausência de calibração de escala leva a heatmap espacialmente impreciso | Medium | Tornar a calibração simples (dois cliques + distância) e destacar visualmente quando a planta não está calibrada                                                                 |
| Poucos pontos de medição geram interpolação enganosa                    | Medium | Marcar explicitamente áreas de "dados insuficientes" em vez de extrapolar sinal com confiança                                                                                    |

---

## 9. Roadmap

### Estado atual (julho 2026)
App Electron funcional: criação de levantamento, upload de planta, importação de CSV, exportação de CSV (por ponto, planta ou levantamento inteiro, com reimportação consolidada casando plantas por nome nesse último caso), marcação/remoção/reposicionamento de pontos (individual e em lote), captura ao vivo nas três plataformas, heatmap por rede única e por "todas as redes" (cores por rede, misturando nas sobreposições), filtro por banda, calibração de escala com réguas, legenda ampliável por clique, e navegação entre múltiplos levantamentos/plantas via sidebar. Testado manualmente de ponta a ponta. Comparado ao mercado, é o projeto open-source mais completo tecnicamente no seu nicho, mas ainda não oferece export de heatmap/relatório visual (imagem ou PDF) — ver Panorama Competitivo na Seção 3.

O roadmap abaixo unifica as pendências herdadas do MVP com as fases de evolução mapeadas a partir do panorama competitivo (Seção 3); legenda de esforço: **P** (dias) · **M** (1–2 semanas) · **G** (2–4 semanas) · **GG** (1–3 meses).

### Fase 1 — Core Mature (v0.2.0)
Fecha pendências do MVP e funcionalidades essenciais para o app ficar comparável a ferramentas comerciais básicas.

| # | Item | Descrição | Esforço | Prioridade |
| --- | --- | --- | --- | --- |
| 1 | ~~Reposicionar ponto(s) por arraste~~ ✅ | Concluído (julho 2026) — arraste do marcador move um ponto (ADR-032); Shift+arraste na planta move todos de uma vez, com confirmação (ADR-038) | P | Alta |
| 2 | Visão por BSSID individual | Drill-down explícito dentro de um SSID agrupado | P | Alta |
| 3 | ~~Excluir planta~~ ✅ / Excluir levantamento | Planta: concluído (julho 2026), com confirmação, ver ADR-037. Levantamento (projeto) inteiro: ainda não — só fica sem plantas se todas forem excluídas uma a uma | P | Média |
| 4 | Export heatmap PNG/PDF | Salvar heatmap como imagem ou relatório básico | M | Alta |
| 5 | Suporte à banda 6GHz (WiFi 6E/7) | Canalização + heatmap para a banda de 6GHz | P | Alta |
| 6 | Visão de canais/interferência dedicada | Além do filtro de banda já existente (UC-006) | G | Média |
| 7 | Otimização de performance do IDW | Spatial index (kd-tree) para acelerar a grade | M | Média |
| 8 | Dark mode / temas | Suporte a tema escuro | P | Baixa |
| 9 | ~~Exportar leituras para CSV~~ ✅ | Concluído (julho 2026) — export/import por ponto, planta ou levantamento inteiro, ver ADR-033/034. Pendente: import de levantamento criar automaticamente (sem imagem) plantas citadas no CSV que ainda não existem — hoje essas linhas só são ignoradas e avisadas | P | Baixa |

### Fase 2 — Advanced Features (v0.3.0)
Funcionalidades que tornam o app útil para profissionais de rede.

| # | Item | Descrição | Esforço | Prioridade |
| --- | --- | --- | --- | --- |
| 10 | Export/import de projeto como bundle | Portabilidade entre máquinas (ADR-005, decidido mas ainda não implementado) | M | Média |
| 11 | Modo de planejamento preditivo | Colocar APs virtuais na planta e simular cobertura | GG | Alta |
| 12 | Active survey (iPerf3) | Teste de throughput integrado | G | Alta |
| 13 | Suporte a múltiplos formatos de CSV | Parser flexível para diferentes ferramentas de origem | M | Média |
| 14 | Relatório customizável em PDF | Relatório profissional com heatmaps e tabelas | G | Média |
| 15 | Comparação entre levantamentos | Comparar antes/depois de mudanças na rede ao longo do tempo | G | Média |
| 16 | Internacionalização (i18n) | Suporte a múltiplos idiomas | M | Baixa |

### Fase 3 — Scale (v1.0.0)
Escala para uso em equipe/ambientes maiores. A maioria destes itens exige revisitar deliberadamente decisões de escopo já tomadas (Seções 1 e 11) antes de entrar em desenvolvimento — não são extensões incrementais do produto atual.

| # | Item | Descrição | Esforço | Prioridade | Nota de escopo |
| --- | --- | --- | --- | --- | --- |
| 17 | App mobile companion | Coleta de dados via celular (React Native) | G | Média | Fora de escopo "nesta fase" (Seção 11); reavaliar quando/se o produto crescer além de uso pessoal |
| 18 | Cloud sync auto-hospedável | Sincronizar projetos entre máquinas | GG | Média | Exige backend — conflita com [ADR-001](02-arch.md#adr-001--arquitetura-client-only-sem-backend-remoto) ("sem backend remoto por padrão" em docs/02-arch.md); tratar como mudança arquitetural deliberada |
| 19 | Integração com APIs de fabricante | Unifi, Cisco Meraki, Mikrotik | G | Baixa | Risco de deslizar para "administração de rede", explicitamente fora de escopo (Seção 1) — escopo restrito a leitura, nunca configuração |
| 20 | Sistema de plugins | API para extensões da comunidade | GG | Baixa | — |
| 21 | Auto-positioning (fingerprinting por RSSI) | Posicionamento automático de ponto/AP | GG | Baixa | **Conflita diretamente** com o não-objetivo "não realiza posicionamento indoor automático" (Seções 1 e 11) — exige decisão explícita de mudança de escopo, não é evolução natural do produto |
| 22 | Instaladores assinados/notarizados | macOS Gatekeeper / Windows SmartScreen | M | Baixa | Só se surgir necessidade real de distribuir o app a terceiros (Seção 11) |

---

## 10. Critérios para o sucesso

### Qualitativos
- Um usuário consegue, sem instrução prévia, importar um arquivo de scan, marcar o ponto na planta e visualizar um heatmap coerente com a intuição de "aqui o sinal é mais fraco".
- Zonas com poucos dados são claramente diferenciadas de zonas com sinal fraco confirmado.
- Redes com múltiplos BSSIDs (2.4GHz/5GHz do mesmo AP) são agrupadas de forma que não pareçam redes duplicadas confusas.

### Quantitativos

| Criterion                                              | Target                          |
| --------------------------------------------------------- | ---------------------------------- |
| Formato de CSV de referência suportado na importação      | 100% dos campos do arquivo exemplo |
| Recalculo do heatmap após alteração de ponto              | Automático, sem ação manual extra  |
| Pontos mínimos para gerar heatmap                         | 2 pontos na mesma planta           |

---

## 11. Fora de Escopo
- Configuração, gerenciamento ou autenticação em access points.
- Posicionamento automático via GPS, BLE ou triangulação de sinal.
- Contas de usuário multiusuário, permissões ou colaboração em tempo real.
- Monitoramento contínuo com alertas/notificações de queda de sinal.
- Aplicativo mobile nativo (iOS/Android) nesta fase.
- Distribuição de instaladores assinados/notarizados (macOS Gatekeeper, Windows SmartScreen) — build/execução a partir do código-fonte é suficiente nesta fase.
- Ataques, quebra de segurança ou qualquer funcionalidade de análise ofensiva sobre redes de terceiros — o produto é estritamente um visualizador passivo de dados de varredura já coletados.
