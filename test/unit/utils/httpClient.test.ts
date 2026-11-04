import { describe, it, expect, afterEach } from 'vitest';
import * as http from 'http';
import { AddressInfo } from 'net';
import { HttpClient } from '../../../src/utils/httpClient';

describe('HttpClient', () => {
  let server: http.Server | undefined;

  afterEach(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server!.close(resolve));
      server = undefined;
    }
  });

  async function listen(handler: http.RequestListener): Promise<string> {
    server = http.createServer(handler);
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  }

  it('parses JSON responses', async () => {
    const url = await listen((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    });

    const response = await new HttpClient(url).get<{ ok: boolean }>('/x');

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it('rejects when the server does not answer within the timeout', async () => {
    const url = await listen(() => {
      /* never respond */
    });

    await expect(new HttpClient(url, {}, { timeoutMs: 50 }).get('/slow')).rejects.toMatchObject({
      code: 'ETIMEDOUT',
    });
  });

  it('rejects when the response exceeds the size limit', async () => {
    const url = await listen((_req, res) => {
      res.end('x'.repeat(10_000));
    });

    await expect(
      new HttpClient(url, {}, { maxResponseBytes: 100 }).get('/big'),
    ).rejects.toThrow(/exceeded/);
  });
});
