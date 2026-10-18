-- =====================================================================
-- 0004_funciones_administrador.sql
-- Acciones de administrador, como funciones (no como políticas RLS):
-- así las pantallas actuales de los profesores no cambian en nada.
-- Cada función exige ser administrador y trabaja SOLO dentro de la
-- institución del administrador.
--
-- Un administrador NO puede, con estas funciones: ver asistencias,
-- clases ni alumnos de materias ajenas; borrar profesores; crear
-- cuentas de login; ni dar el permiso de administrador a otros.
-- =====================================================================

-- ---------- Ayudante: exige ser administrador y devuelve su institución ----------
create or replace function private.exigir_admin()
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.soy_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return private.mi_institucion_id();
end;
$$;

revoke execute on function private.exigir_admin() from public, anon;
grant  execute on function private.exigir_admin() to authenticated;

-- ---------- 1. Listar profesores de mi institución ----------
create or replace function public.listar_profesores()
returns table (
  id              uuid,
  apellido_nombre text,
  dni             text,
  email           text,
  tiene_cuenta    boolean
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_inst uuid := private.exigir_admin();
begin
  return query
    select p.id, p.apellido_nombre, p.dni, p.email, (p.user_id is not null)
    from public.personas p
    where p.institucion_id = v_inst
      and p.tipo = 'profesor'
    order by p.apellido_nombre;
end;
$$;

-- ---------- 2. Crear profesor (ficha sin cuenta de login) ----------
create or replace function public.crear_profesor(
  p_nombre text, p_dni text, p_email text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_inst   uuid := private.exigir_admin();
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_dni    text := nullif(btrim(coalesce(p_dni, '')), '');
  v_email  text := nullif(btrim(coalesce(p_email, '')), '');
  v_id     uuid;
begin
  if v_nombre = '' then
    raise exception 'El nombre del profesor es obligatorio';
  end if;
  if v_email is not null and position('@' in v_email) = 0 then
    raise exception 'El correo no es válido';
  end if;
  if v_dni is not null and exists (
    select 1 from public.personas p
    where p.institucion_id = v_inst and p.dni = v_dni
  ) then
    raise exception 'Ya existe una persona con ese DNI';
  end if;

  insert into public.personas (institucion_id, tipo, apellido_nombre, dni, email)
  values (v_inst, 'profesor', v_nombre, v_dni, v_email)
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------- 3. Editar profesor (solo nombre, DNI y correo) ----------
create or replace function public.editar_profesor(
  p_id uuid, p_nombre text, p_dni text, p_email text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_inst   uuid := private.exigir_admin();
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_dni    text := nullif(btrim(coalesce(p_dni, '')), '');
  v_email  text := nullif(btrim(coalesce(p_email, '')), '');
begin
  if v_nombre = '' then
    raise exception 'El nombre del profesor es obligatorio';
  end if;
  if v_email is not null and position('@' in v_email) = 0 then
    raise exception 'El correo no es válido';
  end if;
  if not exists (
    select 1 from public.personas p
    where p.id = p_id and p.tipo = 'profesor' and p.institucion_id = v_inst
  ) then
    raise exception 'El profesor no existe en tu institución';
  end if;
  if v_dni is not null and exists (
    select 1 from public.personas p
    where p.institucion_id = v_inst and p.dni = v_dni and p.id <> p_id
  ) then
    raise exception 'Ya existe una persona con ese DNI';
  end if;

  update public.personas
     set apellido_nombre = v_nombre, dni = v_dni, email = v_email
   where id = p_id;
end;
$$;

-- ---------- 4. Materias de la institución, con sus profesores ----------
create or replace function public.listar_materias_institucion()
returns table (
  id         uuid,
  nombre     text,
  anio       smallint,
  profesores jsonb
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_inst uuid := private.exigir_admin();
begin
  return query
    select m.id, m.nombre, m.anio,
           coalesce(
             jsonb_agg(
               jsonb_build_object('id', p.id, 'apellido_nombre', p.apellido_nombre)
               order by p.apellido_nombre
             ) filter (where p.id is not null),
             '[]'::jsonb
           )
    from public.materias m
    left join public.profesor_materias pm on pm.materia_id = m.id
    left join public.personas p on p.id = pm.profesor_id
    where m.institucion_id = v_inst
    group by m.id, m.nombre, m.anio
    order by m.anio, m.nombre;
end;
$$;

-- ---------- 5a. Asignar una materia a un profesor (idempotente) ----------
create or replace function public.asignar_materia(p_profesor uuid, p_materia uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_inst uuid := private.exigir_admin();
begin
  if not exists (
    select 1 from public.personas p
    where p.id = p_profesor and p.tipo = 'profesor' and p.institucion_id = v_inst
  ) then
    raise exception 'El profesor no existe en tu institución';
  end if;
  if not exists (
    select 1 from public.materias m
    where m.id = p_materia and m.institucion_id = v_inst
  ) then
    raise exception 'La materia no existe en tu institución';
  end if;

  insert into public.profesor_materias (profesor_id, materia_id)
  values (p_profesor, p_materia)
  on conflict do nothing;
end;
$$;

-- ---------- 5b. Quitar la asignación (NO borra clases ni asistencias) ----------
create or replace function public.quitar_materia(p_profesor uuid, p_materia uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_inst uuid := private.exigir_admin();
begin
  if not exists (
    select 1 from public.personas p
    where p.id = p_profesor and p.tipo = 'profesor' and p.institucion_id = v_inst
  ) then
    raise exception 'El profesor no existe en tu institución';
  end if;
  if not exists (
    select 1 from public.materias m
    where m.id = p_materia and m.institucion_id = v_inst
  ) then
    raise exception 'La materia no existe en tu institución';
  end if;

  -- Solo se borra la fila que une profesor y materia
  delete from public.profesor_materias
   where profesor_id = p_profesor and materia_id = p_materia;
end;
$$;

-- ---------- Permisos: cerrar a todos y abrir solo a usuarios con sesión ----------
revoke execute on function public.listar_profesores()                       from public, anon;
revoke execute on function public.crear_profesor(text, text, text)          from public, anon;
revoke execute on function public.editar_profesor(uuid, text, text, text)   from public, anon;
revoke execute on function public.listar_materias_institucion()             from public, anon;
revoke execute on function public.asignar_materia(uuid, uuid)               from public, anon;
revoke execute on function public.quitar_materia(uuid, uuid)                from public, anon;

grant execute on function public.listar_profesores()                       to authenticated;
grant execute on function public.crear_profesor(text, text, text)          to authenticated;
grant execute on function public.editar_profesor(uuid, text, text, text)   to authenticated;
grant execute on function public.listar_materias_institucion()             to authenticated;
grant execute on function public.asignar_materia(uuid, uuid)               to authenticated;
grant execute on function public.quitar_materia(uuid, uuid)                to authenticated;