-- Initial schema for the class report application.
-- Target: Supabase PostgreSQL

create extension if not exists pgcrypto;

create type public.member_role as enum ('admin', 'coach');
create type public.member_status as enum ('active', 'inactive');
create type public.class_session_status as enum ('scheduled', 'cancelled');
create type public.template_status as enum ('draft', 'active', 'archived');
create type public.template_field_type as enum (
  'short_text',
  'long_text',
  'number',
  'date',
  'single_select',
  'multi_select',
  'photo'
);
create type public.report_status as enum ('draft', 'submitted');
create type public.export_format as enum ('pdf', 'xlsx');
create type public.export_status as enum ('queued', 'processing', 'completed', 'failed');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name varchar(100) not null check (btrim(name) <> ''),
  timezone varchar(50) not null default 'Asia/Seoul',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name varchar(50) not null check (btrim(name) <> ''),
  role public.member_role not null default 'coach',
  status public.member_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  title varchar(150) not null check (btrim(title) <> ''),
  location varchar(200) not null check (btrim(location) <> ''),
  start_at timestamptz not null,
  end_at timestamptz not null,
  memo text,
  status public.class_session_status not null default 'scheduled',
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_sessions_valid_period check (start_at < end_at)
);

create table public.template_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  version integer not null check (version > 0),
  status public.template_status not null default 'draft',
  created_by uuid not null references public.profiles(id) on delete restrict,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, version),
  constraint template_published_state check (
    (status = 'draft' and published_at is null)
    or (status in ('active', 'archived') and published_at is not null)
  )
);

create unique index template_versions_one_active_per_org
  on public.template_versions (organization_id)
  where status = 'active';

create table public.template_fields (
  id uuid primary key default gen_random_uuid(),
  template_version_id uuid not null references public.template_versions(id) on delete cascade,
  label varchar(100) not null check (btrim(label) <> ''),
  help_text varchar(300),
  field_type public.template_field_type not null,
  required boolean not null default false,
  sort_order integer not null check (sort_order >= 0),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_version_id, sort_order),
  constraint template_fields_settings_object check (jsonb_typeof(settings) = 'object')
);

create table public.field_options (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.template_fields(id) on delete cascade,
  label varchar(100) not null check (btrim(label) <> ''),
  sort_order integer not null check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (field_id, sort_order),
  unique (field_id, label)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  class_session_id uuid not null references public.class_sessions(id) on delete restrict,
  author_id uuid not null references public.profiles(id) on delete restrict,
  template_version_id uuid not null references public.template_versions(id) on delete restrict,
  status public.report_status not null default 'draft',
  submitted_at timestamptz,
  confirmed_by uuid references public.profiles(id) on delete restrict,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_session_id, author_id),
  constraint reports_submission_state check (
    (status = 'draft' and submitted_at is null)
    or (status = 'submitted' and submitted_at is not null)
  ),
  constraint reports_confirmation_state check (
    (confirmed_by is null and confirmed_at is null)
    or (confirmed_by is not null and confirmed_at is not null)
  )
);

create table public.report_answers (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  field_id uuid not null references public.template_fields(id) on delete restrict,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (report_id, field_id)
);

create table public.report_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  report_id uuid not null references public.reports(id) on delete cascade,
  field_id uuid not null references public.template_fields(id) on delete restrict,
  storage_path text not null unique,
  original_filename text not null,
  mime_type varchar(50) not null default 'image/jpeg',
  file_size integer not null check (file_size > 0 and file_size <= 1048576),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  created_at timestamptz not null default now()
);

create table public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  format public.export_format not null,
  filters jsonb not null default '{}'::jsonb,
  status public.export_status not null default 'queued',
  storage_path text,
  error_message text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint export_jobs_filters_object check (jsonb_typeof(filters) = 'object')
);

create index profiles_org_idx on public.profiles (organization_id, status, role);
create index class_sessions_org_start_idx on public.class_sessions (organization_id, start_at);
create index class_sessions_org_status_idx on public.class_sessions (organization_id, status, start_at);
create index template_versions_org_status_idx on public.template_versions (organization_id, status);
create index template_fields_version_order_idx on public.template_fields (template_version_id, sort_order);
create index reports_org_created_idx on public.reports (organization_id, created_at desc);
create index reports_org_status_idx on public.reports (organization_id, status, confirmed_at);
create index reports_author_idx on public.reports (author_id, created_at desc);
create index reports_session_idx on public.reports (class_session_id);
create index report_answers_report_idx on public.report_answers (report_id);
create index report_attachments_report_idx on public.report_attachments (report_id, field_id);
create index export_jobs_requester_idx on public.export_jobs (requested_by, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger class_sessions_set_updated_at
before update on public.class_sessions
for each row execute function public.set_updated_at();

create trigger template_versions_set_updated_at
before update on public.template_versions
for each row execute function public.set_updated_at();

create trigger template_fields_set_updated_at
before update on public.template_fields
for each row execute function public.set_updated_at();

create trigger field_options_set_updated_at
before update on public.field_options
for each row execute function public.set_updated_at();

create trigger reports_set_updated_at
before update on public.reports
for each row execute function public.set_updated_at();

create trigger report_answers_set_updated_at
before update on public.report_answers
for each row execute function public.set_updated_at();

create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.organization_id
  from public.profiles p
  where p.id = auth.uid()
    and p.status = 'active'::public.member_status
$$;

create or replace function public.current_user_role()
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.status = 'active'::public.member_status
$$;

create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'::public.member_status
  )
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() = 'admin'::public.member_role, false)
$$;

create or replace function public.protect_class_session_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id <> old.organization_id or new.created_by <> old.created_by then
    raise exception 'Class session organization and creator are immutable'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger class_sessions_protect_identity
before update on public.class_sessions
for each row execute function public.protect_class_session_identity();

create or replace function public.protect_profile_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id or new.organization_id <> old.organization_id then
    raise exception 'Profile identity and organization are immutable'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_identity
before update on public.profiles
for each row execute function public.protect_profile_identity();

create or replace function public.prevent_published_template_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status public.template_status;
  v_template_version_id uuid;
  v_field_id uuid;
begin
  if tg_table_name = 'template_fields' then
    v_template_version_id := case when tg_op = 'DELETE' then old.template_version_id else new.template_version_id end;
    select tv.status into v_status
    from public.template_versions tv
    where tv.id = v_template_version_id;
  else
    v_field_id := case when tg_op = 'DELETE' then old.field_id else new.field_id end;
    select tv.status into v_status
    from public.template_versions tv
    join public.template_fields tf on tf.template_version_id = tv.id
    where tf.id = v_field_id;
  end if;

  if v_status <> 'draft'::public.template_status then
    raise exception 'Published template versions are immutable'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger template_fields_require_draft
before insert or update or delete on public.template_fields
for each row execute function public.prevent_published_template_changes();

create trigger field_options_require_draft
before insert or update or delete on public.field_options
for each row execute function public.prevent_published_template_changes();

create or replace function public.touch_report_after_attachment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report_id uuid;
begin
  v_report_id := case when tg_op = 'DELETE' then old.report_id else new.report_id end;
  update public.reports
  set confirmed_by = null,
      confirmed_at = null,
      updated_at = now()
  where id = v_report_id;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger report_attachments_touch_report
after insert or update or delete on public.report_attachments
for each row execute function public.touch_report_after_attachment_change();

create or replace function public.answer_matches_type(
  p_type public.template_field_type,
  p_value jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value = 'null'::jsonb then
    return true;
  elsif p_type in ('short_text', 'long_text', 'date', 'single_select') then
    return jsonb_typeof(p_value) = 'string';
  elsif p_type = 'number' then
    return jsonb_typeof(p_value) = 'number';
  elsif p_type = 'multi_select' then
    if jsonb_typeof(p_value) <> 'array' then
      return false;
    end if;
    return not exists (
      select 1 from jsonb_array_elements(p_value) e
      where jsonb_typeof(e) <> 'string'
    );
  end if;
  return false;
end;
$$;

create or replace function public.answer_is_empty(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null or p_value = 'null'::jsonb then
    return true;
  elsif jsonb_typeof(p_value) = 'string' then
    return btrim(p_value #>> '{}') = '';
  elsif jsonb_typeof(p_value) = 'array' then
    return jsonb_array_length(p_value) = 0;
  end if;
  return false;
end;
$$;

create or replace function public.cancel_class_session(p_session_id uuid)
returns public.class_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.class_sessions;
begin
  if not public.is_active_member() then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into v_session
  from public.class_sessions
  where id = p_session_id
    and organization_id = public.current_organization_id();

  if not found then
    raise exception 'Class session not found' using errcode = 'P0002';
  end if;

  if not public.is_admin() and v_session.created_by <> auth.uid() then
    raise exception 'Only an administrator or the creator can cancel this session'
      using errcode = '42501';
  end if;

  update public.class_sessions
  set status = 'cancelled',
      updated_by = auth.uid()
  where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

create or replace function public.get_or_create_report(p_class_session_id uuid)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.class_sessions;
  v_template_id uuid;
  v_report public.reports;
begin
  if not public.is_active_member() then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into v_session
  from public.class_sessions
  where id = p_class_session_id
    and organization_id = public.current_organization_id();

  if not found then
    raise exception 'Class session not found' using errcode = 'P0002';
  end if;

  if v_session.status = 'cancelled'::public.class_session_status then
    raise exception 'A report cannot be created for a cancelled session'
      using errcode = '23514';
  end if;

  select * into v_report
  from public.reports
  where class_session_id = p_class_session_id
    and author_id = auth.uid();

  if found then
    return v_report;
  end if;

  select id into v_template_id
  from public.template_versions
  where organization_id = public.current_organization_id()
    and status = 'active'::public.template_status;

  if v_template_id is null then
    raise exception 'No active report template exists' using errcode = 'P0002';
  end if;

  insert into public.reports (
    organization_id,
    class_session_id,
    author_id,
    template_version_id
  ) values (
    public.current_organization_id(),
    p_class_session_id,
    auth.uid(),
    v_template_id
  )
  on conflict (class_session_id, author_id) do update
    set updated_at = public.reports.updated_at
  returning * into v_report;

  return v_report;
end;
$$;

create or replace function public.save_report_draft(
  p_report_id uuid,
  p_answers jsonb
)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports;
  v_item jsonb;
  v_field public.template_fields;
  v_field_id uuid;
  v_value jsonb;
begin
  if not public.is_active_member() then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if jsonb_typeof(p_answers) <> 'array' then
    raise exception 'Answers must be a JSON array' using errcode = '22023';
  end if;

  select * into v_report
  from public.reports
  where id = p_report_id
    and author_id = auth.uid()
    and organization_id = public.current_organization_id()
  for update;

  if not found then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;

  for v_item in select value from jsonb_array_elements(p_answers)
  loop
    if not (v_item ? 'fieldId') or not (v_item ? 'value') then
      raise exception 'Each answer requires fieldId and value' using errcode = '22023';
    end if;

    v_field_id := (v_item ->> 'fieldId')::uuid;
    v_value := v_item -> 'value';

    select * into v_field
    from public.template_fields
    where id = v_field_id
      and template_version_id = v_report.template_version_id;

    if not found then
      raise exception 'Field % does not belong to the report template', v_field_id
        using errcode = '23503';
    end if;

    if not public.answer_matches_type(v_field.field_type, v_value) then
      raise exception 'Invalid value type for field %', v_field.label
        using errcode = '22023';
    end if;

    insert into public.report_answers (report_id, field_id, value)
    values (p_report_id, v_field_id, v_value)
    on conflict (report_id, field_id) do update
      set value = excluded.value;
  end loop;

  delete from public.report_answers a
  where a.report_id = p_report_id
    and not exists (
      select 1
      from jsonb_array_elements(p_answers) item
      where (item ->> 'fieldId')::uuid = a.field_id
    );

  update public.reports
  set confirmed_by = null,
      confirmed_at = null
  where id = p_report_id
  returning * into v_report;

  return v_report;
end;
$$;

create or replace function public.submit_report(p_report_id uuid)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports;
  v_session_status public.class_session_status;
  v_field public.template_fields;
  v_value jsonb;
  v_attachment_count integer;
  v_max_files integer;
begin
  if not public.is_active_member() then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select r.* into v_report
  from public.reports r
  join public.class_sessions cs on cs.id = r.class_session_id
  where r.id = p_report_id
    and r.author_id = auth.uid()
    and r.organization_id = public.current_organization_id()
  for update of r;

  if not found then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;

  select cs.status into v_session_status
  from public.class_sessions cs
  where cs.id = v_report.class_session_id
  for share;

  if v_session_status = 'cancelled'::public.class_session_status then
    raise exception 'A report for a cancelled session cannot be submitted'
      using errcode = '23514';
  end if;

  for v_field in
    select *
    from public.template_fields
    where template_version_id = v_report.template_version_id
    order by sort_order
  loop
    if v_field.field_type = 'photo'::public.template_field_type then
      select count(*) into v_attachment_count
      from public.report_attachments
      where report_id = p_report_id
        and field_id = v_field.id;

      v_max_files := coalesce((v_field.settings ->> 'max_files')::integer, 3);

      if v_field.required and v_attachment_count = 0 then
        raise exception 'Required photo field is empty: %', v_field.label
          using errcode = '23514';
      end if;

      if v_attachment_count > v_max_files then
        raise exception 'Too many photos for field %', v_field.label
          using errcode = '23514';
      end if;
      continue;
    end if;

    v_value := null;
    select a.value into v_value
    from public.report_answers a
    where a.report_id = p_report_id
      and a.field_id = v_field.id;

    if v_field.required and public.answer_is_empty(v_value) then
      raise exception 'Required field is empty: %', v_field.label
        using errcode = '23514';
    end if;

    if not public.answer_is_empty(v_value) then
      if not public.answer_matches_type(v_field.field_type, v_value) then
        raise exception 'Invalid value type for field %', v_field.label
          using errcode = '22023';
      end if;

      if v_field.field_type = 'date'::public.template_field_type
         and (v_value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception 'Invalid date value for field %', v_field.label
          using errcode = '22007';
      end if;

      if v_field.field_type = 'single_select'::public.template_field_type
         and not exists (
           select 1 from public.field_options o
           where o.field_id = v_field.id
             and o.label = (v_value #>> '{}')
         ) then
        raise exception 'Invalid option for field %', v_field.label
          using errcode = '22023';
      end if;

      if v_field.field_type = 'multi_select'::public.template_field_type
         and exists (
           select 1
           from jsonb_array_elements_text(v_value) selected(value)
           where not exists (
             select 1 from public.field_options o
             where o.field_id = v_field.id
               and o.label = selected.value
           )
         ) then
        raise exception 'Invalid option for field %', v_field.label
          using errcode = '22023';
      end if;
    end if;
  end loop;

  update public.reports
  set status = 'submitted',
      submitted_at = coalesce(submitted_at, now()),
      confirmed_by = null,
      confirmed_at = null
  where id = p_report_id
  returning * into v_report;

  return v_report;
end;
$$;

create or replace function public.confirm_report(p_report_id uuid)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports;
begin
  if not public.is_admin() then
    raise exception 'Administrator permission required' using errcode = '42501';
  end if;

  update public.reports
  set confirmed_by = auth.uid(),
      confirmed_at = now()
  where id = p_report_id
    and organization_id = public.current_organization_id()
    and status = 'submitted'::public.report_status
  returning * into v_report;

  if not found then
    raise exception 'Submitted report not found' using errcode = 'P0002';
  end if;

  return v_report;
end;
$$;

create or replace function public.publish_template(p_template_version_id uuid)
returns public.template_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template public.template_versions;
begin
  if not public.is_admin() then
    raise exception 'Administrator permission required' using errcode = '42501';
  end if;

  select * into v_template
  from public.template_versions
  where id = p_template_version_id
    and organization_id = public.current_organization_id()
    and status = 'draft'::public.template_status
  for update;

  if not found then
    raise exception 'Draft template not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.template_fields
    where template_version_id = p_template_version_id
  ) then
    raise exception 'A template requires at least one field' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.template_fields f
    where f.template_version_id = p_template_version_id
      and f.field_type in ('single_select', 'multi_select')
      and not exists (
        select 1 from public.field_options o where o.field_id = f.id
      )
  ) then
    raise exception 'Every select field requires at least one option'
      using errcode = '23514';
  end if;

  update public.template_versions
  set status = 'archived'
  where organization_id = public.current_organization_id()
    and status = 'active'::public.template_status;

  update public.template_versions
  set status = 'active',
      published_at = now()
  where id = p_template_version_id
  returning * into v_template;

  return v_template;
end;
$$;

create or replace function public.update_my_profile(p_name text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  if not public.is_active_member() or btrim(p_name) = '' then
    raise exception 'Invalid profile update' using errcode = '22023';
  end if;

  update public.profiles
  set name = left(btrim(p_name), 50)
  where id = auth.uid()
  returning * into v_profile;

  return v_profile;
end;
$$;

create or replace function public.change_member_role(
  p_user_id uuid,
  p_role public.member_role
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.profiles;
  v_other_admins integer;
begin
  if not public.is_admin() then
    raise exception 'Administrator permission required' using errcode = '42501';
  end if;

  select * into v_target
  from public.profiles
  where id = p_user_id
    and organization_id = public.current_organization_id()
  for update;

  if not found then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;

  if v_target.role = 'admin'::public.member_role
     and v_target.status = 'active'::public.member_status
     and p_role = 'coach'::public.member_role then
    select count(*) into v_other_admins
    from public.profiles
    where organization_id = v_target.organization_id
      and role = 'admin'::public.member_role
      and status = 'active'::public.member_status
      and id <> p_user_id;

    if v_other_admins = 0 then
      raise exception 'The last active administrator cannot be demoted'
        using errcode = '23514';
    end if;
  end if;

  update public.profiles
  set role = p_role
  where id = p_user_id
  returning * into v_target;

  return v_target;
end;
$$;

create or replace function public.change_member_status(
  p_user_id uuid,
  p_status public.member_status
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.profiles;
  v_other_admins integer;
begin
  if not public.is_admin() then
    raise exception 'Administrator permission required' using errcode = '42501';
  end if;

  select * into v_target
  from public.profiles
  where id = p_user_id
    and organization_id = public.current_organization_id()
  for update;

  if not found then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;

  if v_target.role = 'admin'::public.member_role
     and v_target.status = 'active'::public.member_status
     and p_status = 'inactive'::public.member_status then
    select count(*) into v_other_admins
    from public.profiles
    where organization_id = v_target.organization_id
      and role = 'admin'::public.member_role
      and status = 'active'::public.member_status
      and id <> p_user_id;

    if v_other_admins = 0 then
      raise exception 'The last active administrator cannot be deactivated'
        using errcode = '23514';
    end if;
  end if;

  update public.profiles
  set status = p_status
  where id = p_user_id
  returning * into v_target;

  return v_target;
end;
$$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.class_sessions enable row level security;
alter table public.template_versions enable row level security;
alter table public.template_fields enable row level security;
alter table public.field_options enable row level security;
alter table public.reports enable row level security;
alter table public.report_answers enable row level security;
alter table public.report_attachments enable row level security;
alter table public.export_jobs enable row level security;

create policy organizations_select_own
on public.organizations for select to authenticated
using (id = public.current_organization_id());

create policy profiles_select_allowed
on public.profiles for select to authenticated
using (
  public.is_active_member()
  and (
    id = auth.uid()
    or (public.is_admin() and organization_id = public.current_organization_id())
  )
);

create policy class_sessions_select_org
on public.class_sessions for select to authenticated
using (
  public.is_active_member()
  and organization_id = public.current_organization_id()
);

create policy class_sessions_insert_org
on public.class_sessions for insert to authenticated
with check (
  public.is_active_member()
  and organization_id = public.current_organization_id()
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

create policy class_sessions_update_creator_or_admin
on public.class_sessions for update to authenticated
using (
  public.is_active_member()
  and organization_id = public.current_organization_id()
  and (created_by = auth.uid() or public.is_admin())
)
with check (
  organization_id = public.current_organization_id()
  and updated_by = auth.uid()
);

create policy template_versions_select_org
on public.template_versions for select to authenticated
using (
  public.is_active_member()
  and organization_id = public.current_organization_id()
);

create policy template_versions_insert_admin_draft
on public.template_versions for insert to authenticated
with check (
  public.is_admin()
  and organization_id = public.current_organization_id()
  and created_by = auth.uid()
  and status = 'draft'::public.template_status
);

create policy template_versions_update_admin_draft
on public.template_versions for update to authenticated
using (
  public.is_admin()
  and organization_id = public.current_organization_id()
  and status = 'draft'::public.template_status
)
with check (
  organization_id = public.current_organization_id()
  and status = 'draft'::public.template_status
);

create policy template_fields_select_org
on public.template_fields for select to authenticated
using (
  exists (
    select 1 from public.template_versions tv
    where tv.id = template_version_id
      and tv.organization_id = public.current_organization_id()
  )
);

create policy template_fields_insert_admin_draft
on public.template_fields for insert to authenticated
with check (
  public.is_admin()
  and exists (
    select 1 from public.template_versions tv
    where tv.id = template_version_id
      and tv.organization_id = public.current_organization_id()
      and tv.status = 'draft'::public.template_status
  )
);

create policy template_fields_update_admin_draft
on public.template_fields for update to authenticated
using (
  public.is_admin()
  and exists (
    select 1 from public.template_versions tv
    where tv.id = template_version_id
      and tv.organization_id = public.current_organization_id()
      and tv.status = 'draft'::public.template_status
  )
)
with check (
  exists (
    select 1 from public.template_versions tv
    where tv.id = template_version_id
      and tv.organization_id = public.current_organization_id()
      and tv.status = 'draft'::public.template_status
  )
);

create policy template_fields_delete_admin_draft
on public.template_fields for delete to authenticated
using (
  public.is_admin()
  and exists (
    select 1 from public.template_versions tv
    where tv.id = template_version_id
      and tv.organization_id = public.current_organization_id()
      and tv.status = 'draft'::public.template_status
  )
);

create policy field_options_select_org
on public.field_options for select to authenticated
using (
  exists (
    select 1
    from public.template_fields tf
    join public.template_versions tv on tv.id = tf.template_version_id
    where tf.id = field_id
      and tv.organization_id = public.current_organization_id()
  )
);

create policy field_options_insert_admin_draft
on public.field_options for insert to authenticated
with check (
  public.is_admin()
  and exists (
    select 1
    from public.template_fields tf
    join public.template_versions tv on tv.id = tf.template_version_id
    where tf.id = field_id
      and tv.organization_id = public.current_organization_id()
      and tv.status = 'draft'::public.template_status
  )
);

create policy field_options_update_admin_draft
on public.field_options for update to authenticated
using (
  public.is_admin()
  and exists (
    select 1
    from public.template_fields tf
    join public.template_versions tv on tv.id = tf.template_version_id
    where tf.id = field_id
      and tv.organization_id = public.current_organization_id()
      and tv.status = 'draft'::public.template_status
  )
)
with check (
  exists (
    select 1
    from public.template_fields tf
    join public.template_versions tv on tv.id = tf.template_version_id
    where tf.id = field_id
      and tv.organization_id = public.current_organization_id()
      and tv.status = 'draft'::public.template_status
  )
);

create policy field_options_delete_admin_draft
on public.field_options for delete to authenticated
using (
  public.is_admin()
  and exists (
    select 1
    from public.template_fields tf
    join public.template_versions tv on tv.id = tf.template_version_id
    where tf.id = field_id
      and tv.organization_id = public.current_organization_id()
      and tv.status = 'draft'::public.template_status
  )
);

create policy reports_select_author_or_admin
on public.reports for select to authenticated
using (
  public.is_active_member()
  and organization_id = public.current_organization_id()
  and (author_id = auth.uid() or public.is_admin())
);

create policy report_answers_select_author_or_admin
on public.report_answers for select to authenticated
using (
  exists (
    select 1 from public.reports r
    where r.id = report_id
      and r.organization_id = public.current_organization_id()
      and (r.author_id = auth.uid() or public.is_admin())
  )
);

create policy report_attachments_select_author_or_admin
on public.report_attachments for select to authenticated
using (
  organization_id = public.current_organization_id()
  and exists (
    select 1 from public.reports r
    where r.id = report_id
      and r.organization_id = public.current_organization_id()
      and (r.author_id = auth.uid() or public.is_admin())
  )
);

create policy report_attachments_insert_author
on public.report_attachments for insert to authenticated
with check (
  public.is_active_member()
  and report_attachments.organization_id = public.current_organization_id()
  and report_attachments.storage_path like (
    public.current_organization_id()::text || '/' || report_attachments.report_id::text || '/%'
  )
  and exists (
    select 1
    from public.reports r
    join public.template_fields tf on tf.id = field_id
    where r.id = report_attachments.report_id
      and r.author_id = auth.uid()
      and r.organization_id = report_attachments.organization_id
      and tf.template_version_id = r.template_version_id
      and tf.field_type = 'photo'::public.template_field_type
  )
);

create policy report_attachments_delete_author_or_admin
on public.report_attachments for delete to authenticated
using (
  report_attachments.organization_id = public.current_organization_id()
  and exists (
    select 1 from public.reports r
    where r.id = report_attachments.report_id
      and r.organization_id = report_attachments.organization_id
      and (r.author_id = auth.uid() or public.is_admin())
  )
);

create policy export_jobs_select_requester
on public.export_jobs for select to authenticated
using (
  public.is_admin()
  and organization_id = public.current_organization_id()
  and requested_by = auth.uid()
);

revoke all on table public.organizations from anon, authenticated;
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.class_sessions from anon, authenticated;
revoke all on table public.template_versions from anon, authenticated;
revoke all on table public.template_fields from anon, authenticated;
revoke all on table public.field_options from anon, authenticated;
revoke all on table public.reports from anon, authenticated;
revoke all on table public.report_answers from anon, authenticated;
revoke all on table public.report_attachments from anon, authenticated;
revoke all on table public.export_jobs from anon, authenticated;

grant select on public.organizations to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update on public.class_sessions to authenticated;
grant select, insert, update on public.template_versions to authenticated;
grant select, insert, update, delete on public.template_fields to authenticated;
grant select, insert, update, delete on public.field_options to authenticated;
grant select on public.reports to authenticated;
grant select on public.report_answers to authenticated;
grant select, insert, delete on public.report_attachments to authenticated;
grant select on public.export_jobs to authenticated;

revoke all on function public.current_organization_id() from public;
revoke all on function public.current_user_role() from public;
revoke all on function public.is_active_member() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.cancel_class_session(uuid) from public;
revoke all on function public.get_or_create_report(uuid) from public;
revoke all on function public.save_report_draft(uuid, jsonb) from public;
revoke all on function public.submit_report(uuid) from public;
revoke all on function public.confirm_report(uuid) from public;
revoke all on function public.publish_template(uuid) from public;
revoke all on function public.update_my_profile(text) from public;
revoke all on function public.change_member_role(uuid, public.member_role) from public;
revoke all on function public.change_member_status(uuid, public.member_status) from public;

grant execute on function public.current_organization_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_active_member() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.cancel_class_session(uuid) to authenticated;
grant execute on function public.get_or_create_report(uuid) to authenticated;
grant execute on function public.save_report_draft(uuid, jsonb) to authenticated;
grant execute on function public.submit_report(uuid) to authenticated;
grant execute on function public.confirm_report(uuid) to authenticated;
grant execute on function public.publish_template(uuid) to authenticated;
grant execute on function public.update_my_profile(text) to authenticated;
grant execute on function public.change_member_role(uuid, public.member_role) to authenticated;
grant execute on function public.change_member_status(uuid, public.member_status) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-images',
  'report-images',
  false,
  1048576,
  array['image/jpeg']
)
on conflict (id) do nothing;

create policy report_images_select_author_or_admin
on storage.objects for select to authenticated
using (
  bucket_id = 'report-images'
  and (storage.foldername(name))[1] = public.current_organization_id()::text
  and exists (
    select 1
    from public.reports r
    where r.id = ((storage.foldername(name))[2])::uuid
      and r.organization_id = public.current_organization_id()
      and (r.author_id = auth.uid() or public.is_admin())
  )
);

create policy report_images_insert_author
on storage.objects for insert to authenticated
with check (
  bucket_id = 'report-images'
  and (storage.foldername(name))[1] = public.current_organization_id()::text
  and exists (
    select 1
    from public.reports r
    where r.id = ((storage.foldername(name))[2])::uuid
      and r.organization_id = public.current_organization_id()
      and r.author_id = auth.uid()
  )
);

create policy report_images_delete_author_or_admin
on storage.objects for delete to authenticated
using (
  bucket_id = 'report-images'
  and (storage.foldername(name))[1] = public.current_organization_id()::text
  and exists (
    select 1
    from public.reports r
    where r.id = ((storage.foldername(name))[2])::uuid
      and r.organization_id = public.current_organization_id()
      and (r.author_id = auth.uid() or public.is_admin())
  )
);
