import 'server-only';
import { z } from 'zod';
import { configured, serverClient } from './supabase/server';
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function authorized(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new ApiError('Permintaan berasal dari halaman yang berbeda.', 403);
  if (!configured()) throw new ApiError('Database Supabase belum terhubung.', 503);
  const client = await serverClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new ApiError('Silakan login sebagai petugas.', 401);
  return client;
}
export function apiFailure(error: unknown) {
  if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message || 'Periksa kembali formulir.' }, { status: 400 });
  if (error instanceof SyntaxError) return Response.json({ error: 'Format permintaan tidak valid.' }, { status: 400 });
  return Response.json({ error: 'Data belum dapat diproses. Silakan coba kembali.' }, { status: 500 });
}
export function rpcFailure(error: { code: string; message: string }) {
  if (error.code === '23505') return new ApiError('No. registrasi sudah digunakan. Periksa pengajuan yang ada.', 409);
  if (error.code === '42501') return new ApiError(error.message, 403);
  if (error.code === '40001') return new ApiError(error.message, 409);
  if (error.code === 'P0002') return new ApiError(error.message, 404);
  if (error.code === 'P0001') return new ApiError(error.message, 400);
  return new ApiError('Data belum tersimpan. Periksa formulir dan koneksi database.', 400);
}
