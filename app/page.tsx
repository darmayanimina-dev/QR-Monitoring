import Workspace from '@/components/workspace';
import { configured } from '@/lib/supabase/server';
import { readState } from '@/lib/data';
import { createDemo } from '@/lib/demo';
export const dynamic = 'force-dynamic';
export default async function Home({ searchParams }: { searchParams: Promise<{ demo?: string; id?: string }> }) {
  const params = await searchParams;
  const demo = params.demo === '1' || !configured();
  if (demo) return <Workspace initial={createDemo(Date.now())} demo deepLink={params.id} />;
  try { return <Workspace initial={await readState()} demo={false} deepLink={params.id} />; }
  catch {
    return <main className="setup-page"><span className="brand">berkas.</span><h1>Database belum siap</h1><p>Koneksi Supabase sudah diatur. Terapkan migrasi database untuk mulai menyimpan pengajuan.</p><a className="button primary" href="/?demo=1">Lihat demo tampilan</a></main>;
  }
}
