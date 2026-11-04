import * as http from 'http';
import * as https from 'https';

export interface HttpResponse<T = unknown> {
  statusCode: number;
  body: T;
  headers: Record<string, string | string[] | undefined>;
}

export interface HttpClientOptions {
  timeoutMs?: number;
  maxResponseBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 50 * 1024 * 1024;

export class HttpClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private timeoutMs: number;
  private maxResponseBytes: number;

  constructor(
    baseUrl: string,
    headers: Record<string, string> = {},
    options: HttpClientOptions = {},
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...headers,
    };
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  }

  updateBaseUrl(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async get<T>(path: string, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>('GET', path, undefined, headers);
  }

  async post<T>(
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<HttpResponse<T>> {
    return this.request<T>('POST', path, body, headers);
  }

  async delete<T>(path: string, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>('DELETE', path, undefined, headers);
  }

  private request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<HttpResponse<T>> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const options: http.RequestOptions = {
        method,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: { ...this.defaultHeaders, ...extraHeaders },
      };

      const req = lib.request(options, (res) => {
        const chunks: Buffer[] = [];
        let received = 0;
        let overflowed = false;
        res.on('data', (chunk: Buffer) => {
          if (overflowed) return;
          received += chunk.length;
          if (received > this.maxResponseBytes) {
            overflowed = true;
            const error = new Error(`Response exceeded ${this.maxResponseBytes} bytes`);
            req.destroy(error);
            reject(error);
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          if (overflowed) return;
          const raw = Buffer.concat(chunks).toString('utf-8');
          let parsed: T;
          try {
            parsed = JSON.parse(raw) as T;
          } catch {
            parsed = raw as unknown as T;
          }
          resolve({
            statusCode: res.statusCode ?? 0,
            body: parsed,
            headers: res.headers as Record<string, string | string[] | undefined>,
          });
        });
      });

      req.setTimeout(this.timeoutMs, () => {
        req.destroy(Object.assign(new Error(`Request timed out after ${this.timeoutMs}ms`), { code: 'ETIMEDOUT' }));
      });
      req.on('error', reject);

      if (body !== undefined) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }
}
