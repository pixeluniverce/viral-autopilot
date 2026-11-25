import { timingSafeEqual } from 'node:crypto';

function same(a, b) {
  if (!a || !b) return false;
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

// Allowed: dashboard (x-admin-password) or cron callers (Authorization: Bearer CRON_SECRET)
export function isAuthed(req) {
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const admin = req.headers.get('x-admin-password');
  return same(bearer, process.env.CRON_SECRET) || same(admin, process.env.ADMIN_PASSWORD);
}

export function isWorker(req) {
  return same(req.headers.get('x-worker-secret'), process.env.WORKER_SECRET);
}
