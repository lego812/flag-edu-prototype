-- Return the report revision from the same transaction as its photo change.
-- The caller must supply the revision it has seen, so a photo cannot silently
-- acknowledge another editor's changes.
create function public.mutate_report_photo(
  p_report_id uuid,
  p_version timestamptz,
  p_operation text,
  p_attachment jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports;
  v_attachment public.report_attachments;
  v_status public.class_session_status;
  v_version timestamptz;
begin
  if not public.is_active_member() then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  select cs.status into v_status
  from public.reports r
  join public.class_sessions cs on cs.id = r.class_session_id
  where r.id = p_report_id
    and r.organization_id = public.current_organization_id()
    and (r.author_id = auth.uid() or public.is_admin())
  for update of cs;
  if not found then raise exception 'Report not found' using errcode = '42501'; end if;
  if v_status = 'cancelled'::public.class_session_status then
    raise exception 'A cancelled report cannot be changed' using errcode = 'PT409';
  end if;

  select * into v_report from public.reports where id = p_report_id for update;
  if p_version is distinct from v_report.updated_at then
    raise exception 'Report changed; reload' using errcode = 'PT409';
  end if;

  if p_operation = 'insert' then
    if not coalesce(
      (p_attachment->>'storage_path') like (v_report.organization_id::text || '/' || p_report_id::text || '/%')
      and (p_attachment->>'file_size')::integer between 1 and 1048576,
      false
    ) then
      raise exception 'Invalid photo' using errcode = '22023';
    end if;
    insert into public.report_attachments(
      organization_id,report_id,field_id,storage_path,original_filename,mime_type,file_size
    ) values (
      v_report.organization_id,p_report_id,(p_attachment->>'field_id')::uuid,
      p_attachment->>'storage_path','photo.jpg','image/jpeg',(p_attachment->>'file_size')::integer
    ) returning * into v_attachment;
  elsif p_operation = 'delete' then
    delete from public.report_attachments
    where id = (p_attachment->>'id')::uuid and report_id = p_report_id
    returning * into v_attachment;
    if not found then raise exception 'Photo not found' using errcode = 'P0002'; end if;
  else
    raise exception 'Invalid photo operation' using errcode = '22023';
  end if;

  select updated_at into v_version from public.reports where id = p_report_id;
  return jsonb_build_object('attachment',to_jsonb(v_attachment),'version',v_version);
end;
$$;

revoke all on function public.mutate_report_photo(uuid,timestamptz,text,jsonb) from public;
grant execute on function public.mutate_report_photo(uuid,timestamptz,text,jsonb) to authenticated;
