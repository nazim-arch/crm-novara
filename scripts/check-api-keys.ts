import { prisma } from "../lib/prisma";

async function main() {
  const settings = await prisma.ir_settings.findMany({
    where: { category: 'api_keys' },
    orderBy: { key: 'asc' },
  });

  console.log(`\nStored API keys (${settings.length} total):\n`);
  for (const s of settings) {
    const preview = s.value?.length > 4 ? `***${s.value.slice(-4)}` : s.value ? '(set, short)' : '(empty)';
    console.log(`  ${s.key.padEnd(35)} = ${preview}`);
  }

  if (settings.length === 0) {
    console.log('  ⚠️  No API keys found in ir_settings table!');
    console.log('  → Go to IntentRadar → Settings and save your keys.');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
