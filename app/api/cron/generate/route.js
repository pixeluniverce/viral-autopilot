import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/auth';
import { listJobs } from '@/lib/db';
import { startJob } from '@/lib/pipeline';
import { upcomingSlots, takenSlots } from '@/lib/slots';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Makes sure every upcoming posting slot (next PLAN_DAYS days) has a video queued.
async function handle(req) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const taken = takenSlots(await listJobs(300));
    const missing = upcomingSlots(Number(process.env.PLAN_DAYS || 2)).filter((s) => !taken.has(s));
    const created = [];
    for (const slot of missing.slice(0, 6)) {
      const job = await startJob({ mode: 'auto', scheduledAt: slot });
      created.push({ id: job.id, status: job.status, slot });
    }
    return NextResponse.json({ missing: missing.length, created });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
export const GET = handle;
export const POST = handle;
