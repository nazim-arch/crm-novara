// app/api/intentradar/settings/route.ts
// SECURITY: This route handles sensitive API keys.
//   GET  — returns settings with values masked; hasValue flag only. Never exposes plaintext.
//   POST — encrypts any new non-masked value before persisting. Skips masked values (unchanged).
// Decryption happens only in server-side service code (lib/intentradar/db.ts getApiKey).
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/intentradar/db';
import { encrypt, isEncrypted } from '@/lib/intentradar/crypto';

// GET all settings — values are masked, never decrypted here
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'Admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const settings = await prisma.ir_settings.findMany({
      orderBy: { category: 'asc' },
    });

    // Return only metadata + masked hint — never the raw (encrypted or plaintext) value
    const masked = settings.map(s => ({
      key: s.key,
      category: s.category,
      encrypted: s.encrypted,
      hasValue: s.value.length > 0,
      // Show last 4 chars of the encrypted blob as a visual confirmation hint only
      value: s.value.length > 0 ? `***${s.value.slice(-4)}` : '',
    }));

    return NextResponse.json({ settings: masked });
  } catch (error) {
    console.error('Settings GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

// POST — encrypt sensitive values before persisting
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'Admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { settings } = await req.json();
    if (!Array.isArray(settings)) {
      return NextResponse.json({ error: 'settings must be an array' }, { status: 400 });
    }

    const results = [];
    for (const setting of settings) {
      // Skip masked values — user did not change this key
      if (!setting.value || setting.value.startsWith('***')) continue;

      const rawValue: string = setting.value.trim();
      const isApiKey = setting.encrypted === true || setting.category === 'api_keys';

      // Encrypt sensitive values; skip encryption for already-encrypted or empty values
      let storedValue = rawValue;
      if (isApiKey && rawValue.length > 0 && !isEncrypted(rawValue)) {
        storedValue = encrypt(rawValue);
      }

      const result = await prisma.ir_settings.upsert({
        where: { key: setting.key },
        update: {
          value: storedValue,
          category: setting.category || 'general',
          encrypted: isApiKey,
          updatedAt: new Date(),
        },
        create: {
          key: setting.key,
          value: storedValue,
          category: setting.category || 'general',
          encrypted: isApiKey,
        },
      });
      results.push(result.key);
    }

    return NextResponse.json({ success: true, updated: results });
  } catch (error) {
    console.error('Settings POST error:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
