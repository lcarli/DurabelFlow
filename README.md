# DurableFlow

> Real-time visual orchestration flow and developer tools for Azure Durable Functions — all inside VS Code.

---

## 📦 Instalação

### Pré-requisitos

| Requisito | Versão | Como instalar |
|-----------|--------|---------------|
| **VS Code** | 1.85+ | [Download](https://code.visualstudio.com/) |
| **Node.js** | 18+ | [Download](https://nodejs.org/) |
| **Azure Functions Core Tools** | v4+ | `npm install -g azure-functions-core-tools@4 --unsafe-perm true` |
| **Azure Storage Emulator** | — | [Azurite](https://learn.microsoft.com/en-us/azure/storage/common/storage-use-azurite) ou conta Azure Storage real |

### Opção 1: Instalar via arquivo VSIX (local)

```bash
# 1. Clone o repositório
git clone <url-do-repo> durableflow
cd durableflow

# 2. Instale as dependências
npm install
cd webview-ui && npm install && cd ..

# 3. Build da extensão + WebView
npm run build
npm run build:webview

# 4. Gere o pacote .vsix
npx @vscode/vsce package --no-dependencies

# 5. Instale no VS Code
code --install-extension durableflow-0.1.0.vsix
```

Ou instale manualmente: VS Code → `Ctrl+Shift+P` → **"Extensions: Install from VSIX..."** → selecione o arquivo `.vsix`.

### Opção 2: Modo desenvolvimento (Debug)

```bash
# 1. Clone e instale dependências
git clone <url-do-repo> durableflow
cd durableflow
npm install
cd webview-ui && npm install && cd ..

# 2. Build
npm run build && npm run build:webview

# 3. Abra o projeto no VS Code
code .

# 4. Pressione F5 para abrir o Extension Development Host
```

Isso abre uma nova janela do VS Code com a extensão carregada. Qualquer mudança no código pode ser testada com `Ctrl+Shift+F5` (restart).

### Opção 3: Publicar no Marketplace (para distribuição)

```bash
# 1. Crie uma conta no VS Code Marketplace
# https://marketplace.visualstudio.com/manage

# 2. Gere um Personal Access Token (PAT) no Azure DevOps
# https://dev.azure.com → User Settings → Personal Access Tokens
# Scope: Marketplace (Manage)

# 3. Login no vsce
npx @vscode/vsce login <seu-publisher-id>

# 4. Publique
npx @vscode/vsce publish --no-dependencies
```

Depois de publicado, qualquer pessoa pode instalar buscando **"DurableFlow"** na aba de Extensions do VS Code.

---

## 🚀 Como Usar

### Fluxo Principal: Visualizar Orchestrations em Tempo Real

A extensão foi projetada para **observar e visualizar** — você dispara suas functions normalmente e a extensão mostra o que está acontecendo.

#### Passo 1: Abra seu projeto Azure Functions

Abra no VS Code qualquer pasta que contenha um `host.json`. A extensão ativa automaticamente e mostra o ícone na **Activity Bar** (barra lateral esquerda).

#### Passo 2: Inicie o Function Host

**Opção A** — Pela extensão:
- `Ctrl+Shift+P` → **"DurableFlow: Start Azure Functions Core Tools"**
- Ou clique no ícone ▶ na sidebar da extensão

**Opção B** — Pelo terminal (como você já faz):
```bash
func host start
```

#### Passo 3: Dispare a orchestration

Use **qualquer ferramenta** para chamar seu HTTP trigger:

```bash
# curl
curl -X POST http://localhost:7071/api/MyOrchestrator_HttpStart \
  -H "Content-Type: application/json" \
  -d '{"input": "Hello World"}'

# REST Client (extensão do VS Code)
# Thunder Client
# Postman
# Seus testes automatizados
```

Ou use os atalhos da extensão:
- **CodeLens**: Clique `▶ Start Orchestration` acima do seu orchestrator no código
- **Command Palette**: `Ctrl+Shift+P` → **"DurableFlow: Start Orchestration"**
- **Sidebar**: Clique com botão direito no orchestrator → **Start Orchestration**

#### Passo 4: Assista a execução em tempo real

A extensão **detecta automaticamente** novas instâncias e mostra uma notificação:

```
🎭 New orchestration "MyOrchestrator" detected (Running)
  [Show Flow]  [View Details]  [Dismiss]
```

Clique **"Show Flow"** para abrir o **Visual Flow** — um grafo interativo mostrando:

- ⚪ **Pending** — atividade aguardando
- 🔵 **Running** — executando agora (nó pulsante)
- 🟢 **Completed** — concluída com sucesso
- 🔴 **Failed** — falhou
- 🟡 **Waiting** — aguardando evento externo
- 🟣 **Replaying** — sendo replayed

**Interaja com o grafo:**
- **Click em um nó** → ver input/output JSON, duração, retry count
- **"Go to Code"** → navegar ao arquivo da function
- **Zoom/Pan** — scroll + arrastar
- **Layout** — alternar Vertical ↔ Horizontal
- **Export** — salvar como PNG/SVG

---

### Sidebar: Painel Lateral

O ícone da extensão na Activity Bar mostra 3 seções:

#### 🔹 Functions
Lista todas as functions detectadas no projeto, agrupadas por tipo:
- 🎭 Orchestrators → botão ▶ para iniciar
- ⚡ Activities
- 📦 Entities
- 🚀 Durable Clients
- 🌐 HTTP Triggers → botão ⚡ para disparar

#### 🔹 Orchestration Instances
Lista instâncias ativas/recentes com status visual:
- Botão direito → **Show Flow**, **View Details**, **Terminate**, **Purge**

#### 🔹 Connections
Mostra a configuração atual: environment (local/Azure), porta, storage provider, task hub.

---

### Instance Dashboard

`Ctrl+Shift+P` → **"DurableFlow: Open Instance Dashboard"**

Tabela completa com todas as instâncias:
- **Filtrar** por status (Running, Completed, Failed...) ou nome
- **Ações**: 📊 Show Flow, 🔍 View Details, 🛑 Terminate, 🗑 Purge
- **Auto-refresh** automático

---

### Performance Dashboard

`Ctrl+Shift+P` → **"DurableFlow: Open Performance Dashboard"**

Métricas das suas orchestrations:
- Total por status (running, completed, failed)
- Tabela por orchestrator: runs, taxa de sucesso, duração média

---

### Code Intelligence

A extensão analisa seu código e adiciona informações visuais:

#### CodeLens (acima das functions)
```
▶ Start Orchestration  |  📊 Show Flow  |  ⚡ calls 3 activities
async function* myOrchestrator(context) {
```

```
🎭 2 orchestrators call this
async function myActivity(input) {
```

#### Go to Definition
Dentro de um orchestrator, clique com `Ctrl+Click` no nome de uma activity:
```typescript
yield context.df.callActivity('SayHello', 'Tokyo');
//                             ^^^^^^^^^ Ctrl+Click → vai para a definição
```

#### Hover
Passe o mouse sobre o nome de uma function para ver tipo, callers, e call graph.

---

### Code Snippets

Digite o prefixo e pressione `Tab`:

| Prefixo | O que cria | Linguagens |
|---------|-----------|------------|
| `df-orch` | Orchestrator function | TS/JS, C#, Python, Java |
| `df-activity` | Activity function | TS/JS, C#, Python, Java |
| `df-client` | HTTP Starter | TS/JS, C#, Python, Java |
| `df-entity` | Entity function | TS/JS, C#, Python, Java |
| `df-chain` | Function chaining pattern | TS/JS, C#, Python, Java |
| `df-fanout` | Fan-out/fan-in pattern | TS/JS, C#, Python, Java |
| `df-sub-orch` | Sub-orchestration | TS/JS, C# |
| `df-human` | Human interaction (timer + event) | TS/JS, C#, Python |
| `df-monitor` | Monitor/polling pattern | TS/JS, C#, Python |
| `df-eternal` | Eternal orchestration | TS/JS, C# |

---

### Scaffold Wizard

`Ctrl+Shift+P` → **"DurableFlow: New Durable Function..."**

Wizard interativo para criar novas functions:
1. Escolha o tipo (Orchestrator, Activity, Entity, HTTP Starter)
2. Escolha o pattern (Chaining, Fan-out, Human Interaction...)
3. Digite o nome
4. Escolha a linguagem (auto-detecta do projeto)
5. Arquivo criado e aberto automaticamente!

---

### Azure Integration

#### Conectar ao Azure
1. `Ctrl+Shift+P` → **"DurableFlow: Azure Login"**
2. `Ctrl+Shift+P` → **"DurableFlow: Select Function App"**
3. Escolha: Subscription → Resource Group → Function App
4. A extensão passa a monitorar a Function App na cloud

#### Alertas
Ative em Settings para receber notificações automáticas:
- Orchestration rodando por mais de N minutos
- Orchestration que falhou

---

## ⚙️ Configuração

Acesse via `Ctrl+Shift+P` → **"DurableFlow: Open Settings"** ou em `settings.json`:

```jsonc
{
  // Ambiente padrão
  "durableFunctionsUI.defaultEnvironment": "local",  // "local" | "azure"

  // Porta do Azure Functions Core Tools
  "durableFunctionsUI.localPort": 7071,

  // Intervalo de polling para status (ms)
  "durableFunctionsUI.pollingIntervalMs": 2000,

  // Máximo de instâncias no dashboard
  "durableFunctionsUI.maxInstances": 100,

  // Nome do Task Hub (vazio = auto-detect do host.json)
  "durableFunctionsUI.taskHubName": "",

  // Storage provider do Durable Task
  "durableFunctionsUI.storageProvider": "AzureStorage",  // "Netherite" | "MSSQL"

  // Mostrar CodeLens acima das functions
  "durableFunctionsUI.showCodeLens": true,

  // Nível de log
  "durableFunctionsUI.logLevel": "info",

  // Alertas
  "durableFunctionsUI.alerts.enabled": false,
  "durableFunctionsUI.alerts.longRunningThresholdMinutes": 30,
  "durableFunctionsUI.alerts.failureAlertEnabled": true,

  // Telemetria (opt-in)
  "durableFunctionsUI.enableTelemetry": false
}
```

---

## 🎯 Todos os Commands

| Command | Atalho | Descrição |
|---------|--------|-----------|
| `DurableFlow: Start Orchestration` | — | Iniciar uma orchestration com input JSON |
| `DurableFlow: Show Orchestration Flow` | — | Abrir visualização do flow de uma instância |
| `DurableFlow: Open Instance Dashboard` | — | Abrir dashboard de instâncias |
| `DurableFlow: Open Performance Dashboard` | — | Abrir dashboard de performance |
| `DurableFlow: Raise Event` | — | Enviar evento para instância running |
| `DurableFlow: Terminate Instance` | — | Terminar uma instância |
| `DurableFlow: Purge Instance` | — | Purgar histórico de uma instância |
| `DurableFlow: Trigger Function` | — | Disparar HTTP function |
| `DurableFlow: Start Azure Functions Core Tools` | — | Iniciar func host start |
| `DurableFlow: Stop Azure Functions Core Tools` | — | Parar Core Tools |
| `DurableFlow: New Durable Function...` | — | Wizard para criar nova function |
| `DurableFlow: Azure Login` | — | Login no Azure |
| `DurableFlow: Azure Logout` | — | Logout do Azure |
| `DurableFlow: Select Function App` | — | Selecionar Function App no Azure |
| `DurableFlow: Open in Portal` | — | Abrir no Azure Portal |
| `DurableFlow: Refresh Functions` | — | Atualizar lista de functions |
| `DurableFlow: Refresh Instances` | — | Atualizar lista de instâncias |
| `DurableFlow: Open Settings` | — | Abrir configurações |

---

## 🏗️ Arquitetura

```
Extension Host (TypeScript + esbuild)
├── Analyzers (TS, C#, Python, Java) → CodeLens + Definitions + Hover
├── Providers
│   ├── LocalProvider → Core Tools HTTP API
│   ├── AzureProvider → Azure Management REST API
│   └── DurableApiClient → Durable Task HTTP API
├── Services
│   ├── InstanceWatcher → Auto-detect novas instâncias
│   ├── AlertService → Notificações configuráveis
│   ├── LogService → Output channels por instância
│   ├── AppInsightsService → Query KQL via REST
│   └── TelemetryService → Opt-in telemetry
├── Tree Views (Functions, Instances, Connections)
├── Commands (18 commands registrados)
└── WebView Panels (React 18 + React Flow)
    ├── FlowPanel → DAG interativo da orchestration
    ├── DashboardPanel → Tabela de instâncias
    └── PerformancePanel → Métricas e stats
```

---

## 🛠️ Desenvolvimento

```bash
# Instalar dependências
npm install
cd webview-ui && npm install && cd ..

# Build completo
npm run build           # Extension (esbuild)
npm run build:webview   # WebView (Vite + React)

# Watch mode (rebuild automático)
npm run watch

# Testes
npm test                # Vitest (52 testes)

# Lint
npm run lint            # ESLint
npm run lint:fix        # Auto-fix

# Formatar
npm run format          # Prettier

# Gerar pacote .vsix
npx @vscode/vsce package --no-dependencies
```

### Debug

1. Abra o projeto no VS Code
2. Pressione `F5` → abre Extension Development Host
3. Abra uma pasta com um projeto Azure Functions
4. A extensão ativa e mostra o ícone na sidebar

### Estrutura do Projeto

```
├── src/                    # Extension source (TypeScript)
│   ├── extension.ts        # Entry point
│   ├── commands/           # 18 command handlers
│   ├── providers/          # Local + Azure + Durable API clients
│   ├── analyzers/          # Code analysis (4 linguagens)
│   ├── codelens/           # CodeLens + Definition + Hover
│   ├── views/              # Tree View providers
│   ├── services/           # Business logic services
│   ├── webview/            # WebView panel managers
│   ├── models/             # TypeScript types
│   └── utils/              # Config, Logger, HttpClient
├── webview-ui/             # React app (Visual Flow + Dashboard)
│   └── src/
│       ├── flow/           # React Flow components + nodes
│       ├── shared/         # Types, messaging, theme
│       └── App.tsx         # Main React app
├── snippets/               # Code snippets (4 linguagens)
├── test/                   # Vitest unit tests
├── .github/workflows/      # CI/CD (GitHub Actions)
└── package.json            # Extension manifest
```

---

## 📄 License

MIT
