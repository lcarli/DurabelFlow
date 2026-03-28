import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DurableApiClient } from '../../../src/providers/durableApiClient';
import { HttpClient } from '../../../src/utils/httpClient';

// Mock HttpClient
vi.mock('../../../src/utils/httpClient', () => {
  const MockHttpClient = vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    updateBaseUrl: vi.fn(),
  }));
  return { HttpClient: MockHttpClient };
});

describe('DurableApiClient', () => {
  let client: DurableApiClient;
  let mockHttp: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    updateBaseUrl: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    client = new DurableApiClient(7071, '');
    // Access the internal http client mock
    mockHttp = (HttpClient as unknown as ReturnType<typeof vi.fn>).mock.results[0].value;
  });

  describe('startOrchestration', () => {
    it('should start orchestration and return instance info', async () => {
      const mockResponse = {
        statusCode: 202,
        body: { instanceId: 'test-123', name: 'MyOrchestrator', runtimeStatus: 'Running' },
      };
      mockHttp.post.mockResolvedValue(mockResponse);

      const result = await client.startOrchestration('MyOrchestrator', { key: 'value' });

      expect(result).toEqual(mockResponse.body);
      expect(mockHttp.post).toHaveBeenCalledWith(
        expect.stringContaining('/orchestrators/MyOrchestrator'),
        { key: 'value' },
      );
    });

    it('should include instance ID in path when provided', async () => {
      mockHttp.post.mockResolvedValue({ statusCode: 202, body: {} });

      await client.startOrchestration('MyOrch', null, 'custom-id');

      expect(mockHttp.post).toHaveBeenCalledWith(
        expect.stringContaining('/orchestrators/MyOrch/custom-id'),
        null,
      );
    });

    it('should return null on failure', async () => {
      mockHttp.post.mockResolvedValue({ statusCode: 500, body: 'error' });

      const result = await client.startOrchestration('MyOrch');

      expect(result).toBeNull();
    });
  });

  describe('getInstanceStatus', () => {
    it('should return instance status', async () => {
      const instance = {
        instanceId: 'test-123',
        name: 'MyOrch',
        runtimeStatus: 'Completed',
      };
      mockHttp.get.mockResolvedValue({ statusCode: 200, body: instance });

      const result = await client.getInstanceStatus('test-123');

      expect(result).toEqual(instance);
    });

    it('should return null for 404', async () => {
      mockHttp.get.mockResolvedValue({ statusCode: 404, body: null });

      const result = await client.getInstanceStatus('nonexistent');

      expect(result).toBeNull();
    });

    it('should include history params when requested', async () => {
      mockHttp.get.mockResolvedValue({ statusCode: 200, body: {} });

      await client.getInstanceStatus('test-123', true, true);

      expect(mockHttp.get).toHaveBeenCalledWith(
        expect.stringContaining('showHistory=true'),
      );
      expect(mockHttp.get).toHaveBeenCalledWith(
        expect.stringContaining('showHistoryOutput=true'),
      );
    });
  });

  describe('terminateInstance', () => {
    it('should terminate and return true on 202', async () => {
      mockHttp.post.mockResolvedValue({ statusCode: 202, body: null });

      const result = await client.terminateInstance('test-123', 'test reason');

      expect(result).toBe(true);
      expect(mockHttp.post).toHaveBeenCalledWith(
        expect.stringContaining('/instances/test-123/terminate'),
      );
    });

    it('should return false on failure', async () => {
      mockHttp.post.mockResolvedValue({ statusCode: 404, body: null });

      const result = await client.terminateInstance('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('raiseEvent', () => {
    it('should raise event and return true on 202', async () => {
      mockHttp.post.mockResolvedValue({ statusCode: 202, body: null });

      const result = await client.raiseEvent('test-123', 'Approval', { approved: true });

      expect(result).toBe(true);
      expect(mockHttp.post).toHaveBeenCalledWith(
        expect.stringContaining('/instances/test-123/raiseEvent/Approval'),
        { approved: true },
      );
    });
  });

  describe('purgeInstance', () => {
    it('should purge and return true on 200', async () => {
      mockHttp.delete.mockResolvedValue({ statusCode: 200, body: { instancesDeleted: 1 } });

      const result = await client.purgeInstance('test-123');

      expect(result).toBe(true);
    });
  });

  describe('listInstances', () => {
    it('should return instances list', async () => {
      const instances = [
        { instanceId: 'a', name: 'Orch1', runtimeStatus: 'Running' },
        { instanceId: 'b', name: 'Orch2', runtimeStatus: 'Completed' },
      ];
      mockHttp.get.mockResolvedValue({ statusCode: 200, body: instances });

      const result = await client.listInstances({ top: 10 });

      expect(result).toHaveLength(2);
    });

    it('should filter by runtime status', async () => {
      mockHttp.get.mockResolvedValue({ statusCode: 200, body: [] });

      await client.listInstances({ runtimeStatus: ['Running', 'Failed'] });

      expect(mockHttp.get).toHaveBeenCalledWith(
        expect.stringContaining('runtimeStatus=Running%2CFailed'),
      );
    });

    it('should return empty array on error', async () => {
      mockHttp.get.mockRejectedValue(new Error('network error'));

      const result = await client.listInstances();

      expect(result).toEqual([]);
    });
  });

  describe('task hub support', () => {
    it('should include taskHub param when configured', () => {
      const hubClient = new DurableApiClient(7071, 'MyHub');
      mockHttp = (HttpClient as unknown as ReturnType<typeof vi.fn>).mock.results[1].value;
      mockHttp.post.mockResolvedValue({ statusCode: 202, body: {} });

      hubClient.startOrchestration('MyOrch');

      expect(mockHttp.post).toHaveBeenCalledWith(
        expect.stringContaining('taskHub=MyHub'),
        undefined,
      );
    });
  });
});
