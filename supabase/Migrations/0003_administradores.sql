-- =====================================================================
-- 0003_administradores.sql
-- Quiénes pueden gestionar profesores (ver, crear y asignar materias).
-- Esta migración SOLO crea la tabla y la función auxiliar: todavía no
-- da ningún permiso nuevo sobre profesores ni materias (eso viene después).
--
-- Seguridad: la app solo puede LEER su propia fila. Nadie puede agregar,
-- modificar ni quitar administradores desde la app: se hace a mano, desde
-- el editor SQL de Supabase, con la cuenta dueña del proyecto.
-- =====================================================================

create table public.administradores (
  persona_id  uuid primary key references public.personas (id) on delete cascade,
  creado_en   timestamptz not null default now()
);

alter table public.administradores enable row level security;

-- Permisos mínimos: solo lectura (la política limita a la fila propia)
revoke all on public.administradores from anon, authenticated;
grant select on public.administradores to authenticated;

create policy "ver mi permiso de administrador" on public.administradores
  for select to authenticated
  using (persona_id = private.mi_persona_id());

-- ¿La persona con la sesión iniciada es administradora?
-- (mi_persona_id() solo devuelve fichas de tipo profesor con cuenta propia)
create or replace function private.soy_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.administradores a
    where a.persona_id = private.mi_persona_id()
  )
$$;

-- Las funciones nuevas nacen ejecutables por todos: se cierra explícitamente
revoke execute on function private.soy_admin() from public, anon;
grant  execute on function private.soy_admin() to authenticated;