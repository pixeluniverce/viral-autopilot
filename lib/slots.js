const TZ = () => process.env.TIMEZONE || 'Asia/Kolkata';
const TIMES = () =>
  (process.env.POST_TIMES || '09:00,13:00,19:00')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d{1,2}:\d{2}$/.test(s));

function tzOffsetMs(utcMs, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const o = {};
  for (const p of parts) o[p.type] = p.value;
  const asUtc = Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute, +o.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

function zonedToUtc(y, m, d, hh, mm, tz) {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  return guess - tzOffsetMs(guess, tz);
}

function todayParts(tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const o = {};
  for (const p of parts) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day };
}

// Upcoming posting slots (epoch ms), sorted, at least 5 minutes in the future
export function upcomingSlots(days = 2) {
  const tz = TZ();
  const { y, m, d } = todayParts(tz);
  const out = [];
  for (let i = 0; i < days; i++) {
    const base = new Date(Date.UTC(y, m - 1, d + i));
    for (const t of TIMES()) {
      const [hh, mm] = t.split(':').map(Number);
      const ms = zonedToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), hh, mm, tz);
      if (ms > Date.now() + 5 * 60000) out.push(ms);
    }
  }
  return out.sort((a, b) => a - b);
}

export function nextFreeSlot(taken) {
  const free = upcomingSlots(14).find((s) => !taken.has(s));
  return free || Date.now() + 60 * 60000;
}

export function takenSlots(jobs) {
  return new Set(jobs.filter((j) => j.status !== 'failed' && j.scheduledAt).map((j) => j.scheduledAt));
}
