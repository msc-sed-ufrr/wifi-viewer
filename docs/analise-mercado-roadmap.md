# Análise de Mercado e Roadmap — WiFi Viewer

## Panorama Competitivo

### Concorrentes Comerciais

| Produto | Modelo | Preço (aprox.) | Plataforma | Diferenciais-chave |
|---------|--------|---------------|------------|-------------------|
| **Ekahau Connect** | Enterprise (Accenture) | ~$3.000/ano + HW | Win/Mac + iOS/Android | AI Pro planning, Sidekick 2 (HW), cloud sync, AP integrations, WiFi 7 |
| **NetSpot** | Prosumer pago | $49–$149 | Win/Mac + Android | 20+ heatmaps, planning mode, active surveys (iPerf), report builder |
| **Acrylic Wi-Fi Heatmaps** | Profissional pago | ~$99–$499 | Windows | WiFi 7, sniffer, spectrum analysis, BLE analyzer |
| **Acrylic Wi-Fi Analyzer** | Profissional pago | ~$49–$199 | Windows | Live troubleshooting, AP detection, performance metrics |
| **TamoGraph Site Survey** | Profissional pago | ~$1.000 | Windows | Site survey enterprise completo |

### Concorrentes Open-Source

| Projeto | Estrelas | Stack | Funcionalidades |
|---------|----------|-------|-----------------|
| **python-wifi-survey-heatmap** (jantman) | ~480 | Python, CLI | Survey Linux-only, heatmap matplotlib |
| **wifi-planner** (mmereu) | ~1 | React + FastAPI + Docker | AP placement, predição sinal, paredes, AI wall detection |
| **wifi-heatmap** (ribaldorafael) | ~1 | Python/Flask | Survey multi-plataforma, mesh support |
| **WiFi Viewer** (este projeto) | — | Electron + React + Vite | **O mais completo tecnicamente** entre os open-source |

### Posicionamento do WiFi Viewer

O WiFi Viewer é **o único open-source com todas estas características simultaneamente**:
- Desktop cross-platform (Electron) — Windows, Linux, macOS
- Captura ao vivo nativa em cada SO (netsh, nmcli, macwifi-cli)
- Heatmap IDW com Web Worker (off main thread)
- Múltiplas plantas por projeto
- Calibração de escala (pixels → metros)
- Gráfico de distribuição de canais (SVG)
- Persistência 100% local (IndexedDB)

Nenhum outro projeto open-source combina heatmap + captura ao vivo multi-SO + UI React + armazenamento local.

### Gaps vs. Concorrentes Comerciais

| Funcionalidade | Ekahau | NetSpot | Acrylic | WiFi Viewer |
|---------------|--------|---------|---------|-------------|
| Heatmap por SSID | ✅ | ✅ | ✅ | ✅ |
| Calibração de escala | ✅ | ✅ | ✅ | ✅ |
| Captura ao vivo | ✅ (Sidekick) | ✅ | ✅ | ✅ |
| Múltiplas plantas | ✅ | ✅ | ✅ | ✅ |
| Gráfico de canais | ✅ | ✅ | ✅ | ✅ |
| **Planning preditivo (AP placement)** | ✅ | ✅ | ✅ | ❌ |
| **Active survey (throughput)** | ✅ | ✅ | ❌ | ❌ |
| **Export relatório PDF** | ✅ | ✅ | ✅ | ❌ |
| **Suporte 6 GHz / WiFi 6E/7** | ✅ | ✅ | ✅ | ❌ |
| **App mobile coleta** | ✅ | ✅ | ❌ | ❌ |
| **Cloud sync / colaboração** | ✅ | ❌ | ❌ | ❌ |
| **Integração APIs fabricante** | ✅ | ❌ | ❌ | ❌ |
| **Auto-positioning (GPS/fingerprint)** | ✅ | ❌ | ❌ | ❌ |

---

## Roadmap de Funcionalidades

### Fase 1 — Core Mature (v0.2.0)

**Foco**: Fechar funcionalidades essenciais que o app ainda não tem para ser comparável a ferramentas comerciais básicas.

| # | Issue | Descrição | Esforço | Prioridade |
|---|-------|-----------|---------|------------|
| 1 | Export heatmap PNG/PDF | Salvar heatmap como imagem ou relatório básico | M | Alta |
| 2 | Suporte banda 6GHz (WiFi 6E/7) | Canalização + heatmap para a banda de 6GHz | P | Alta |
| 3 | Mapa de interferência/sobreposição | Visualizar conflitos entre canais no heatmap | G | Média |
| 4 | Otimização performance IDW | Spatial index (kd-tree) para acelerar grade | M | Média |
| 5 | Dark mode / temas | Suporte a tema escuro | P | Baixa |
| 6 | Exportar leituras para CSV | Exportar dados brutos de um ponto/projeto | P | Baixa |

### Fase 2 — Advanced Features (v0.3.0)

**Foco**: Funcionalidades que tornam o app útil para profissionais de rede.

| # | Issue | Descrição | Esforço | Prioridade |
|---|-------|-----------|---------|------------|
| 7 | Modo planejamento preditivo | Colocar APs virtuais na planta e simular cobertura | GG | Alta |
| 8 | Active survey (iPerf3) | Teste de throughput integrado | G | Alta |
| 9 | Suporte a múltiplos formatos CSV | Parser flexível para diferentes ferramentas | M | Média |
| 10 | Relatório customizável em PDF | Relatório profissional com heatmaps e tabelas | G | Média |
| 11 | Internacionalização (i18n) | Suporte a múltiplos idiomas | M | Baixa |
| 12 | Snapshot/comparação entre levantamentos | Comparar antes/depois de mudanças na rede | G | Média |

### Fase 3 — Scale (v1.0.0)

**Foco**: Escalar para uso em equipe e ambientes maiores.

| # | Issue | Descrição | Esforço | Prioridade |
|---|-------|-----------|---------|------------|
| 13 | App mobile companion | Coleta de dados via celular (React Native) | G | Média |
| 14 | Cloud sync auto-hospedável | Sincronizar projetos entre máquinas | GG | Média |
| 15 | Integração APIs de fabricante | Unifi, Cisco Meraki, Mikrotik | G | Baixa |
| 16 | Sistema de plugins | API para extensões da comunidade | GG | Baixa |
| 17 | Auto-positioning (fingerprinting) | Posicionamento automático por RSSI | GG | Baixa |
| 18 | Importação/exportação de projetos | Troca de projetos entre instâncias | M | Média |

---

## Critérios de Priorização

1. **Valor de usuário**: o quanto a funcionalidade melhora a experiência de uso
2. **Diferenciação**: o quanto nos destaca de outros open-source
3. **Esforço de implementação**: estimativa de complexidade técnica
4. **Dependências**: o que precisa estar pronto antes

## Notas sobre Legenda de Esforço

- **P** (Pequeno): dias, implementável por uma pessoa
- **M** (Médio): 1–2 semanas
- **G** (Grande): 2–4 semanas
- **GG** (Muito Grande): 1–3 meses

---

*Documento mantido em alinhamento com o GitHub Project e as milestones do repositório.*
