-- =====================================================================
-- 0007_carreras_administrador.sql
-- Carreras gestionadas por el administrador, listado de materias del
-- administrador y limpieza de dos funciones creadas a mano en producción.
--
-- Piezas, en este orden:
--   1) eliminar crear_alumno_matricular y guardar_planilla_asistencia
--   2) carreras: estado activo, nombre único sin importar mayúsculas ni
--      tildes, y funciones de administrador (listar, crear, editar,
--      activar o desactivar)
--   3) crear_materia y editar_materia: una carrera desactivada no admite
--      materias nuevas
--   4) listado de materias del administrador con todos los datos
--
-- DECISIONES (01/11/2026)
--   * El administrador no borra carreras: las desactiva. No hay ningún
--     permiso de borrado sobre la tabla (sigue cerrada a la API).
--   * Una carrera desactivada no admite materias nuevas, pero sus materias,
--     alumnos e historial se siguen viendo. Desactivarla NO desactiva sus
--     materias: eso se decide materia por materia.
--   * Editar una materia que ya está en una carrera desactivada se permite
--     si no cambia de carrera; se rechaza si la edición la mueve a una
--     carrera desactivada.
--
-- ANTES DE APLICAR
--   * Aplicar junto con la 0006 y ANTES de subir el código de la rama.
--   * Descargar la copia JSON del Perfil.
--   * Comprobar con una consulta de solo lectura que no haya dos carreras
--     que se diferencien solo por mayúsculas o tildes: el índice nuevo
--     haría fallar la migración entera (sin dejar cambios a medias).
--
-- Compatibilidad: no cambia nada de lo que ven los profesores. Es segura
-- en staging, donde las dos funciones sueltas no existen.
--
-- Esta migración no se edita una vez aplicada: las correcciones van en una nueva.
-- =====================================================================

begin;

-- ---------- Pieza 1: eliminar las dos funciones creadas a mano ----------
-- Existen solo en producción (no estaban en Git ni las usa la app) y se
-- saltearían el solo lectura de la 0006. Se buscan por nombre en el esquema
-- public, así no importa con qué parámetros se hayan creado; si no existen
-- (por ejemplo en staging) no pasa nada.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as funcion
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('crear_alumno_matricular', 'guardar_planilla_asistencia')
  loop
    execute format('drop function %s', r.funcion);
  end loop;
end;
$$;

-- ---------- Pieza 2: carreras ----------
alter table public.carreras
  add column activo boolean not null default true;

-- Reemplaza el índice de la 0005 (que ignoraba mayúsculas pero no tildes)
drop index public.carreras_nombre_unico;
create unique index carreras_nombre_unico_normalizado
  on public.carreras (institucion_id, private.texto_normalizado(nombre));

-- ---------- Listar carreras de mi institución ----------
create or replace function public.listar_carreras()
returns table (
  id               uuid,
  nombre           text,
  activo           boolean,
  cantidad_materias bigint
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_inst uuid := private.exigir_admin();
begin
  return query
    select c.id, c.nombre, c.activo, count(m.id)
    from public.carreras c
    left join public.materias m on m.carrera_id = c.id
    where c.institucion_id = v_inst
    group by c.id, c.nombre, c.activo
    order by private.texto_normalizado(c.nombre);
end;
$$;

-- ---------- Crear carrera (nace activa) ----------
create or replace function public.crear_carrera(p_nombre text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_inst   uuid := private.exigir_admin();
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_id     uuid;
begin
  if v_nombre = '' then
    raise exception 'El nombre de la carrera es obligatorio';
  end if;
  if exists (
    select 1 from public.carreras c
    where c.institucion_id = v_inst
      and private.texto_normalizado(c.nombre) = private.texto_normalizado(v_nombre)
  ) then
    raise exception 'Ya existe una carrera con ese nombre';
  end if;

  insert into public.carreras (institucion_id, nombre)
  values (v_inst, v_nombre)
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------- Editar el nombre (también en una carrera desactivada) ----------
create or replace function public.editar_carrera(p_id uuid, p_nombre text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_inst   uuid := private.exigir_admin();
  v_nombre text := btrim(coalesce(p_nombre, ''));
begin
  if not exists (
    select 1 from public.carreras c
    where c.id = p_id and c.institucion_id = v_inst
  ) then
    raise exception 'La carrera no existe en tu institución';
  end if;
  if v_nombre = '' then
    raise exception 'El nombre de la carrera es obligatorio';
  end if;
  if exists (
    select 1 from public.carreras c
    where c.institucion_id = v_inst and c.id <> p_id
      and private.texto_normalizado(c.nombre) = private.texto_normalizado(v_nombre)
  ) then
    raise exception 'Ya existe una carrera con ese nombre';
  end if;

  update public.carreras set nombre = v_nombre where id = p_id;
end;
$$;

-- ---------- Activar y desactivar (el administrador no borra) ----------
-- No toca las materias de la carrera.
create or replace function public.cambiar_estado_carrera(p_id uuid, p_activo boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_inst uuid := private.exigir_admin();
begin
  if p_activo is null then
    raise exception 'Hay que indicar si la carrera queda activa o inactiva';
  end if;
  update public.carreras
     set activo = p_activo
   where id = p_id and institucion_id = v_inst;
  if not found then
    raise exception 'La carrera no existe en tu institución';
  end if;
end;
$$;

revoke execute on function public.listar_carreras()                      from public, anon;
revoke execute on function public.crear_carrera(text)                    from public, anon;
revoke execute on function public.editar_carrera(uuid, text)             from public, anon;
revoke execute on function public.cambiar_estado_carrera(uuid, boolean)  from public, anon;
grant  execute on function public.listar_carreras()                      to authenticated;
grant  execute on function public.crear_carrera(text)                    to authenticated;
grant  execute on function public.editar_carrera(uuid, text)             to authenticated;
grant  execute on function public.cambiar_estado_carrera(uuid, boolean)  to authenticated;

-- ---------- Pieza 3: una carrera desactivada no admite materias nuevas ----------
-- Mismas firmas que en la 0006; solo se agrega la comprobación de la carrera.

create or replace function public.crear_materia(
  p_nombre       text,
  p_anio         smallint,
  p_tipo         text,
  p_duracion     text,
  p_cuatrimestre smallint,
  p_carrera_id   uuid,
  p_ciclo_id     uuid
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_inst           uuid := private.exigir_admin();
  v_nombre         text := btrim(coalesce(p_nombre, ''));
  v_estado         text;
  v_carrera_activa boolean;
  v_id             uuid;
begin
  if v_nombre = '' then
    raise exception 'El nombre de la materia es obligatorio';
  end if;
  if p_carrera_id is null then
    raise exception 'La carrera es obligatoria';
  end if;
  if p_ciclo_id is null then
    raise exception 'El ciclo lectivo es obligatorio';
  end if;
  if p_duracion = 'anual' and p_cuatrimestre is not null then
    raise exception 'Una materia anual no lleva cuatrimestre';
  end if;
  if p_duracion = 'cuatrimestral' and p_cuatrimestre is null then
    raise exception 'Una materia cuatrimestral necesita cuatrimestre (1 o 2)';
  end if;

  select c.activo into v_carrera_activa
  from public.carreras c
  where c.id = p_carrera_id and c.institucion_id = v_inst;
  if v_carrera_activa is null then
    raise exception 'La carrera no existe en tu institución';
  end if;
  if not v_carrera_activa then
    raise exception 'La carrera está desactivada: reactivala para crear materias';
  end if;

  select c.estado into v_estado
  from public.ciclos_lectivos c
  where c.id = p_ciclo_id and c.institucion_id = v_inst;
  if v_estado is null then
    raise exception 'El ciclo no existe en tu institución';
  end if;
  if v_estado = 'cerrado' then
    raise exception 'El ciclo está cerrado: reabrilo para crear materias';
  end if;

  if exists (
    select 1 from public.materias m
    where m.carrera_id = p_carrera_id and m.ciclo_id = p_ciclo_id
      and m.anio = p_anio
      and coalesce(m.cuatrimestre, 0) = coalesce(p_cuatrimestre, 0)
      and private.texto_normalizado(m.nombre) = private.texto_normalizado(v_nombre)
  ) then
    raise exception 'Ya existe una materia con ese nombre, año y cuatrimestre en esa carrera y ciclo';
  end if;

  insert into public.materias (
    institucion_id, nombre, anio, tipo, duracion, cuatrimestre, carrera_id, ciclo_id
  )
  values (
    v_inst, v_nombre, p_anio, p_tipo, p_duracion, p_cuatrimestre, p_carrera_id, p_ciclo_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.editar_materia(
  p_id           uuid,
  p_nombre       text,
  p_anio         smallint,
  p_tipo         text,
  p_duracion     text,
  p_cuatrimestre smallint,
  p_carrera_id   uuid
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_inst           uuid := private.exigir_admin();
  v_nombre         text := btrim(coalesce(p_nombre, ''));
  v_ciclo          uuid;
  v_estado         text;
  v_carrera_actual uuid;
  v_carrera_activa boolean;
begin
  select m.ciclo_id, c.estado, m.carrera_id into v_ciclo, v_estado, v_carrera_actual
  from public.materias m
  join public.ciclos_lectivos c on c.id = m.ciclo_id
  where m.id = p_id and m.institucion_id = v_inst;
  if v_ciclo is null then
    raise exception 'La materia no existe en tu institución';
  end if;
  if v_estado = 'cerrado' then
    raise exception 'El ciclo está cerrado: reabrilo para editar la materia';
  end if;

  if v_nombre = '' then
    raise exception 'El nombre de la materia es obligatorio';
  end if;
  if p_carrera_id is null then
    raise exception 'La carrera es obligatoria';
  end if;
  if p_duracion = 'anual' and p_cuatrimestre is not null then
    raise exception 'Una materia anual no lleva cuatrimestre';
  end if;
  if p_duracion = 'cuatrimestral' and p_cuatrimestre is null then
    raise exception 'Una materia cuatrimestral necesita cuatrimestre (1 o 2)';
  end if;

  select c.activo into v_carrera_activa
  from public.carreras c
  where c.id = p_carrera_id and c.institucion_id = v_inst;
  if v_carrera_activa is null then
    raise exception 'La carrera no existe en tu institución';
  end if;
  -- Se puede seguir editando una materia que ya está en una carrera
  -- desactivada; lo que no se puede es mudarla a una carrera desactivada.
  if not v_carrera_activa and p_carrera_id is distinct from v_carrera_actual then
    raise exception 'La carrera de destino está desactivada: reactivala para mover materias a ella';
  end if;

  if exists (
    select 1 from public.materias m
    where m.id <> p_id
      and m.carrera_id = p_carrera_id and m.ciclo_id = v_ciclo
      and m.anio = p_anio
      and coalesce(m.cuatrimestre, 0) = coalesce(p_cuatrimestre, 0)
      and private.texto_normalizado(m.nombre) = private.texto_normalizado(v_nombre)
  ) then
    raise exception 'Ya existe una materia con ese nombre, año y cuatrimestre en esa carrera y ciclo';
  end if;

  update public.materias
     set nombre = v_nombre, anio = p_anio, tipo = p_tipo, duracion = p_duracion,
         cuatrimestre = p_cuatrimestre, carrera_id = p_carrera_id
   where id = p_id;
end;
$$;

-- (create or replace conserva los permisos; se repiten por claridad)
revoke execute on function public.crear_materia(text, smallint, text, text, smallint, uuid, uuid) from public, anon;
revoke execute on function public.editar_materia(uuid, text, smallint, text, text, smallint, uuid) from public, anon;
grant  execute on function public.crear_materia(text, smallint, text, text, smallint, uuid, uuid) to authenticated;
grant  execute on function public.editar_materia(uuid, text, smallint, text, text, smallint, uuid) to authenticated;

-- ---------- Pieza 4: listado de materias del administrador ----------
-- Trae TODAS las materias de la institución (activas, inactivas y de ciclos
-- cerrados), cada una con su estado; los filtros los resuelve la pantalla.
-- Cambia el tipo de resultado, por eso se elimina y se vuelve a crear con el
-- mismo nombre. Las columnas viejas (id, nombre, anio, profesores) se mantienen.
drop function public.listar_materias_institucion();

create function public.listar_materias_institucion()
returns table (
  id             uuid,
  nombre         text,
  anio           smallint,
  tipo           text,
  duracion       text,
  cuatrimestre   smallint,
  carrera_id     uuid,
  carrera_nombre text,
  carrera_activa boolean,
  ciclo_id       uuid,
  ciclo_anio     smallint,
  ciclo_estado   text,
  activo         boolean,
  profesores     jsonb
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_inst uuid := private.exigir_admin();
begin
  return query
    select m.id, m.nombre, m.anio, m.tipo, m.duracion, m.cuatrimestre,
           m.carrera_id, ca.nombre, ca.activo,
           m.ciclo_id, ci.anio, ci.estado,
           m.activo,
           coalesce(
             jsonb_agg(
               jsonb_build_object('id', p.id, 'apellido_nombre', p.apellido_nombre)
               order by p.apellido_nombre
             ) filter (where p.id is not null),
             '[]'::jsonb
           )
    from public.materias m
    join public.carreras ca on ca.id = m.carrera_id
    join public.ciclos_lectivos ci on ci.id = m.ciclo_id
    left join public.profesor_materias pm on pm.materia_id = m.id
    left join public.personas p on p.id = pm.profesor_id
    where m.institucion_id = v_inst
    group by m.id, m.nombre, m.anio, m.tipo, m.duracion, m.cuatrimestre,
             m.carrera_id, ca.nombre, ca.activo,
             m.ciclo_id, ci.anio, ci.estado, m.activo
    order by ci.anio desc, private.texto_normalizado(ca.nombre), m.anio,
             coalesce(m.cuatrimestre, 0), private.texto_normalizado(m.nombre);
end;
$$;

revoke execute on function public.listar_materias_institucion() from public, anon;
grant  execute on function public.listar_materias_institucion() to authenticated;

commit;
