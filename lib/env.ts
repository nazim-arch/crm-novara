import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET:  z.string().min(1, "AUTH_SECRET is required"),
  UPSTASH_REDIS_REST_URL:   z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  // Meta Lead Ads integration
  META_APP_SECRET:           z.string().min(1).optional(),
  META_SYSTEM_USER_TOKEN:    z.string().min(1).optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(1).optional(),
  META_PAGE_ID:              z.string().min(1).optional(),
  META_DATASET_ID:           z.string().min(1).optional(),
  META_GRAPH_VERSION:        z.string().default("v21.0"),
});

const parsed = schema.safeParse(process.env);

// Skip during Next.js build phase — env vars are only available at runtime
if (!parsed.success && process.env.NEXT_PHASE !== "phase-production-build") {
  const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
  console.error("[startup] Missing required environment variables:", missing);
  throw new Error(`Missing required environment variables: ${missing}`);
}

if (
  parsed.success &&
  (!parsed.data.UPSTASH_REDIS_REST_URL || !parsed.data.UPSTASH_REDIS_REST_TOKEN)
) {
  console.warn("[startup] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set — rate limiting disabled");
}

export const env = (parsed.success ? parsed.data : {}) as z.infer<typeof schema>;
