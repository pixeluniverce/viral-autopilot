# Viral Autopilot

AI writes the script → makes a 9:16 video with voice, footage and captions → uploads to **YouTube Shorts** and **Instagram Reels** at your set times. You can also paste a video link and it cuts the most viral clips.

```
Vercel (dashboard + API)  ──►  GitHub Actions (free video worker)
        │  Neon DB (queue)            │  Claude script · edge-tts voice · Pexels footage · ffmpeg · Whisper
        │  Vercel Blob (temp video)   ▼
        └──────── publishes at your times ──► YouTube + Instagram
```

## 1. Accounts / keys you need

| What | Where | Cost |
|---|---|---|
| GitHub account | github.com | free |
| Vercel account | vercel.com | free |
| Neon database | added from Vercel (Storage tab) | free |
| Anthropic API key (writes scripts) | console.anthropic.com | pay per use, very small |
| Pexels API key (stock footage) | pexels.com/api | free |
| YouTube OAuth keys | Google Cloud Console | free |
| Instagram access token | Meta for Developers | free |

## 2. Deploy

1. Create a **new GitHub repo** and push this whole folder (the `.github` folder must be included).
2. On Vercel: **Add New → Project → import the repo → Deploy**.
3. In the Vercel project → **Storage**: create/connect **Neon** (adds `DATABASE_URL`) and **Blob** (adds `BLOB_READ_WRITE_TOKEN`).
   - Optional: open Neon SQL Editor and run `schema.sql`. If you skip it, the app creates the table by itself.
4. Vercel → **Settings → Environment Variables**: add everything from `.env.example`, then **Redeploy**.
5. GitHub repo → **Settings → Secrets and variables → Actions**, add:
   `ANTHROPIC_API_KEY`, `PEXELS_API_KEY`, `BLOB_READ_WRITE_TOKEN` (copy from Vercel Blob), `WORKER_SECRET` (same as Vercel), `APP_URL` (your `https://xxx.vercel.app`), `CRON_SECRET` (same as Vercel), optional `YT_COOKIES`.
6. `GH_TOKEN` (for Vercel): GitHub → Settings → Developer settings → Fine-grained token → only this repo → **Actions: Read and write**.

Open your Vercel URL, log in with `ADMIN_PASSWORD`, click **Create video**. After ~5 minutes it shows as *ready* → press **Publish now** to test.

## 3. YouTube keys

1. Google Cloud Console → new project → enable **YouTube Data API v3**.
2. OAuth consent screen → set **Publishing status: In production** (in "Testing" the refresh token dies after 7 days).
3. Credentials → OAuth client ID (Web) → add redirect `https://developers.google.com/oauthplayground`.
4. Open OAuth Playground → gear icon → "Use your own OAuth credentials" → scope `https://www.googleapis.com/auth/youtube.upload` → authorize → exchange → copy the **refresh token**.
5. Put `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN` in Vercel.

> Google keeps uploads from new, unaudited API projects **private** until the project passes a YouTube API compliance audit. If your videos show as private, request the audit (or switch them to public in YouTube Studio).

## 4. Instagram keys

1. Instagram must be a **Business or Creator** account linked to a Facebook Page.
2. Meta for Developers → create app → add **Instagram Graph API** → permission `instagram_content_publish`.
3. Generate a long-lived access token and find your Instagram user ID (Graph API Explorer: `me/accounts` → page → `instagram_business_account`).
4. Put `IG_USER_ID` and `IG_ACCESS_TOKEN` in Vercel. Long-lived tokens last ~60 days, so refresh before they expire.

## 5. How it runs by itself

- Every day at 00:00 IST the scheduler plans videos for all slots in `POST_TIMES` (default 09:00, 13:00, 19:00) for the next 2 days.
- GitHub Actions renders each one, the app stores it, and publishes when the time arrives (checked every 30 min).
- Change `POST_TIMES`, `TIMEZONE`, `NICHE`, `LANGUAGE_NAME`, `TTS_VOICE` any time in Vercel env.
- Free GitHub minutes: private repos get 2000/month. A public repo is unlimited (your secrets stay hidden).

## 6. Clip from a link

Paste a link in the dashboard → the worker downloads it, transcribes it, asks Claude for the best moments, cuts 9:16 clips with captions and queues them into your next free slots. The original source is credited in the description.

- Only use videos you own or have permission to reuse. Re-uploading other people's content can get your channel struck.
- YouTube often blocks downloads from GitHub servers ("confirm you're not a bot"). If that happens, export your browser cookies (cookies.txt format) and save them as the `YT_COOKIES` secret.

## Files

- `app/` dashboard + API routes · `lib/` database, YouTube, Instagram, scheduling
- `worker/main.py` script + video maker · `worker/publish.mjs` upload + callback
- `.github/workflows/render.yml` video worker · `scheduler.yml` free cron
- `schema.sql` Neon table
