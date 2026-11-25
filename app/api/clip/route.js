import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/auth';
import { listJobs } from '@/lib/db';
import { startJob } from '@/lib/pipeline';
import { nextFreeSlot, takenSlots } from '@/lib/slots';

export const dynamic = 'force-dynamic';

// Cut viral clips out of a video link you provide
export async function POST(req) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    let url;
    try {
      url = new URL(String(body.url || '').trim());
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch {
      return NextResponse.json({ error: 'Please paste a valid http(s) video link' }, { status: 400 });
    }
    const count = Math.min(Math.max(parseInt(body.count, 10) || 3, 1), 6);
    const scheduledAt = body.when === 'now' ? Date.now() : nextFreeSlot(takenSlots(await listJobs(200)));
    const job = await startJob({ mode: 'clip', url: url.toString(), count, scheduledAt });
    return NextResponse.json({ job });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
