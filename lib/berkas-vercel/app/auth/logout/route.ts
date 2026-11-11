import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase/server';
export async function POST(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return new Response('Forbidden', { status: 403 });
  const client = await serverClient();
  await client.auth.signOut();
  return NextResponse.redirect(new URL('/', url), 303);
}
