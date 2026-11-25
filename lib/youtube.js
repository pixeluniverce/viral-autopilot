export const youtubeConfigured = () =>
  Boolean(process.env.YT_CLIENT_ID && process.env.YT_CLIENT_SECRET && process.env.YT_REFRESH_TOKEN);

async function accessToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: process.env.YT_CLIENT_ID,
      client_secret: process.env.YT_CLIENT_SECRET,
      refresh_token: process.env.YT_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`YouTube auth failed: ${j.error_description || j.error || r.status}`);
  return j.access_token;
}

export async function uploadToYouTube({ videoUrl, title, description, hashtags = [] }) {
  const token = await accessToken();

  const src = await fetch(videoUrl);
  if (!src.ok) throw new Error(`Could not fetch video file (${src.status})`);
  const buf = Buffer.from(await src.arrayBuffer());

  let t = (title || 'Untitled').trim();
  if (!/#shorts/i.test(t) && t.length <= 90) t += ' #Shorts';
  const tags = hashtags.map((h) => h.replace(/^#/, '')).filter(Boolean).slice(0, 15);
  const desc = `${description || ''}\n\n${hashtags.join(' ')} #Shorts`.trim().slice(0, 4900);

  const init = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(buf.length),
        'X-Upload-Content-Type': 'video/mp4',
      },
      body: JSON.stringify({
        snippet: { title: t.slice(0, 100), description: desc, tags, categoryId: process.env.YT_CATEGORY_ID || '22' },
        status: { privacyStatus: process.env.YT_PRIVACY || 'public', selfDeclaredMadeForKids: false },
      }),
    }
  );
  if (!init.ok) throw new Error(`YouTube init failed (${init.status}): ${(await init.text()).slice(0, 250)}`);
  const location = init.headers.get('location');
  if (!location) throw new Error('YouTube did not return an upload URL');

  const up = await fetch(location, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(buf.length) },
    body: buf,
  });
  const j = await up.json().catch(() => ({}));
  if (!up.ok || !j.id) throw new Error(`YouTube upload failed (${up.status}): ${JSON.stringify(j).slice(0, 250)}`);
  return { id: j.id, url: `https://youtube.com/shorts/${j.id}` };
}
