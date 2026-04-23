import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import {
  BadGatewayException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

@Injectable()
export class DownstreamHttpService {
  async get<T>(baseUrl: string, path: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(baseUrl, path, 'GET', undefined, headers);
  }

  async post<T>(
    baseUrl: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T> {
    return this.request<T>(baseUrl, path, 'POST', body, headers);
  }

  async put<T>(
    baseUrl: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T> {
    return this.request<T>(baseUrl, path, 'PUT', body, headers);
  }

  private async request<T>(
    baseUrl: string,
    path: string,
    method: 'GET' | 'POST' | 'PUT',
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<T> {
    const url = new URL(this.joinUrl(baseUrl, path));
    const payload = body === undefined ? undefined : JSON.stringify(body);

    return new Promise<T>((resolve, reject) => {
      const requestImpl = url.protocol === 'https:' ? httpsRequest : httpRequest;
      const request = requestImpl(
        url,
        {
          method,
          headers: {
            accept: 'application/json',
            ...(payload
              ? {
                  'content-type': 'application/json',
                  'content-length': Buffer.byteLength(payload).toString(),
                }
              : {}),
            ...headers,
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          response.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            const parsed = this.parsePayload(text);
            const statusCode = response.statusCode ?? 502;

            if (statusCode < 200 || statusCode >= 300) {
              reject(this.toHttpException(statusCode, parsed));
              return;
            }

            resolve(parsed as T);
          });
        },
      );

      request.setTimeout(4000, () => {
        request.destroy(new Error(`Request to ${url.toString()} timed out.`));
      });
      request.on('error', (error) => {
        reject(
          new BadGatewayException({
            message: `Downstream request to ${url.toString()} failed.`,
            error: error.message,
          }),
        );
      });

      if (payload) {
        request.write(payload);
      }

      request.end();
    });
  }

  private joinUrl(baseUrl: string, path: string): string {
    const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${normalizedBaseUrl}${normalizedPath}`;
  }

  private parsePayload(text: string): unknown {
    const trimmed = text.trim();
    if (!trimmed) {
      return null;
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      return { message: trimmed };
    }
  }

  private toHttpException(statusCode: number, payload: unknown): HttpException {
    const responseBody =
      payload && typeof payload === 'object'
        ? payload
        : { message: `Downstream request failed with status ${statusCode}.` };

    if (statusCode === 503) {
      return new ServiceUnavailableException(responseBody);
    }

    return new HttpException(responseBody, statusCode);
  }
}
