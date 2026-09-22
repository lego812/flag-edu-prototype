alter table public.template_versions add column name varchar(100) not null default '보고서 양식' check (btrim(name) <> '');

create function public.rename_template(p_id uuid,p_name text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Administrator permission required' using errcode='42501'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 100 then raise exception 'Invalid template name'; end if;
  update public.template_versions set name=btrim(p_name) where id=p_id and organization_id=public.current_organization_id();
  if not found then raise exception 'Template not found'; end if;
end; $$;

create function public.save_named_template(p_id uuid,p_version timestamptz,p_fields jsonb,p_publish boolean,p_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  v_id:=public.save_template(p_id,p_version,p_fields,false);
  perform public.rename_template(v_id,p_name);
  if p_publish then perform public.publish_template(v_id); end if;
  return v_id;
end; $$;
revoke all on function public.rename_template(uuid,text) from public;
revoke all on function public.save_named_template(uuid,timestamptz,jsonb,boolean,text) from public;
grant execute on function public.rename_template(uuid,text) to authenticated;
grant execute on function public.save_named_template(uuid,timestamptz,jsonb,boolean,text) to authenticated;
