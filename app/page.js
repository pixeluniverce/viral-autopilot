'use client';

import { useCallback, useEffect, useState } from 'react';

const fmt = (ms) =>
  ms ? new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export default function Home() {
  const [pw, setPw] = useState('');
  const [authed, setAuthed] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [status, setStatus] = useState(null);
  const [topic, setTopic] = useState('');
  const [link, setLink] = useState('');
  const [count, setCount] = useState(3);
  const [when, setWhen] = useState('slot');
  const [language, setLanguage] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const api = useCallback(async (path, opts = {}) => {
    const res = await fetch(path, {
      ...opts,
      headers: {
        'content-type': 'application/json',
        'x-admin-password': localStorage.getItem('adminPw') || '',
      },
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      setAuthed(false);
      throw new Error('Wrong password');
    }
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }, []);

  const refresh = useCallback(async () => {
    const [j, s] = await Promise.all([api('/api/jobs'), api('/api/status')]);
    setJobs(j.jobs);
    setStatus(s);
    setAuthed(true);
  }, [api]);

  useEffect(() => {
    if (localStorage.getItem('adminPw')) refresh().catch(() => {});
  }, [refresh]);

  useEffect(() => {
    if (!authed) return;
    const t = setInterval(() => refresh().catch(() => {}), 15000);
    return () => clearInterval(t);
  }, [authed, refresh]);

  async function login(e) {
    e.preventDefault();
    localStorage.setItem('adminPw', pw);
    try {
      await refresh();
      setMsg('');
    } catch (err) {
      setMsg(err.message);
    }
  }

  async function submit(path, body, okText) {
    setBusy(true);
    setMsg('');
    try {
      await api(path, { method: 'POST', body: JSON.stringify(body) });
      setMsg(okText);
      await refresh();
    } catch (err) {
      setMsg('Error: ' + err.message);
    }
    setBusy(false);
  }

  async function jobAction(id, action) {
    if (action === 'delete' && !confirm('Delete this item?')) return;
    setBusy(true);
    setMsg(action === 'publish-now' ? 'Publishing… this can take 1–3 minutes.' : '');
    try {
      await api(`/api/jobs/${id}`, { method: 'POST', body: JSON.stringify({ action }) });
      setMsg('Done.');
      await refresh();
    } catch (err) {
      setMsg('Error: ' + err.message);
    }
    setBusy(false);
  }

  if (!authed) {
    return (
      <div className="wrap" style={{ maxWidth: 420, paddingTop: 80 }}>
        <h1>Viral Autopilot</h1>
        <p className="sub">Enter your dashboard password (ADMIN_PASSWORD).</p>
        <form className="card" onSubmit={login}>
          <label>Password</label>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
          <button type="submit">Open dashboard</button>
          {msg && <div className="err">{msg}</div>}
        </form>
      </div>
    );
  }

  const chips = status
    ? [
        ['Database', status.redis],
        ['Storage', status.blob],
        ['GitHub worker', status.github],
        ['YouTube', status.youtube],
        ['Instagram', status.instagram],
      ]
    : [];

  return (
    <div className="wrap">
      <h1>Viral Autopilot</h1>
      <p className="sub">
        Auto-posts at {status?.postTimes} ({status?.timezone}). Next slots:{' '}
        {(status?.nextSlots || []).map(fmt).join(' · ') || '—'}
      </p>

      <div className="chips">
        {chips.map(([name, on]) => (
          <span key={name} className={`chip ${on ? 'on' : 'off'}`}>
            {on ? '●' : '○'} {name}
          </span>
        ))}
      </div>

      {msg && <div className="msg">{msg}</div>}

      <div className="grid">
        <div className="card">
          <h2>Make an AI video</h2>
          <label>Topic (leave empty = AI picks a viral topic)</label>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. 5 habits of rich people" />
          <label>Language</label>
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="">Auto (rotate Gujarati / Hindi / English)</option>
            <option value="gujarati">Gujarati</option>
            <option value="hindi">Hindi</option>
            <option value="english">English</option>
          </select>
          <label>Upload</label>
          <select value={when} onChange={(e) => setWhen(e.target.value)}>
            <option value="slot">At the next free slot</option>
            <option value="now">As soon as it is ready</option>
          </select>
          <button disabled={busy} onClick={() => submit('/api/generate', { topic, when, language }, 'Started! Rendering takes about 3–6 minutes.')}>
            Create video
          </button>
        </div>

        <div className="card">
          <h2>Cut viral clips from a link</h2>
          <label>Video link (YouTube, etc. — use only content you own or have rights to)</label>
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://youtube.com/watch?v=..." />
          <label>How many clips</label>
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <button disabled={busy || !link} onClick={() => submit('/api/clip', { url: link, count, when }, 'Started! Clipping takes about 5–15 minutes.')}>
            Find &amp; cut clips
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Queue ({jobs.length})</h2>
        {jobs.length === 0 && <div className="meta">Nothing yet. Create a video above.</div>}
        {jobs.map((j) => (
          <div className="job" key={j.id}>
            <div className="row">
              <div>
                <div className="title">{j.title || j.topic || (j.mode === 'clip' ? 'Clip job' : 'Auto topic')}</div>
                <div className="meta">
                  {j.mode === 'clip' ? 'clip' : `AI video · ${j.languageName || ''}`} · upload {fmt(j.scheduledAt)}
                  {j.published?.youtube && (
                    <> · <a href={j.published.youtube.url} target="_blank" rel="noreferrer">YouTube</a></>
                  )}
                  {j.published?.instagram && <> · Instagram ✓</>}
                </div>
              </div>
              <span className={`badge s-${j.status}`}>{j.status}</span>
            </div>
            {j.error && <div className="err">{j.error}</div>}
            <div className="actions">
              {j.videoUrl && (
                <a href={j.videoUrl} target="_blank" rel="noreferrer">
                  <button className="ghost">Preview</button>
                </a>
              )}
              {j.status === 'ready' && (
                <button className="ghost" disabled={busy} onClick={() => jobAction(j.id, 'publish-now')}>Publish now</button>
              )}
              {j.status === 'failed' && (
                <button className="ghost" disabled={busy} onClick={() => jobAction(j.id, 'retry')}>Retry</button>
              )}
              <button className="ghost" disabled={busy} onClick={() => jobAction(j.id, 'delete')}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
