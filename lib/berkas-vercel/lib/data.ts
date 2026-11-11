import 'server-only';
import { serverClient } from './supabase/server';
import type { Application, Event, Profile, State } from './model';

// Supabase returns at most 1000 rows by default. Load each page so older records
// and the complete audit trail remain available in monitoring views.
async function readAll(client: Awaited<ReturnType<typeof serverClient>>, table: string, columns: string, order: string) {
  const result: unknown[] = [];
  const pageSize = 1000;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await client.from(table).select(columns).order(order, { ascending: false }).order('id', { ascending: false }).range(start, start + pageSize - 1);
    if (error) throw new Error('Database is not ready');
    result.push(...data);
    if (data.length < pageSize) return result;
  }
}

export async function readState(): Promise<State> {
  const client = await serverClient();
  const { data: { user } } = await client.auth.getUser();
  const [applications, history, profile] = await Promise.all([
    readAll(client, 'applications', 'id,registration,customer,branch,notes,stage,status,assignee,due_at,created_at,updated_at,version', 'updated_at'),
    readAll(client, 'document_events', 'id,application_id,action,stage,actor_name,occurred_at,note', 'occurred_at'),
    user ? client.from('profiles').select('id,full_name,role,active').eq('id', user.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (profile.error) throw new Error('Profile is not ready');
  return { items: applications as Application[], events: history as Event[], profile: profile.data as Profile | null, signedIn: !!user };
}
