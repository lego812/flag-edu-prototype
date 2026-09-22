-- Server-only member provisioning uses a Supabase secret key, which maps to
-- service_role. RLS bypass does not replace PostgreSQL table privileges.

grant select, insert, delete on table public.organizations to service_role;
grant select, insert, update, delete on table public.profiles to service_role;
