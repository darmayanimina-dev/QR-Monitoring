'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, LoaderCircle, ScanLine, Search, ShieldCheck } from 'lucide-react';

export default function Scanner({ onResult }: { onResult: (value: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const controller = useRef<{ stop: () => void } | null>(null);
  const mounted = useRef(true);
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [manual, setManual] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.stop(); };
  }, []);
  function accept(value: string) {
    try { onResult(value); controller.current?.stop(); }
    catch (failure) { setError((failure as Error).message); }
  }
  async function start() {
    setStarting(true); setError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Kamera tidak tersedia. Masukkan nomor registrasi di bawah.');
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      if (!mounted.current || !video.current) return;
      const reader = new BrowserQRCodeReader();
      const controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, video.current, result => {
        if (result && mounted.current) accept(result.getText());
      });
      if (!mounted.current) { controls.stop(); return; }
      controller.current = controls;
      setActive(true);
    } catch (failure) {
      if (mounted.current) {
        const reason = failure as Error;
        setError(reason.name === 'NotAllowedError' ? 'Izinkan akses kamera pada browser, atau cari melalui nomor registrasi.' : reason.name === 'NotFoundError' ? 'Kamera tidak ditemukan. Cari melalui nomor registrasi.' : reason.message);
      }
    } finally { if (mounted.current) setStarting(false); }
  }
  return <div className="scanner-content"><div className={`camera-preview ${active ? 'active' : ''}`}><video ref={video} autoPlay playsInline muted aria-label="Kamera pemindai QR" />{!active && <div className="camera-placeholder"><span><ScanLine size={48} strokeWidth={1.4} /></span><h3>Temukan berkas lewat QR</h3><p>Aktifkan kamera lalu arahkan ke label pada map.</p><button className="button primary" disabled={starting} onClick={start}>{starting ? <LoaderCircle className="spin" size={17} /> : <Camera size={17} />}{starting ? 'Membuka kamera...' : 'Aktifkan kamera'}</button></div>}{active && <div className="camera-target" />}</div>{active && <button className="text-button centered" onClick={() => { controller.current?.stop(); setActive(false); }}>Matikan kamera</button>}<div className="divider"><span>atau masukkan nomor registrasi</span></div><form onSubmit={event => { event.preventDefault(); accept(manual); }}><label>No. registrasi atau tautan QR<input value={manual} onChange={event => setManual(event.target.value)} placeholder="Contoh: REG-2026-00148" required autoComplete="off" /></label><button type="submit" className="button primary full"><Search size={17} />Cari pengajuan</button></form>{error && <p className="error-box" role="alert">{error}</p>}<div className="scanner-help"><ShieldCheck size={16} /><p>Setelah berkas terbuka, pilih tindakan untuk mencatat penerimaan atau penyerahan.</p></div></div>;
}
