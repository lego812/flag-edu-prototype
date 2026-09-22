-- Keep historical confirmation columns for old records, but remove approval APIs.
drop function public.confirm_report_version(uuid,timestamptz);
drop function public.confirm_report(uuid);

alter table public.class_sessions add column teaching_method text
  check (char_length(teaching_method) <= 2000);

create or replace function public.create_class_schedule(p_registration_id uuid,p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_item jsonb; v_id uuid; v_first uuid; v_index integer:=0;
begin
  if not public.is_active_member() then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_registration_id is null or jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Invalid schedule'; end if;
  if jsonb_array_length(p_items) not between 1 and 366 then raise exception 'Schedule must contain 1 to 366 classes'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_registration_id::text,2));
  select id into v_first from public.class_sessions where created_by=auth.uid() and organization_id=public.current_organization_id() and registration_id=p_registration_id order by occurrence_no limit 1;
  if v_first is not null then return v_first; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.class_sessions(organization_id,title,location,start_at,end_at,memo,teaching_method,has_time,created_by,updated_by,registration_id,occurrence_no)
    values(public.current_organization_id(),btrim(v_item->>'title'),btrim(v_item->>'location'),(v_item->>'start_at')::timestamptz,(v_item->>'end_at')::timestamptz,v_item->>'memo',nullif(btrim(v_item->>'teaching_method'),''),(v_item->>'has_time')::boolean,auth.uid(),auth.uid(),p_registration_id,v_index)
    returning id into v_id;
    if v_first is null then v_first:=v_id; end if;
    v_index:=v_index+1;
  end loop;
  return v_first;
end; $$;
revoke all on function public.create_class_schedule(uuid,jsonb) from public;
grant execute on function public.create_class_schedule(uuid,jsonb) to authenticated;



create or replace function public.save_and_submit_report(p_id uuid, p_version timestamptz, p_answers jsonb, p_submit boolean)
returns public.reports language plpgsql security definer set search_path = '' as $$
declare v_report public.reports;
begin
  if not public.is_active_member() then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into v_report from public.reports where id=p_id and author_id=auth.uid() and organization_id=public.current_organization_id() for update;
  if not found then raise exception 'Report not found'; end if;
  if p_version is distinct from v_report.updated_at then raise exception 'Report changed; reload' using errcode='40001'; end if;
  select * into v_report from public.save_report_draft(p_id,p_answers);
  if p_submit then
    select * into v_report from public.submit_report(p_id);
  else
    update public.reports set status='draft',submitted_at=null where id=p_id returning * into v_report;
  end if;
  return v_report;
end; $$;

