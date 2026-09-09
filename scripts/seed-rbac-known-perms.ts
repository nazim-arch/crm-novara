/**
 * Fix #5 §6.3 — seed the `rbac_known_perms` SystemSetting so `withNewDefaults` decides "new"
 * from an explicit list instead of "granted to no role" (which silently self-restored a revoked
 * guarded permission).
 *
 * Idempotent. Run once at the Fix #5 deploy, AFTER `prisma migrate deploy`:
 *   npx tsx scripts/seed-rbac-known-perms.ts
 *
 * Does two things:
 *  1. Ensures Admin holds the guarded permissions in the STORED rbac config (so they don't vanish
 *     once every permission counts as "known" and withNewDefaults stops back-filling them).
 *  2. Sets rbac_known_perms = ALL_PERMISSIONS (only if absent — never clobbers a later, richer list).
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { ALL_PERMISSIONS, GUARDED_PERMISSIONS, DEFAULT_PERMS, type Permission } from "../lib/rbac-constants";

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  console.log("host:", new URL(process.env.DATABASE_URL!).host);

  // 1. Persist Admin's guarded grants into the stored config (if a stored config exists).
  const rbacRow = await prisma.systemSetting.findUnique({ where: { key: "rbac" } });
  if (rbacRow?.value) {
    const cfg = JSON.parse(rbacRow.value) as Record<string, Permission[]>;
    const admin = new Set(cfg.Admin ?? []);
    let changed = false;
    for (const p of GUARDED_PERMISSIONS) {
      if (DEFAULT_PERMS.Admin.includes(p) && !admin.has(p)) { admin.add(p); changed = true; }
    }
    if (changed) {
      cfg.Admin = [...admin];
      await prisma.systemSetting.update({ where: { key: "rbac" }, data: { value: JSON.stringify(cfg) } });
      console.log("Added guarded permissions to Admin in stored rbac config.");
    } else {
      console.log("Stored rbac config already grants Admin the guarded permissions (or none to add).");
    }
  } else {
    console.log("No stored rbac config — DEFAULT_PERMS (Admin has guarded) is in effect. Nothing to patch.");
  }

  // 2. Seed rbac_known_perms only if absent.
  const known = await prisma.systemSetting.findUnique({ where: { key: "rbac_known_perms" } });
  if (known) {
    console.log("rbac_known_perms already present — left as-is.");
  } else {
    await prisma.systemSetting.create({ data: { key: "rbac_known_perms", value: JSON.stringify(ALL_PERMISSIONS) } });
    console.log(`Seeded rbac_known_perms with ${ALL_PERMISSIONS.length} permissions.`);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
