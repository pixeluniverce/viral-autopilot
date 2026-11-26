// Uploads rendered videos to Vercel Blob and reports back to the app.
//   node worker/publish.mjs        -> upload out/result.json items + callback
//   node worker/publish.mjs fail   -> report a failed run
import fs from 'node:fs';

const APP_URL = (process.env.APP_URL || '').replace(/\/$/, '');
const JOB_ID = process.env.JOB_ID;

async function callback(body) {
  const r = await fetch(`${APP_URL}/api/callback`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-worker-secret': process.env.WORKER_SECRET || '' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Callback failed: ${r.status} ${await r.text()}`);
}

if (process.argv[2] === 'fail') {
  const msg = `Render failed. See run: ${process.env.RUN_URL || ''}`;
  await callback({ jobId: JOB_ID, ok: false, error: msg });
  console.log('Reported failure');
} else {
  const { put } = await import('@vercel/blob');
  const data = JSON.parse(fs.readFileSync('out/result.json', 'utf8'));
  const results = [];
  for (let i = 0; i < data.results.length; i++) {
    const item = data.results[i];
    const blob = await put(`videos/${JOB_ID}-${i}.mp4`, fs.readFileSync(item.file), {
      access: 'public',
      addRandomSuffix: true,
      contentType: 'video/mp4',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    results.push({
      videoUrl: blob.url,
      title: item.title,
      description: item.description,
      hashtags: item.hashtags,
      duration: item.duration,
    });
    console.log('Uploaded', blob.url);
  }
  await callback({ jobId: JOB_ID, ok: true, results });
  console.log('Callback sent');
}
