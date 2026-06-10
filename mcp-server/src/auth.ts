const DEALSTACK_URL = process.env.DEALSTACK_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.DEALSTACK_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.DEALSTACK_ADMIN_PASSWORD;

let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

export async function getToken(): Promise<string> {
  // Refresh 1 hour before expiry
  if (cachedToken && Date.now() < tokenExpiresAt - 60 * 60 * 1000) {
    return cachedToken;
  }

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      "DEALSTACK_ADMIN_EMAIL and DEALSTACK_ADMIN_PASSWORD must be set in the MCP server environment."
    );
  }

  const res = await fetch(`${DEALSTACK_URL}/api/mcp/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DealStackHQ auth failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { token: string; expires_at: string };
  cachedToken = data.token;
  tokenExpiresAt = new Date(data.expires_at).getTime();

  return cachedToken;
}

export function getBaseUrl(): string {
  return DEALSTACK_URL;
}
