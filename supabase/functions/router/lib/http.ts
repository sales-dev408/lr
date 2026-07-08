export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export function json(body: JsonValue, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function errorResponse(message: string, status = 400): Response {
  return json({ error: message }, { status });
}

export async function readJson<T>(request: Request, fallback: T): Promise<T> {
  const text = await request.text();
  if (!text) {
    return fallback;
  }
  return JSON.parse(text) as T;
}

export function getQueryParam(url: URL, key: string): string {
  return url.searchParams.get(key) ?? '';
}

export function corsHeaders(origin?: string | null): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  };
}
