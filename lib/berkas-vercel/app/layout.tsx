import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Berkas — Monitoring dokumen',
  description: 'Pantau posisi berkas, serah terima, dan waktu proses pengajuan.',
  icons: { icon: '/favicon.svg' },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body>{children}</body></html>;
}
