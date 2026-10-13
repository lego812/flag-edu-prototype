-- Commit the enum addition separately before referencing its value.
alter type public.member_status add value if not exists 'removed';
