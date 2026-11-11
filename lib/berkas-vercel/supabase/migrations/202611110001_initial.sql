-- Apply once in a new Supabase project's SQL Editor or through Supabase migrations.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 100),
  role text not null default 'viewer' check (role in ('admin','sales','risk','coordinator','analyst','committee','ao','credit_admin','underwriting','viewer')),
  active boolean not null default false
);
create sequence public.registration_sequence;
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  registration text not null unique check (char_length(registration) between 3 and 60),
  customer text not null check (char_length(customer) between 2 and 100),
  branch text not null check (char_length(branch) between 2 and 100),
  notes text not null default '' check (char_length(notes) <= 1000),
  stage integer not null default 1 check (stage between 0 and 12),
  status text not null default 'waiting' check (status in ('waiting','processing','hold','completed','rejected')),
  assignee text,
  due_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  version integer not null default 0
);
create table public.document_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  action text not null check (action in ('create','receive','finish','hold','resume','reject')),
  stage integer not null check (stage between 0 and 12),
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null,
  occurred_at timestamptz not null default now(),
  note text not null default '' check (char_length(note) <= 1000)
);
create index document_events_application_time_idx on public.document_events(application_id, occurred_at desc);
create index applications_updated_idx on public.applications(updated_at desc);
alter table public.profiles enable row level security;
alter table public.applications enable row level security;
alter table public.document_events enable row level security;
-- The project owner requested a public monitoring dashboard. Mutations require staff membership.
create policy "Read own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "Public monitoring" on public.applications for select to anon, authenticated using (true);
create policy "Public audit trail" on public.document_events for select to anon, authenticated using (true);
grant select on public.profiles to authenticated;
grant select on public.applications, public.document_events to anon, authenticated;
revoke insert, update, delete on public.profiles, public.applications, public.document_events from anon, authenticated;
revoke all on sequence public.registration_sequence from anon, authenticated;

create or replace function public.register_application(
  p_customer text, p_registration text, p_branch text, p_due_at timestamptz, p_notes text default ''
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  staff public.profiles%rowtype;
  application_id uuid;
  reference_code text;
  registration_number bigint;
begin
  if auth.uid() is null then raise exception 'Silakan login terlebih dahulu.' using errcode = '42501'; end if;
  select * into staff from public.profiles where id = auth.uid() and active;
  if not found or staff.role not in ('admin', 'sales') then
    raise exception 'Pendaftaran pengajuan hanya tersedia untuk Admin Sales.' using errcode = '42501';
  end if;
  if p_due_at is null or p_due_at <= now() or p_due_at > now() + interval '1 year' then
    raise exception 'Target selesai harus di masa depan, maksimal satu tahun.';
  end if;
  reference_code := upper(nullif(trim(p_registration), ''));
  if reference_code is null then
    registration_number := nextval('public.registration_sequence');
    reference_code := 'BRK-' || to_char(now() at time zone 'Asia/Jakarta', 'YYYYMMDD') || '-' || lpad(registration_number::text, greatest(6, length(registration_number::text)), '0');
  end if;
  insert into public.applications (registration, customer, branch, due_at, notes, created_by)
    values (reference_code, trim(p_customer), trim(p_branch), p_due_at, trim(coalesce(p_notes,'')), auth.uid()) returning id into application_id;
  insert into public.document_events (application_id, action, stage, actor_id, actor_name, note)
    values (application_id, 'create', 0, auth.uid(), staff.full_name, trim(coalesce(p_notes,''))),
           (application_id, 'finish', 0, auth.uid(), staff.full_name, 'Registrasi selesai. Menunggu diterima Admin Grading / Risk.');
  return application_id;
end;
$$;

create or replace function public.record_document_event(
  p_application_id uuid, p_action text, p_expected_version integer, p_note text default ''
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  staff public.profiles%rowtype;
  item public.applications%rowtype;
  stage_roles text[] := array['sales','risk','sales','coordinator','analyst','committee','ao','sales','coordinator','analyst','credit_admin','ao','underwriting'];
  next_status text;
  next_stage integer;
  next_assignee text;
  event_id uuid;
begin
  if auth.uid() is null then raise exception 'Silakan login terlebih dahulu.' using errcode = '42501'; end if;
  select * into staff from public.profiles where id = auth.uid() and active;
  if not found then raise exception 'Akun belum diberi akses petugas oleh administrator.' using errcode = '42501'; end if;
  select * into item from public.applications where id = p_application_id for update;
  if not found then raise exception 'Pengajuan tidak ditemukan.' using errcode = 'P0002'; end if;
  if staff.role <> 'admin' and staff.role <> stage_roles[item.stage + 1] then
    raise exception 'Tindakan ini hanya tersedia untuk PIC pada tahap berjalan.' using errcode = '42501';
  end if;
  if p_expected_version is distinct from item.version then
    raise exception 'Berkas telah diperbarui petugas lain. Muat ulang sebelum melanjutkan.' using errcode = '40001';
  end if;
  if not (
    (item.status = 'waiting' and p_action = 'receive') or
    (item.status = 'processing' and p_action in ('finish','hold','reject')) or
    (item.status = 'hold' and p_action in ('resume','reject'))
  ) then raise exception 'Tindakan tidak sesuai dengan status berkas saat ini.'; end if;
  if char_length(coalesce(p_note,'')) > 1000 then raise exception 'Catatan maksimal 1000 karakter.'; end if;
  if p_action in ('hold','reject') and char_length(trim(coalesce(p_note,''))) < 5 then
    raise exception 'Tuliskan alasan minimal 5 karakter.';
  end if;
  if p_action = 'reject' and item.stage not in (4,5) then
    raise exception 'Penolakan hanya dicatat pada tahap analisis atau komite.';
  end if;
  next_status := item.status;
  next_stage := item.stage;
  next_assignee := item.assignee;
  case p_action
    when 'receive', 'resume' then next_status := 'processing'; next_assignee := staff.full_name;
    when 'hold' then next_status := 'hold';
    when 'reject' then next_status := 'rejected';
    when 'finish' then
      if item.stage = 12 then next_status := 'completed';
      else next_stage := item.stage + 1; next_status := 'waiting'; next_assignee := null;
      end if;
    else raise exception 'Tindakan tidak dikenal.';
  end case;
  update public.applications set status = next_status, stage = next_stage, assignee = next_assignee,
    updated_at = now(), version = version + 1 where id = item.id;
  insert into public.document_events (application_id, action, stage, actor_id, actor_name, note)
    values (item.id, p_action, item.stage, auth.uid(), staff.full_name, trim(coalesce(p_note,''))) returning id into event_id;
  return event_id;
end;
$$;
revoke all on function public.register_application(text,text,text,timestamptz,text) from public, anon;
revoke all on function public.record_document_event(uuid,text,integer,text) from public, anon;
grant execute on function public.register_application(text,text,text,timestamptz,text) to authenticated;
grant execute on function public.record_document_event(uuid,text,integer,text) to authenticated;
