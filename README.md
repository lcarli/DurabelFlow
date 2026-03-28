# DurableFlow

> Real-time visual orchestration flow and developer tools for Azure Durable Functions — all inside VS Code.

---

## 📦 Installation

### Prerequisites

| Requirement | Version | How to install |
|-------------|---------|----------------|
| **VS Code** | 1.85+ | [Download](https://code.visualstudio.com/) |
| **Node.js** | 18+ | [Download](https://nodejs.org/) |
| **Azure Functions Core Tools** | v4+ | `npm install -g azure-functions-core-tools@4 --unsafe-perm true` |
| **Azure Storage Emulator** | — | [Azurite](https://learn.microsoft.com/en-us/azure/storage/common/storage-use-azurite) or a real Azure Storage account |

### Option 1: Install via VSIX file (local)

```bash
# 1. Clone the repository
git clone https://github.com/lcarli/DurabelFlow.git durableflow
cd durableflow

# 2. Install dependencies
npm install
cd webview-ui && npm install && cd ..

# 3. Build the extension + WebView
npm run build
npm run build:webview

# 4. Package the .vsix file
npx @vscode/vsce package --no-dependencies

# 5. Install in VS Code
code --install-extension durableflow-0.1.0.vsix
```

Or install manually: VS Code → `Ctrl+Shift+P` → **"Extensions: Install from VSIX..."** → select the `.vsix` file.

### Option 2: Development mode (Debug)

```bash
# 1. Clone and install dependencies
git clone https://github.com/lcarli/DurabelFlow.git durableflow
cd durableflow
npm install
cd webview-ui && npm install && cd ..

# 2. Build
npm run build && npm run build:webview

# 3. Open the project in VS Code
code .

# 4. Press F5 to launch the Extension Development Host
```

This opens a new VS Code window with the extension loaded. Any code changes can be tested with `Ctrl+Shift+F5` (restart).

### Option 3: Publish to the Marketplace (for distribution)

```bash
# 1. Create an account on the VS Code Marketplace
# https://marketplace.visualstudio.com/manage

# 2. Generate a Personal Access Token (PAT) on Azure DevOps
# https://dev.azure.com → User Settings → Personal Access Tokens
# Scope: Marketplace (Manage)

# 3. Login to vsce
npx @vscode/vsce login <your-publisher-id>

# 4. Publish
npx @vscode/vsce publish --no-dependencies
```

Once published, anyone can install it by searching for **"DurableFlow"** in the VS Code Extensions tab.

---

## 🚀 How to Use

### Main Workflow: Visualize Orchestrations in Real Time

The extension is designed to **observe and visualize** — you trigger your functions as usual and the extension shows what's happening.

#### Step 1: Open your Azure Functions project

Open any folder containing a `host.json` in VS Code. The extension activates automatically and shows its icon in the **Activity Bar** (left sidebar).

#### Step 2: Start the Function Host

**Option A** — Via the extension:
- `Ctrl+Shift+P` → **"DurableFlow: Start Azure Functions Core Tools"**
- Or click the ▶ icon in the extension sidebar

**Option B** — Via the terminal (as you normally do):
```bash
func host start
```

#### Step 3: Trigger the orchestration

Use **any tool** to call your HTTP trigger:

```bash
# curl
curl -X POST http://localhost:7071/api/MyOrchestrator_HttpStart \
  -H "Content-Type: application/json" \
  -d '{"input": "Hello World"}'

# REST Client (VS Code extension)
# Thunder Client
# Postman
# Your automated tests
```

Or use the extension shortcuts:
- **CodeLens**: Click `▶ Start Orchestration` above your orchestrator in the code
- **Command Palette**: `Ctrl+Shift+P` → **"DurableFlow: Start Orchestration"**
- **Sidebar**: Right-click the orchestrator → **Start Orchestration**

#### Step 4: Watch the execution in real time

The extension **automatically detects** new instances and shows a notification:

```
🎭 New orchestration "MyOrchestrator" detected (Running)
  [Show Flow]  [View Details]  [Dismiss]
```

Click **"Show Flow"** to open the **Visual Flow** — an interactive graph showing:

- ⚪ **Pending** — activity waiting to run
- 🔵 **Running** — executing now (pulsing node)
- 🟢 **Completed** — finished successfully
- 🔴 **Failed** — failed
- 🟡 **Waiting** — waiting for an external event
- 🟣 **Replaying** — being replayed

**Interact with the graph:**
- **Click a node** → see input/output JSON, duration, retry count
- **"Go to Code"** → navigate to the function file
- **Zoom/Pan** — scroll + drag
- **Layout** — toggle Vertical ↔ Horizontal
- **Auto-Fit** — toggle auto-fit on/off; manual zoom disables it
- **Export** — save as PNG/SVG

---

### Sidebar Panel

The extension icon in the Activity Bar shows 3 sections:

#### 🔹 Functions
Lists all detected functions in the project, grouped by type:
- 🎭 Orchestrators → ▶ button to start
- ⚡ Activities
- 📦 Entities
- 🚀 Durable Clients
- 🌐 HTTP Triggers → ⚡ button to trigger

#### 🔹 Orchestration Instances
Lists active/recent instances with visual status:
- Right-click → **Show Flow**, **View Details**, **Terminate**, **Purge**

#### 🔹 Connections
Shows current configuration: environment (local/Azure), port, storage provider, task hub.

---

### Instance Dashboard

`Ctrl+Shift+P` → **"DurableFlow: Open Instance Dashboard"**

Full table with all instances:
- **Filter** by status (Running, Completed, Failed...) or name
- **Actions**: 📊 Show Flow, 🔍 View Details, 🛑 Terminate, 🗑 Purge
- **Auto-refresh** enabled

---

### Performance Dashboard

`Ctrl+Shift+P` → **"DurableFlow: Open Performance Dashboard"**

Orchestration metrics:
- Totals by status (running, completed, failed)
- Per-orchestrator table: runs, success rate, average duration

---

### Code Intelligence

The extension analyzes your code and adds visual information:

#### CodeLens (above functions)
```
▶ Start Orchestration  |  📊 Show Flow  |  ⚡ calls 3 activities
async function* myOrchestrator(context) {
```

```
🎭 2 orchestrators call this
async function myActivity(input) {
```

#### Go to Definition
Inside an orchestrator, `Ctrl+Click` on an activity name:
```typescript
yield context.df.callActivity('SayHello', 'Tokyo');
//                             ^^^^^^^^^ Ctrl+Click → jumps to definition
```

#### Hover
Hover over a function name to see its type, callers, and call graph.

---

### Code Snippets

Type the prefix and press `Tab`:

| Prefix | What it creates | Languages |
|--------|----------------|-----------|
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

Interactive wizard to create new functions:
1. Choose the type (Orchestrator, Activity, Entity, HTTP Starter)
2. Choose the pattern (Chaining, Fan-out, Human Interaction...)
3. Enter the name
4. Choose the language (auto-detected from the project)
5. File is created and opened automatically!

---

### Azure Integration

#### Connect to Azure
1. `Ctrl+Shift+P` → **"DurableFlow: Azure Login"**
2. `Ctrl+Shift+P` → **"DurableFlow: Select Function App"**
3. Choose: Subscription → Resource Group → Function App
4. The extension starts monitoring the Function App in the cloud

#### Alerts
Enable in Settings to receive automatic notifications:
- Orchestration running for more than N minutes
- Orchestration that failed

---

## ⚙️ Configuration

Access via `Ctrl+Shift+P` → **"DurableFlow: Open Settings"** or in `settings.json`:

```jsonc
{
  // Default environment
  "durableFunctionsUI.defaultEnvironment": "local",  // "local" | "azure"

  // Azure Functions Core Tools port
  "durableFunctionsUI.localPort": 7071,

  // Polling interval for status updates (ms)
  "durableFunctionsUI.pollingIntervalMs": 2000,

  // Maximum instances in the dashboard
  "durableFunctionsUI.maxInstances": 100,

  // Task Hub name (empty = auto-detect from host.json)
  "durableFunctionsUI.taskHubName": "",

  // Durable Task storage provider
  "durableFunctionsUI.storageProvider": "AzureStorage",  // "Netherite" | "MSSQL"

  // Show CodeLens above functions
  "durableFunctionsUI.showCodeLens": true,

  // Log level
  "durableFunctionsUI.logLevel": "info",

  // Alerts
  "durableFunctionsUI.alerts.enabled": false,
  "durableFunctionsUI.alerts.longRunningThresholdMinutes": 30,
  "durableFunctionsUI.alerts.failureAlertEnabled": true,

  // Telemetry (opt-in)
  "durableFunctionsUI.enableTelemetry": false
}
```

---

## 🎯 All Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| `DurableFlow: Start Orchestration` | — | Start an orchestration with JSON input |
| `DurableFlow: Show Orchestration Flow` | — | Open the visual flow for an instance |
| `DurableFlow: Open Instance Dashboard` | — | Open the instance dashboard |
| `DurableFlow: Open Performance Dashboard` | — | Open the performance dashboard |
| `DurableFlow: Raise Event` | — | Send an event to a running instance |
| `DurableFlow: Terminate Instance` | — | Terminate an instance |
| `DurableFlow: Purge Instance` | — | Purge an instance's history |
| `DurableFlow: Trigger Function` | — | Trigger an HTTP function |
| `DurableFlow: Start Azure Functions Core Tools` | — | Start func host start |
| `DurableFlow: Stop Azure Functions Core Tools` | — | Stop Core Tools |
| `DurableFlow: New Durable Function...` | — | Wizard to create a new function |
| `DurableFlow: Azure Login` | — | Log in to Azure |
| `DurableFlow: Azure Logout` | — | Log out of Azure |
| `DurableFlow: Select Function App` | — | Select a Function App in Azure |
| `DurableFlow: Open in Portal` | — | Open in the Azure Portal |
| `DurableFlow: Refresh Functions` | — | Refresh the functions list |
| `DurableFlow: Refresh Instances` | — | Refresh the instances list |
| `DurableFlow: Open Settings` | — | Open settings |

---

## 🏗️ Architecture

```
Extension Host (TypeScript + esbuild)
├── Analyzers (TS, C#, Python, Java) → CodeLens + Definitions + Hover
├── Providers
│   ├── LocalProvider → Core Tools HTTP API
│   ├── AzureProvider → Azure Management REST API
│   └── DurableApiClient → Durable Task HTTP API
├── Services
│   ├── InstanceWatcher → Auto-detect new instances
│   ├── AlertService → Configurable notifications
│   ├── LogService → Output channels per instance
│   ├── AppInsightsService → KQL queries via REST
│   └── TelemetryService → Opt-in telemetry
├── Tree Views (Functions, Instances, Connections)
├── Commands (18 registered commands)
└── WebView Panels (React 18 + React Flow)
    ├── FlowPanel → Interactive orchestration DAG
    ├── DashboardPanel → Instance table
    └── PerformancePanel → Metrics and stats
```

---

## 🛠️ Development

```bash
# Install dependencies
npm install
cd webview-ui && npm install && cd ..

# Full build
npm run build           # Extension (esbuild)
npm run build:webview   # WebView (Vite + React)

# Watch mode (auto-rebuild)
npm run watch

# Tests
npm test                # Vitest (52 tests)

# Lint
npm run lint            # ESLint
npm run lint:fix        # Auto-fix

# Format
npm run format          # Prettier

# Package as .vsix
npx @vscode/vsce package --no-dependencies
```

### Debug

1. Open the project in VS Code
2. Press `F5` → launches Extension Development Host
3. Open a folder with an Azure Functions project
4. The extension activates and shows its icon in the sidebar

### Project Structure

```
├── src/                    # Extension source (TypeScript)
│   ├── extension.ts        # Entry point
│   ├── commands/           # 18 command handlers
│   ├── providers/          # Local + Azure + Durable API clients
│   ├── analyzers/          # Code analysis (4 languages)
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
├── snippets/               # Code snippets (4 languages)
├── test/                   # Vitest unit tests
├── .github/workflows/      # CI/CD (GitHub Actions)
└── package.json            # Extension manifest
```

---

## 📄 License

MIT
