\getenv password POSTGRES_PASSWORD

select format('alter role %I with login password %L', rolname, :'password')
from pg_roles
where rolname in ('supabase_auth_admin', 'authenticator')
\gexec
