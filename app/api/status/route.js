import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/auth';
import { dbConfigured } from '@/lib/db';
import { youtubeConfigured } from '@/lib/youtube';
import { instagramConfigured } from '@/lib/instagram';
import { upcomingSlots } from '@/lib/slots';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({
    redis: dbConfigured,
    blob: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    github: Boolean(process.env.GH_TOKEN && process.env.GH_REPO),
    youtube: youtubeConfigured(),
    instagram: instagramConfigured(),
    postTimes: process.env.POST_TIMES || '09:00,13:00,19:00',
    timezone: process.env.TIMEZONE || 'Asia/Kolkata',
    nextSlots: upcomingSlots(2).slice(0, 4),
  });
}
