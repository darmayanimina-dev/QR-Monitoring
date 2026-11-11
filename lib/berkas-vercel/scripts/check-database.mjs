import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`);
await db.exec(await readFile(new URL('../supabase/migrations/202611110001_initial.sql', import.meta.url), 'utf8'));
const identities = {
  admin: '00000000-0000-4000-8000-000000000001',
  sales: '00000000-0000-4000-8000-000000000002',
  risk: '00000000-0000-4000-8000-000000000003',
  analyst: '00000000-0000-4000-8000-000000000004',
  inactive: '00000000-0000-4000-8000-000000000005',
};
for (const [role, id] of Object.entries(identities)) {
  await db.query('insert into auth.users values ($1, $2)', [id, `${role}@test.local`]);
  await db.query('insert into public.profiles (id,full_name,role,active) values ($1,$2,$3,$4)', [id, `Petugas ${role}`, role === 'inactive' ? 'risk' : role, role !== 'inactive']);
}
async function as(role) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [identities[role] || '']);
  await db.exec(`set role ${role === 'anon' ? 'anon' : 'authenticated'}`);
}
async function count() {
  return (await db.query('select count(*)::int as count from public.document_events')).rows[0].count;
}
async function record(id, action, version, note = '') {
  return db.query('select public.record_document_event($1,$2,$3,$4)', [id, action, version, note]);
}
await as('anon');
assert.equal((await db.query('select * from public.applications')).rows.length, 0);
await assert.rejects(() => record(identities.admin, 'receive', 0), { code: '42501' });
await as('risk');
await assert.rejects(() => db.query("select public.register_application('Customer Uji','','Jakarta',now()+interval '1 day','')"), { code: '42501' });
await as('sales');
const id = (await db.query("select public.register_application('Customer Uji','','Jakarta',now()+interval '1 day','') as id")).rows[0].id;
assert.equal(await count(), 2);
let item = (await db.query('select * from public.applications where id=$1', [id])).rows[0];
assert.equal(item.stage, 1);
assert.equal(item.status, 'waiting');
await assert.rejects(() => record(id, 'receive', 0), { code: '42501' });
await as('inactive');
await assert.rejects(() => record(id, 'receive', 0), { code: '42501' });
await as('risk');
await assert.rejects(() => record(id, 'finish', 0), { code: 'P0001' });
await record(id, 'receive', 0);
await assert.rejects(() => record(id, 'finish', 0), { code: '40001' });
assert.equal(await count(), 3, 'Invalid and stale changes must not create audit entries');
await assert.rejects(() => record(id, 'hold', 1, ''), { code: 'P0001' });
await record(id, 'hold', 1, 'Dokumen pendukung belum lengkap.');
await record(id, 'resume', 2, 'Dokumen sudah dilengkapi.');
await record(id, 'finish', 3);
item = (await db.query('select * from public.applications where id=$1', [id])).rows[0];
assert.equal(item.stage, 2);
assert.equal(item.status, 'waiting');
await as('admin');
for (let stage = 2; stage <= 12; stage++) {
  item = (await db.query('select * from public.applications where id=$1', [id])).rows[0];
  assert.equal(item.stage, stage);
  await record(id, 'receive', item.version);
  await record(id, 'finish', item.version + 1, 'Pemeriksaan selesai.');
}
item = (await db.query('select * from public.applications where id=$1', [id])).rows[0];
assert.equal(item.status, 'completed');
await assert.rejects(() => record(id, 'receive', item.version), { code: 'P0001' });
await assert.rejects(() => db.query('update public.profiles set role=$1 where id=$2', ['admin', identities.risk]), { code: '42501' });
await assert.rejects(() => db.query("update public.applications set status='waiting' where id=$1", [id]), { code: '42501' });
await as('anon');
assert.equal((await db.query('select * from public.applications')).rows.length, 1);
await as('admin');
const second = (await db.query("select public.register_application('Customer Kedua','','Bandung',now()+interval '1 day','') as id")).rows[0].id;
await as('admin');
const registration = (await db.query('select registration from public.applications where id=$1', [id])).rows[0].registration;
await assert.rejects(() => db.query("select public.register_application('Duplikat',$1,'Jakarta',now()+interval '1 day','')", [registration]), { code: '23505' });
await db.exec('reset role');
await db.query('update public.applications set stage=4,status=$1 where id=$2', ['processing', second]);
await as('analyst');
await record(second, 'reject', 0, 'Alasan penolakan pengujian.');
assert.equal((await db.query('select status from public.applications where id=$1', [second])).rows[0].status, 'rejected');
await db.close();
console.log('PASS: PostgreSQL migration, public read, authenticated RPCs, staff roles, inactive users, 13 checkpoints, hold/resume, rejection, stale-write protection, audit integrity, unique registration, and denied privilege escalation.');
