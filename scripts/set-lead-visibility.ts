/**
 * Fix #5 — flip the `lead_visibility_v2` rollback flag on/off, or report its current state.
 *
 * The whole lead-visibility rule is dormant until this SystemSetting is "true". There is no admin
 * UI for it by design (break-glass rollback switch). Enabling hides Lost/Invalid/Recycled leads and
 * leads on non-Active opportunities from every restricted role (everyone except Admin / a role with
 * lead:view_hidden). Reversible: run with `off`.
 *
 * Usage (targets whatever DATABASE_URL points to — set it inline to hit a specific Neon branch):
 *   npx tsx scripts/set-lead-visibility.ts status
 *   npx tsx scripts/set-lead-visibility.ts on
 *   npx tsx scripts/set-lead-visibility.ts off
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });

const KEY = "lead_visibility_v2";

async function main() {
  const arg = (process.argv[2] ?? "status").toLowerCase();
  console.log("host:", new URL(process.env.DATABASE_URL!).host);

  const current = await prisma.systemSetting.findUnique({ where: { key: KEY } });
  console.log(`current ${KEY}:`, current?.value ?? "(unset → disabled)");

  if (arg === "status") return;

  if (arg !== "on" && arg !== "off") {
    console.error(`Unknown argument "${arg}". Use: status | on | off`);
    process.exitCode = 1;
    return;
  }

  const value = arg === "on" ? "true" : "false";
  await prisma.systemSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value },
    update: { value },
  });
  console.log(`set ${KEY} = ${value}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
