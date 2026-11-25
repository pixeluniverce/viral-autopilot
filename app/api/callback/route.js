import { NextResponse } from 'next/server';
import { isWorker } from '@/lib/auth';
import { getJob, saveJob, listJobs, newId } from '@/lib/db';
import { nextFreeSlot, takenSlots } from '@/lib/slots';
import { activeTargets } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

// The GitHub Actions worker calls this when a render finishes (or fails).
export async function POST(req) {
  if (!isWorker(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { jobId, ok, results = [], error } = await req.json();
  const job = await getJob(jobId);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  if (!ok || !results.length) {
    job.status = 'failed';
    job.error = String(error || 'Worker returned no video').slice(0, 500);
    await saveJob(job);
    return NextResponse.json({ ok: true });
  }

  const apply = (j, r) => {
    j.videoUrl = r.videoUrl;
    j.title = r.title;
    j.description = r.description;
    j.hashtags = r.hashtags || [];
    j.duration = r.duration;
    j.status = 'ready';
    j.error = null;
  };

  apply(job, results[0]);
  if (!job.scheduledAt) job.scheduledAt = Date.now();
  await saveJob(job);

  // Clip mode can return several clips: queue the extras into the next free slots.
  if (results.length > 1) {
    const taken = takenSlots(await listJobs(200));
    for (const r of results.slice(1)) {
      const slot = nextFreeSlot(taken);
      taken.add(slot);
      const extra = {
        id: newId(),
        mode: job.mode,
        url: job.url,
        status: 'ready',
        scheduledAt: slot,
        targets: activeTargets(),
        published: {},
        attempts: 0,
        createdAt: Date.now(),
      };
      apply(extra, r);
      await saveJob(extra);
    }
  }
  return NextResponse.json({ ok: true });
}
