'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCheck, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Clock3, FilePlus2, FileText,
  FolderOpen, History, LayoutDashboard, ListFilter, LoaderCircle, LogIn, LogOut,
  Menu, MoreHorizontal, Plus, Printer, QrCode, RefreshCw, ScanLine, Search,
  ShieldCheck, Sparkles, UserRound, X,
} from 'lucide-react';
import QRCode from 'qrcode';
import Scanner from './scanner';
import { demoAction } from '@/lib/demo';
import {
  ACTION_LABELS, CHECKPOINTS, ROLE_LABELS, STATUS_LABELS, active, duration, formatDate,
  overdue, permits, type Action, type Application, type NewApplication, type State, type Status,
} from '@/lib/model';

type View = 'dashboard' | 'applications' | 'history';
type Modal = 'new' | 'scan' | 'label' | null;

function initials(name: string) {
  return name.replace(/^(PT|CV)\s+/i, '').split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
}
function inputDate(date: number) {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Jakarta' }).format(date);
}
function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'Baru saja';
  if (minutes < 60) return `${minutes} menit lalu`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} jam lalu`;
  return `${Math.floor(minutes / 1440)} hari lalu`;
}
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store', headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || 'Permintaan belum berhasil. Silakan coba kembali.');
  return body;
}
function downloadImage(url: string, filename: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
}
function Dialog({ title, description, children, close, className = '' }: {
  title: string; description?: string; children: ReactNode; close: () => void; className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={ref} className={`dialog ${className}`} aria-labelledby="dialog-title"
    onCancel={event => { event.preventDefault(); close(); }}
    onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="dialog-header"><div><h2 id="dialog-title">{title}</h2>{description && <p>{description}</p>}</div>
      <button className="icon-button" onClick={close} aria-label="Tutup"><X size={20} /></button>
    </div>{children}
  </dialog>;
}
function StatusBadge({ status }: { status: Status }) {
  return <span className={`status-badge ${status}`}><i />{STATUS_LABELS[status]}</span>;
}

export default function Workspace({ initial, demo, deepLink }: { initial: State; demo: boolean; deepLink?: string }) {
  const [data, setData] = useState(initial);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<View>('dashboard');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [stage, setStage] = useState('all');
  const [page, setPage] = useState(0);
  const [showFlow, setShowFlow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [qr, setQr] = useState('');
  const [pendingAction, setPendingAction] = useState<Action | null>(null);
  const [note, setNote] = useState('');
  const [detailTab, setDetailTab] = useState<'history' | 'timing'>('history');
  const [printLabel, setPrintLabel] = useState<{ item: Application; qr: string } | null>(null);
  const [storageWarning, setStorageWarning] = useState('');
  const requestVersion = useRef(0);
  const deepLinkOpened = useRef(false);
  const selected = data.items.find(item => item.id === selectedId);
  const selectedEvents = useMemo(() => data.events.filter(event => event.application_id === selectedId).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)), [data.events, selectedId]);
  const canRegister = demo || !!(data.profile?.active && ['admin', 'sales'].includes(data.profile.role));

  useEffect(() => {
    if (demo) {
      try {
        const saved = localStorage.getItem('berkas-demo-v3');
        if (saved) {
          const parsed = JSON.parse(saved) as State;
          if (Array.isArray(parsed.items) && Array.isArray(parsed.events) && parsed.items.every(item => Number.isInteger(item.stage) && item.stage >= 0 && item.stage < CHECKPOINTS.length)) {
            setData({ ...parsed, profile: initial.profile, signedIn: true });
          }
        }
      } catch { setStorageWarning('Penyimpanan demo browser tidak tersedia. Perubahan berlaku selama halaman ini dibuka.'); }
    }
    setHydrated(true);
  }, [demo, initial.profile]);
  useEffect(() => {
    if (demo && hydrated) {
      try { localStorage.setItem('berkas-demo-v3', JSON.stringify(data)); }
      catch { setStorageWarning('Perubahan demo belum dapat disimpan di browser ini.'); }
    }
  }, [data, demo, hydrated]);
  useEffect(() => {
    if (!deepLink || deepLinkOpened.current || !hydrated) return;
    deepLinkOpened.current = true;
    if (data.items.some(item => item.id === deepLink)) setSelectedId(deepLink);
    else setMessage('Pengajuan pada QR ini tidak ditemukan. Periksa kembali nomor registrasinya.');
  }, [data.items, deepLink, hydrated]);
  useEffect(() => { setPage(0); }, [search, filter, stage, view]);
  useEffect(() => {
    if (!message) return;
    const timeout = setTimeout(() => setMessage(''), 5000);
    return () => clearTimeout(timeout);
  }, [message]);

  const refresh = useCallback(async () => {
    if (demo) { setMessage('Mode demo menggunakan data yang tersimpan di browser ini.'); return; }
    const version = ++requestVersion.current;
    setRefreshing(true);
    try {
      const state = await request<State>('/api/state');
      if (version === requestVersion.current) { setData(state); setError(''); }
    } catch (failure) { setError((failure as Error).message); }
    finally { if (version === requestVersion.current) setRefreshing(false); }
  }, [demo]);
  useEffect(() => {
    if (demo) return;
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, 30000);
    return () => clearInterval(timer);
  }, [demo, refresh]);
  useEffect(() => {
    if (!selected) { setQr(''); return; }
    let cancelled = false;
    const query = new URLSearchParams({ id: selected.id });
    if (demo) query.set('demo', '1');
    QRCode.toDataURL(`${location.origin}/?${query}`, { width: 640, margin: 4, errorCorrectionLevel: 'M' })
      .then(value => { if (!cancelled) setQr(value); })
      .catch(() => { if (!cancelled) setError('QR belum dapat dibuat. Buka kembali pengajuan untuk mencoba lagi.'); });
    return () => { cancelled = true; };
  }, [selected?.id, demo]);

  function navigate(next: View) {
    setView(next); setFilter('all'); setStage('all'); setSearch(''); setMobileMenu(false);
  }
  function select(item: Application) {
    setSelectedId(item.id); setPendingAction(null); setNote(''); setError(''); setDetailTab('history');
  }
  function closeDetail() {
    if (busy) return;
    setSelectedId(null); setPendingAction(null); setError(''); setQr('');
    if (location.search.includes('id=')) history.replaceState(null, '', demo ? '/?demo=1' : '/');
  }
  function closeModal() { if (!busy) { setModal(null); setError(''); } }
  function register() {
    if (!demo && !data.signedIn) { location.assign('/login'); return; }
    if (!canRegister) { setMessage('Pembuatan pengajuan tersedia untuk Admin Sales. Hubungi administrator untuk akses.'); return; }
    setError(''); setModal('new');
  }
  function openLabel(item: Application) { select(item); setModal('label'); }
  function findScanned(value: string) {
    let reference = value.trim();
    if (/^https?:\/\//i.test(reference)) {
      const url = new URL(reference);
      if (url.origin !== location.origin) throw new Error('QR ini berasal dari alamat aplikasi lain.');
      if ((url.searchParams.get('demo') === '1') !== demo) throw new Error('QR berasal dari mode yang berbeda. Buka tautan QR tersebut secara langsung.');
      reference = url.searchParams.get('id') || '';
    }
    const item = data.items.find(item => item.id === reference || item.registration.toLowerCase() === reference.toLowerCase());
    if (!item) throw new Error('Pengajuan tidak ditemukan. Periksa nomor registrasi atau perbarui data dashboard.');
    setModal(null); select(item);
  }

  async function createApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    const input: NewApplication = {
      customer: String(form.get('customer') || '').trim(), registration: String(form.get('registration') || '').trim(),
      branch: String(form.get('branch') || '').trim(), notes: String(form.get('notes') || '').trim(),
      due_at: new Date(`${form.get('due')}T23:59:59+07:00`).toISOString(),
    };
    try {
      let id: string;
      if (demo) {
        id = crypto.randomUUID();
        const registration = input.registration.toUpperCase() || `DEMO-${id.slice(0, 8).toUpperCase()}`;
        if (data.items.some(item => item.registration.toLowerCase() === registration.toLowerCase())) throw new Error('No. registrasi sudah digunakan.');
        if (new Date(input.due_at).getTime() <= Date.now()) throw new Error('Target selesai harus di masa depan.');
        const now = new Date().toISOString();
        const item: Application = { ...input, id, registration, stage: 1, status: 'waiting', assignee: null, created_at: now, updated_at: now, version: 0 };
        setData(previous => ({ ...previous, items: [item, ...previous.items], events: [
          { id: crypto.randomUUID(), application_id: id, action: 'finish', stage: 0, actor_name: 'Petugas Demo', occurred_at: now, note: 'Registrasi selesai. Menunggu diterima Admin Grading / Risk.' },
          { id: crypto.randomUUID(), application_id: id, action: 'create', stage: 0, actor_name: 'Petugas Demo', occurred_at: now, note: input.notes },
          ...previous.events,
        ] }));
      } else {
        const result = await request<{ id: string }>('/api/applications', { method: 'POST', body: JSON.stringify(input) });
        id = result.id;
        await refresh();
      }
      setSelectedId(id); setModal('label'); setMessage('Pengajuan tersimpan. Cetak QR dan tempel pada map berkas.');
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  async function confirmAction(event: FormEvent) {
    event.preventDefault();
    if (!selected || !pendingAction) return;
    setBusy(true); setError('');
    try {
      if (demo) setData(demoAction(data, selected.id, pendingAction, note.trim()));
      else {
        await request(`/api/applications/${selected.id}/events`, { method: 'POST', body: JSON.stringify({ action: pendingAction, version: selected.version, note }) });
        await refresh();
      }
      setPendingAction(null); setNote(''); setMessage('Tindakan berhasil dicatat. Posisi berkas sudah diperbarui.');
    } catch (failure) { if (!demo) await refresh(); setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  async function saveLabel(item: Application) {
    if (!qr) return;
    try {
      const image = new Image(); image.src = qr; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 970;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, 800, 970); context.textAlign = 'center';
      context.fillStyle = '#183a2c'; context.font = 'bold 42px sans-serif'; context.fillText('berkas.', 400, 70);
      context.drawImage(image, 80, 90, 640, 640);
      context.fillStyle = '#63766a'; context.font = '21px sans-serif'; context.fillText('NO. REGISTRASI', 400, 755);
      context.fillStyle = '#183a2c'; context.font = 'bold 29px monospace'; context.fillText(item.registration, 400, 802, 720);
      context.font = '25px sans-serif'; context.fillText(item.customer, 400, 850, 720);
      context.fillStyle = '#63766a'; context.font = '19px sans-serif'; context.fillText(demo ? 'DATA CONTOH · MODE DEMO' : 'Scan untuk melihat posisi dan riwayat berkas.', 400, 910);
      downloadImage(canvas.toDataURL('image/png'), `${item.registration}-label.png`);
    } catch { setMessage('Label belum dapat diunduh. Silakan coba kembali.'); }
  }
  async function print(item: Application) {
    if (!qr) return;
    const image = new Image(); image.src = qr; await image.decode();
    setPrintLabel({ item, qr });
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  }
  function exportCsv() {
    const cell = (value: string) => {
      const safe = /^[\s]*[=+@\-\t\r]/.test(value) ? `'${value}` : value;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const rows = [
      ['No. registrasi', 'Customer', 'Unit', 'Tahap', 'Status', 'PIC', 'Target selesai WIB', 'Diperbarui WIB'],
      ...filtered.map(item => [item.registration, item.customer, item.branch, CHECKPOINTS[item.stage].name, STATUS_LABELS[item.status], item.assignee || CHECKPOINTS[item.stage].owner, formatDate(item.due_at), formatDate(item.updated_at, true)]),
    ];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    downloadImage(url, demo ? 'demo-pengajuan.csv' : 'monitoring-pengajuan.csv');
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const filtered = data.items.filter(item => {
    const match = `${item.customer} ${item.registration} ${item.branch}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filter === 'all' || (filter === 'active' ? active(item) : filter === 'attention' ? overdue(item) || item.status === 'hold' : item.status === filter);
    return match && matchStatus && (stage === 'all' || item.stage === Number(stage));
  }).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const totalActive = data.items.filter(active).length;
  const attention = data.items.filter(item => overdue(item) || item.status === 'hold');
  const completed = data.items.filter(item => item.status === 'completed').length;
  const pageSize = 6;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const availableActions: { action: Action; label: string; description: string }[] = [];
  if (selected && permits(data.profile, selected.stage)) {
    if (selected.status === 'waiting') availableActions.push({ action: 'receive', label: 'Terima berkas', description: 'Konfirmasi bahwa map berkas sudah Anda terima.' });
    if (selected.status === 'processing') {
      availableActions.push({ action: 'finish', label: selected.stage === 12 ? 'Selesaikan & Go-Live' : selected.stage === 5 ? 'Disetujui, serahkan berkas' : 'Serahkan berkas', description: selected.stage === 12 ? 'Konfirmasi seluruh dokumen siap untuk pencairan.' : `Berkas akan menunggu diterima oleh ${CHECKPOINTS[selected.stage + 1].owner}.` });
      availableActions.push({ action: 'hold', label: 'Minta kelengkapan', description: 'Catat kekurangan berkas atau hal yang masih perlu ditindaklanjuti.' });
    }
    if (selected.status === 'hold') availableActions.push({ action: 'resume', label: 'Lanjutkan pemeriksaan', description: 'Konfirmasi kekurangan telah dipenuhi dan pemeriksaan dapat dilanjutkan.' });
    if (['processing', 'hold'].includes(selected.status) && [4, 5].includes(selected.stage)) availableActions.push({ action: 'reject', label: 'Tolak pengajuan', description: 'Tutup pengajuan dan catat alasan penolakannya.' });
  }
  const timings = selected ? CHECKPOINTS.map((checkpoint, index) => {
    const history = selectedEvents.filter(event => event.stage === index).sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    const received = history.find(event => event.action === 'receive');
    const finished = history.filter(event => event.action === 'finish').at(-1);
    return { checkpoint, index, received, finished };
  }) : [];

  return <>
    <div className="workspace-shell">
      {mobileMenu && <button className="nav-overlay" aria-label="Tutup navigasi" onClick={() => setMobileMenu(false)} />}
      <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}>
        <a href={demo ? '/?demo=1' : '/'} className="brand"><span className="brand-icon"><FolderOpen size={22} strokeWidth={1.8} /></span>berkas<span className="brand-period">.</span></a>
        <div className="workspace-label"><span className="workspace-avatar">PI</span><div><strong>Project Improvement</strong><small>Monitoring dokumen</small></div><ChevronDown size={15} /></div>
        <span className="nav-section">MENU UTAMA</span>
        <nav aria-label="Menu utama">
          <button className={view === 'dashboard' ? 'selected' : ''} onClick={() => navigate('dashboard')}><LayoutDashboard size={18} />Ringkasan</button>
          <button className={view === 'applications' ? 'selected' : ''} onClick={() => navigate('applications')}><FolderOpen size={19} />Semua pengajuan<span className="nav-total">{data.items.length}</span></button>
          <button onClick={() => { setModal('scan'); setMobileMenu(false); }}><ScanLine size={19} />Scan dokumen</button>
          <button className={view === 'history' ? 'selected' : ''} onClick={() => navigate('history')}><History size={19} />Riwayat aktivitas</button>
        </nav>
        <div className="sidebar-bottom"><div className="help-card"><span className="help-icon"><QrCode size={22} /></span><strong>Mulai dari satu scan</strong><p>Scan QR pada map untuk melihat posisi dan mencatat serah terima.</p><button onClick={() => setModal('scan')}>Buka pemindai<ArrowUpRight size={14} /></button></div>
          <div className="account"><span className="user-avatar">{data.profile ? initials(data.profile.full_name) : <UserRound size={17} />}</span><div><strong>{data.profile?.full_name || 'Pengunjung'}</strong><small>{demo ? 'Akun simulasi' : data.profile ? ROLE_LABELS[data.profile.role] : data.signedIn ? 'Menunggu akses petugas' : 'Dashboard publik'}</small></div>
            {data.signedIn && !demo ? <form method="post" action="/auth/logout"><button className="icon-button" title="Keluar" aria-label="Keluar"><LogOut size={16} /></button></form> : <a href="/login" className="icon-button" title="Login petugas" aria-label="Login petugas"><LogIn size={17} /></a>}
          </div>
        </div>
      </aside>
      <div className="page-shell">
        <header className="topbar"><div className="breadcrumbs"><button className="icon-button menu-button" aria-label="Buka navigasi" onClick={() => setMobileMenu(true)}><Menu size={21} /></button><span>Workspace</span><ChevronRight size={14} /><strong>{view === 'dashboard' ? 'Ringkasan' : view === 'history' ? 'Riwayat aktivitas' : 'Semua pengajuan'}</strong></div><div className="topbar-actions"><span className={`connection ${demo ? 'demo' : ''}`}><i />{demo ? 'Mode demo' : 'Supabase terhubung'}</span><span className="topbar-date">{formatDate(new Date().toISOString())}</span><span className="user-avatar top-avatar">{initials(data.profile?.full_name || 'Pengunjung')}</span></div></header>
        <main className="main-content">
          {demo && <div className="demo-notice"><Sparkles size={16} /><p><strong>Anda sedang mencoba mode demo.</strong> Data contoh dan perubahan simulasi tersimpan di browser ini.</p><a href="/login">Login petugas<ArrowUpRight size={14} /></a></div>}
          {storageWarning && <div className="error-box" role="status">{storageWarning}</div>}
          <div className="page-title"><div><span className="eyebrow">MONITORING DOKUMEN</span><h1>{view === 'dashboard' ? 'Dashboard pengajuan' : view === 'history' ? 'Riwayat aktivitas' : 'Semua pengajuan'}</h1><p>{view === 'history' ? 'Setiap penerimaan dan penyerahan berkas tercatat di sini.' : 'Lihat posisi berkas dan langkah selanjutnya dalam satu tempat.'}</p></div><div className="page-actions"><button className="button" onClick={register}><Plus size={17} />Pengajuan baru</button><button className="button primary" onClick={() => setModal('scan')}><ScanLine size={18} />Scan dokumen</button></div></div>
          {error && !selected && !modal && <div className="error-box" role="alert">{error}<button className="text-button" onClick={refresh}>Coba lagi</button></div>}
          {view !== 'history' && <>
            <div className="summary-grid">
              <button className={`summary-card ${filter === 'active' ? 'highlight' : ''}`} onClick={() => setFilter(filter === 'active' ? 'all' : 'active')}><div><span>Pengajuan aktif</span><span className="metric-icon blue"><FolderOpen size={19} /></span></div><strong>{totalActive.toString().padStart(2, '0')}</strong><p>Masih dalam proses pemeriksaan<ArrowUpRight size={15} /></p></button>
              <button className={`summary-card ${filter === 'attention' ? 'highlight' : ''}`} onClick={() => setFilter(filter === 'attention' ? 'all' : 'attention')}><div><span>Perlu perhatian</span><span className="metric-icon amber"><CircleAlert size={19} /></span></div><strong>{attention.length.toString().padStart(2, '0')}</strong><p>Lewat target atau perlu dilengkapi<ArrowUpRight size={15} /></p></button>
              <button className={`summary-card ${filter === 'completed' ? 'highlight' : ''}`} onClick={() => setFilter(filter === 'completed' ? 'all' : 'completed')}><div><span>Pengajuan selesai</span><span className="metric-icon green"><CheckCheck size={19} /></span></div><strong>{completed.toString().padStart(2, '0')}</strong><p>Seluruh pemeriksaan sudah selesai<ArrowUpRight size={15} /></p></button>
            </div>
            <div className="flow-summary"><div><span className="flow-icon"><ArrowRight size={17} /></span><p><strong>13 langkah, satu perjalanan berkas.</strong><span>Dari registrasi hingga siap pencairan.</span></p></div><button className="text-button" onClick={() => setShowFlow(!showFlow)}>{showFlow ? 'Tutup alur' : 'Lihat alur proses'}<ChevronDown size={15} className={showFlow ? 'rotate' : ''} /></button></div>
            {showFlow && <section className="flow-grid" aria-label="13 tahap proses berkas">{CHECKPOINTS.map((checkpoint, index) => <button key={checkpoint.name} className={stage === String(index) ? 'selected' : ''} onClick={() => { setStage(stage === String(index) ? 'all' : String(index)); setFilter('all'); }}><span>{index + 1}</span><div><strong>{checkpoint.name}</strong><small>{checkpoint.owner}</small></div></button>)}</section>}
            <section className="records-panel">
              <div className="panel-title"><div><h2>Pengajuan customer<span className="count-badge">{data.items.length}</span></h2><p>Temukan berkas, cek status, atau cetak QR dokumen.</p></div><button className="button small" disabled={!filtered.length} onClick={exportCsv}><ArrowDownToLine size={15} />Ekspor data</button></div>
              <div className="records-toolbar"><div className="search-input"><Search size={18} /><input aria-label="Cari pengajuan" placeholder="Cari nama customer atau No. Reg..." value={search} onChange={event => setSearch(event.target.value)} />{search && <button aria-label="Hapus pencarian" className="icon-button" onClick={() => setSearch('')}><X size={15} /></button>}</div><div className="toolbar-controls"><label className="stage-filter"><ListFilter size={15} /><select aria-label="Filter tahap" value={stage} onChange={event => setStage(event.target.value)}><option value="all">Semua tahap</option>{CHECKPOINTS.map((checkpoint, index) => <option key={checkpoint.name} value={index}>{index + 1}. {checkpoint.short}</option>)}</select></label><button className="icon-button refresh-button" title="Perbarui data" aria-label="Perbarui data" onClick={refresh}><RefreshCw size={16} className={refreshing ? 'spin' : ''} /></button></div></div>
              <div className="status-tabs" aria-label="Filter status">{[['all', 'Semua'], ['active', 'Aktif'], ['attention', 'Perlu perhatian'], ['completed', 'Selesai'], ['rejected', 'Ditolak']].map(([value, label]) => <button key={value} className={filter === value ? 'selected' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}{value === 'all' && <span>{data.items.length}</span>}</button>)}</div>
              <div className="table-wrapper"><table><thead><tr><th>Customer / No. registrasi</th><th>Posisi berkas</th><th>Status</th><th>Penanggung jawab</th><th>Update terakhir</th><th aria-label="Aksi pengajuan" /></tr></thead><tbody>{visible.map((item, index) => <tr key={item.id}><td><button className="record-name" onClick={() => select(item)}><span className={`customer-mark tone-${index % 4}`}>{initials(item.customer)}</span><span><strong>{item.customer}</strong><small>{item.registration}</small></span></button></td><td><button className="position-cell" onClick={() => select(item)}><strong>{CHECKPOINTS[item.stage].short}</strong><small><span className="step-track"><i style={{ width: `${(item.stage + 1) / 13 * 100}%` }} /></span>{item.stage + 1}/13</small></button></td><td><StatusBadge status={item.status} /></td><td><div className="owner-cell">{item.assignee ? <><span className="owner-dot" /><span title={item.assignee}>{item.assignee.replace(' · Demo', '')}</span></> : <span className="unassigned">{CHECKPOINTS[item.stage].owner}</span>}<small>{!active(item) ? 'Pemeriksaan berakhir' : item.assignee ? 'Sedang memegang berkas' : 'Menunggu penerimaan'}</small></div></td><td><div className="updated-cell"><span>{formatDate(item.updated_at, true)}</span><small className={overdue(item) ? 'overdue-text' : ''}>{overdue(item) ? 'Melewati target' : `Target ${formatDate(item.due_at)}`}</small></div></td><td><div className="row-actions"><button className="icon-button" aria-label={`QR ${item.customer}`} title="Lihat dan cetak QR" onClick={() => openLabel(item)}><QrCode size={18} /></button><button className="icon-button" aria-label={`Detail ${item.customer}`} title="Lihat detail" onClick={() => select(item)}><ArrowUpRight size={18} /></button></div></td></tr>)}</tbody></table></div>
              {!visible.length && <div className="empty-state"><span><FolderOpen size={31} /></span><h3>{data.items.length ? 'Pengajuan belum ditemukan' : 'Mulai dari pengajuan pertama'}</h3><p>{data.items.length ? 'Coba nama, nomor registrasi, atau filter yang berbeda.' : 'Daftarkan pengajuan, cetak QR, lalu tempel pada map dokumen.'}</p>{data.items.length ? <button className="button" onClick={() => { setSearch(''); setStage('all'); setFilter('all'); }}>Tampilkan semua</button> : <button className="button primary" onClick={register}><Plus size={16} />Buat pengajuan</button>}</div>}
              <div className="table-bottom"><span>{filtered.length ? `${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, filtered.length)} dari ${filtered.length} pengajuan` : '0 pengajuan'}</span><div><button className="icon-button" aria-label="Halaman sebelumnya" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button><span>{currentPage + 1} / {totalPages}</span><button className="icon-button" aria-label="Halaman berikutnya" disabled={currentPage >= totalPages - 1} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button></div></div>
            </section>
          </>}
          {(view === 'dashboard' || view === 'history') && <div className={`support-grid ${view === 'history' ? 'single' : ''}`}><section className="support-panel"><div className="panel-title"><div><h2>Aktivitas terbaru</h2><p>Riwayat penerimaan dan penyerahan dokumen.</p></div>{view === 'dashboard' && <button className="text-button" onClick={() => navigate('history')}>Lihat riwayat<ArrowUpRight size={14} /></button>}</div><div className="activity-list">{data.events.slice(0, view === 'history' ? 50 : 4).map(event => {
            const item = data.items.find(item => item.id === event.application_id);
            return <button key={event.id} className="activity-item" onClick={() => { if (item) select(item); }}><span className={`event-icon ${event.action}`} >{event.action === 'finish' ? <ArrowUpRight size={16} /> : event.action === 'hold' ? <CircleAlert size={16} /> : <FileText size={16} />}</span><span><strong>{event.action === 'finish' && event.stage === 12 ? 'Pengajuan selesai / Go-Live' : ACTION_LABELS[event.action]}</strong><small>{item?.customer} <i />{event.actor_name}</small></span><time title={formatDate(event.occurred_at, true)}>{relativeTime(event.occurred_at)}</time></button>;
          })}{!data.events.length && <div className="compact-empty"><History size={25} /><p>Aktivitas akan muncul setelah pengajuan dibuat.</p></div>}</div></section>{view === 'dashboard' && <section className="support-panel attention-panel"><div className="panel-title"><div><h2>Butuh tindak lanjut<span className="count-badge amber">{attention.length}</span></h2><p>Berkas yang memerlukan perhatian petugas.</p></div></div><div className="attention-list">{attention.slice(0, 3).map(item => <button key={item.id} onClick={() => select(item)}><span className="attention-indicator" /><div><strong>{item.customer}</strong><small>{item.status === 'hold' ? 'Menunggu kelengkapan dokumen' : 'Melewati target penyelesaian'}</small></div><ChevronRight size={16} /></button>)}</div>{!attention.length && <div className="compact-empty"><ShieldCheck size={28} /><strong>Semua dalam pantauan</strong><p>Belum ada berkas yang memerlukan tindak lanjut.</p></div>}</section>}</div>}
          <footer className="page-footer"><span><ShieldCheck size={14} />{demo ? 'Data simulasi untuk mencoba aplikasi' : 'Dashboard publik · Perubahan oleh petugas berwenang'}</span><span>Seluruh waktu ditampilkan dalam WIB</span></footer>
        </main>
      </div>
    </div>

    {selected && !modal && <Dialog className="detail-drawer" title="Detail pengajuan" description={selected.registration} close={closeDetail}><div className="detail-content"><div className="detail-customer"><span className="customer-mark large">{initials(selected.customer)}</span><div><h3>{selected.customer}</h3><p>{selected.branch}{demo && <span className="demo-chip">Data contoh</span>}</p></div></div><div className="detail-status-row"><StatusBadge status={selected.status} /><span>Langkah {selected.stage + 1} dari 13</span></div><div className="detail-progress"><i style={{ width: `${(selected.stage + 1) / 13 * 100}%` }} /></div>
      <section className="current-position"><span className="eyebrow">POSISI BERKAS SAAT INI</span><h3>{CHECKPOINTS[selected.stage].name}</h3><p><UserRound size={15} />{selected.assignee || CHECKPOINTS[selected.stage].owner}</p>{active(selected) && <div className="next-position"><ArrowRight size={15} />{selected.stage < 12 ? `Berikutnya: ${CHECKPOINTS[selected.stage + 1].owner}` : 'Tahap akhir sebelum Go-Live'}</div>}</section>
      <div className="detail-facts"><div><small>No. registrasi</small><strong>{selected.registration}</strong></div><div><small>Target selesai</small><strong className={overdue(selected) ? 'overdue-text' : ''}>{formatDate(selected.due_at)}{overdue(selected) && ' · Terlambat'}</strong></div><div><small>Tanggal didaftarkan</small><strong>{formatDate(selected.created_at, true)}</strong></div><div><small>{active(selected) ? 'Sejak didaftarkan' : 'Total lead time'}</small><strong>{duration(selected.created_at, active(selected) ? new Date().toISOString() : selected.updated_at)}</strong></div></div>
      {selected.notes && <div className="document-note"><small>Catatan pengajuan</small><p>{selected.notes}</p></div>}
      <div className="document-tools"><button className="button" onClick={() => setModal('label')}><QrCode size={17} />Lihat QR & cetak label</button><button className="icon-button" title="Perbarui data" aria-label="Perbarui detail" onClick={refresh}><RefreshCw size={16} className={refreshing ? 'spin' : ''} /></button></div>
      <section className="staff-actions"><h3>Tindakan selanjutnya</h3>{availableActions.length ? <><p>{demo ? 'Anda mencoba sebagai Petugas Demo.' : `Dicatat atas nama ${data.profile?.full_name}.`}</p><div className="action-buttons">{availableActions.map((option, index) => <button key={option.action} className={`button ${index === 0 ? 'primary' : ''} ${option.action === 'reject' ? 'danger-outline' : ''}`} onClick={() => { setPendingAction(option.action); setNote(''); setError(''); }}>{option.action === 'receive' ? <Check size={16} /> : option.action === 'finish' ? <ArrowRight size={16} /> : option.action === 'hold' ? <CircleAlert size={16} /> : <ChevronRight size={16} />}{option.label}</button>)}</div>{pendingAction && <form className="confirm-action" onSubmit={confirmAction}><p>{availableActions.find(option => option.action === pendingAction)?.description}</p><label>{['hold', 'reject'].includes(pendingAction) ? 'Alasan atau kekurangan dokumen' : 'Catatan tindakan (opsional)'}<textarea value={note} onChange={event => setNote(event.target.value)} rows={3} maxLength={1000} required={['hold', 'reject'].includes(pendingAction)} minLength={['hold', 'reject'].includes(pendingAction) ? 5 : undefined} placeholder="Tuliskan informasi yang perlu diketahui petugas..." /></label>{error && <p className="error-box" role="alert">{error}</p>}<div><button className="button" type="button" disabled={busy} onClick={() => setPendingAction(null)}>Batal</button><button className={`button ${pendingAction === 'reject' ? 'danger' : 'primary'}`} disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}Konfirmasi</button></div></form>}</> : active(selected) ? <div className="notice"><ShieldCheck size={19} /><div><p>{data.signedIn ? `Tindakan tersedia untuk ${CHECKPOINTS[selected.stage].owner} yang telah diberi akses.` : 'Login sebagai petugas untuk mencatat serah terima berkas.'}</p>{!data.signedIn && <a className="text-button" href={`/login?next=${encodeURIComponent(`/?id=${selected.id}`)}`}>Login petugas<ArrowRight size={14} /></a>}</div></div> : <div className="closed-state"><CheckCircle2 size={20} /><p>{selected.status === 'completed' ? 'Pemeriksaan selesai. Dokumen telah dinyatakan siap untuk Go-Live.' : 'Pengajuan ditutup dengan status ditolak. Alasan tercatat di riwayat.'}</p></div>}</section>
      <section className="detail-history"><div className="detail-tabs"><button className={detailTab === 'history' ? 'selected' : ''} onClick={() => setDetailTab('history')}>Riwayat berkas</button><button className={detailTab === 'timing' ? 'selected' : ''} onClick={() => setDetailTab('timing')}>Waktu per tahap</button></div>{detailTab === 'history' ? <ol className="timeline">{selectedEvents.map(event => <li key={event.id}><span className={`timeline-dot ${event.action}`} /><div><strong>{event.action === 'finish' && event.stage === 12 ? 'Selesai / Go-Live' : ACTION_LABELS[event.action]}</strong><small>{CHECKPOINTS[event.stage].short} · {event.actor_name}</small><time>{formatDate(event.occurred_at, true)} WIB</time>{event.note && <p>{event.note}</p>}</div></li>)}</ol> : <div className="stage-timings"><p>Durasi dihitung dari penerimaan sampai penyerahan, termasuk waktu menunggu kelengkapan.</p>{timings.map(({ checkpoint, index, received, finished }) => <div key={checkpoint.name}><span className={`timing-number ${finished ? 'done' : ''}`}>{finished ? <Check size={12} /> : index + 1}</span><span><strong>{checkpoint.short}</strong><small>{received ? `${formatDate(received.occurred_at, true)} → ${finished ? formatDate(finished.occurred_at, true) : 'Berjalan'}` : finished && index === 0 ? 'Registrasi selesai' : 'Belum diterima'}</small></span><b>{received ? duration(received.occurred_at, finished?.occurred_at || new Date().toISOString()) : '—'}</b></div>)}</div>}</section></div></Dialog>}

    {modal === 'new' && <Dialog title="Pengajuan baru" description="Daftarkan berkas dan buat QR untuk map dokumen." close={closeModal}><form onSubmit={createApplication}><div className="form-content"><label>Nama customer<span className="required">*</span><input name="customer" placeholder="Contoh: PT Nusantara Logistik" required minLength={2} maxLength={100} autoFocus /></label><label>No. registrasi<input name="registration" placeholder="Isi No. Reg dari sistem utama" maxLength={60} minLength={3} /><small>Kosongkan untuk membuat nomor secara otomatis.</small></label><div className="form-grid"><label>Unit / Cabang<span className="required">*</span><input name="branch" placeholder="Contoh: Jakarta" required minLength={2} maxLength={100} /></label><label>Target selesai<span className="required">*</span><input type="date" name="due" min={inputDate(Date.now())} defaultValue={inputDate(Date.now() + 5 * 86400000)} required /><small>Batas waktu pukul 23.59 WIB.</small></label></div><label>Catatan awal<span className="optional">Opsional</span><textarea name="notes" placeholder="Informasi tambahan untuk petugas berikutnya..." rows={3} maxLength={1000} /></label><div className="notice"><QrCode size={20} /><p>QR yang sama digunakan selama perjalanan berkas. Setelah registrasi, berkas menunggu diterima Admin Grading / Risk.</p></div>{error && <p className="error-box" role="alert">{error}</p>}</div><div className="dialog-footer"><button type="button" className="button" onClick={closeModal} disabled={busy}>Batal</button><button className="button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <QrCode size={17} />}Simpan & buat QR</button></div></form></Dialog>}
    {modal === 'scan' && <Dialog title="Scan dokumen" description="Arahkan kamera ke QR yang tertempel pada map berkas." close={closeModal}><Scanner onResult={findScanned} /></Dialog>}
    {modal === 'label' && selected && <Dialog title="Label QR dokumen" description="Cetak dan tempel label pada map pengajuan." close={() => { closeModal(); }}><div className="label-content"><div className="label-card"><span className="label-brand">berkas.</span>{qr ? <img src={qr} width={236} height={236} alt={`QR ${selected.registration}`} /> : <div className="qr-placeholder"><LoaderCircle className="spin" /></div>}<span className="registration-label">NO. REGISTRASI</span><strong className="registration-number">{selected.registration}</strong><span className="label-customer">{selected.customer}</span><small>{selected.branch}</small>{demo && <span className="demo-chip">DATA CONTOH</span>}</div><div className="label-actions"><button className="button" disabled={!qr} onClick={() => saveLabel(selected)}><ArrowDownToLine size={16} />Unduh PNG</button><button className="button primary" disabled={!qr} onClick={() => print(selected)}><Printer size={16} />Cetak label</button></div><button className="text-button back-detail" onClick={() => setModal(null)}>Lihat detail pengajuan<ArrowRight size={15} /></button>{error && <p className="error-box">{error}</p>}</div></Dialog>}
    {message && <div className="toast" role="status"><CheckCircle2 size={18} /><p>{message}</p><button aria-label="Tutup notifikasi" onClick={() => setMessage('')}><X size={16} /></button></div>}
    <section className="print-root" aria-hidden="true">{printLabel && <div className="print-card"><span className="label-brand">berkas.</span><img src={printLabel.qr} alt="QR label untuk dicetak" /><p className="registration-label">NO. REGISTRASI</p><strong className="registration-number">{printLabel.item.registration}</strong><p>{printLabel.item.customer}</p><small>{printLabel.item.branch}{demo && ' · DATA CONTOH'}</small></div>}</section>
  </>;
}
