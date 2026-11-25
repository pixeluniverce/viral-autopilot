import { del } from '@vercel/blob';
import { saveJob, listJobs, newId } from './db.js';
import { dispatchRender } from './github.js';
import { uploadToYouTube, youtubeConfigured } from './youtube.js';
import { uploadToInstagram, instagramConfigured } from './instagram.js';

export function activeTargets() {
  const wanted = (process.env.TARGETS || 'youtube,instagram').split(',').map((s) => s.trim());
  const out = [];
  if (wanted.includes('youtube') && youtubeConfigured()) out.push('youtube');
  if (wanted.includes('instagram') && instagramConfigured()) out.push('instagram');
  return out;
}

// Creates a job and asks GitHub Actions to render it.
export async function startJob({ mode, topic = '', url = '', count = 3, scheduledAt }) {
  const recentJobs = await listJobs(15);
  const recent = recentJobs.map((j) => j.title || j.topic).filter(Boolean).join(' | ');
  const job = {
    id: newId(),
    mode,
    topic,
    url,
    count,
    status: 'queued',
    scheduledAt,
    targets: activeTargets(),
    published: {},
    attempts: 0,
    createdAt: Date.now(),
  };
  await saveJob(job);
  try {
    await dispatchRender(job, recent);
    job.status = 'rendering';
  } catch (e) {
    job.status = 'failed';
    job.error = String(e.message || e);
  }
  await saveJob(job);
  return job;
}

// Uploads one ready job to every target platform that is not done yet.
export async function publishJob(job) {
  job.status = 'publishing';
  job.published = job.published || {};
  await saveJob(job);

  const hashtags = job.hashtags || [];
  const caption = `${job.title}\n\n${job.description || ''}\n\n${hashtags.join(' ')}`.trim();
  const pending = (job.targets || []).filter((t) => !job.published[t]);

  const results = await Promise.allSettled(
    pending.map(async (t) => {
      if (t === 'youtube') {
        return uploadToYouTube({ videoUrl: job.videoUrl, title: job.title, description: job.description, hashtags });
      }
      return uploadToInstagram({ videoUrl: job.videoUrl, caption });
    })
  );

  const errors = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') job.published[pending[i]] = r.value;
    else errors.push(`${pending[i]}: ${r.reason?.message || r.reason}`);
  });

  job.attempts = (job.attempts || 0) + 1;
  const allDone = (job.targets || []).length > 0 && job.targets.every((t) => job.published[t]);

  if (allDone) {
    job.status = 'published';
    job.error = null;
    job.publishedAt = Date.now();
    try {
      await del(job.videoUrl); // free Blob storage
    } catch {}
  } else if (!(job.targets || []).length) {
    job.status = 'failed';
    job.error = 'No platform is configured (add YouTube or Instagram keys in Vercel env).';
  } else {
    job.error = errors.join(' | ');
    if (job.attempts >= 3) job.status = 'failed';
    else {
      job.status = 'ready';
      job.scheduledAt = Date.now() + 15 * 60000; // retry later
    }
  }
  await saveJob(job);
  return job;
}
