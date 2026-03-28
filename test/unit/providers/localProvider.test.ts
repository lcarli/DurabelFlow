import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalProvider } from '../../../src/providers/localProvider';
import { HttpClient } from '../../../src/utils/httpClient';

vi.mock('../../../src/utils/httpClient', () => {
  const MockHttpClient = vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    post: vi.fn(),
    updateBaseUrl: vi.fn(),
  }));
  return { HttpClient: MockHttpClient };
});

describe('LocalProvider', () => {
  let provider: LocalProvider;
  let mockHttp: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    updateBaseUrl: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new LocalProvider(7071);
    mockHttp = (HttpClient as unknown as ReturnType<typeof vi.fn>).mock.results[0].value;
  });

  describe('isHostRunning', () => {
    it('should return true when host is reachable', async () => {
      mockHttp.get.mockResolvedValue({ statusCode: 200 });

      const result = await provider.isHostRunning();

      expect(result).toBe(true);
    });

    it('should return false when host is unreachable', async () => {
      mockHttp.get.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await provider.isHostRunning();

      expect(result).toBe(false);
    });
  });

  describe('listFunctions', () => {
    it('should return classified functions', async () => {
      mockHttp.get.mockResolvedValue({
        statusCode: 200,
        body: [
          {
            name: 'MyOrchestrator',
            config: {
              bindings: [{ type: 'orchestrationTrigger', direction: 'in', name: 'context' }],
            },
          },
          {
            name: 'MyActivity',
            config: {
              bindings: [{ type: 'activityTrigger', direction: 'in', name: 'input' }],
            },
          },
          {
            name: 'HttpStart',
            config: {
              bindings: [{ type: 'httpTrigger', direction: 'in', name: 'req' }],
            },
          },
        ],
      });

      const result = await provider.listFunctions();

      expect(result).toHaveLength(3);
      expect(result[0].type).toBe('orchestrator');
      expect(result[1].type).toBe('activity');
      expect(result[2].type).toBe('httpTrigger');
    });

    it('should return empty array on error', async () => {
      mockHttp.get.mockRejectedValue(new Error('connection refused'));

      const result = await provider.listFunctions();

      expect(result).toEqual([]);
    });
  });

  describe('triggerHttpFunction', () => {
    it('should trigger GET request', async () => {
      mockHttp.get.mockResolvedValue({ statusCode: 200, body: { result: 'ok' } });

      const result = await provider.triggerHttpFunction('MyFunc', 'GET');

      expect(result.statusCode).toBe(200);
      expect(mockHttp.get).toHaveBeenCalledWith('/api/MyFunc', undefined);
    });

    it('should trigger POST request with body', async () => {
      mockHttp.post.mockResolvedValue({ statusCode: 200, body: { created: true } });

      const result = await provider.triggerHttpFunction('MyFunc', 'POST', { data: 'test' });

      expect(result.statusCode).toBe(200);
      expect(mockHttp.post).toHaveBeenCalledWith('/api/MyFunc', { data: 'test' }, undefined);
    });
  });

  describe('getBaseUrl', () => {
    it('should return correct URL', () => {
      expect(provider.getBaseUrl()).toBe('http://localhost:7071');
    });
  });

  describe('updatePort', () => {
    it('should update port and base URL', () => {
      provider.updatePort(8080);

      expect(provider.getBaseUrl()).toBe('http://localhost:8080');
      expect(mockHttp.updateBaseUrl).toHaveBeenCalledWith('http://localhost:8080');
    });
  });
});
