import { z } from 'zod';
import { authorized, apiFailure, rpcFailure } from '@/lib/api';
const input = z.object({
  customer: z.string().trim().min(2, 'Isi nama customer minimal 2 karakter.').max(100),
  registration: z.string().trim().max(60).refine(value => !value || value.length >= 3, 'No. registrasi minimal 3 karakter.'),
  branch: z.string().trim().min(2, 'Isi nama unit atau cabang.').max(100),
  due_at: z.string().datetime({ offset: true }),
  notes: z.string().trim().max(1000),
});
export async function POST(request: Request) {
  try {
    const client = await authorized(request);
    const data = input.parse(await request.json());
    const { data: id, error } = await client.rpc('register_application', { p_customer: data.customer, p_registration: data.registration, p_branch: data.branch, p_due_at: data.due_at, p_notes: data.notes });
    if (error) throw rpcFailure(error);
    return Response.json({ id }, { status: 201 });
  } catch (error) { return apiFailure(error); }
}
