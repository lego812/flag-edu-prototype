-- Enum values must be committed before later migrations can use them.
alter type public.class_session_status add value if not exists 'completed';
