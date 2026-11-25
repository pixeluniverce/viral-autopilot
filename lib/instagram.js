const GRAPH = () => `https://graph.facebook.com/${process.env.GRAPH_VERSION || 'v23.0'}`;

export const instagramConfigured = () => Boolean(process.env.IG_USER_ID && process.env.IG_ACCESS_TOKEN);

async function call(path, params, method = 'POST') {
  const url = new URL(`${GRAPH()}/${path}`);
  const init = { method };
  const all = { ...params, access_token: process.env.IG_ACCESS_TOKEN };
  if (method === 'GET') Object.entries(all).forEach(([k, v]) => url.searchParams.set(k, v));
  else init.body = new URLSearchParams(all);
  const r = await fetch(url, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`Instagram: ${j.error?.message || r.status}`);
  return j;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Publishes a Reel from a public video URL.
export async function uploadToInstagram({ videoUrl, caption }) {
  const igId = process.env.IG_USER_ID;
  const container = await call(`${igId}/media`, {
    media_type: 'REELS',
    video_url: videoUrl,
    caption: caption.slice(0, 2200),
    share_to_feed: 'true',
  });

  for (let i = 0; i < 36; i++) {
    await sleep(5000);
    const s = await call(container.id, { fields: 'status_code,status' }, 'GET');
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') {
      throw new Error(`Instagram processing failed: ${s.status || s.status_code}`);
    }
    if (i === 35) throw new Error('Instagram processing timed out');
  }

  const pub = await call(`${igId}/media_publish`, { creation_id: container.id });
  return { id: pub.id };
}
