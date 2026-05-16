import { z } from "zod";

const schema = z.object({
  DATABASE_URL:    z.string().min(1, "DATABASE_URL is required"),
  NEXTAUTH_SECRET: z.string().min(1, "NEXTAUTH_SECRET is required"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
  console.error("[startup] Missing required environment variables:", missing);
  throw new Error(`Missing required environment variables: ${missing}`);
}

export const env = parsed.data;
