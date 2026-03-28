import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../utils/logger';

// --- Types ---

type FunctionType = 'Orchestrator' | 'Activity' | 'Entity' | 'HTTP Starter';

type OrchestratorPattern =
  | 'Simple'
  | 'Chaining'
  | 'Fan-out/Fan-in'
  | 'Human Interaction'
  | 'Monitor'
  | 'Eternal';

type Language = 'TypeScript' | 'C#' | 'Python' | 'Java';

interface WizardResult {
  functionType: FunctionType;
  pattern?: OrchestratorPattern;
  functionName: string;
  language: Language;
}

// --- Language detection ---

function detectWorkspaceLanguage(): Language | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) {
    return undefined;
  }

  const rootPath = folders[0].uri.fsPath;

  const indicators: { file: string; language: Language }[] = [
    { file: 'tsconfig.json', language: 'TypeScript' },
    { file: 'package.json', language: 'TypeScript' },
    { file: 'requirements.txt', language: 'Python' },
    { file: 'pom.xml', language: 'Java' },
    { file: 'build.gradle', language: 'Java' },
  ];

  for (const { file, language } of indicators) {
    const filePath = vscode.Uri.file(path.join(rootPath, file));
    try {
      // Synchronous existence check via URI — we rely on .cs detection below for C#
      if (fs.existsSync(filePath.fsPath)) {
        return language;
      }
    } catch {
      // Ignore and continue
    }
  }

  // Check for .csproj files
  try {
    const files = fs.readdirSync(rootPath) as string[];
    if (files.some((f: string) => f.endsWith('.csproj'))) {
      return 'C#';
    }
  } catch {
    // Ignore
  }

  return undefined;
}

// --- File extension mapping ---

function getFileExtension(language: Language): string {
  switch (language) {
    case 'TypeScript':
      return '.ts';
    case 'C#':
      return '.cs';
    case 'Python':
      return '.py';
    case 'Java':
      return '.java';
  }
}

// --- Template generators ---

function generateTypeScript(result: WizardResult): string {
  const name = result.functionName;

  switch (result.functionType) {
    case 'Activity':
      return [
        `import { app, InvocationContext } from '@azure/functions';`,
        `import * as df from 'durable-functions';`,
        ``,
        `function ${name}(input: string, context: InvocationContext): string {`,
        `  context.log('${name} processing:', input);`,
        `  return \`Hello \${input}\`;`,
        `}`,
        ``,
        `df.app.activity('${name}', { handler: ${name} });`,
        ``,
      ].join('\n');

    case 'Entity':
      return [
        `import * as df from 'durable-functions';`,
        ``,
        `const ${name}: df.EntityHandler<number> = function (context) {`,
        `  const currentValue = context.df.getState(() => 0) as number;`,
        ``,
        `  switch (context.df.operationName) {`,
        `    case 'add':`,
        `      context.df.setState(currentValue + (context.df.input as number));`,
        `      break;`,
        `    case 'reset':`,
        `      context.df.setState(0);`,
        `      break;`,
        `    case 'get':`,
        `      context.df.return(currentValue);`,
        `      break;`,
        `  }`,
        `};`,
        ``,
        `df.app.entity('${name}', ${name});`,
        ``,
      ].join('\n');

    case 'HTTP Starter':
      return [
        `import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';`,
        `import * as df from 'durable-functions';`,
        ``,
        `async function ${name}(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {`,
        `  const client = df.getClient(context);`,
        `  const body = await req.text();`,
        `  const instanceId = await client.startNew('OrchestratorName', { input: body });`,
        ``,
        `  context.log(\`Started orchestration with ID = '\${instanceId}'.\`);`,
        ``,
        `  return client.createCheckStatusResponse(req, instanceId);`,
        `}`,
        ``,
        `app.http('${name}', {`,
        `  route: 'orchestrators/{orchestratorName}',`,
        `  extraInputs: [df.input.durableClient()],`,
        `  handler: ${name},`,
        `});`,
        ``,
      ].join('\n');

    case 'Orchestrator':
      return generateTypeScriptOrchestrator(name, result.pattern ?? 'Simple');
  }
}

function generateTypeScriptOrchestrator(name: string, pattern: OrchestratorPattern): string {
  switch (pattern) {
    case 'Simple':
      return [
        `import * as df from 'durable-functions';`,
        ``,
        `const ${name}: df.OrchestrationHandler = function* (context) {`,
        `  const outputs = [];`,
        ``,
        `  outputs.push(yield context.df.callActivity('ActivityName', 'input'));`,
        ``,
        `  return outputs;`,
        `};`,
        ``,
        `df.app.orchestration('${name}', ${name});`,
        ``,
      ].join('\n');

    case 'Chaining':
      return [
        `import * as df from 'durable-functions';`,
        ``,
        `const ${name}: df.OrchestrationHandler = function* (context) {`,
        `  const result1 = yield context.df.callActivity('Step1', context.df.input);`,
        `  const result2 = yield context.df.callActivity('Step2', result1);`,
        `  const result3 = yield context.df.callActivity('Step3', result2);`,
        ``,
        `  return result3;`,
        `};`,
        ``,
        `df.app.orchestration('${name}', ${name});`,
        ``,
      ].join('\n');

    case 'Fan-out/Fan-in':
      return [
        `import * as df from 'durable-functions';`,
        ``,
        `const ${name}: df.OrchestrationHandler = function* (context) {`,
        `  const workItems: string[] = yield context.df.callActivity('GetWorkItems');`,
        ``,
        `  // Fan out: schedule all tasks in parallel`,
        `  const parallelTasks = workItems.map((item) =>`,
        `    context.df.callActivity('ProcessItem', item),`,
        `  );`,
        ``,
        `  // Fan in: wait for all tasks to complete`,
        `  const results = yield context.df.Task.all(parallelTasks);`,
        ``,
        `  // Aggregate results`,
        `  const summary = yield context.df.callActivity('Summarize', results);`,
        `  return summary;`,
        `};`,
        ``,
        `df.app.orchestration('${name}', ${name});`,
        ``,
      ].join('\n');

    case 'Human Interaction':
      return [
        `import * as df from 'durable-functions';`,
        ``,
        `const ${name}: df.OrchestrationHandler = function* (context) {`,
        `  yield context.df.callActivity('RequestApproval', context.df.input);`,
        ``,
        `  // Wait for approval event or timeout`,
        `  const expiration = new Date(context.df.currentUtcDateTime);`,
        `  expiration.setHours(expiration.getHours() + 72);`,
        ``,
        `  const timeoutTask = context.df.createTimer(expiration);`,
        `  const approvalTask = context.df.waitForExternalEvent('ApprovalEvent');`,
        ``,
        `  const winner = yield context.df.Task.any([approvalTask, timeoutTask]);`,
        ``,
        `  if (winner === approvalTask) {`,
        `    timeoutTask.cancel();`,
        `    yield context.df.callActivity('ProcessApproval', approvalTask.result);`,
        `  } else {`,
        `    yield context.df.callActivity('HandleTimeout', 'Approval timed out');`,
        `  }`,
        `};`,
        ``,
        `df.app.orchestration('${name}', ${name});`,
        ``,
      ].join('\n');

    case 'Monitor':
      return [
        `import * as df from 'durable-functions';`,
        ``,
        `const ${name}: df.OrchestrationHandler = function* (context) {`,
        `  const endTime = new Date(context.df.currentUtcDateTime);`,
        `  endTime.setHours(endTime.getHours() + 6);`,
        ``,
        `  while (context.df.currentUtcDateTime < endTime) {`,
        `    const status = yield context.df.callActivity('CheckStatus', context.df.input);`,
        ``,
        `    if (status === 'done') {`,
        `      yield context.df.callActivity('SendNotification', 'Job completed!');`,
        `      return 'completed';`,
        `    }`,
        ``,
        `    // Wait before next check`,
        `    const nextCheck = new Date(context.df.currentUtcDateTime);`,
        `    nextCheck.setSeconds(nextCheck.getSeconds() + 30);`,
        `    yield context.df.createTimer(nextCheck);`,
        `  }`,
        ``,
        `  return 'timed out';`,
        `};`,
        ``,
        `df.app.orchestration('${name}', ${name});`,
        ``,
      ].join('\n');

    case 'Eternal':
      return [
        `import * as df from 'durable-functions';`,
        ``,
        `const ${name}: df.OrchestrationHandler = function* (context) {`,
        `  yield context.df.callActivity('DoWork', context.df.input);`,
        ``,
        `  // Wait before next iteration`,
        `  const nextRun = new Date(context.df.currentUtcDateTime);`,
        `  nextRun.setMinutes(nextRun.getMinutes() + 5);`,
        `  yield context.df.createTimer(nextRun);`,
        ``,
        `  // Continue as new to avoid unbounded history`,
        `  context.df.continueAsNew(context.df.input);`,
        `};`,
        ``,
        `df.app.orchestration('${name}', ${name});`,
        ``,
      ].join('\n');
  }
}

function generateCSharp(result: WizardResult): string {
  const name = result.functionName;

  switch (result.functionType) {
    case 'Activity':
      return [
        `using Microsoft.Azure.WebJobs;`,
        `using Microsoft.Azure.WebJobs.Extensions.DurableTask;`,
        `using Microsoft.Extensions.Logging;`,
        ``,
        `public static class ${name}`,
        `{`,
        `    [FunctionName("${name}")]`,
        `    public static string Run(`,
        `        [ActivityTrigger] string input,`,
        `        ILogger log)`,
        `    {`,
        `        log.LogInformation("${name} processing: {Input}", input);`,
        `        return $"Hello {input}";`,
        `    }`,
        `}`,
        ``,
      ].join('\n');

    case 'Entity':
      return [
        `using Microsoft.Azure.WebJobs;`,
        `using Microsoft.Azure.WebJobs.Extensions.DurableTask;`,
        ``,
        `public static class ${name}`,
        `{`,
        `    [FunctionName("${name}")]`,
        `    public static void Run(`,
        `        [EntityTrigger] IDurableEntityContext ctx)`,
        `    {`,
        `        var currentValue = ctx.GetState<int>();`,
        ``,
        `        switch (ctx.OperationName.ToLowerInvariant())`,
        `        {`,
        `            case "add":`,
        `                ctx.SetState(currentValue + ctx.GetInput<int>());`,
        `                break;`,
        `            case "reset":`,
        `                ctx.SetState(0);`,
        `                break;`,
        `            case "get":`,
        `                ctx.Return(currentValue);`,
        `                break;`,
        `        }`,
        `    }`,
        `}`,
        ``,
      ].join('\n');

    case 'HTTP Starter':
      return [
        `using System.Net.Http;`,
        `using System.Threading.Tasks;`,
        `using Microsoft.Azure.WebJobs;`,
        `using Microsoft.Azure.WebJobs.Extensions.DurableTask;`,
        `using Microsoft.Azure.WebJobs.Extensions.Http;`,
        `using Microsoft.Extensions.Logging;`,
        ``,
        `public static class ${name}`,
        `{`,
        `    [FunctionName("${name}")]`,
        `    public static async Task<HttpResponseMessage> Run(`,
        `        [HttpTrigger(AuthorizationLevel.Anonymous, "get", "post")] HttpRequestMessage req,`,
        `        [DurableClient] IDurableOrchestrationClient starter,`,
        `        ILogger log)`,
        `    {`,
        `        string instanceId = await starter.StartNewAsync("OrchestratorName", null);`,
        ``,
        `        log.LogInformation("Started orchestration with ID = '{InstanceId}'.", instanceId);`,
        ``,
        `        return starter.CreateCheckStatusResponse(req, instanceId);`,
        `    }`,
        `}`,
        ``,
      ].join('\n');

    case 'Orchestrator':
      return generateCSharpOrchestrator(name, result.pattern ?? 'Simple');
  }
}

function generateCSharpOrchestrator(name: string, pattern: OrchestratorPattern): string {
  switch (pattern) {
    case 'Simple':
      return [
        `using System.Collections.Generic;`,
        `using System.Threading.Tasks;`,
        `using Microsoft.Azure.WebJobs;`,
        `using Microsoft.Azure.WebJobs.Extensions.DurableTask;`,
        ``,
        `public static class ${name}`,
        `{`,
        `    [FunctionName("${name}")]`,
        `    public static async Task<List<string>> Run(`,
        `        [OrchestrationTrigger] IDurableOrchestrationContext context)`,
        `    {`,
        `        var outputs = new List<string>();`,
        ``,
        `        outputs.Add(await context.CallActivityAsync<string>("ActivityName", "input"));`,
        ``,
        `        return outputs;`,
        `    }`,
        `}`,
        ``,
      ].join('\n');

    case 'Chaining':
      return [
        `using System.Threading.Tasks;`,
        `using Microsoft.Azure.WebJobs;`,
        `using Microsoft.Azure.WebJobs.Extensions.DurableTask;`,
        ``,
        `public static class ${name}`,
        `{`,
        `    [FunctionName("${name}")]`,
        `    public static async Task<string> Run(`,
        `        [OrchestrationTrigger] IDurableOrchestrationContext context)`,
        `    {`,
        `        var result1 = await context.CallActivityAsync<string>("Step1", context.GetInput<string>());`,
        `        var result2 = await context.CallActivityAsync<string>("Step2", result1);`,
        `        var result3 = await context.CallActivityAsync<string>("Step3", result2);`,
        ``,
        `        return result3;`,
        `    }`,
        `}`,
        ``,
      ].join('\n');

    case 'Fan-out/Fan-in':
      return [
        `using System.Collections.Generic;`,
        `using System.Linq;`,
        `using System.Threading.Tasks;`,
        `using Microsoft.Azure.WebJobs;`,
        `using Microsoft.Azure.WebJobs.Extensions.DurableTask;`,
        ``,
        `public static class ${name}`,
        `{`,
        `    [FunctionName("${name}")]`,
        `    public static async Task<List<string>> Run(`,
        `        [OrchestrationTrigger] IDurableOrchestrationContext context)`,
        `    {`,
        `        var workItems = await context.CallActivityAsync<List<string>>("GetWorkItems", null);`,
        ``,
        `        // Fan out: schedule all tasks in parallel`,
        `        var parallelTasks = new List<Task<string>>();`,
        `        foreach (var item in workItems)`,
        `        {`,
        `            parallelTasks.Add(context.CallActivityAsync<string>("ProcessItem", item));`,
        `        }`,
        ``,
        `        // Fan in: wait for all tasks to complete`,
        `        var results = await Task.WhenAll(parallelTasks);`,
        ``,
        `        return results.ToList();`,
        `    }`,
        `}`,
        ``,
      ].join('\n');

    case 'Human Interaction':
      return [
        `using System;`,
        `using System.Threading;`,
        `using System.Threading.Tasks;`,
        `using Microsoft.Azure.WebJobs;`,
        `using Microsoft.Azure.WebJobs.Extensions.DurableTask;`,
        ``,
        `public static class ${name}`,
        `{`,
        `    [FunctionName("${name}")]`,
        `    public static async Task Run(`,
        `        [OrchestrationTrigger] IDurableOrchestrationContext context)`,
        `    {`,
        `        await context.CallActivityAsync("RequestApproval", context.GetInput<object>());`,
        ``,
        `        using var cts = new CancellationTokenSource();`,
        `        var expiration = context.CurrentUtcDateTime.AddHours(72);`,
        `        var timeoutTask = context.CreateTimer(expiration, cts.Token);`,
        `        var approvalTask = context.WaitForExternalEvent<bool>("ApprovalEvent");`,
        ``,
        `        var winner = await Task.WhenAny(approvalTask, timeoutTask);`,
        ``,
        `        if (winner == approvalTask)`,
        `        {`,
        `            cts.Cancel();`,
        `            await context.CallActivityAsync("ProcessApproval", approvalTask.Result);`,
        `        }`,
        `        else`,
        `        {`,
        `            await context.CallActivityAsync("HandleTimeout", "Approval timed out");`,
        `        }`,
        `    }`,
        `}`,
        ``,
      ].join('\n');

    case 'Monitor':
      return [
        `using System;`,
        `using System.Threading;`,
        `using System.Threading.Tasks;`,
        `using Microsoft.Azure.WebJobs;`,
        `using Microsoft.Azure.WebJobs.Extensions.DurableTask;`,
        ``,
        `public static class ${name}`,
        `{`,
        `    [FunctionName("${name}")]`,
        `    public static async Task<string> Run(`,
        `        [OrchestrationTrigger] IDurableOrchestrationContext context)`,
        `    {`,
        `        var endTime = context.CurrentUtcDateTime.AddHours(6);`,
        ``,
        `        while (context.CurrentUtcDateTime < endTime)`,
        `        {`,
        `            var status = await context.CallActivityAsync<string>("CheckStatus", context.GetInput<object>());`,
        ``,
        `            if (status == "done")`,
        `            {`,
        `                await context.CallActivityAsync("SendNotification", "Job completed!");`,
        `                return "completed";`,
        `            }`,
        ``,
        `            var nextCheck = context.CurrentUtcDateTime.AddSeconds(30);`,
        `            await context.CreateTimer(nextCheck, CancellationToken.None);`,
        `        }`,
        ``,
        `        return "timed out";`,
        `    }`,
        `}`,
        ``,
      ].join('\n');

    case 'Eternal':
      return [
        `using System;`,
        `using System.Threading.Tasks;`,
        `using Microsoft.Azure.WebJobs;`,
        `using Microsoft.Azure.WebJobs.Extensions.DurableTask;`,
        ``,
        `public static class ${name}`,
        `{`,
        `    [FunctionName("${name}")]`,
        `    public static async Task Run(`,
        `        [OrchestrationTrigger] IDurableOrchestrationContext context)`,
        `    {`,
        `        await context.CallActivityAsync("DoWork", context.GetInput<object>());`,
        ``,
        `        // Wait before next iteration`,
        `        var nextRun = context.CurrentUtcDateTime.AddMinutes(5);`,
        `        await context.CreateTimer(nextRun, default);`,
        ``,
        `        // Continue as new to avoid unbounded history`,
        `        context.ContinueAsNew(context.GetInput<object>());`,
        `    }`,
        `}`,
        ``,
      ].join('\n');
  }
}

function generatePython(result: WizardResult): string {
  const name = result.functionName;

  switch (result.functionType) {
    case 'Activity':
      return [
        `import logging`,
        ``,
        ``,
        `def main(input: str) -> str:`,
        `    logging.info(f'${name} processing: {input}')`,
        `    return f'Hello {input}'`,
        ``,
      ].join('\n');

    case 'Entity':
      return [
        `import azure.functions as func`,
        `import azure.durable_functions as df`,
        ``,
        ``,
        `def entity_function(ctx: df.DurableEntityContext):`,
        `    current_value = ctx.get_state(lambda: 0)`,
        ``,
        `    operation = ctx.operation_name`,
        `    if operation == "add":`,
        `        ctx.set_state(current_value + ctx.get_input())`,
        `    elif operation == "reset":`,
        `        ctx.set_state(0)`,
        `    elif operation == "get":`,
        `        ctx.set_result(current_value)`,
        ``,
        ``,
        `main = df.Entity.create(entity_function)`,
        ``,
      ].join('\n');

    case 'HTTP Starter':
      return [
        `import logging`,
        `import azure.functions as func`,
        `import azure.durable_functions as df`,
        ``,
        ``,
        `async def main(req: func.HttpRequest, starter: str) -> func.HttpResponse:`,
        `    client = df.DurableOrchestrationClient(starter)`,
        `    instance_id = await client.start_new('OrchestratorName', None, req.get_body().decode())`,
        ``,
        `    logging.info(f"Started orchestration with ID = '{instance_id}'")`,
        ``,
        `    return client.create_check_status_response(req, instance_id)`,
        ``,
      ].join('\n');

    case 'Orchestrator':
      return generatePythonOrchestrator(name, result.pattern ?? 'Simple');
  }
}

function generatePythonOrchestrator(name: string, pattern: OrchestratorPattern): string {
  // Python uses snake_case for the internal function name
  switch (pattern) {
    case 'Simple':
      return [
        `import azure.functions as func`,
        `import azure.durable_functions as df`,
        ``,
        ``,
        `def orchestrator_function(context: df.DurableOrchestrationContext):`,
        `    result1 = yield context.call_activity('ActivityName', 'input')`,
        ``,
        `    return [result1]`,
        ``,
        ``,
        `main = df.Orchestrator.create(orchestrator_function)`,
        ``,
      ].join('\n');

    case 'Chaining':
      return [
        `import azure.durable_functions as df`,
        ``,
        ``,
        `def orchestrator_function(context: df.DurableOrchestrationContext):`,
        `    result1 = yield context.call_activity('Step1', context.get_input())`,
        `    result2 = yield context.call_activity('Step2', result1)`,
        `    result3 = yield context.call_activity('Step3', result2)`,
        ``,
        `    return result3`,
        ``,
        ``,
        `main = df.Orchestrator.create(orchestrator_function)`,
        ``,
      ].join('\n');

    case 'Fan-out/Fan-in':
      return [
        `import azure.durable_functions as df`,
        ``,
        ``,
        `def orchestrator_function(context: df.DurableOrchestrationContext):`,
        `    work_items = yield context.call_activity('GetWorkItems', None)`,
        ``,
        `    # Fan out: schedule all tasks in parallel`,
        `    parallel_tasks = [context.call_activity('ProcessItem', item) for item in work_items]`,
        ``,
        `    # Fan in: wait for all tasks to complete`,
        `    results = yield context.task_all(parallel_tasks)`,
        ``,
        `    return results`,
        ``,
        ``,
        `main = df.Orchestrator.create(orchestrator_function)`,
        ``,
      ].join('\n');

    case 'Human Interaction':
      return [
        `import azure.durable_functions as df`,
        `from datetime import timedelta`,
        ``,
        ``,
        `def orchestrator_function(context: df.DurableOrchestrationContext):`,
        `    yield context.call_activity('RequestApproval', context.get_input())`,
        ``,
        `    expiration = context.current_utc_datetime + timedelta(hours=72)`,
        `    timeout_task = context.create_timer(expiration)`,
        `    approval_task = context.wait_for_external_event('ApprovalEvent')`,
        ``,
        `    winner = yield context.task_any([approval_task, timeout_task])`,
        ``,
        `    if winner == approval_task:`,
        `        timeout_task.cancel()`,
        `        yield context.call_activity('ProcessApproval', approval_task.result)`,
        `    else:`,
        `        yield context.call_activity('HandleTimeout', 'Approval timed out')`,
        ``,
        ``,
        `main = df.Orchestrator.create(orchestrator_function)`,
        ``,
      ].join('\n');

    case 'Monitor':
      return [
        `import azure.durable_functions as df`,
        `from datetime import timedelta`,
        ``,
        ``,
        `def orchestrator_function(context: df.DurableOrchestrationContext):`,
        `    end_time = context.current_utc_datetime + timedelta(hours=6)`,
        ``,
        `    while context.current_utc_datetime < end_time:`,
        `        status = yield context.call_activity('CheckStatus', context.get_input())`,
        ``,
        `        if status == 'done':`,
        `            yield context.call_activity('SendNotification', 'Job completed!')`,
        `            return 'completed'`,
        ``,
        `        next_check = context.current_utc_datetime + timedelta(seconds=30)`,
        `        yield context.create_timer(next_check)`,
        ``,
        `    return 'timed out'`,
        ``,
        ``,
        `main = df.Orchestrator.create(orchestrator_function)`,
        ``,
      ].join('\n');

    case 'Eternal':
      return [
        `import azure.durable_functions as df`,
        `from datetime import timedelta`,
        ``,
        ``,
        `def orchestrator_function(context: df.DurableOrchestrationContext):`,
        `    yield context.call_activity('DoWork', context.get_input())`,
        ``,
        `    # Wait before next iteration`,
        `    next_run = context.current_utc_datetime + timedelta(minutes=5)`,
        `    yield context.create_timer(next_run)`,
        ``,
        `    # Continue as new to avoid unbounded history`,
        `    context.continue_as_new(context.get_input())`,
        ``,
        ``,
        `main = df.Orchestrator.create(orchestrator_function)`,
        ``,
      ].join('\n');
  }
}

function generateJava(result: WizardResult): string {
  const name = result.functionName;

  switch (result.functionType) {
    case 'Activity':
      return [
        `import com.microsoft.azure.functions.*;`,
        `import com.microsoft.azure.functions.annotation.*;`,
        `import com.microsoft.durabletask.azurefunctions.DurableActivityTrigger;`,
        ``,
        `public class ${name} {`,
        `    @FunctionName("${name}")`,
        `    public String run(`,
        `            @DurableActivityTrigger(name = "input") String input,`,
        `            final ExecutionContext context) {`,
        `        context.getLogger().info("${name} processing: " + input);`,
        `        return "Hello " + input;`,
        `    }`,
        `}`,
        ``,
      ].join('\n');

    case 'Entity':
      return [
        `import com.microsoft.azure.functions.*;`,
        `import com.microsoft.azure.functions.annotation.*;`,
        `import com.microsoft.durabletask.azurefunctions.DurableEntityTrigger;`,
        `import com.microsoft.durabletask.entities.EntityContext;`,
        ``,
        `public class ${name} {`,
        `    @FunctionName("${name}")`,
        `    public void run(`,
        `            @DurableEntityTrigger(name = "ctx") EntityContext ctx,`,
        `            final ExecutionContext context) {`,
        `        int currentValue = ctx.getState(Integer.class);`,
        ``,
        `        switch (ctx.getOperationName().toLowerCase()) {`,
        `            case "add":`,
        `                ctx.setState(currentValue + ctx.getInput(Integer.class));`,
        `                break;`,
        `            case "reset":`,
        `                ctx.setState(0);`,
        `                break;`,
        `            case "get":`,
        `                ctx.setResult(currentValue);`,
        `                break;`,
        `        }`,
        `    }`,
        `}`,
        ``,
      ].join('\n');

    case 'HTTP Starter':
      return [
        `import com.microsoft.azure.functions.*;`,
        `import com.microsoft.azure.functions.annotation.*;`,
        `import com.microsoft.durabletask.DurableTaskClient;`,
        `import com.microsoft.durabletask.azurefunctions.DurableClientContext;`,
        `import com.microsoft.durabletask.azurefunctions.DurableClientInput;`,
        `import java.util.Optional;`,
        ``,
        `public class ${name} {`,
        `    @FunctionName("${name}")`,
        `    public HttpResponseMessage run(`,
        `            @HttpTrigger(name = "req", methods = {HttpMethod.GET, HttpMethod.POST},`,
        `                         authLevel = AuthorizationLevel.ANONYMOUS) HttpRequestMessage<Optional<String>> req,`,
        `            @DurableClientInput(name = "durableContext") DurableClientContext durableContext,`,
        `            final ExecutionContext context) {`,
        `        DurableTaskClient client = durableContext.getClient();`,
        `        String instanceId = client.scheduleNewOrchestrationInstance("OrchestratorName");`,
        ``,
        `        context.getLogger().info("Started orchestration with ID = '" + instanceId + "'.");`,
        ``,
        `        return durableContext.createCheckStatusResponse(req, instanceId);`,
        `    }`,
        `}`,
        ``,
      ].join('\n');

    case 'Orchestrator':
      return generateJavaOrchestrator(name, result.pattern ?? 'Simple');
  }
}

function generateJavaOrchestrator(name: string, pattern: OrchestratorPattern): string {
  switch (pattern) {
    case 'Simple':
      return [
        `import com.microsoft.azure.functions.annotation.*;`,
        `import com.microsoft.durabletask.TaskOrchestrationContext;`,
        `import com.microsoft.durabletask.azurefunctions.DurableOrchestrationTrigger;`,
        `import java.util.ArrayList;`,
        `import java.util.List;`,
        ``,
        `public class ${name} {`,
        `    @FunctionName("${name}")`,
        `    public List<String> run(`,
        `            @DurableOrchestrationTrigger(name = "ctx") TaskOrchestrationContext ctx) {`,
        `        List<String> outputs = new ArrayList<>();`,
        ``,
        `        outputs.add(ctx.callActivity("ActivityName", "input", String.class).await());`,
        ``,
        `        return outputs;`,
        `    }`,
        `}`,
        ``,
      ].join('\n');

    case 'Chaining':
      return [
        `import com.microsoft.azure.functions.annotation.*;`,
        `import com.microsoft.durabletask.TaskOrchestrationContext;`,
        `import com.microsoft.durabletask.azurefunctions.DurableOrchestrationTrigger;`,
        ``,
        `public class ${name} {`,
        `    @FunctionName("${name}")`,
        `    public String run(`,
        `            @DurableOrchestrationTrigger(name = "ctx") TaskOrchestrationContext ctx) {`,
        `        String result1 = ctx.callActivity("Step1", ctx.getInput(String.class), String.class).await();`,
        `        String result2 = ctx.callActivity("Step2", result1, String.class).await();`,
        `        String result3 = ctx.callActivity("Step3", result2, String.class).await();`,
        ``,
        `        return result3;`,
        `    }`,
        `}`,
        ``,
      ].join('\n');

    case 'Fan-out/Fan-in':
      return [
        `import com.microsoft.azure.functions.annotation.*;`,
        `import com.microsoft.durabletask.Task;`,
        `import com.microsoft.durabletask.TaskOrchestrationContext;`,
        `import com.microsoft.durabletask.azurefunctions.DurableOrchestrationTrigger;`,
        `import java.util.ArrayList;`,
        `import java.util.List;`,
        ``,
        `public class ${name} {`,
        `    @FunctionName("${name}")`,
        `    public List<String> run(`,
        `            @DurableOrchestrationTrigger(name = "ctx") TaskOrchestrationContext ctx) {`,
        `        List<String> workItems = ctx.callActivity("GetWorkItems", null, List.class).await();`,
        ``,
        `        // Fan out: schedule all tasks in parallel`,
        `        List<Task<String>> parallelTasks = new ArrayList<>();`,
        `        for (String item : workItems) {`,
        `            parallelTasks.add(ctx.callActivity("ProcessItem", item, String.class));`,
        `        }`,
        ``,
        `        // Fan in: wait for all tasks to complete`,
        `        List<String> results = ctx.allOf(parallelTasks).await();`,
        ``,
        `        return results;`,
        `    }`,
        `}`,
        ``,
      ].join('\n');

    case 'Human Interaction':
      return [
        `import com.microsoft.azure.functions.annotation.*;`,
        `import com.microsoft.durabletask.Task;`,
        `import com.microsoft.durabletask.TaskOrchestrationContext;`,
        `import com.microsoft.durabletask.azurefunctions.DurableOrchestrationTrigger;`,
        `import java.time.Duration;`,
        ``,
        `public class ${name} {`,
        `    @FunctionName("${name}")`,
        `    public void run(`,
        `            @DurableOrchestrationTrigger(name = "ctx") TaskOrchestrationContext ctx) {`,
        `        ctx.callActivity("RequestApproval", ctx.getInput(Object.class)).await();`,
        ``,
        `        Duration timeout = Duration.ofHours(72);`,
        `        Task<Void> timeoutTask = ctx.createTimer(timeout);`,
        `        Task<Boolean> approvalTask = ctx.waitForExternalEvent("ApprovalEvent", Boolean.class);`,
        ``,
        `        Task<?> winner = ctx.anyOf(approvalTask, timeoutTask).await();`,
        ``,
        `        if (winner == approvalTask) {`,
        `            ctx.callActivity("ProcessApproval", approvalTask.await()).await();`,
        `        } else {`,
        `            ctx.callActivity("HandleTimeout", "Approval timed out").await();`,
        `        }`,
        `    }`,
        `}`,
        ``,
      ].join('\n');

    case 'Monitor':
      return [
        `import com.microsoft.azure.functions.annotation.*;`,
        `import com.microsoft.durabletask.TaskOrchestrationContext;`,
        `import com.microsoft.durabletask.azurefunctions.DurableOrchestrationTrigger;`,
        `import java.time.Duration;`,
        `import java.time.Instant;`,
        ``,
        `public class ${name} {`,
        `    @FunctionName("${name}")`,
        `    public String run(`,
        `            @DurableOrchestrationTrigger(name = "ctx") TaskOrchestrationContext ctx) {`,
        `        Instant endTime = ctx.getCurrentInstant().plus(Duration.ofHours(6));`,
        ``,
        `        while (ctx.getCurrentInstant().isBefore(endTime)) {`,
        `            String status = ctx.callActivity("CheckStatus", ctx.getInput(Object.class), String.class).await();`,
        ``,
        `            if ("done".equals(status)) {`,
        `                ctx.callActivity("SendNotification", "Job completed!").await();`,
        `                return "completed";`,
        `            }`,
        ``,
        `            ctx.createTimer(Duration.ofSeconds(30)).await();`,
        `        }`,
        ``,
        `        return "timed out";`,
        `    }`,
        `}`,
        ``,
      ].join('\n');

    case 'Eternal':
      return [
        `import com.microsoft.azure.functions.annotation.*;`,
        `import com.microsoft.durabletask.TaskOrchestrationContext;`,
        `import com.microsoft.durabletask.azurefunctions.DurableOrchestrationTrigger;`,
        `import java.time.Duration;`,
        ``,
        `public class ${name} {`,
        `    @FunctionName("${name}")`,
        `    public void run(`,
        `            @DurableOrchestrationTrigger(name = "ctx") TaskOrchestrationContext ctx) {`,
        `        ctx.callActivity("DoWork", ctx.getInput(Object.class)).await();`,
        ``,
        `        // Wait before next iteration`,
        `        ctx.createTimer(Duration.ofMinutes(5)).await();`,
        ``,
        `        // Continue as new to avoid unbounded history`,
        `        ctx.continueAsNew(ctx.getInput(Object.class));`,
        `    }`,
        `}`,
        ``,
      ].join('\n');
  }
}

function generateContent(result: WizardResult): string {
  switch (result.language) {
    case 'TypeScript':
      return generateTypeScript(result);
    case 'C#':
      return generateCSharp(result);
    case 'Python':
      return generatePython(result);
    case 'Java':
      return generateJava(result);
  }
}

// --- Wizard steps ---

async function pickFunctionType(): Promise<FunctionType | undefined> {
  const items: vscode.QuickPickItem[] = [
    { label: '$(symbol-event) Orchestrator', description: 'Durable orchestrator function' },
    { label: '$(symbol-method) Activity', description: 'Durable activity function' },
    { label: '$(symbol-class) Entity', description: 'Durable entity function' },
    { label: '$(globe) HTTP Starter', description: 'HTTP trigger client starter' },
  ];

  const picked = await vscode.window.showQuickPick(items, {
    title: 'New Durable Function (Step 1/4)',
    placeHolder: 'Select function type',
  });

  if (!picked) {
    return undefined;
  }

  // Extract the plain label text after the codicon
  const labelMap: Record<string, FunctionType> = {
    'Orchestrator': 'Orchestrator',
    'Activity': 'Activity',
    'Entity': 'Entity',
    'HTTP Starter': 'HTTP Starter',
  };

  for (const [key, value] of Object.entries(labelMap)) {
    if (picked.label.includes(key)) {
      return value;
    }
  }

  return undefined;
}

async function pickOrchestratorPattern(): Promise<OrchestratorPattern | undefined> {
  const items: vscode.QuickPickItem[] = [
    { label: 'Simple', description: 'Basic orchestrator with activity calls' },
    { label: 'Chaining', description: 'Sequential chain of activity calls' },
    { label: 'Fan-out/Fan-in', description: 'Parallel activity execution with aggregation' },
    { label: 'Human Interaction', description: 'Approval workflow with external event and timeout' },
    { label: 'Monitor', description: 'Polling pattern with periodic status checks' },
    { label: 'Eternal', description: 'Infinite loop orchestrator with continueAsNew' },
  ];

  const picked = await vscode.window.showQuickPick(items, {
    title: 'New Durable Function (Step 2/4)',
    placeHolder: 'Select orchestrator pattern',
  });

  return picked?.label as OrchestratorPattern | undefined;
}

async function inputFunctionName(functionType: FunctionType): Promise<string | undefined> {
  const defaultNames: Record<FunctionType, string> = {
    'Orchestrator': 'myOrchestrator',
    'Activity': 'myActivity',
    'Entity': 'myEntity',
    'HTTP Starter': 'httpStart',
  };

  return vscode.window.showInputBox({
    title: 'New Durable Function (Step 3/4)',
    prompt: 'Enter function name',
    value: defaultNames[functionType],
    validateInput: (value) => {
      if (!value.trim()) {
        return 'Function name cannot be empty';
      }
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
        return 'Function name must be a valid identifier (letters, digits, underscores)';
      }
      return undefined;
    },
  });
}

async function pickLanguage(detected: Language | undefined): Promise<Language | undefined> {
  const languages: Language[] = ['TypeScript', 'C#', 'Python', 'Java'];

  const items: vscode.QuickPickItem[] = languages.map((lang) => ({
    label: lang,
    description: lang === detected ? '(detected)' : undefined,
  }));

  // Put detected language first
  if (detected) {
    items.sort((a, b) => {
      if (a.label === detected) return -1;
      if (b.label === detected) return 1;
      return 0;
    });
  }

  const picked = await vscode.window.showQuickPick(items, {
    title: 'New Durable Function (Step 4/4)',
    placeHolder: 'Select language',
  });

  return picked?.label as Language | undefined;
}

// --- Main command ---

export async function scaffoldDurableFunction(): Promise<void> {
  const logger = Logger.getInstance();

  // Step 1: Pick function type
  const functionType = await pickFunctionType();
  if (!functionType) {
    return;
  }

  // Step 2: Pick orchestrator pattern (only for orchestrators)
  let pattern: OrchestratorPattern | undefined;
  if (functionType === 'Orchestrator') {
    pattern = await pickOrchestratorPattern();
    if (!pattern) {
      return;
    }
  }

  // Step 3: Enter function name
  const functionName = await inputFunctionName(functionType);
  if (!functionName) {
    return;
  }

  // Step 4: Pick language
  const detectedLanguage = detectWorkspaceLanguage();
  const language = await pickLanguage(detectedLanguage);
  if (!language) {
    return;
  }

  const result: WizardResult = { functionType, pattern, functionName, language };

  // Generate file content
  const content = generateContent(result);
  const ext = getFileExtension(language);
  const fileName = `${functionName}${ext}`;

  // Determine target folder
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) {
    vscode.window.showErrorMessage('No workspace folder open. Please open a folder first.');
    return;
  }

  const workspaceRoot = folders[0].uri;
  let targetFolder = workspaceRoot;

  // For Java, place in src/main/java if it exists
  if (language === 'Java') {
    const javaDir = vscode.Uri.joinPath(workspaceRoot, 'src', 'main', 'java');
    try {
      await vscode.workspace.fs.stat(javaDir);
      targetFolder = javaDir;
    } catch {
      // Fall back to workspace root
    }
  }

  // For C#, try to place alongside other .cs files
  if (language === 'C#') {
    const srcDir = vscode.Uri.joinPath(workspaceRoot, 'Functions');
    try {
      await vscode.workspace.fs.stat(srcDir);
      targetFolder = srcDir;
    } catch {
      // Fall back to workspace root
    }
  }

  // For TypeScript, try src/functions
  if (language === 'TypeScript') {
    const srcFunctions = vscode.Uri.joinPath(workspaceRoot, 'src', 'functions');
    try {
      await vscode.workspace.fs.stat(srcFunctions);
      targetFolder = srcFunctions;
    } catch {
      // Fall back to workspace root
    }
  }

  const fileUri = vscode.Uri.joinPath(targetFolder, fileName);

  // Check if file already exists
  try {
    await vscode.workspace.fs.stat(fileUri);
    const overwrite = await vscode.window.showWarningMessage(
      `File "${fileName}" already exists. Overwrite?`,
      'Overwrite',
      'Cancel',
    );
    if (overwrite !== 'Overwrite') {
      return;
    }
  } catch {
    // File doesn't exist — proceed
  }

  // Write the file
  await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf-8'));

  // Open the file in the editor
  const doc = await vscode.workspace.openTextDocument(fileUri);
  await vscode.window.showTextDocument(doc);

  const patternLabel = pattern ? ` (${pattern})` : '';
  logger.info(`Scaffolded ${functionType}${patternLabel} "${functionName}" as ${language}`);
  vscode.window.showInformationMessage(
    `Created ${functionType}${patternLabel}: ${fileName}`,
  );
}
