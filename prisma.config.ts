import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7: URL for migrations uses DIRECT_URL (non-pooled) for Neon
// Runtime queries use the adapter in lib/prisma.ts
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
