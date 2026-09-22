alter table public.class_sessions
  add column has_time boolean not null default true,
  add column registration_id uuid,
  add column occurrence_no integer;
alter table public.class_sessions add constraint class_registration_identity check (
  (registration_id is null and occurrence_no is null)
  or (registration_id is not null and occurrence_no between 0 and 365)
);
create unique index class_registration_occurrence on public.class_sessions(created_by,registration_id,occurrence_no);
alter table public.class_sessions add constraint class_unspecified_time check (
  has_time or (
    (start_at at time zone 'Asia/Seoul')::time = time '00:00'
    and end_at = start_at + interval '1 day'
  )
);

-- One atomic batch, with an idempotency key to prevent double-click/retry duplicates.
create function public.create_class_schedule(p_registration_id uuid,p_items jsonb)
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
    insert into public.class_sessions(organization_id,title,location,start_at,end_at,memo,has_time,created_by,updated_by,registration_id,occurrence_no)
    values(public.current_organization_id(),btrim(v_item->>'title'),btrim(v_item->>'location'),(v_item->>'start_at')::timestamptz,(v_item->>'end_at')::timestamptz,v_item->>'memo',(v_item->>'has_time')::boolean,auth.uid(),auth.uid(),p_registration_id,v_index)
    returning id into v_id;
    if v_first is null then v_first:=v_id; end if;
    v_index:=v_index+1;
  end loop;
  return v_first;
end; $$;
revoke all on function public.create_class_schedule(uuid,jsonb) from public;
grant execute on function public.create_class_schedule(uuid,jsonb) to authenticated;
