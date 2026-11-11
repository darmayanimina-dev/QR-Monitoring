import { z } from 'zod';
import { authorized, apiFailure, rpcFailure } from '@/lib/api';
const input = z.object({ action: z.enum(['receive','finish','hold','resume','reject']), version: z.number().int().min(0), note: z.string().trim().max(1000) });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const client = await authorized(request);
    const { id } = await context.params;
    z.string().uuid().parse(id);
    const body = input.parse(await request.json());
    const { error } = await client.rpc('record_document_event', { p_application_id: id, p_action: body.action, p_expected_version: body.version, p_note: body.note });
    if (error) throw rpcFailure(error);
    return Response.json({ ok: true });
  } catch (error) { return apiFailure(error); }
}
