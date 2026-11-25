import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/auth';
import { listJobs } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ jobs: await listJobs(100) });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
