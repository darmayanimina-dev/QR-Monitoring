export const CHECKPOINTS = [
  { name: 'Registrasi aplikasi', short: 'Registrasi', role: 'sales', owner: 'Admin Sales' },
  { name: 'Grading risiko', short: 'Grading risiko', role: 'risk', owner: 'Admin Grading / Risk' },
  { name: 'Input hasil grading', short: 'Input grading', role: 'sales', owner: 'Admin Sales' },
  { name: 'Pembagian berkas ke analis', short: 'Pembagian CA', role: 'coordinator', owner: 'Koordinator CA' },
  { name: 'Analisis kredit dan NUK', short: 'Analisis kredit', role: 'analyst', owner: 'Credit Analyst' },
  { name: 'Keputusan dan persetujuan komite', short: 'Persetujuan komite', role: 'committee', owner: 'Komite Kredit' },
  { name: 'Pemenuhan syarat persetujuan', short: 'Pemenuhan syarat', role: 'ao', owner: 'Account Officer' },
  { name: 'Permintaan cetak kontrak', short: 'Request kontrak', role: 'sales', owner: 'Admin Sales' },
  { name: 'Pemeriksaan syarat oleh Coor CA', short: 'Pemeriksaan Coor CA', role: 'coordinator', owner: 'Koordinator CA' },
  { name: 'Pemeriksaan syarat oleh CA', short: 'Pemeriksaan CA', role: 'analyst', owner: 'Credit Analyst' },
  { name: 'Pencetakan kontrak', short: 'Cetak kontrak', role: 'credit_admin', owner: 'Credit Admin' },
  { name: 'Tanda tangan dan dokumen tagihan', short: 'TTD & tagihan', role: 'ao', owner: 'Account Officer' },
  { name: 'Validasi akhir dan Go-Live', short: 'Validasi akhir', role: 'underwriting', owner: 'Underwriting Fleet' },
] as const;
export const STATUS_LABELS = {
  waiting: 'Menunggu diterima', processing: 'Sedang ditangani', hold: 'Perlu dilengkapi', completed: 'Selesai', rejected: 'Ditolak',
};
export type Status = keyof typeof STATUS_LABELS;
export type Action = 'receive' | 'finish' | 'hold' | 'resume' | 'reject';
export const ACTION_LABELS = { create: 'Pengajuan didaftarkan', receive: 'Berkas diterima', finish: 'Berkas diserahkan', hold: 'Kelengkapan diminta', resume: 'Pemeriksaan dilanjutkan', reject: 'Pengajuan ditolak' };
export type Application = {
  id: string; registration: string; customer: string; branch: string; notes: string;
  stage: number; status: Status; assignee: string | null; due_at: string;
  created_at: string; updated_at: string; version: number;
};
export type Event = {
  id: string; application_id: string; action: keyof typeof ACTION_LABELS; stage: number;
  actor_name: string; occurred_at: string; note: string;
};
export type Profile = { id: string; full_name: string; role: string; active: boolean };
export type State = { items: Application[]; events: Event[]; profile: Profile | null; signedIn: boolean };
export type NewApplication = { customer: string; registration: string; branch: string; due_at: string; notes: string };
export const ROLE_LABELS: Record<string, string> = { admin: 'Administrator', sales: 'Admin Sales', risk: 'Admin Grading / Risk', coordinator: 'Koordinator CA', analyst: 'Credit Analyst', committee: 'Komite Kredit', ao: 'Account Officer', credit_admin: 'Credit Admin', underwriting: 'Underwriting Fleet', viewer: 'Pengamat' };
export function active(item: Application) { return item.status !== 'completed' && item.status !== 'rejected'; }
export function overdue(item: Application) { return active(item) && new Date(item.due_at).getTime() < Date.now(); }
export function formatDate(value: string, time = false) {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}), timeZone: 'Asia/Jakarta' }).format(new Date(value));
}
export function duration(start: string, end: string) {
  const minutes = Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 60000));
  if (minutes < 60) return `${minutes} menit`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} jam`;
  return `${Math.floor(minutes / 1440)} hari ${Math.floor(minutes % 1440 / 60)} jam`;
}
export function permits(profile: Profile | null, stage: number) {
  return !!profile?.active && (profile.role === 'admin' || profile.role === CHECKPOINTS[stage]?.role);
}
export function transition(item: Application, action: Action, actor: string, note: string, now: string): Application {
  const allowed: Record<Status, Action[]> = { waiting: ['receive'], processing: ['finish', 'hold', 'reject'], hold: ['resume', 'reject'], completed: [], rejected: [] };
  if (!allowed[item.status].includes(action)) throw new Error('Status berkas telah berubah. Muat ulang lalu coba kembali.');
  if (['hold', 'reject'].includes(action) && note.trim().length < 5) throw new Error('Tuliskan alasan minimal 5 karakter.');
  if (action === 'reject' && ![4, 5].includes(item.stage)) throw new Error('Penolakan hanya dicatat pada tahap analisis atau komite.');
  const next = { ...item, updated_at: now, version: item.version + 1 };
  if (action === 'receive' || action === 'resume') { next.status = 'processing'; next.assignee = actor; }
  if (action === 'hold') next.status = 'hold';
  if (action === 'reject') next.status = 'rejected';
  if (action === 'finish') {
    if (item.stage === CHECKPOINTS.length - 1) next.status = 'completed';
    else { next.stage += 1; next.status = 'waiting'; next.assignee = null; }
  }
  return next;
}
