# Berkas — Next.js + Supabase + Vercel

Aplikasi monitoring dokumen berbahasa Indonesia dengan UI minimal, QR per pengajuan, 13 checkpoint, Scan In/Out, dan perhitungan lead time. Source ini disiapkan untuk akun Supabase dan Vercel pilihan pemilik.

## Teknologi

- Next.js App Router, TypeScript, React.
- Supabase PostgreSQL, Supabase Auth email/password, dan Row Level Security.
- Vercel untuk deployment Next.js.
- QR dibuat secara lokal menggunakan `qrcode`, kamera memakai `@zxing/browser`.

## Menjalankan preview

```sh
npm ci
npm run dev
```

Buka `http://127.0.0.1:3000`. Jika environment Supabase belum diisi, halaman menampilkan **Mode demo**. Semua pengajuan, nomor registrasi, identitas petugas, dan perubahan pada mode ini adalah simulasi yang disimpan di browser. Untuk mereset demo, hapus hanya key local storage `berkas-demo-v3` melalui pengaturan penyimpanan situs browser.

## Menghubungkan akun Supabase tujuan

1. Login ke akun Supabase yang akan dipakai dan pilih organisasi/project tujuan. Source ini memakai schema `public`, jadi gunakan project baru khusus Berkas jika belum ada schema yang sesuai.
2. Terapkan `supabase/migrations/202611110001_initial.sql` sekali melalui SQL Editor atau migrasi Supabase. Migrasi membuat tabel `profiles`, `applications`, `document_events`, dan fungsi transaksi.
3. Di Authentication → Users, buat atau undang akun petugas. Atur metode email/password. Pendaftaran akun dari aplikasi tidak dibuka.
4. Daftarkan user tersebut ke tabel `profiles` dengan UUID yang sama dengan Authentication User ID, nama lengkap, jabatan yang sesuai, dan `active=true`. Administrator pertama ditentukan oleh pemilik melalui SQL Editor, bukan melalui input di browser.

Contoh pembuatan profil, ganti UUID dan nama dengan user yang benar:

```sql
insert into public.profiles (id, full_name, role, active)
values ('UUID-DARI-AUTH-USER', 'Nama Administrator', 'admin', true);
```

Role yang tersedia adalah `admin`, `sales`, `risk`, `coordinator`, `analyst`, `committee`, `ao`, `credit_admin`, `underwriting`, dan `viewer`. Pengguna yang belum memiliki profil aktif dapat melihat dashboard, tetapi belum bisa mencatat tindakan. Role `admin` dapat menangani seluruh tahap. `sales` dapat membuat pengajuan dan menangani tahap Admin Sales. Petugas lainnya hanya menangani checkpoint yang sesuai jabatannya.

5. Salin `.env.example` menjadi `.env.local` dan isi URL project serta **publishable key** dari pengaturan API Supabase. Tidak dibutuhkan service role key pada aplikasi ini.

```env
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=KEY-PUBLIC-PROJECT
```

6. Restart server. Data ditampilkan dari Supabase. Bila variabel koneksi sudah diisi tetapi migrasi belum diterapkan, halaman menampilkan pesan database belum siap.

## Deploy ke akun Vercel tujuan

1. Login ke akun Vercel yang dipilih, lalu pilih team yang benar.
2. Impor source folder ini ke project Vercel melalui repository Git milik akun tujuan atau Vercel CLI. Jika repository mencakup folder lain, set Root Directory ke `berkas-vercel`.
3. Framework Preset adalah **Next.js**. Install `npm ci` dan Build `npm run build`.
4. Tambahkan kedua environment variable Supabase di atas untuk environment deployment yang diinginkan, lalu deploy.
5. Setelah deploy, pengajuan baru membuat QR dengan alamat deployment yang sedang dibuka. Label QR dari prototype lama masih mengarah ke alamat lama, sehingga label perlu diterbitkan ulang setelah data dimigrasikan.

Pilihan paket Vercel harus sesuai tujuan penggunaan akun. Pemilihan atau pembelian paket dilakukan oleh pemilik.

## Perilaku proses

- Checkpoint mengikuti 13 baris pada dokumen Lead Time Project. Registrasi selesai saat pengajuan disimpan. Pengajuan baru menunggu di Admin Grading / Risk.
- No. Reg dapat diisi dari sistem utama. Jika kosong, PostgreSQL menghasilkan nomor berbasis tanggal WIB dan sequence unik.
- **Terima berkas** mencatat Scan In dan PIC yang memegang map.
- **Serahkan berkas** mencatat Scan Out dan memindahkan antrean ke checkpoint berikutnya.
- Waktu tindakan dan identitas diambil dari database dan profil login, bukan dari nama yang diketik pada formulir.
- Permintaan kelengkapan/negosiasi ditahan pada checkpoint aktif sampai pemeriksaan dilanjutkan. Rute kembali ke checkpoint lain belum ditetapkan pada proses bisnis.
- Penolakan tersedia pada tahap Credit Analyst dan Komite. Penyelesaian/Go-Live berada di tahap Underwriting Fleet.
- Mutasi memakai transaksi PostgreSQL dengan row lock, pemeriksaan role, dan optimistic version untuk mencegah konflik. Browser tidak dapat menulis tabel atau menaikkan role secara langsung.
- Dashboard dan riwayat dapat dibaca publik, mengikuti pengaturan publik yang sebelumnya diminta. Hak baca dapat dibatasi melalui kebijakan RLS jika pemilik memilih akses internal.
- Data produksi Supabase dan data demo browser terpisah. Data dari prototype Cloudflare belum diimpor ke Supabase.

## Pemeriksaan

```sh
npm run typecheck
npm run build
npm run test:database
```

Uji database memakai PostgreSQL lokal dalam memori melalui PGlite. Uji memeriksa syntax migrasi, hak baca publik, pembatasan role, lifecycle 13 checkpoint, hold/resume, penolakan, nomor unik, audit, konflik versi, dan penolakan eskalasi kewenangan. Pengujian ini tidak membuat project pada akun Supabase dan tidak mengubah database online.
