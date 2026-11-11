import { CHECKPOINTS, transition, type Application, type Event, type State } from './model';
export function createDemo(now: number): State {
  const definitions = [
    ['PT Nusantara Logistik', 'Jakarta', 4, 'processing', 2],
    ['CV Bumi Sejahtera', 'Bandung', 5, 'waiting', 3],
    ['PT Sinar Transportasi', 'Jakarta', 6, 'hold', -1],
    ['PT Karya Mandiri', 'Bekasi', 10, 'processing', 1],
    ['CV Lintas Jaya', 'Bandung', 1, 'waiting', 4],
    ['PT Cakrawala Abadi', 'Jakarta', 12, 'completed', 2],
    ['PT Prima Niaga', 'Tangerang', 8, 'processing', -2],
  ] as const;
  const events: Event[] = [];
  const items = definitions.map(([customer, branch, stage, status, days], index): Application => {
    const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    const created = now - (index + 2) * 86400000;
    const updated = now - (index + 1) * 2400000;
    events.push({ id: `demo-create-${index}`, application_id: id, action: 'create', stage: 0, actor_name: 'Admin Sales · Demo', occurred_at: new Date(created).toISOString(), note: 'Pengajuan simulasi untuk mencoba aplikasi.' });
    for (let current = 0; current <= stage; current++) {
      const entered = created + (updated - created) * (current + 0.2) / (stage + 1);
      if (current === 0 || current < stage || status !== 'waiting') events.push({ id: `demo-in-${index}-${current}`, application_id: id, action: 'receive', stage: current, actor_name: `${CHECKPOINTS[current].owner} · Demo`, occurred_at: new Date(entered).toISOString(), note: '' });
      if (current < stage || status === 'completed') events.push({ id: `demo-out-${index}-${current}`, application_id: id, action: 'finish', stage: current, actor_name: `${CHECKPOINTS[current].owner} · Demo`, occurred_at: new Date(created + (updated - created) * (current + 0.8) / (stage + 1)).toISOString(), note: 'Pemeriksaan simulasi selesai.' });
    }
    if (status === 'hold') events.push({ id: `demo-hold-${index}`, application_id: id, action: 'hold', stage, actor_name: 'Account Officer · Demo', occurred_at: new Date(updated).toISOString(), note: 'Menunggu dokumen pendukung dan bukti pemenuhan syarat customer.' });
    return { id, customer, registration: `REG-2026-${String(148 + index).padStart(5, '0')}`, branch, stage, status, assignee: status === 'waiting' ? null : `${CHECKPOINTS[stage].owner} · Demo`, due_at: new Date(now + days * 86400000).toISOString(), notes: 'Data contoh untuk simulasi. Semua perubahan demo tersimpan di browser ini.', created_at: new Date(created).toISOString(), updated_at: new Date(updated).toISOString(), version: 0 };
  });
  return { items, events: events.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)), profile: { id: 'demo', full_name: 'Petugas Demo', role: 'admin', active: true }, signedIn: true };
}
export function demoAction(state: State, id: string, action: Parameters<typeof transition>[1], note: string): State {
  const item = state.items.find(item => item.id === id);
  if (!item) throw new Error('Pengajuan tidak ditemukan.');
  const now = new Date().toISOString();
  const next = transition(item, action, 'Petugas Demo', note, now);
  return { ...state, items: state.items.map(item => item.id === id ? next : item), events: [{ id: crypto.randomUUID(), application_id: id, action, stage: item.stage, actor_name: 'Petugas Demo', occurred_at: now, note }, ...state.events] };
}
