import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/auth';
import { listJobs, saveJob } from '@/lib/db';
import { publishJob } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Publishes every ready video whose scheduled time has arrived.
async function handle(req) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const jobs = await listJobs(200);
    const now = Date.now();

    for (const j of jobs) {
      if (j.status === 'rendering' && now - j.createdAt > 90 * 60000) {
        j.status = 'failed';
        j.error = 'Render timed out (check the GitHub Actions run)';
        await saveJob(j);
      } else if (j.status === 'publishing' && now - (j.updatedAt || 0) > 15 * 60000) {
        j.status = 'ready';
        await saveJob(j);
      }
    }

    const due = jobs
      .filter((j) => j.status === 'ready' && j.videoUrl && (j.scheduledAt || 0) <= now)
      .sort((a, b) => a.scheduledAt - b.scheduledAt);

    const started = Date.now();
    const processed = [];
    for (const j of due) {
      if (Date.now() - started > 150000) break;
      const done = await publishJob(j);
      processed.push({ id: done.id, status: done.status, error: done.error || null });
    }
    return NextResponse.json({ checked: jobs.length, due: due.length, processed });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
export const GET = handle;
export const POST = handle;
