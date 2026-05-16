import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET:  z.string().min(1, "AUTH_SECRET is required"),
});

const parsed = schema.safeParse(process.env);

// Skip during Next.js build phase — env vars are only available at runtime
if (!parsed.success && process.env.NEXT_PHASE !== "phase-production-build") {
  const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
  console.error("[startup] Missing required environment variables:", missing);
  throw new Error(`Missing required environment variables: ${missing}`);
}

export const env = (parsed.success ? parsed.data : {}) as z.infer<typeof schema>;
