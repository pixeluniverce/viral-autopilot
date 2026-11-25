// Starts the free GitHub Actions worker that renders the video.
export async function dispatchRender(job, recent = '') {
  const repo = process.env.GH_REPO;
  const token = process.env.GH_TOKEN;
  if (!repo || !token) throw new Error('GH_REPO / GH_TOKEN are not set in Vercel env');

  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/render.yml/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'viral-autopilot',
    },
    body: JSON.stringify({
      ref: process.env.GH_BRANCH || 'main',
      inputs: {
        job_id: job.id,
        mode: job.mode,
        topic: job.topic || '',
        url: job.url || '',
        count: String(job.count || 3),
        recent: recent.slice(0, 3000),
        niche: process.env.NICHE || 'amazing facts, motivation, smart money tips, tech tricks',
        language: process.env.LANGUAGE_NAME || 'English',
        voice: process.env.TTS_VOICE || 'en-US-AndrewNeural',
      },
    }),
  });
  if (res.status !== 204) {
    throw new Error(`GitHub dispatch failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
}
