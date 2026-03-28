export type FunctionType = 'orchestrator' | 'activity' | 'entity' | 'httpTrigger' | 'durableClient' | 'other';

export interface AzureFunction {
  name: string;
  type: FunctionType;
  language?: string;
  filePath?: string;
  bindings?: FunctionBinding[];
}

export interface FunctionBinding {
  type: string;
  direction: 'in' | 'out' | 'inout';
  name: string;
}

export interface FunctionListResponse {
  name: string;
  config?: {
    bindings?: FunctionBinding[];
  };
  invoke_url_template?: string;
  language?: string;
}

export function classifyFunctionType(bindings: FunctionBinding[]): FunctionType {
  for (const binding of bindings) {
    const type = binding.type.toLowerCase();
    if (type === 'orchestrationtrigger') return 'orchestrator';
    if (type === 'activitytrigger') return 'activity';
    if (type === 'entitytrigger') return 'entity';
    if (type === 'httptrigger') return 'httpTrigger';
    if (type === 'durableclient' || type === 'orchestrationclient') return 'durableClient';
  }
  return 'other';
}
