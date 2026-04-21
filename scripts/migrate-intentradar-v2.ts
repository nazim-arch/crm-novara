// scripts/migrate-intentradar-v2.ts
// One-time production migration for IntentRadar v2 hardening.
// Run once after deploying the schema changes:
//   npx tsx --env-file=.env scripts/migrate-intentradar-v2.ts
//
// What this does:
//   1. Re-encrypts any existing plaintext API keys in ir_settings
//   2. Backfills leadOriginType on existing ir_lead rows
//   3. Backfills firstSeenAt/lastSeenAt/freshnessScore on existing ir_lead rows
//   4. Sets dedupeDecision = 'distinct' on existing leads with no value

import { prisma } from '../lib/prisma';
import { encrypt, isEncrypted } from '../lib/intentradar/crypto';
import { computeFreshnessScore } from '../lib/intentradar/freshness';

async function main() {
  console.log('\n[migrate-intentradar-v2] Starting...\n');

  // ─── 1. Re-encrypt plaintext API keys ───────────────────────────────────────
  const settings = await prisma.ir_settings.findMany({
    where: { category: 'api_keys' },
  });

  let encryptedCount = 0;
  let skippedCount = 0;

  for (const s of settings) {
    if (!s.value || s.value.trim() === '') { skippedCount++; continue; }
    if (isEncrypted(s.value)) { skippedCount++; continue; } // already encrypted

    const encrypted = encrypt(s.value);
    await prisma.ir_settings.update({
      where: { id: s.id },
      data: { value: encrypted, encrypted: true },
    });
    encryptedCount++;
    console.log(`  ✓ Encrypted key: ${s.key}`);
  }

  console.log(`\nAPI keys: ${encryptedCount} encrypted, ${skippedCount} skipped (empty or already encrypted)`);

  // ─── 2. Backfill ir_lead production fields ───────────────────────────────────
  const leads = await prisma.ir_lead.findMany({
    select: { id: true, sourcePlatform: true, sourceType: true, createdAt: true, firstSeenAt: true, dedupeDecision: true },
  });

  let backfilled = 0;

  for (const lead of leads) {
    const isSynthetic =
      lead.sourcePlatform === 'openai_generate' ||
      lead.sourcePlatform === 'openai_generated' ||
      lead.sourceType === 'ai_generated';

    const freshness = computeFreshnessScore(lead.createdAt);

    await prisma.ir_lead.update({
      where: { id: lead.id },
      data: {
        leadOriginType: isSynthetic ? 'synthetic' : 'real',
        firstSeenAt: lead.firstSeenAt ?? lead.createdAt,
        lastSeenAt: lead.createdAt,
        freshnessScore: freshness,
        dedupeDecision: lead.dedupeDecision ?? 'distinct',
      },
    });
    backfilled++;
  }

  console.log(`\nLeads backfilled: ${backfilled}`);

  // ─── Summary ─────────────────────────────────────────────────────────────────
  const realCount = await prisma.ir_lead.count({ where: { leadOriginType: 'real' } });
  const syntheticCount = await prisma.ir_lead.count({ where: { leadOriginType: 'synthetic' } });

  console.log(`\nFinal lead counts:`);
  console.log(`  Real:      ${realCount}`);
  console.log(`  Synthetic: ${syntheticCount}`);
  console.log('\n[migrate-intentradar-v2] Done.\n');
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
