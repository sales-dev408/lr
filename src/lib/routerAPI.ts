// src/lib/routerApi.ts
const normalize = (p: string) => p.replace(/^\/+/, ""); // remove leading /

function getBaseUrl(): string {
  // Example: VITE_API_BASE_URL should be like:
  // https://<project>.supabase.co/functions/v1/router
  return import.meta.env.VITE_API_BASE_URL as string;
}

type RouterRequest = {
  path: string; // e.g. "auth/admin/login"
  body?: unknown;
  method?: "POST" | "GET" | "PUT" | "PATCH" | "DELETE";
};

export async function routerRequest<T = unknown>(
  req: RouterRequest
): Promise<T> {
  const base = getBaseUrl();

  // If someone set VITE_API_BASE_URL to ".../functions/v1/router",
  // we should call it directly (no extra path segments).
  // If they set it to ".../functions/v1", we add "/router".
  const routerUrl = (() => {
    const hasRouter = /\/functions\/v1\/router\/?$/i.test(base) || /\/router\/?$/i.test(base);
    if (hasRouter) return base.replace(/\/+$/, "");
    return `${base.replace(/\/+$/, "")}/router`;
  })();

  const payload: RouterRequest = {
    path: normalize(req.path),
    method: req.method ?? "POST",
    body: req.body,
  };

  const res = await fetch(routerUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // The router function might validate auth; if you use user JWT, add it here.
      // "authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Router request failed: ${res.status} ${res.statusText} ${text}`);
  }

  // If your router returns JSON:
  return (await res.json()) as T;
}
