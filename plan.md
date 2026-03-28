# Azure Durable Functions UI — VSCode Extension

## Visão Geral

Extensão para VSCode focada em **Azure Durable Functions** que oferece uma experiência completa para desenvolvedores: iniciar functions, disparar orchestrators, visualizar graficamente a execução (nós paralelos/sequenciais), acompanhar logs em tempo real, e gerenciar instâncias — tudo de dentro do editor.

**Nome da extensão:** `Durable Functions UI`
**Linguagem da extensão:** TypeScript
**Suporte a linguagens de Functions:** Todas (C#, TypeScript/JS, Python, Java, PowerShell)
**Ambientes suportados:** Local (Core Tools) + Azure (Cloud)

---

## Arquitetura Geral

```
┌─────────────────────────────────────────────────────────────┐
│                     VSCode Extension Host                    │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │  Tree Views   │  │  Commands &  │  │   WebView Panels  │ │
│  │  (Sidebar)    │  │  Palette     │  │   (React + D3)    │ │
│  └──────┬───────┘  └──────┬───────┘  └────────┬──────────┘ │
│         │                 │                    │            │
│  ┌──────▼─────────────────▼────────────────────▼──────────┐ │
│  │              Extension Core Services                    │ │
│  │  ┌─────────────┐ ┌──────────────┐ ┌──────────────────┐ │ │
│  │  │ Orchestration│ │ Code Analyzer│ │  Config Manager  │ │ │
│  │  │   Manager   │ │  (AST Parse) │ │                  │ │ │
│  │  └──────┬──────┘ └──────┬───────┘ └──────────────────┘ │ │
│  └─────────┼───────────────┼─────────────────────────────┘ │
│            │               │                                │
│  ┌─────────▼───────────────▼─────────────────────────────┐ │
│  │              Backend Providers                         │ │
│  │  ┌──────────────────┐  ┌────────────────────────────┐ │ │
│  │  │  Local Provider   │  │     Azure Provider         │ │ │
│  │  │  (Core Tools API) │  │  (Azure Mgmt + DurableAPI) │ │ │
│  │  └──────────────────┘  └────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Features Planejadas

### 🔹 F1 — Project Detection & Sidebar Panel

**Descrição:** Detectar automaticamente projetos Azure Functions no workspace e exibir um painel lateral (Activity Bar) dedicado.

**Detalhes:**
- Detectar `host.json` e `local.settings.json` no workspace
- Ícone dedicado na Activity Bar do VSCode
- Tree View principal com seções: Functions, Orchestrations, Instances, Connections
- Identificar Durable Functions (orchestrators, activities, entity functions, sub-orchestrations) via análise estática de código
- Suporte multi-linguagem: parse de decorators/attributes/bindings em C#, TS/JS, Python, Java
- Indicador visual de tipo (orchestrator 🎭, activity ⚡, entity 📦, client/starter 🚀)

---

### 🔹 F2 — Connection Manager (Local + Azure)

**Descrição:** Gerenciar conexões com ambientes local e Azure.

**Detalhes:**
- **Modo Local:**
  - Detectar Azure Functions Core Tools instalado
  - Configurar URL base local (default: `http://localhost:7071`)
  - Start/Stop do Core Tools host diretamente do VSCode
  - Detectar status do host local automaticamente
- **Modo Azure:**
  - Login via Azure Account extension (reusar autenticação)
  - Listar subscriptions → resource groups → function apps
  - Selecionar Function App ativa para monitoramento
  - Armazenar conexões recentes para quick-switch
- **Task Storage Connection:**
  - Configurar connection string do Azure Storage / Netherite / MSSQL (backends do Durable Task)
  - Validar conectividade com o backend de storage

---

### 🔹 F3 — Start & Trigger Functions

**Descrição:** Iniciar functions e disparar orchestrators diretamente do editor.

**Detalhes:**
- **CodeLens** acima de cada function detectada: `▶ Run` | `▶ Start Orchestration`
- Disparar HTTP trigger functions com request builder inline:
  - Method, URL, headers, body (JSON editor com syntax highlight)
  - Salvar requests como "favorites" para re-uso
- Disparar Orchestrators via Durable HTTP API (`POST /runtime/webhooks/durableTask/orchestrators/{name}`)
  - Input JSON editor com validação
  - Opção de instance ID customizado ou auto-gerado
- Disparar eventos em instâncias running (`POST .../raiseEvent/{eventName}`)
- Quick actions via Command Palette:
  - `Durable UI: Start Orchestration`
  - `Durable UI: Raise Event`
  - `Durable UI: Send Signal to Entity`
- Histórico de chamadas recentes com replay rápido

---

### 🔹 F4 — Orchestration Visual Flow (⭐ Feature Principal)

**Descrição:** Visualização gráfica e interativa da execução de um orchestrator, mostrando cada atividade como um nó em um DAG (grafo acíclico direcionado).

**Detalhes:**
- **WebView Panel** renderizado com React + uma lib de grafos (React Flow, D3, ou dagre)
- **Dois modos de visualização:**
  1. **Design Mode (estático):** Análise do código-fonte para gerar o flow antes da execução
     - Detectar patterns: chaining, fan-out/fan-in, sub-orchestrations, external events, timers
     - Mostrar nós e arestas do fluxo esperado
  2. **Runtime Mode (ao vivo):** Visualização da execução real de uma instância
     - Polling na Durable Task status API (`GET .../instances/{instanceId}?showHistory=true&showHistoryOutput=true`)
     - Estado visual de cada nó:
       - ⏳ Pending (cinza)
       - 🔄 Running (azul pulsante)
       - ✅ Completed (verde)
       - ❌ Failed (vermelho)
       - ⏸ Waiting for Event (amarelo)
       - 🔁 Replaying (roxo)
     - Animação de progresso em tempo real
     - Mostrar duração de cada activity
- **Interatividade:**
  - Click em nó → ver input/output JSON
  - Click em nó → navegar ao código da activity function
  - Zoom, pan, fit-to-screen
  - Expand/collapse sub-orchestrations
  - Tooltip com timestamps, retry count, duração
- **Layouts:**
  - Horizontal (esquerda→direita)
  - Vertical (cima→baixo)
  - Toggle entre layouts
- **Export:** Salvar diagrama como PNG/SVG

---

### 🔹 F5 — Live Logs & Output

**Descrição:** Painel de logs em tempo real por instância de orchestration.

**Detalhes:**
- Output Channel dedicado: `Durable Functions UI`
- Logs filtráveis por:
  - Instância de orchestration (instance ID)
  - Tipo (orchestrator replay, activity execution, entity operation)
  - Nível (info, warning, error)
- **Para ambiente local:**
  - Capturar stdout/stderr do Core Tools process
  - Parsear logs estruturados do Durable Task Framework
- **Para Azure:**
  - Integrar com Application Insights (query via REST API)
  - Log streaming via Azure Management API
- Correlação de logs com nós do visual flow (click no log → highlight no grafo e vice-versa)
- Timestamp relativo ("+2.3s desde início da orchestration")
- Auto-scroll com opção de pause
- Copiar logs para clipboard / exportar

---

### 🔹 F6 — Instance Management Dashboard

**Descrição:** Painel para listar, filtrar, e gerenciar instâncias de orchestration.

**Detalhes:**
- **Listagem de instâncias** com filtros:
  - Status: Running, Completed, Failed, Terminated, Pending, Suspended
  - Nome do orchestrator
  - Date range (created, last updated)
  - Instance ID (busca direta)
- **Ações por instância:**
  - 🔍 Ver detalhes (input, output, custom status, history)
  - 🛑 Terminate
  - ⏸ Suspend / ▶ Resume
  - 🔄 Rewind (replay from failure point)
  - 🗑 Purge history
  - 📋 Copiar instance ID
  - 🔗 Abrir no Azure Portal
- **Ações em lote (bulk):**
  - Purge por filtro (status + date range)
  - Terminate múltiplas instâncias
- **Refresh automático** com intervalo configurável
- **WebView** com tabela interativa (sort, filter, pagination)

---

### 🔹 F7 — Code Navigation & IntelliSense

**Descrição:** Melhorar a experiência de navegação de código para Durable Functions.

**Detalhes:**
- **Go to Definition:**
  - Click em nome de activity dentro do orchestrator → navegar à definição da activity function
  - Click em sub-orchestration → navegar ao orchestrator
  - Click em entity → navegar ao entity function
- **Find All References:**
  - Ver todos os orchestrators que chamam uma activity
  - Ver todos os clients que iniciam um orchestrator
- **CodeLens enriquecido:**
  - `3 orchestrators call this activity` acima de activities
  - `Last run: 2m ago ✅` com status da última execução
- **Hover information:**
  - Input/output types esperados
  - Retry policy configurada
  - Timeout settings

---

### 🔹 F8 — Code Snippets & Scaffolding

**Descrição:** Snippets e templates para criar Durable Functions rapidamente.

**Detalhes:**
- Snippets por linguagem (C#, TS/JS, Python, Java):
  - `df-orch` → Orchestrator function template
  - `df-activity` → Activity function template
  - `df-entity` → Entity function template
  - `df-client` → Durable client/starter template
  - `df-chain` → Function chaining pattern
  - `df-fanout` → Fan-out/fan-in pattern
  - `df-sub-orch` → Sub-orchestration pattern
  - `df-human` → Human interaction pattern (wait for event + timer)
  - `df-monitor` → Monitor pattern (periodic check)
  - `df-eternal` → Eternal orchestration pattern
- **Scaffold command:** `Durable UI: New Durable Function...`
  - Wizard para criar nova function com bindings corretos
  - Gerar arquivo + registrar no function app

---

### 🔹 F9 — Replay Debugger

**Descrição:** Ferramenta para entender e debugar o mecanismo de replay do Durable Functions.

**Detalhes:**
- **Replay Visualizer:**
  - Mostrar cada replay iteration do orchestrator
  - Indicar quais chamadas são replayed vs. novas
  - Highlight de code paths executados em cada replay
- **Replay Breakpoints:**
  - Configurar breakpoints que disparam apenas em replays específicos
  - Breakpoint condicional: "parar quando `context.IsReplaying == false`"
- **History Inspector:**
  - Timeline visual do execution history
  - Cada event type colorido diferentemente (TaskScheduled, TaskCompleted, EventRaised, TimerCreated, etc.)
  - Detalhe de cada history event com payload

---

### 🔹 F10 — Performance & Monitoring

**Descrição:** Métricas e insights de performance das orchestrations.

**Detalhes:**
- **Métricas por orchestrator:**
  - Tempo médio de execução
  - Taxa de sucesso/falha
  - Distribuição de duração (P50, P95, P99)
  - Throughput (execuções/minuto)
- **Métricas por activity:**
  - Tempo médio de execução
  - Retry rate
  - Failure rate
- **Alertas configuráveis:**
  - Orchestration demorou mais que X minutos
  - Activity falhou mais que N vezes
  - Fila de trabalho crescendo (control queue, work-item queue)
- **Dashboard WebView** com gráficos (chart.js ou similar)
- **Integração com Application Insights** para métricas históricas

---

### 🔹 F11 — Settings & Configuration

**Descrição:** Configurações da extensão via `settings.json` do VSCode.

**Detalhes:**
- `durableFunctionsUI.defaultEnvironment`: `"local"` | `"azure"`
- `durableFunctionsUI.localPort`: porta do Core Tools (default: 7071)
- `durableFunctionsUI.pollingIntervalMs`: intervalo de polling para status (default: 2000)
- `durableFunctionsUI.maxInstances`: limite de instâncias no dashboard (default: 100)
- `durableFunctionsUI.theme`: tema do visual flow (`"auto"` | `"light"` | `"dark"`)
- `durableFunctionsUI.taskHubName`: nome do Task Hub
- `durableFunctionsUI.storageProvider`: `"AzureStorage"` | `"Netherite"` | `"MSSQL"`
- `durableFunctionsUI.showCodeLens`: habilitar/desabilitar CodeLens (default: true)
- `durableFunctionsUI.logLevel`: nível de log da extensão

---

## Stack Técnica

| Componente | Tecnologia |
|---|---|
| Extensão | TypeScript + VSCode Extension API |
| WebView (Visual Flow) | React 18 + React Flow (ou dagre-d3) |
| WebView (Dashboard) | React 18 + Tabela customizada |
| Gráficos | Chart.js ou Recharts |
| Bundler | esbuild (rápido, recomendado pelo VSCode) |
| Testes | Vitest + @vscode/test-electron |
| Linting | ESLint + Prettier |
| CI/CD | GitHub Actions |
| Package Manager | pnpm (workspaces para extension + webview) |

---

## Estrutura do Projeto

```
funcUI-vscode/
├── .vscode/
│   ├── launch.json              # Debug configurations
│   ├── tasks.json               # Build tasks
│   └── settings.json            # Workspace settings
├── src/
│   ├── extension.ts             # Entry point (activate/deactivate)
│   ├── commands/                # Command handlers
│   │   ├── startOrchestration.ts
│   │   ├── raiseEvent.ts
│   │   ├── terminateInstance.ts
│   │   ├── purgeInstances.ts
│   │   └── index.ts
│   ├── providers/               # Backend providers
│   │   ├── IFunctionProvider.ts # Interface abstrata
│   │   ├── localProvider.ts     # Core Tools API client
│   │   ├── azureProvider.ts     # Azure Management + Durable API
│   │   └── providerFactory.ts   # Factory pattern
│   ├── views/                   # Tree Views (sidebar)
│   │   ├── functionsTreeView.ts
│   │   ├── instancesTreeView.ts
│   │   └── connectionsTreeView.ts
│   ├── codelens/                # CodeLens providers
│   │   ├── durableCodeLensProvider.ts
│   │   └── referenceCodeLensProvider.ts
│   ├── analyzers/               # Code analysis
│   │   ├── ILanguageAnalyzer.ts # Interface per language
│   │   ├── csharpAnalyzer.ts
│   │   ├── typescriptAnalyzer.ts
│   │   ├── pythonAnalyzer.ts
│   │   └── javaAnalyzer.ts
│   ├── webview/                 # WebView panel management
│   │   ├── flowPanel.ts         # Orchestration flow panel
│   │   ├── dashboardPanel.ts    # Instance dashboard panel
│   │   └── messageHandler.ts   # Extension ↔ WebView messaging
│   ├── services/                # Business logic
│   │   ├── orchestrationService.ts
│   │   ├── instanceService.ts
│   │   ├── logService.ts
│   │   └── metricsService.ts
│   ├── models/                  # TypeScript types/interfaces
│   │   ├── orchestration.ts
│   │   ├── instance.ts
│   │   ├── activity.ts
│   │   └── historyEvent.ts
│   └── utils/                   # Utilities
│       ├── config.ts
│       ├── logger.ts
│       └── httpClient.ts
├── webview-ui/                  # React app for WebViews
│   ├── src/
│   │   ├── App.tsx
│   │   ├── flow/               # Visual flow components
│   │   │   ├── FlowCanvas.tsx
│   │   │   ├── nodes/
│   │   │   │   ├── ActivityNode.tsx
│   │   │   │   ├── OrchestratorNode.tsx
│   │   │   │   ├── TimerNode.tsx
│   │   │   │   └── EventNode.tsx
│   │   │   ├── edges/
│   │   │   │   └── AnimatedEdge.tsx
│   │   │   └── controls/
│   │   │       ├── LayoutToggle.tsx
│   │   │       └── ExportButton.tsx
│   │   ├── dashboard/          # Instance dashboard
│   │   │   ├── InstanceTable.tsx
│   │   │   ├── InstanceDetail.tsx
│   │   │   ├── FilterBar.tsx
│   │   │   └── BulkActions.tsx
│   │   ├── logs/               # Log viewer
│   │   │   ├── LogPanel.tsx
│   │   │   └── LogFilter.tsx
│   │   ├── metrics/            # Performance dashboard
│   │   │   ├── MetricsDashboard.tsx
│   │   │   └── charts/
│   │   └── shared/             # Shared components
│   │       ├── JsonViewer.tsx
│   │       ├── StatusBadge.tsx
│   │       └── theme.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── snippets/                    # Code snippets
│   ├── csharp.json
│   ├── typescript.json
│   ├── python.json
│   └── java.json
├── test/
│   ├── unit/
│   │   ├── analyzers/
│   │   ├── services/
│   │   └── providers/
│   ├── integration/
│   │   └── extension.test.ts
│   └── fixtures/               # Sample function projects for tests
│       ├── csharp-sample/
│       ├── typescript-sample/
│       └── python-sample/
├── resources/                   # Icons, images
│   ├── icon.png
│   └── dark/
│   └── light/
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
├── package.json                 # Extension manifest
├── tsconfig.json
├── esbuild.config.mjs
├── .eslintrc.json
├── .prettierrc
├── .vscodeignore
├── CHANGELOG.md
├── README.md
├── LICENSE
└── plan.md                      # Este arquivo
```

---

## Fases de Implementação

### Fase 1 — Fundação (MVP)
> Objetivo: Extensão funcional com detecção de projeto, sidebar, e execução básica.

| ID | Task | Descrição |
|---|---|---|
| F1.1 | Scaffold do projeto | Inicializar extensão com `yo code`, configurar TypeScript, esbuild, ESLint, Prettier |
| F1.2 | Detecção de projeto | Detectar `host.json`, classificar como Azure Functions project |
| F1.3 | Activity Bar + Tree View | Criar ícone na sidebar e tree view com lista de functions detectadas |
| F1.4 | Local Provider | Client HTTP para Azure Functions Core Tools (listar functions, status) |
| F1.5 | Start/Stop Core Tools | Iniciar/parar `func host start` via terminal integrado |
| F1.6 | Trigger HTTP Functions | Disparar HTTP trigger functions com request simples |
| F1.7 | Durable API Client | Client para Durable Task HTTP API (start, status, terminate, raise event) |
| F1.8 | Start Orchestration | Command + CodeLens para iniciar orchestration com input JSON |
| F1.9 | Settings básicos | Configurações essenciais (porta, polling, task hub) |
| F1.10 | Testes unitários base | Setup de testes + testes para providers e services |

### Fase 2 — Visual Flow
> Objetivo: Visualização gráfica da orchestration em tempo real.

| ID | Task | Descrição |
|---|---|---|
| F2.1 | WebView infra | Setup React + Vite dentro do projeto, comunicação Extension↔WebView |
| F2.2 | Flow Canvas | Componente base com React Flow, layout dagre |
| F2.3 | Custom Nodes | Nós visuais para Activity, Timer, Event, Sub-Orchestration |
| F2.4 | Runtime Mode | Polling do status + render dos estados (running/completed/failed) |
| F2.5 | Animações | Transições suaves de estado, nó pulsante quando running |
| F2.6 | Interatividade | Click → ver I/O, click → go-to-code, zoom/pan/fit |
| F2.7 | Design Mode | Análise estática do código para gerar flow antes da execução |
| F2.8 | Layout toggle | Horizontal/Vertical + export PNG/SVG |

### Fase 3 — Code Intelligence
> Objetivo: Análise de código multi-linguagem e navegação rica.

| ID | Task | Descrição |
|---|---|---|
| F3.1 | TypeScript Analyzer | Detectar orchestrators/activities em código TS/JS |
| F3.2 | C# Analyzer | Detectar orchestrators/activities em código C# |
| F3.3 | Python Analyzer | Detectar orchestrators/activities em código Python |
| F3.4 | Java Analyzer | Detectar orchestrators/activities em código Java |
| F3.5 | CodeLens Provider | Mostrar "▶ Run", "N references" acima de functions |
| F3.6 | Go to Definition | Navegar de chamada de activity → definição |
| F3.7 | Hover Info | Input/output types, retry policy, timeout |
| F3.8 | Snippets | Criar snippets para todos os patterns em todas as linguagens |

### Fase 4 — Instance Management & Logs
> Objetivo: Dashboard completo de instâncias e logs em tempo real.

| ID | Task | Descrição |
|---|---|---|
| F4.1 | Instance Dashboard | WebView com tabela de instâncias, filtros, paginação |
| F4.2 | Instance Actions | Terminate, Suspend, Resume, Rewind, Purge |
| F4.3 | Bulk Operations | Purge/Terminate em lote por filtro |
| F4.4 | Live Logs Panel | Output channel com logs filtráveis por instância |
| F4.5 | Log ↔ Flow correlation | Click no log → highlight no flow e vice-versa |
| F4.6 | History Inspector | Timeline visual de history events |

### Fase 5 — Azure Integration
> Objetivo: Suporte completo a Function Apps no Azure.

| ID | Task | Descrição |
|---|---|---|
| F5.1 | Azure Provider | Integração com Azure Resource Management API |
| F5.2 | Azure Authentication | Login via Azure Account extension |
| F5.3 | Function App Picker | Seletor de subscription → RG → Function App |
| F5.4 | App Insights Integration | Query logs via Application Insights REST API |
| F5.5 | Azure Portal deep links | Abrir instância/function no portal |
| F5.6 | Remote Start Orchestration | Iniciar orchestrations em Function Apps na cloud |

### Fase 6 — Advanced Features
> Objetivo: Replay debugger, métricas, e polish.

| ID | Task | Descrição |
|---|---|---|
| F6.1 | Replay Visualizer | Mostrar replay iterations com highlight de code path |
| F6.2 | Performance Dashboard | Métricas de duração, throughput, error rate |
| F6.3 | Alertas | Notificações configuráveis (long running, failures) |
| F6.4 | Scaffold Wizard | Wizard para criar nova Durable Function com bindings |
| F6.5 | Dark/Light theme | Temas do visual flow sincronizados com VSCode |
| F6.6 | Telemetria da extensão | Opt-in telemetry para melhorar a extensão |
| F6.7 | Documentação & README | README completo com GIFs, docs, marketplace listing |
| F6.8 | CI/CD Pipeline | GitHub Actions para build, test, publish no marketplace |

---

## APIs Utilizadas

### Durable Task HTTP API (Local & Azure)
```
POST /runtime/webhooks/durableTask/orchestrators/{functionName}[/{instanceId}]
GET  /runtime/webhooks/durableTask/instances/{instanceId}?showHistory=true&showHistoryOutput=true
POST /runtime/webhooks/durableTask/instances/{instanceId}/raiseEvent/{eventName}
POST /runtime/webhooks/durableTask/instances/{instanceId}/terminate?reason={reason}
POST /runtime/webhooks/durableTask/instances/{instanceId}/suspend?reason={reason}
POST /runtime/webhooks/durableTask/instances/{instanceId}/resume?reason={reason}
POST /runtime/webhooks/durableTask/instances/{instanceId}/rewind?reason={reason}
DELETE /runtime/webhooks/durableTask/instances/{instanceId}
GET  /runtime/webhooks/durableTask/instances?runtimeStatus=Running,Completed,Failed&createdTimeFrom=...&top=...
POST /runtime/webhooks/durableTask/instances/purge?runtimeStatus=...&createdTimeFrom=...
```

### Azure Management API (para Azure Provider)
```
GET /subscriptions/{subId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{name}
GET /subscriptions/{subId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{name}/functions
POST /subscriptions/{subId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{name}/host/default/listkeys
```

### Application Insights REST API (para logs)
```
POST https://api.applicationinsights.io/v1/apps/{appId}/query
```

---

## Riscos e Mitigações

| Risco | Mitigação |
|---|---|
| Análise estática multi-linguagem é complexa | Começar com TS/JS (mais simples de parsear), expandir incrementalmente |
| Performance do visual flow com orchestrations grandes | Virtualização de nós, lazy-loading, limitar profundidade de sub-orch |
| Polling frequente pode sobrecarregar Core Tools | Intervalo configurável, backoff exponencial quando idle |
| WebView tem limitações de segurança no VSCode | Usar `@vscode/webview-ui-toolkit`, seguir CSP guidelines |
| Variações entre versões do Durable Functions SDK | Testar com v2 e v3 do SDK, feature detection |

---

## Dependências Externas

- `@vscode/webview-ui-toolkit` — componentes UI para WebView
- `reactflow` (ou `@xyflow/react`) — biblioteca de grafos interativos
- `dagre` — layout automático de grafos
- `@azure/identity` — autenticação Azure
- `@azure/arm-appservice` — Azure App Service Management
- `chart.js` + `react-chartjs-2` — gráficos de métricas
- `typescript` — parser para análise de código TS/JS

---

## Notas Adicionais

- A extensão deve ser **complementar** à extensão oficial Azure Functions, não substituí-la
- Focar na DX (Developer Experience) — cada feature deve economizar tempo do dev
- Priorizar a visualização gráfica como diferencial competitivo
- Considerar futuramente: suporte a Durable Functions em Azure Container Apps
