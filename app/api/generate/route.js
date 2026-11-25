import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/auth';
import { listJobs } from '@/lib/db';
import { startJob } from '@/lib/pipeline';
import { nextFreeSlot, takenSlots } from '@/lib/slots';

export const dynamic = 'force-dynamic';

// Create one AI video (auto topic or your own topic)
export async function POST(req) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { topic = '', when = 'slot' } = await req.json().catch(() => ({}));
    const scheduledAt = when === 'now' ? Date.now() : nextFreeSlot(takenSlots(await listJobs(200)));
    const job = await startJob({ mode: 'auto', topic: String(topic).slice(0, 300), scheduledAt });
    return NextResponse.json({ job });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
