import { NextResponse } from 'next/server';
import { refreshAnalyticsCache } from '@/lib/analytics';

export async function GET(request: Request) {
  // 1. Verify Vercel Cron Secret (Security)
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await refreshAnalyticsCache();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
