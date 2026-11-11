import { NextResponse } from 'next/server';
import { configured, serverClient } from '@/lib/supabase/server';
export async function POST(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return new Response('Forbidden', { status: 403 });
  if (!configured()) return NextResponse.redirect(new URL('/login?error=setup', url), 303);
  const data = await request.formData();
  const email = String(data.get('email') || '').trim();
  const password = String(data.get('password') || '');
  const nextValue = String(data.get('next') || '/');
  const next = nextValue.startsWith('/?id=') ? nextValue : '/';
  const client = await serverClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) return NextResponse.redirect(new URL('/login?error=invalid', url), 303);
  return NextResponse.redirect(new URL(next, url), 303);
}
