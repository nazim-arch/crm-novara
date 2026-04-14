// app/api/intentradar/settings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/intentradar/db';

// GET all settings
export async function GET() {
  try {
    const settings = await prisma.ir_settings.findMany({
      orderBy: { category: 'asc' },
    });

    // Mask API key values for security (show only last 4 chars)
    const masked = settings.map(s => ({
      ...s,
      value: s.encrypted ? `***${s.value.slice(-4)}` : s.value,
      hasValue: s.value.length > 0,
    }));

    return NextResponse.json({ settings: masked });
  } catch (error) {
    console.error('Settings GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

// POST - save settings
export async function POST(req: NextRequest) {
  try {
    const { settings } = await req.json();

    // settings is an array of { key, value, category, encrypted }
    const results = [];
    for (const setting of settings) {
      // Don't update if value is masked (hasn't changed)
      if (setting.value?.startsWith('***')) continue;

      const result = await prisma.ir_settings.upsert({
        where: { key: setting.key },
        update: {
          value: setting.value || '',
          category: setting.category || 'general',
          encrypted: setting.encrypted ?? false,
          updatedAt: new Date(),
        },
        create: {
          key: setting.key,
          value: setting.value || '',
          category: setting.category || 'general',
          encrypted: setting.encrypted ?? false,
        },
      });
      results.push(result);
    }

    return NextResponse.json({ success: true, count: results.length });
  } catch (error) {
    console.error('Settings POST error:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
