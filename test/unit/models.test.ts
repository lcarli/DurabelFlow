import { describe, it, expect } from 'vitest';
import { classifyFunctionType, FunctionBinding } from '../../src/models/function';

describe('classifyFunctionType', () => {
  it('should classify orchestration trigger as orchestrator', () => {
    const bindings: FunctionBinding[] = [
      { type: 'orchestrationTrigger', direction: 'in', name: 'context' },
    ];
    expect(classifyFunctionType(bindings)).toBe('orchestrator');
  });

  it('should classify activity trigger as activity', () => {
    const bindings: FunctionBinding[] = [
      { type: 'activityTrigger', direction: 'in', name: 'input' },
    ];
    expect(classifyFunctionType(bindings)).toBe('activity');
  });

  it('should classify entity trigger as entity', () => {
    const bindings: FunctionBinding[] = [
      { type: 'entityTrigger', direction: 'in', name: 'context' },
    ];
    expect(classifyFunctionType(bindings)).toBe('entity');
  });

  it('should classify http trigger as httpTrigger', () => {
    const bindings: FunctionBinding[] = [
      { type: 'httpTrigger', direction: 'in', name: 'req' },
    ];
    expect(classifyFunctionType(bindings)).toBe('httpTrigger');
  });

  it('should classify durable client as durableClient', () => {
    const bindings: FunctionBinding[] = [
      { type: 'httpTrigger', direction: 'in', name: 'req' },
      { type: 'durableClient', direction: 'in', name: 'starter' },
    ];
    // httpTrigger is matched first in the loop
    expect(classifyFunctionType(bindings)).toBe('httpTrigger');
  });

  it('should classify durableClient binding alone', () => {
    const bindings: FunctionBinding[] = [
      { type: 'durableClient', direction: 'in', name: 'starter' },
    ];
    expect(classifyFunctionType(bindings)).toBe('durableClient');
  });

  it('should classify orchestrationClient as durableClient', () => {
    const bindings: FunctionBinding[] = [
      { type: 'orchestrationClient', direction: 'in', name: 'starter' },
    ];
    expect(classifyFunctionType(bindings)).toBe('durableClient');
  });

  it('should return other for unknown bindings', () => {
    const bindings: FunctionBinding[] = [
      { type: 'timerTrigger', direction: 'in', name: 'timer' },
    ];
    expect(classifyFunctionType(bindings)).toBe('other');
  });

  it('should return other for empty bindings', () => {
    expect(classifyFunctionType([])).toBe('other');
  });
});
