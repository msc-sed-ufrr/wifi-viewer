# Product Requirements Document — WiFi Viewer

> Termos técnicos e siglas usados neste documento (ex.: SSID, BSSID, dBm, heatmap) estão explicados em [docs/00-glossary.md](00-glossary.md).

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
| Marcação manual de pontos na planta | 🔶 80% | Criar/selecionar/remover pontos e resetar todos de uma vez funcionam; reposicionar por arraste (UC-004) ainda não                                                     |
| Captura ao vivo                     | ✅ 100% | Nativa via processo principal do Electron (IPC) em Windows/Linux. No macOS depende de `macwifi-cli` (ferramenta externa via Homebrew) — ver docs/02-arch.md (ADR-010) |
| Geração de heatmap                  | ✅ 100% | IDW clássico (potência) pro valor + confiança gaussiana separada pra opacidade, gradiente contínuo sem bandas, legenda dBm→cor térmica (ADR-024/028/029)              |
| Visualização por SSID / por BSSID   | 🔶 70% | Agrupamento por SSID + visão "todas as redes" (cores por rede) prontos; drill-down explícito por BSSID individual dentro de um SSID ainda não                         |
| Filtro por banda (2.4GHz/5GHz)      | ✅ 100% | Filtra leituras antes de agrupar redes e calcular o heatmap                                                                                                           |
| Calibração de escala + réguas       | ✅ 100% | Clique em 2 pontos + distância real; réguas horizontal/vertical em metros                                                                                             |
| Legenda ampliável                   | ✅ 100% | Clique na legenda (gradiente ou lista de redes) alterna entre modo compacto e ampliado                                                                                |
| Múltiplos levantamentos/plantas     | ✅ 100% | Sidebar (colapsável) lista levantamentos e suas plantas; criação de novo levantamento ou de nova planta num existente, com troca entre eles (ADR-015, ADR-018)        |
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
2. Usuário reposiciona o ponto, adiciona nova leitura, ou remove o ponto. Alternativamente, remove todos os pontos da planta de uma vez.

**Acceptance criteria:**
- Heatmap é recalculado automaticamente após a alteração.
- Remoção de um ponto remove todas as leituras associadas a ele.
- Remoção em lote ("resetar pontos") exige confirmação explícita antes de executar, por ser destrutiva e irreversível.
- Reposicionar um ponto por arraste ainda não implementado (dá para remover e recriar).

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

### Current state (julho 2026)
App Electron funcional: criação de levantamento, upload de planta, importação de CSV, marcação/remoção de pontos (individual e em lote), captura ao vivo nas três plataformas, heatmap por rede única e por "todas as redes" (cores por rede, misturando nas sobreposições), filtro por banda, calibração de escala com réguas, legenda ampliável por clique, e navegação entre múltiplos levantamentos/plantas via sidebar. Testado manualmente de ponta a ponta.

### Short term (próximas semanas)
- Reposicionar ponto por arraste (parte restante do UC-004).
- Visão por BSSID individual dentro de um SSID agrupado (drill-down explícito).
- Exclusão de levantamento/planta pela sidebar (hoje só é possível criar, não remover).

### Medium term (próximo trimestre)
- Visão de canais/interferência dedicada (UC-006) além do filtro de banda já existente.
- Export/import de projeto como bundle (ADR-005), ainda não implementado.

### Long term
- Comparação entre levantamentos ao longo do tempo (evolução da cobertura).
- Empacotamento de instaladores assinados/notarizados, caso surja necessidade de distribuir o app para outras máquinas.

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
