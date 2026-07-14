# Glossário — WiFi Viewer

Este documento explica, em linguagem simples, todos os termos técnicos, siglas e jargões usados em [docs/01-prd.md](01-prd.md) (o quê e por quê do produto) e [docs/02-arch.md](02-arch.md) (como ele é construído por dentro). O objetivo é que alguém sem background em tecnologia ou em redes Wi-Fi consiga ler os outros dois documentos sem travar em um termo desconhecido.

Os termos estão agrupados por tema, não em ordem alfabética corrida — mas há uma tabela de siglas logo abaixo para busca rápida (`Ctrl+F` / `Cmd+F`). Um termo em **negrito** dentro de uma explicação indica que ele também tem sua própria entrada no glossário.

---

## Tabela rápida de siglas

| Sigla | Nome completo                      | Do que se trata                                                                         |     |
| ----- | ---------------------------------- | --------------------------------------------------------------------------------------- | --- |
| PRD   | Product Requirements Document      | Documento de requisitos do produto — [docs/01-prd.md](01-prd.md)                        |     |
| ADR   | Architecture Decision Record       | Registro de decisão de arquitetura — seção 9 de [docs/02-arch.md](02-arch.md)           |     |
| POC   | Proof of Concept                   | Prova de conceito — ver seção 1, Termos do produto                                      |     |
| MVP   | Minimum Viable Product             | Produto mínimo viável — ver seção 1, Termos do produto                                  |     |
| UC    | Use Case                           | Caso de uso — ver seção 1, Termos do produto                                            |     |
| SSID  | Service Set Identifier             | Nome de uma rede Wi-Fi — ver seção 2, Termos de redes Wi-Fi                             |     |
| BSSID | Basic Service Set Identifier       | Endereço físico único de um rádio Wi-Fi — ver seção 2, Termos de redes Wi-Fi            |     |
| AP    | Access Point                       | Ponto de acesso Wi-Fi (roteador/antena) — ver seção 2, Termos de redes Wi-Fi            |     |
| RSSI  | Received Signal Strength Indicator | Força do sinal recebido — ver seção 2, Termos de redes Wi-Fi                            |     |
| SNR   | Signal-to-Noise Ratio              | Relação sinal-ruído — ver seção 2, Termos de redes Wi-Fi                                |     |
| dBm   | Decibel-milliwatt                  | Unidade de força de sinal — ver seção 2, Termos de redes Wi-Fi                          |     |
| IDW   | Inverse Distance Weighting         | Método matemático do heatmap — ver seção 5, Termos matemáticos do heatmap               |     |
| IPC   | Inter-Process Communication        | Comunicação entre processos — ver seção 3, Termos de arquitetura de software            |     |
| CSV   | Comma-Separated Values             | Formato de arquivo de planilha simples — ver seção 3, Termos de arquitetura de software |     |
| JSON  | JavaScript Object Notation         | Formato de dados estruturados — ver seção 3, Termos de arquitetura de software          |     |
| API   | Application Programming Interface  | Interface de programação — ver seção 3, Termos de arquitetura de software               |     |
| DOM   | Document Object Model              | Estrutura de uma página web — ver seção 3, Termos de arquitetura de software            |     |
| SPA   | Single Page Application            | Aplicação de página única — ver seção 3, Termos de arquitetura de software              |     |
| CORS  | Cross-Origin Resource Sharing      | Regra de segurança do navegador — ver seção 3, Termos de arquitetura de software        |     |
| GPS   | Global Positioning System          | Sistema de posicionamento por satélite                                                  |     |
| BLE   | Bluetooth Low Energy               | Bluetooth de baixo consumo, usado às vezes para localização indoor                      |     |
| SO    | Sistema Operacional                | Windows, macOS ou Linux                                                                 |     |
| RGBA  | Red, Green, Blue, Alpha            | Formato de cor digital com transparência — ver seção 5, Termos matemáticos do heatmap   |     |
| PR    | Pull Request                       | Pedido de revisão/integração de código (termo de processo de desenvolvimento)           |     |

---

## 1. Termos do produto

O que o WiFi Viewer faz e como o PRD descreve isso.

- **Levantamento (*survey*)** — o "projeto" dentro do app: um agrupamento de uma ou mais **plantas** de um mesmo prédio ou espaço que está sendo mapeado. Exemplo: um levantamento chamado "CIT" pode conter as plantas "Térreo" e "1º andar".
- **Planta** — a imagem estática (uma foto ou desenho) da planta baixa de um andar/área, enviada pelo usuário. É a "tela de fundo" sobre a qual o heatmap é desenhado.
- **Ponto de medição** — um local marcado pelo usuário com um clique sobre a planta, indicando "aqui eu coletei uma leitura de Wi-Fi". Cada ponto guarda uma ou mais **leituras**.
- **Leitura** — o conjunto de informações de uma rede Wi-Fi detectada em um ponto: nome da rede (**SSID**), endereço do rádio (**BSSID**), força do sinal (**dBm**), canal, largura de banda, tipo de segurança, padrão Wi-Fi (**802.11**) e o horário da captura.
- **Heatmap (mapa de calor)** — a camada colorida desenhada sobre a planta que mostra, por interpolação matemática (ver **IDW**, seção 5), onde o sinal de uma rede é mais forte (geralmente vermelho/quente) ou mais fraco (azul/frio) mesmo em lugares onde não houve medição direta.
- **Calibração de escala** — processo opcional em que o usuário clica em dois pontos de referência na planta e informa a distância real entre eles (em metros); isso permite ao app converter pixels da imagem em metros reais, deixando o heatmap espacialmente preciso.
- **Legenda** — o quadro (geralmente no canto da tela) que explica o significado das cores do heatmap (qual cor representa sinal forte ou fraco) ou lista qual cor pertence a qual rede.
- **Sidebar** — a barra lateral (recolhível) que lista os **levantamentos** e suas **plantas**, permitindo trocar de planta ou criar novos levantamentos/plantas.
- **Site survey** — o termo genérico da indústria para "levantamento de cobertura de rede sem fio de um espaço físico", usando ferramentas como NetSpot ou Ekahau (citadas no PRD como referência/concorrência).
- **PRD (Product Requirements Document)** — o documento que descreve *o quê* o produto faz e *por quê* ([docs/01-prd.md](01-prd.md)): personas, problema, regras de negócio, casos de uso, riscos e roadmap. Não descreve *como* o código é construído — isso é papel do ARCH.
- **ARCH (Architecture & Principles)** — o documento que descreve *como* o produto é construído por dentro ([docs/02-arch.md](02-arch.md)): componentes, fluxo de dados, stack tecnológica e decisões técnicas.
- **ADR (Architecture Decision Record)** — um registro curto de uma decisão técnica específica: qual era o problema, o que foi decidido, por quê, e quais as consequências. O ARCH tem uma seção com dezenas de ADRs numerados, funcionando como um "diário" de como a arquitetura evoluiu com o tempo.
- **POC (Proof of Concept)** — fase de um projeto em que o objetivo é provar que a ideia funciona na prática, com uma implementação real (mesmo que não polida para produção), em vez de ficar só no papel. É a fase atual do WiFi Viewer.
- **MVP (Minimum Viable Product)** — o menor conjunto de funcionalidades que já entrega valor real ao usuário; usado no ARCH para marcar decisões que valem "para o escopo atual do produto", sem implicar que features fora disso nunca serão feitas.
- **UC (caso de uso)** — abreviação de "Use Case", uma seção do PRD que descreve um fluxo completo de uso do produto do ponto de vista do usuário: quem faz o quê, passo a passo, e como saber se funcionou (critérios de aceite). Ex.: UC-003 é "Capturar scan ao vivo em um ponto da planta".
- **Roadmap** — a seção do PRD que lista o que já está pronto, o que vem em seguida (curto/médio/longo prazo) e o que está fora de escopo por decisão deliberada.
- **Blocker (bloqueio)** — algo que impede ou limita uma funcionalidade de estar 100% completa; listado numa tabela própria no PRD junto da severidade e da área afetada.

---

## 2. Termos de redes Wi-Fi

Conceitos de rede sem fio usados para descrever as leituras capturadas pelo app.

- **Wi-Fi** — tecnologia de rede sem fio local, baseada na família de padrões técnicos **802.11**.
- **SSID** — o *nome* de uma rede Wi-Fi, o que aparece quando você procura redes disponíveis no seu celular ou computador (ex.: "CIT_Alunos"). Um mesmo SSID pode ser transmitido por vários rádios/antenas diferentes ao mesmo tempo.
- **BSSID** — o endereço físico único (formato parecido com `98:e5:5b:17:c0:e3`) de *um* rádio específico transmitindo Wi-Fi. Enquanto o SSID é o "nome da loja", o BSSID é o "endereço de uma unidade específica" — um mesmo SSID pode ter vários BSSIDs (ex.: uma antena transmitindo em 2.4GHz e outra em 5GHz sob o mesmo nome de rede).
- **AP (Access Point / ponto de acesso)** — o equipamento físico (roteador ou antena) que efetivamente transmite o sinal Wi-Fi. Cada BSSID corresponde a um rádio dentro de um AP.
- **RSSI** — sigla para "indicador de força do sinal recebido"; é a medida bruta, em **dBm**, de quão forte o sinal Wi-Fi chega até o dispositivo que está medindo. Quanto mais próximo de 0, mais forte (ex.: -30dBm é excelente, -80dBm é fraco).
- **dBm e dB** — **dBm** é a unidade usada para força absoluta de sinal (sempre um número negativo em Wi-Fi doméstico/predial, como -45dBm). **dB** (sem o "m") é usado para uma *diferença relativa* entre dois valores, como no caso do **SNR**. Ambos usam escala logarítmica, então a diferença entre -30dBm e -60dBm representa muito mais que "o dobro" de força — é uma queda de mil vezes na potência.
- **SNR (relação sinal-ruído)** — a diferença, em dB, entre a força do sinal (**RSSI**) e o nível de ruído de fundo (interferência de outras redes, micro-ondas etc.). Calculado como `SNR = RSSI - Noise`. Um SNR alto indica um sinal "limpo"; baixo indica sinal degradado por interferência, mesmo que o RSSI pareça bom.
- **Noise (ruído / piso de ruído)** — o nível de interferência de fundo no ambiente, em dBm, contra o qual o sinal Wi-Fi precisa "competir" para ser entendido. Só é reportado pela captura ao vivo no macOS; nas demais fontes de dados (Windows, Linux, CSV) esse valor não está disponível.
- **Canal** — uma sub-faixa de frequência dentro de uma banda Wi-Fi (ex.: canal 6 na banda 2.4GHz) usada por um AP para transmitir. APs vizinhos no mesmo canal (ou em canais que se sobrepõem) competem entre si e degradam o sinal um do outro — é essa sobreposição que a "visão de canais" do app ajuda a identificar.
- **Banda (2.4GHz / 5GHz)** — a faixa larga de frequência de rádio em que o Wi-Fi opera. 2.4GHz alcança mais longe mas é mais lenta e mais disputada; 5GHz é mais rápida e menos congestionada, mas alcança menos através de paredes. As duas bandas não competem entre si por canal, por isso o app as trata separadamente na visão de interferência.
- **Largura de banda (channel width)** — quantos MHz de espectro um canal Wi-Fi ocupa (ex.: 20, 40, 80 MHz). Canais mais largos transmitem mais dados por segundo, mas também são mais suscetíveis a interferência e reduzem quantos canais "cabem" sem sobreposição.
- **Padrão 802.11 (Wi-Fi 4/5/6...)** — a versão/geração do protocolo Wi-Fi que o rádio está usando (ex.: `802.11ax`, popularmente chamado de "Wi-Fi 6"). Cada geração define velocidade máxima, eficiência e recursos suportados.
- **Segurança de rede (WPA2, WPA3, PSK, CCMP, RSN, ESS)** — a combinação de protocolos que protegem uma rede Wi-Fi contra acesso não autorizado. `WPA2`/`WPA3` são os padrões de criptografia; `PSK` (chave pré-compartilhada) é o método de senha único usado em redes domésticas; `CCMP` é o algoritmo de criptografia; `RSN` e `ESS` são detalhes técnicos do tipo de rede reportados junto da segurança. O app apenas exibe essa string como veio da fonte de dados, sem interpretá-la.
- **Distância estimada** — uma aproximação (nunca uma medição exata) de quão longe o ponto medido está da origem do sinal (o AP), calculada a partir de quanto o sinal enfraqueceu — ver **Path loss**, seção 5.

---

## 3. Termos de arquitetura de software

Como o aplicativo é construído por dentro — vocabulário de programação e do framework Electron.

- **Electron** — a tecnologia que permite empacotar uma aplicação web (feita com HTML/CSS/JavaScript) como um aplicativo de desktop de verdade (com ícone, janela própria, instalável), rodando em Windows, macOS e Linux a partir do mesmo código. É o que torna o WiFi Viewer um app desktop e não uma página que abre no navegador comum.
- **Processo principal (*main process*) e processo de renderização (*renderer*)** — todo app Electron é dividido em duas partes que rodam separadamente: o **main** é o "backstage" — tem acesso ao sistema operacional (arquivos, comandos nativos) e controla a janela do app; o **renderer** é a parte visual — a interface que o usuário vê e clica, rodando dentro de um navegador embutido (**Chromium**). As duas partes só conversam entre si através de **IPC**.
- **Chromium** — o motor de navegador de código aberto (a mesma base do Google Chrome) que o Electron usa por baixo dos panos para desenhar a interface do app.
- **Node.js** — um ambiente que permite rodar código JavaScript fora de um navegador (por exemplo, para acessar arquivos do computador ou rodar comandos do sistema). É o que dá ao processo *main* do Electron acesso ao sistema operacional.
- **React** — uma biblioteca para construir interfaces de usuário organizadas em "componentes" reutilizáveis (botões, painéis, listas). É a tecnologia usada para construir toda a tela do WiFi Viewer.
- **TypeScript / JavaScript** — JavaScript é a linguagem de programação usada para construir a lógica de páginas web e apps Electron. TypeScript é a mesma linguagem "reforçada" com verificação de tipos (o compilador avisa antes de rodar se, por exemplo, você tentou tratar um texto como se fosse um número) — usada em 100% do código do WiFi Viewer para reduzir bugs.
- **Vite / electron-vite** — a ferramenta que transforma o código-fonte (TypeScript/React) em algo que o Chromium consegue executar, e que recarrega a tela automaticamente durante o desenvolvimento a cada alteração salva.
- **IPC (Inter-Process Communication / comunicação entre processos)** — o mecanismo pelo qual o **renderer** (tela) e o **main** (backstage) trocam mensagens dentro do mesmo app Electron — por exemplo, a tela pedindo "faça uma varredura Wi-Fi agora" e o backstage respondendo com a lista de redes encontradas. É como dois departamentos de uma mesma empresa se comunicando por um canal formal, em vez de um invadir a sala do outro diretamente.
- **contextBridge e preload** — o único "portão" controlado pelo qual o processo *main* expõe funcionalidades específicas (e só essas) ao *renderer*, via um script chamado *preload*. Em vez de dar à tela acesso irrestrito ao computador, só as funções explicitamente liberadas (ex.: "fazer varredura Wi-Fi") ficam disponíveis.
- **contextIsolation, nodeIntegration, sandbox** — configurações de segurança do Electron que, juntas, garantem que o conteúdo mostrado na tela (React, que é essencialmente uma página web) não tenha acesso direto ao sistema operacional, arquivos ou comandos do computador — só ao que for explicitamente exposto via **contextBridge**. Isso protege o usuário caso alguma dependência de terceiro do projeto tenha uma falha de segurança.
- **IndexedDB** — um banco de dados que já vem embutido no Chromium (e portanto em qualquer app Electron), guardado localmente no computador do usuário. É onde o WiFi Viewer salva permanentemente levantamentos, plantas, pontos e leituras — sem precisar de nenhum servidor externo.
- **idb** — uma pequena biblioteca auxiliar que torna o uso do IndexedDB mais simples e com verificação de tipos (TypeScript), evitando escrever a API mais verbosa e antiga do navegador diretamente.
- **Web Worker** — um mecanismo do navegador que permite rodar um cálculo pesado (no caso do WiFi Viewer, a matemática do heatmap) em segundo plano, numa "linha de execução" separada da tela, para que a interface não trave/congele enquanto o cálculo acontece.
- **Canvas** — uma área da página web em que é possível desenhar gráficos diretamente via código (pixel a pixel), em vez de usar elementos visuais prontos como texto ou botões. É usado para desenhar a planta, os marcadores de ponto e a camada do heatmap.
- **Zustand** — uma biblioteca pequena para guardar informação que precisa ser compartilhada entre partes diferentes da tela (ex.: "qual ponto está selecionado agora") sem precisar passar essa informação manualmente de componente em componente.
- **API (Application Programming Interface)** — um conjunto de funções ou comandos que um sistema disponibiliza para outro usar, sem que o segundo precise entender os detalhes internos do primeiro — como um cardápio de restaurante: você pede o prato pelo nome, sem precisar saber a receita.
- **CSV (Comma-Separated Values)** — um formato de arquivo de texto simples para tabelas, em que cada linha é uma linha da tabela e os valores de cada coluna são separados por um caractere delimitador (geralmente vírgula ou tabulação). É o formato usado para importar arquivos de scan Wi-Fi exportados por outras ferramentas.
- **JSON (JavaScript Object Notation)** — um formato de texto para representar dados estruturados (listas, campos nomeados, valores aninhados), muito usado para troca de informação entre programas. O WiFi Viewer usa JSON internamente para receber a lista de redes Wi-Fi encontradas por ferramentas externas de varredura.
- **DOM (Document Object Model)** — a representação, em forma de árvore, de tudo que existe numa página web (textos, botões, imagens) — é o que o navegador usa para saber o que desenhar na tela e o que código JavaScript pode inspecionar/alterar.
- **HTTP / CORS** — **HTTP** é o protocolo usado para pedir e enviar dados pela internet (o que seu navegador faz toda vez que abre um site). **CORS** é uma regra de segurança dos navegadores que restringe quais sites podem pedir dados de qual servidor. Nenhum dos dois é mais usado ativamente no WiFi Viewer hoje — eram relevantes numa versão antiga e descontinuada do projeto (ver ADR-004/006 no ARCH), quando a captura ao vivo dependia de um servidor local à parte.
- **SPA (Single Page Application)** — um tipo de aplicação web que carrega uma única página e depois atualiza seu conteúdo dinamicamente via código, sem recarregar a página inteira a cada ação — é o modelo usado dentro do *renderer* do Electron.
- **Backend / Frontend** — **frontend** é a parte de um sistema com a qual o usuário interage diretamente (a tela); **backend** é a parte que roda "por trás", geralmente num servidor remoto, cuidando de dados e regras de negócio. O WiFi Viewer é deliberadamente **client-only** ("só cliente"): não existe nenhum servidor remoto — tudo roda e é guardado no computador do próprio usuário.

---

## 4. Ferramentas e conceitos do sistema operacional

Termos específicos de como o app conversa com Windows, Linux e macOS para fazer a varredura Wi-Fi ao vivo.

- **netsh** — comando de linha de comando nativo do Windows usado pelo WiFi Viewer para listar redes Wi-Fi disponíveis.
- **nmcli** — comando de linha de comando do NetworkManager, usado no Linux para o mesmo propósito (listar redes Wi-Fi).
- **macwifi-cli** — uma ferramenta externa (feita por terceiros, não pelo WiFi Viewer), instalada via **Homebrew**, usada para fazer a varredura Wi-Fi no macOS. Foi adotada depois que a Apple removeu o comando nativo antigo (`airport`) sem oferecer substituto — ver ADR-009/010 no ARCH.
- **airport** — um comando de linha de comando que o macOS oferecia antigamente para varredura Wi-Fi, removido pela Apple em versões recentes do sistema, sem alternativa nativa de linha de comando equivalente.
- **Homebrew (brew)** — o "gerenciador de pacotes" mais popular do macOS — um jeito padronizado de instalar ferramentas de linha de comando (como o `macwifi-cli`) digitando um único comando, em vez de baixar e configurar manualmente.
- **CoreWLAN** — a biblioteca oficial da Apple para que programas no macOS consigam interagir com o hardware Wi-Fi (fazer varreduras, ver rede conectada etc.). É a base tecnológica por trás tanto do `airport` (antigo) quanto do `macwifi-cli` (atual).
- **Gatekeeper** — o sistema de segurança do macOS que verifica se um programa é "confiável" antes de deixar o usuário executá-lo, com base em assinatura digital. Um programa sem assinatura válida é bloqueado por padrão.
- **Notarização / Developer ID / codesign / spctl** — mecanismos da Apple para provar que um programa é legítimo: **Developer ID** é um certificado pago da Apple que identifica quem fez o programa; **codesign** é o comando que "assina" digitalmente o binário com esse certificado; **notarização** é uma verificação adicional feita pela própria Apple depois da assinatura; **spctl** é o comando que consulta se o macOS aceita ou rejeita (`accepted`/`rejected`) um programa específico. O projeto não paga por um Developer ID próprio — por isso depende do `macwifi-cli`, que já vem assinado/notarizado pelo autor da ferramenta.
- **child_process** — um recurso do Node.js que permite ao processo *main* do Electron executar comandos do sistema operacional (como `netsh`, `nmcli` ou `macwifi-cli`) e capturar o texto que eles retornam.

---

## 5. Termos matemáticos do heatmap

Como o app transforma pontos isolados de medição num mapa de calor contínuo.

- **Interpolação** — a técnica matemática de estimar um valor em um local *sem* medição direta, a partir dos valores conhecidos ao redor. É o que permite ao heatmap "preencher" a planta inteira mesmo com poucos pontos medidos.
- **IDW (Inverse Distance Weighting / ponderação pelo inverso da distância)** — o método de interpolação usado pelo WiFi Viewer: o valor estimado em qualquer local da planta é uma média dos pontos medidos ao redor, mas dando mais peso aos pontos mais próximos e menos peso aos mais distantes — daí o nome.
- **Kernel gaussiano** — uma curva em formato de sino (a mesma curva da "distribuição normal" da estatística) usada para calcular o quanto um ponto medido "influencia" um local vizinho: influência máxima bem em cima do ponto, caindo suavemente (nunca abruptamente) conforme a distância aumenta.
- **Sigma (σ)** — o parâmetro que controla a "largura" do kernel gaussiano — ou seja, o alcance/raio de influência de cada ponto medido no heatmap. Sigma pequeno = influência concentrada bem perto do ponto; sigma grande = influência se espalha por uma área maior.
- **Confiança (*confidence*)** — um número entre 0 e 1 calculado para cada célula do heatmap, indicando o quanto o sistema "confia" no valor interpolado ali: alto perto de pontos realmente medidos, caindo suavemente até quase zero em áreas distantes de qualquer medição.
- **Opacidade / canal alfa** — o quão transparente ou sólida uma cor aparece na tela. No heatmap, a opacidade de cada célula é derivada da **confiança**: áreas bem transparentes deixam a planta visível por baixo (pouco dado confiável ali); áreas mais opacas mostram a cor do sinal com mais destaque (dado confiável).
- **RGBA e canal alfa** — **RGB** é o jeito padrão de descrever uma cor digital combinando quanto de vermelho (*Red*), verde (*Green*) e azul (*Blue*) ela tem. O **A** (*Alpha*) adiciona um quarto valor: a **opacidade** dessa cor. É o formato interno usado para desenhar cada pixel colorido do heatmap.
- **Path loss / modelo log-distância** — um modelo físico usado para estimar a distância entre o ponto medido e a origem do sinal (o AP) a partir de quanto o sinal enfraqueceu no caminho — sinal mais forte sugere origem mais próxima, sinal mais fraco sugere origem mais distante. É só uma estimativa aproximada (não considera paredes reais no caminho), usada apenas para ajustar visualmente o alcance de cada ponto no heatmap — nunca para posicionar automaticamente nada na planta.
- **Intensidade de interpolação** — uma medida de quantos pontos medidos *diferentes* estão realmente contribuindo para o valor calculado em um local — não é o mesmo que **confiança** (que só olha a distância): um único ponto isolado bem perto tem confiança alta mas intensidade baixa (é só UMA leitura, uma extrapolação); vários pontos próximos concordando entre si têm intensidade alta (mais "testemunhas" independentes dizendo a mesma coisa).
- **Posterização** — técnica (removida do WiFi Viewer, mas mencionada no histórico de decisões) de arredondar valores contínuos para "degraus" fixos antes de colorir — o efeito colateral indesejado eram transições de cor com aparência de contorno/polígono em vez de suaves.

---

## 6. Termos de processo de desenvolvimento

Vocabulário sobre como o código do projeto é organizado e testado, usado principalmente no ARCH.

- **Vitest** — a ferramenta usada para escrever e rodar **testes unitários** — pequenos programas que verificam automaticamente se uma função do código continua se comportando como esperado.
- **Teste unitário** — um teste automatizado que verifica uma única unidade de lógica isolada (ex.: "a função que calcula a cor a partir do dBm dá o resultado certo?"), sem depender de abrir a interface completa do app.
- **Mock** — uma versão "de mentirinha" de uma parte do sistema, usada durante testes para simular um comportamento (ex.: fingir que um comando do sistema operacional retornou um resultado específico) sem de fato executar essa parte real.
- **Strict mode (TypeScript)** — uma configuração mais rigorosa do TypeScript que obriga o código a lidar explicitamente com casos como "esse valor pode não existir", reduzindo a chance de erros em tempo de execução.
- **Commit** — um "salvamento" de uma alteração no histórico do código-fonte (via Git), com uma mensagem descrevendo o que mudou e por quê.
- **PR (Pull Request)** — um pedido formal para que uma alteração de código seja revisada por outra pessoa antes de ser incorporada ao projeto principal. O WiFi Viewer, por ser um projeto pessoal, não usa esse processo formalmente ainda.

---

## Ver também

- [docs/01-prd.md](01-prd.md) — o quê o produto faz e por quê.
- [docs/02-arch.md](02-arch.md) — como o produto é construído por dentro.
