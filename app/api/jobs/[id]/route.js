import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/auth';
import { getJob, saveJob, deleteJob, listJobs } from '@/lib/db';
import { publishJob } from '@/lib/pipeline';
import { dispatchRender } from '@/lib/github';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req, { params }) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { action } = await req.json().catch(() => ({}));
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  try {
    if (action === 'delete') {
      await deleteJob(id);
      return NextResponse.json({ ok: true });
    }

    if (action === 'retry') {
      job.error = null;
      job.attempts = 0;
      if (job.videoUrl) {
        job.status = 'ready';
        job.scheduledAt = Date.now();
      } else {
        const recent = (await listJobs(15)).map((j) => j.title || j.topic).filter(Boolean).join(' | ');
        await dispatchRender(job, recent);
        job.status = 'rendering';
        job.createdAt = Date.now();
      }
      await saveJob(job);
      return NextResponse.json({ job });
    }

    if (action === 'publish-now') {
      if (!job.videoUrl) return NextResponse.json({ error: 'Video is not rendered yet' }, { status: 400 });
      const done = await publishJob(job);
      return NextResponse.json({ job: done });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
