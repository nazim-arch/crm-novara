import { getToken, getBaseUrl } from "./auth.js";

async function request(method: string, path: string, body?: unknown, params?: Record<string, string>): Promise<unknown> {
  const token = await getToken();
  const url = new URL(`${getBaseUrl()}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(`API ${method} ${path} failed (${res.status}): ${err.error ?? res.statusText}`);
  }

  return res.json();
}

export const api = {
  get: (path: string, params?: Record<string, string>) => request("GET", path, undefined, params),
  post: (path: string, body: unknown) => request("POST", path, body),
  patch: (path: string, body: unknown) => request("PATCH", path, body),
};
