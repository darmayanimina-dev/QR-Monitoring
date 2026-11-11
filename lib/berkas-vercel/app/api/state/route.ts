import { readState } from '@/lib/data';
import { apiFailure } from '@/lib/api';
import { configured } from '@/lib/supabase/server';
export async function GET() {
  if (!configured()) return Response.json({ error: 'Supabase belum terhubung. Gunakan mode demo untuk mencoba UI.' }, { status: 503 });
  try { return Response.json(await readState(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return apiFailure(error); }
}
