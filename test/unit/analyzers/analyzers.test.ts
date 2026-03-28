import { describe, it, expect } from 'vitest';
import { TypeScriptAnalyzer } from '../../../src/analyzers/typescriptAnalyzer';
import { CSharpAnalyzer } from '../../../src/analyzers/csharpAnalyzer';
import { PythonAnalyzer } from '../../../src/analyzers/pythonAnalyzer';
import { JavaAnalyzer } from '../../../src/analyzers/javaAnalyzer';

describe('TypeScriptAnalyzer', () => {
  const analyzer = new TypeScriptAnalyzer();

  it('should detect v4 orchestrator', () => {
    const code = `
import * as df from 'durable-functions';

const myOrch: df.OrchestrationHandler = function* (context) {
  yield context.df.callActivity('SayHello', 'Tokyo');
  yield context.df.callActivity('SayHello', 'London');
};

df.app.orchestration('myOrch', myOrch);
`;
    const results = analyzer.analyzeFile('test.ts', code);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('myOrch');
    expect(results[0].type).toBe('orchestrator');
    expect(results[0].callsTo).toContain('SayHello');
  });

  it('should detect v4 activity', () => {
    const code = `
import * as df from 'durable-functions';
function sayHello(input: string) { return 'Hello ' + input; }
df.app.activity('SayHello', { handler: sayHello });
`;
    const results = analyzer.analyzeFile('test.ts', code);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('SayHello');
    expect(results[0].type).toBe('activity');
  });

  it('should detect v4 entity', () => {
    const code = `df.app.entity('Counter', counterEntity);`;
    const results = analyzer.analyzeFile('test.ts', code);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Counter');
    expect(results[0].type).toBe('entity');
  });

  it('should detect sub-orchestration calls', () => {
    const code = `
df.app.orchestration('parent', function*(context) {
  yield context.df.callSubOrchestrator('child', input);
  yield context.df.callActivity('DoWork', 'data');
});
`;
    const results = analyzer.analyzeFile('test.ts', code);
    expect(results).toHaveLength(1);
    expect(results[0].callsTo).toContain('child');
    expect(results[0].callsTo).toContain('DoWork');
  });

  it('should detect waitForExternalEvent', () => {
    const code = `
df.app.orchestration('approval', function*(context) {
  yield context.df.waitForExternalEvent('ApprovalEvent');
});
`;
    const results = analyzer.analyzeFile('test.ts', code);
    expect(results[0].callsTo).toContain('event:ApprovalEvent');
  });
});

describe('CSharpAnalyzer', () => {
  const analyzer = new CSharpAnalyzer();

  it('should detect orchestrator', () => {
    const code = `
[FunctionName("MyOrchestrator")]
public static async Task<List<string>> MyOrchestrator(
    [OrchestrationTrigger] IDurableOrchestrationContext context)
{
    var r1 = await context.CallActivityAsync<string>("SayHello", "Tokyo");
    return new List<string> { r1 };
}
`;
    const results = analyzer.analyzeFile('Functions.cs', code);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('MyOrchestrator');
    expect(results[0].type).toBe('orchestrator');
    expect(results[0].callsTo).toContain('SayHello');
  });

  it('should detect activity', () => {
    const code = `
[FunctionName("SayHello")]
public static string SayHello(
    [ActivityTrigger] string name,
    ILogger log)
{
    return $"Hello {name}!";
}
`;
    const results = analyzer.analyzeFile('Functions.cs', code);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('SayHello');
    expect(results[0].type).toBe('activity');
  });

  it('should detect entity', () => {
    const code = `
[FunctionName("Counter")]
public static void Counter(
    [EntityTrigger] IDurableEntityContext ctx)
{ }
`;
    const results = analyzer.analyzeFile('Functions.cs', code);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Counter');
    expect(results[0].type).toBe('entity');
  });

  it('should detect durable client', () => {
    const code = `
[FunctionName("HttpStart")]
public static async Task<HttpResponseMessage> HttpStart(
    [HttpTrigger] HttpRequestMessage req,
    [DurableClient] IDurableOrchestrationClient starter)
{
    string id = await starter.StartNewAsync("MyOrchestrator", null);
    return starter.CreateCheckStatusResponse(req, id);
}
`;
    const results = analyzer.analyzeFile('Functions.cs', code);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('durableClient');
    expect(results[0].callsTo).toContain('MyOrchestrator');
  });
});

describe('PythonAnalyzer', () => {
  const analyzer = new PythonAnalyzer();

  it('should detect v1 orchestrator', () => {
    const code = `
import azure.durable_functions as df

def orchestrator_function(context):
    result = yield context.call_activity('SayHello', 'Tokyo')
    return [result]

main = df.Orchestrator.create(orchestrator_function)
`;
    const results = analyzer.analyzeFile('MyOrch/__init__.py', code);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('orchestrator');
    expect(results[0].callsTo).toContain('SayHello');
  });

  it('should detect durable client', () => {
    const code = `
async def main(req, starter):
    client = df.DurableOrchestrationClient(starter)
    instance_id = await client.start_new('MyOrch', None, None)
`;
    const results = analyzer.analyzeFile('HttpStart/__init__.py', code);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].type).toBe('durableClient');
  });
});

describe('JavaAnalyzer', () => {
  const analyzer = new JavaAnalyzer();

  it('should detect orchestrator', () => {
    const code = `
@FunctionName("MyOrchestrator")
public List<String> myOrchestrator(
        @DurableOrchestrationTrigger(name = "ctx") TaskOrchestrationContext ctx) {
    String r = ctx.callActivity("SayHello", "Tokyo", String.class).await();
    return List.of(r);
}
`;
    const results = analyzer.analyzeFile('Functions.java', code);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('MyOrchestrator');
    expect(results[0].type).toBe('orchestrator');
    expect(results[0].callsTo).toContain('SayHello');
  });

  it('should detect activity', () => {
    const code = `
@FunctionName("SayHello")
public String sayHello(
        @DurableActivityTrigger(name = "input") String input,
        final ExecutionContext context) {
    return "Hello " + input;
}
`;
    const results = analyzer.analyzeFile('Functions.java', code);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('SayHello');
    expect(results[0].type).toBe('activity');
  });

  it('should detect HTTP starter with DurableClientInput', () => {
    const code = `
@FunctionName("HttpStart")
public HttpResponseMessage httpStart(
        @HttpTrigger(name = "req") HttpRequestMessage<Optional<String>> req,
        @DurableClientInput(name = "durableContext") DurableClientContext ctx) {
    String id = ctx.getClient().scheduleNewOrchestrationInstance("MyOrch");
    return ctx.createCheckStatusResponse(req, id);
}
`;
    const results = analyzer.analyzeFile('Functions.java', code);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('durableClient');
    expect(results[0].callsTo).toContain('MyOrch');
  });
});
