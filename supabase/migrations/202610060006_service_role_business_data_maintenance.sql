-- Server-side maintenance scripts need explicit table privileges because the
-- initial schema intentionally granted business tables only to authenticated.
-- RLS still protects browser users; only the server-only service role receives
-- these privileges.
grant select, insert, update, delete on table
  public.class_sessions,
  public.template_versions,
  public.template_fields,
  public.field_options,
  public.reports,
  public.report_answers,
  public.report_attachments
to service_role;

-- Demo resets remove an entire report graph. A cascade also fires this guard,
-- so allow the trusted service role to perform maintenance while preserving
-- the cancelled-session lock for every application user.
create or replace function public.guard_report_attachment_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class_session_id uuid;
  v_session_status public.class_session_status;
begin
  if auth.role() = 'service_role' then
    return old;
  end if;

  select class_session_id into v_class_session_id
  from public.reports
  where id = old.report_id;

  select status into v_session_status
  from public.class_sessions
  where id = v_class_session_id
  for share;

  if v_session_status = 'cancelled'::public.class_session_status then
    raise exception 'A cancelled session attachment cannot be changed'
      using errcode = 'PT409';
  end if;

  perform 1 from public.reports where id = old.report_id for update;
  return old;
end;
$$;

revoke all on function public.guard_report_attachment_delete() from public;
