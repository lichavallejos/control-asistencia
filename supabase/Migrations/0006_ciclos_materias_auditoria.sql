-- =====================================================================
-- 0006_ciclos_materias_auditoria.sql
-- Ciclos lectivos, materias solo del administrador, inscripciones con baja
-- reversible y resultado final, solo lectura para materias inactivas y ciclos
-- cerrados, auditoría con historial inmutable y porcentaje de asistencia
-- calculado en la base.
--
-- Piezas, en este orden:
--   1) ciclos lectivos            4) auditoría (historial)
--   2) materias                   5) porcentaje de asistencia
--   3) inscripciones y solo lectura
--
-- ANTES DE APLICAR
--   * La tabla materias debe estar VACÍA (las columnas obligatorias nuevas
--     harían fallar la migración entera si hubiera filas).
--   * Descargar la copia JSON del Perfil.
--   * Probar primero en PostgreSQL local y en staging (cuando exista).
--
-- QUÉ DEJA DE FUNCIONAR EN LA APP ACTUAL (hay que adaptar las pantallas):
--   * crear_materia(nombre, año): ahora es de administrador y lleva más datos.
--   * El profesor ya no edita materias ni borra inscripciones ni asistencias.
--   * «Quitar» alumno pasa a «Dar de baja» (funciones dar_de_baja y revertir_baja).
--
-- Esta migración no se edita una vez aplicada: las correcciones van en una nueva.
-- =====================================================================

begin;

-- ---------- Pieza 1: ciclos lectivos ----------
create table public.ciclos_lectivos (
  id                    uuid primary key default gen_random_uuid(),
  institucion_id        uuid not null references public.instituciones (id),
  anio                  smallint not null,
  estado                text not null default 'abierto',
  inicio_cuatrimestre_1 date,
  fin_cuatrimestre_1    date,
  inicio_cuatrimestre_2 date,
  fin_cuatrimestre_2    date,
  umbral_aprobado       numeric(5,2) not null default 85,
  umbral_regular        numeric(5,2) not null default 75,
  creado_en             timestamptz not null default now(),
  -- un solo ciclo por año en cada institución
  constraint ciclos_anio_unico unique (institucion_id, anio),
  -- permite que otras tablas verifiquen que el ciclo es de la misma institución
  constraint ciclos_id_institucion_unico unique (id, institucion_id),
  constraint ciclos_anio_valido check (anio between 2000 and 2100),
  constraint ciclos_estado_valido check (estado in ('abierto', 'cerrado')),
  constraint ciclos_umbrales_validos check (
    umbral_regular >= 0 and umbral_aprobado <= 100 and umbral_regular < umbral_aprobado
  ),
  constraint ciclos_cuat1_orden check (
    inicio_cuatrimestre_1 is null or fin_cuatrimestre_1 is null
    or inicio_cuatrimestre_1 <= fin_cuatrimestre_1
  ),
  constraint ciclos_cuat2_orden check (
    inicio_cuatrimestre_2 is null or fin_cuatrimestre_2 is null
    or inicio_cuatrimestre_2 <= fin_cuatrimestre_2
  ),
  constraint ciclos_cuats_sin_pisarse check (
    fin_cuatrimestre_1 is null or inicio_cuatrimestre_2 is null
    or fin_cuatrimestre_1 < inicio_cuatrimestre_2
  )
);

alter table public.ciclos_lectivos enable row level security;
revoke all on public.ciclos_lectivos from anon, authenticated;
-- Los profesores solo LEEN los ciclos de su institución (para ver umbrales y fechas).
-- Crear, editar, cerrar y reabrir se hace con funciones de administrador.
grant select on public.ciclos_lectivos to authenticated;

create policy "ver ciclos de mi institucion" on public.ciclos_lectivos
  for select to authenticated
  using (institucion_id = private.mi_institucion_id());

-- ---------- Crear ciclo (los umbrales se copian del ciclo anterior) ----------
create or replace function public.crear_ciclo(
  p_anio     smallint,
  p_inicio_1 date default null,
  p_fin_1    date default null,
  p_inicio_2 date default null,
  p_fin_2    date default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_inst   uuid := private.exigir_admin();
  v_prev_a numeric(5,2);
  v_prev_r numeric(5,2);
  v_id     uuid;
begin
  if p_anio is null then
    raise exception 'El año del ciclo es obligatorio';
  end if;
  if exists (
    select 1 from public.ciclos_lectivos c
    where c.institucion_id = v_inst and c.anio = p_anio
  ) then
    raise exception 'Ya existe un ciclo lectivo para ese año';
  end if;

  -- Umbrales del ciclo anterior (el de mayor año menor al nuevo); si no hay, 85 y 75
  select c.umbral_aprobado, c.umbral_regular into v_prev_a, v_prev_r
  from public.ciclos_lectivos c
  where c.institucion_id = v_inst and c.anio < p_anio
  order by c.anio desc
  limit 1;

  insert into public.ciclos_lectivos (
    institucion_id, anio, umbral_aprobado, umbral_regular,
    inicio_cuatrimestre_1, fin_cuatrimestre_1, inicio_cuatrimestre_2, fin_cuatrimestre_2
  )
  values (
    v_inst, p_anio, coalesce(v_prev_a, 85), coalesce(v_prev_r, 75),
    p_inicio_1, p_fin_1, p_inicio_2, p_fin_2
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------- Editar ciclo (solo si está abierto) ----------
create or replace function public.editar_ciclo(
  p_id              uuid,
  p_inicio_1        date,
  p_fin_1           date,
  p_inicio_2        date,
  p_fin_2           date,
  p_umbral_aprobado numeric,
  p_umbral_regular  numeric
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_inst   uuid := private.exigir_admin();
  v_estado text;
begin
  select c.estado into v_estado
  from public.ciclos_lectivos c
  where c.id = p_id and c.institucion_id = v_inst;

  if v_estado is null then
    raise exception 'El ciclo no existe en tu institución';
  end if;
  if v_estado = 'cerrado' then
    raise exception 'El ciclo está cerrado: reabrilo para editarlo';
  end if;

  update public.ciclos_lectivos
     set inicio_cuatrimestre_1 = p_inicio_1,
         fin_cuatrimestre_1    = p_fin_1,
         inicio_cuatrimestre_2 = p_inicio_2,
         fin_cuatrimestre_2    = p_fin_2,
         umbral_aprobado       = p_umbral_aprobado,
         umbral_regular        = p_umbral_regular
   where id = p_id;
end;
$$;

-- ---------- Cerrar y reabrir ----------
create or replace function public.cerrar_ciclo(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_inst uuid := private.exigir_admin();
begin
  update public.ciclos_lectivos
     set estado = 'cerrado'
   where id = p_id and institucion_id = v_inst;
  if not found then
    raise exception 'El ciclo no existe en tu institución';
  end if;
end;
$$;

create or replace function public.reabrir_ciclo(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_inst uuid := private.exigir_admin();
begin
  update public.ciclos_lectivos
     set estado = 'abierto'
   where id = p_id and institucion_id = v_inst;
  if not found then
    raise exception 'El ciclo no existe en tu institución';
  end if;
end;
$$;

revoke execute on function public.crear_ciclo(smallint, date, date, date, date) from public, anon;
revoke execute on function public.editar_ciclo(uuid, date, date, date, date, numeric, numeric) from public, anon;
revoke execute on function public.cerrar_ciclo(uuid)   from public, anon;
revoke execute on function public.reabrir_ciclo(uuid)  from public, anon;
grant execute on function public.crear_ciclo(smallint, date, date, date, date) to authenticated;
grant execute on function public.editar_ciclo(uuid, date, date, date, date, numeric, numeric) to authenticated;
grant execute on function public.cerrar_ciclo(uuid)   to authenticated;
grant execute on function public.reabrir_ciclo(uuid)  to authenticated;

-- ---------- Pieza 2: materias ----------
-- Solo el administrador crea y edita materias. Carrera y ciclo son obligatorios.
-- (Requiere que la tabla materias esté vacía: si tuviera filas, las columnas
-- obligatorias nuevas harían fallar la migración entera, sin dejar cambios a medias.)

-- Para ignorar mayúsculas y tildes al comparar nombres
create extension if not exists unaccent with schema extensions;

create or replace function private.texto_normalizado(p_texto text)
returns text
language sql immutable parallel safe set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, btrim(coalesce(p_texto, ''))))
$$;
revoke execute on function private.texto_normalizado(text) from public, anon;
grant  execute on function private.texto_normalizado(text) to authenticated;

-- Columnas nuevas
alter table public.materias
  add column tipo          text     not null,
  add column duracion      text     not null,
  add column cuatrimestre  smallint,
  add column ciclo_id      uuid     not null,
  add column activo        boolean  not null default true;

alter table public.materias alter column carrera_id set not null;

alter table public.materias
  add constraint materias_tipo_valido check (tipo in ('materia', 'taller')),
  add constraint materias_duracion_valida check (duracion in ('anual', 'cuatrimestral')),
  add constraint materias_cuatrimestre_valido check (cuatrimestre in (1, 2)),
  -- el cuatrimestre se indica si y solo si la materia es cuatrimestral
  add constraint materias_cuatrimestre_segun_duracion
    check ((duracion = 'cuatrimestral') = (cuatrimestre is not null)),
  -- el ciclo debe ser de la misma institución que la materia
  add constraint materias_ciclo_fk
    foreign key (ciclo_id, institucion_id)
    references public.ciclos_lectivos (id, institucion_id);

create index on public.materias (ciclo_id);

-- Regla de unicidad nueva (reemplaza la de la 0005, que no ignoraba tildes)
drop index public.materias_unica_por_carrera;
create unique index materias_unica_por_carrera_ciclo
  on public.materias (
    carrera_id, ciclo_id, anio, coalesce(cuatrimestre, 0),
    private.texto_normalizado(nombre)
  );

-- ---------- Permisos: el profesor solo LEE sus materias ----------
drop policy "editar mis materias" on public.materias;
revoke update on public.materias from authenticated;   -- incluye el permiso por columnas de la 0005

-- ---------- crear_materia: ahora es una función de administrador ----------
drop function public.crear_materia(text, smallint);

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
  v_inst   uuid := private.exigir_admin();
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_estado text;
  v_id     uuid;
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
  if not exists (
    select 1 from public.carreras c where c.id = p_carrera_id and c.institucion_id = v_inst
  ) then
    raise exception 'La carrera no existe en tu institución';
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

-- ---------- editar_materia (la materia no cambia de ciclo) ----------
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
  v_inst   uuid := private.exigir_admin();
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_ciclo  uuid;
  v_estado text;
begin
  select m.ciclo_id, c.estado into v_ciclo, v_estado
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
  if not exists (
    select 1 from public.carreras c where c.id = p_carrera_id and c.institucion_id = v_inst
  ) then
    raise exception 'La carrera no existe en tu institución';
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

-- ---------- Activar y desactivar (el administrador no borra) ----------
create or replace function public.cambiar_estado_materia(p_id uuid, p_activo boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_inst uuid := private.exigir_admin();
begin
  if p_activo is null then
    raise exception 'Hay que indicar si la materia queda activa o inactiva';
  end if;
  update public.materias
     set activo = p_activo
   where id = p_id and institucion_id = v_inst;
  if not found then
    raise exception 'La materia no existe en tu institución';
  end if;
end;
$$;

revoke execute on function public.crear_materia(text, smallint, text, text, smallint, uuid, uuid) from public, anon;
revoke execute on function public.editar_materia(uuid, text, smallint, text, text, smallint, uuid) from public, anon;
revoke execute on function public.cambiar_estado_materia(uuid, boolean) from public, anon;
grant execute on function public.crear_materia(text, smallint, text, text, smallint, uuid, uuid) to authenticated;
grant execute on function public.editar_materia(uuid, text, smallint, text, text, smallint, uuid) to authenticated;
grant execute on function public.cambiar_estado_materia(uuid, boolean) to authenticated;

-- ---------- Pieza 3: inscripciones (baja reversible y resultado final) y solo lectura ----------

-- Hoy, en hora de Argentina (para comparar con la fecha de las clases)
create or replace function private.fecha_ar(p_instante timestamptz)
returns date
language sql stable set search_path = ''
as $$ select (p_instante at time zone 'America/Argentina/Buenos_Aires')::date $$;

create or replace function private.hoy_ar()
returns date
language sql stable set search_path = ''
as $$ select private.fecha_ar(now()) $$;

revoke execute on function private.fecha_ar(timestamptz) from public, anon;
revoke execute on function private.hoy_ar() from public, anon;
grant  execute on function private.fecha_ar(timestamptz) to authenticated;
grant  execute on function private.hoy_ar() to authenticated;

-- ¿La materia admite cambios? Solo si está activa y su ciclo está abierto.
create or replace function private.materia_editable(p_materia uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.materias m
    join public.ciclos_lectivos c on c.id = m.ciclo_id
    where m.id = p_materia and m.activo and c.estado = 'abierto'
  )
$$;
revoke execute on function private.materia_editable(uuid) from public, anon;
grant  execute on function private.materia_editable(uuid) to authenticated;

-- Columnas nuevas de la inscripción
alter table public.inscripciones
  add column fecha_baja       date,                               -- vacía = alumno activo
  add column resultado_final  text not null default 'pendiente',
  add constraint inscripciones_resultado_valido
    check (resultado_final in ('pendiente', 'aprobado', 'desaprobado'));

-- El profesor ya no borra inscripciones (el borrado arrastraba las asistencias)
drop policy "quitar inscripciones de mis materias" on public.inscripciones;
revoke delete on public.inscripciones from authenticated;

-- Al inscribir solo se pueden indicar alumno y materia (la baja y el resultado van por funciones)
revoke insert on public.inscripciones from authenticated;
grant  insert (alumno_id, materia_id) on public.inscripciones to authenticated;

-- ---------- Solo lectura: materia inactiva o ciclo cerrado ----------
drop policy "inscribir en mis materias" on public.inscripciones;
create policy "inscribir en mis materias" on public.inscripciones
  for insert to authenticated
  with check (
    private.es_profesor_de(materia_id)
    and private.materia_editable(materia_id)
    and private.alumno_es_de_mi_institucion(alumno_id)
  );

drop policy "crear clases en mis materias" on public.clases;
create policy "crear clases en mis materias" on public.clases
  for insert to authenticated
  with check (private.es_profesor_de(materia_id) and private.materia_editable(materia_id));

drop policy "editar clases de mis materias" on public.clases;
create policy "editar clases de mis materias" on public.clases
  for update to authenticated
  using (private.es_profesor_de(materia_id) and private.materia_editable(materia_id))
  with check (private.es_profesor_de(materia_id) and private.materia_editable(materia_id));

drop policy "borrar clases de mis materias" on public.clases;
create policy "borrar clases de mis materias" on public.clases
  for delete to authenticated
  using (private.es_profesor_de(materia_id) and private.materia_editable(materia_id));

drop policy "cargar asistencias en mis materias" on public.asistencias;
create policy "cargar asistencias en mis materias" on public.asistencias
  for insert to authenticated
  with check (private.es_profesor_de(materia_id) and private.materia_editable(materia_id));

drop policy "editar asistencias de mis materias" on public.asistencias;
create policy "editar asistencias de mis materias" on public.asistencias
  for update to authenticated
  using (private.es_profesor_de(materia_id) and private.materia_editable(materia_id))
  with check (private.es_profesor_de(materia_id) and private.materia_editable(materia_id));

-- ---------- Después de la baja no se carga asistencia de clases posteriores ----------
create or replace function private.validar_asistencia_contra_baja()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_baja  date;
  v_fecha date;
begin
  select i.fecha_baja into v_baja from public.inscripciones i where i.id = new.inscripcion_id;
  select c.fecha      into v_fecha from public.clases c       where c.id = new.clase_id;
  if v_baja is not null and v_fecha > v_baja then
    raise exception 'El alumno está de baja desde el % y no se le carga asistencia posterior',
      to_char(v_baja, 'DD/MM/YYYY');
  end if;
  return new;
end;
$$;
revoke execute on function private.validar_asistencia_contra_baja() from public, anon, authenticated;

create trigger asistencias_valida_baja
  before insert on public.asistencias
  for each row execute function private.validar_asistencia_contra_baja();

-- ---------- Funciones del profesor de la materia ----------
-- Ayudante común: devuelve la materia de la inscripción si es de una materia del profesor
-- y la materia admite cambios; si no, explica por qué.
create or replace function private.materia_de_inscripcion_editable(p_inscripcion uuid)
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_materia uuid;
begin
  select i.materia_id into v_materia
  from public.inscripciones i
  where i.id = p_inscripcion;

  if v_materia is null or not private.es_profesor_de(v_materia) then
    raise exception 'La inscripción no existe en tus materias';
  end if;
  if not private.materia_editable(v_materia) then
    raise exception 'La materia está inactiva o su ciclo está cerrado: solo lectura';
  end if;
  return v_materia;
end;
$$;
revoke execute on function private.materia_de_inscripcion_editable(uuid) from public, anon, authenticated;

create or replace function public.dar_de_baja(p_inscripcion uuid, p_fecha date default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_fecha date := coalesce(p_fecha, private.hoy_ar());
  v_baja  date;
begin
  perform private.materia_de_inscripcion_editable(p_inscripcion);
  if v_fecha > private.hoy_ar() then
    raise exception 'La fecha de baja no puede ser futura';
  end if;
  select i.fecha_baja into v_baja from public.inscripciones i where i.id = p_inscripcion;
  if v_baja is not null then
    raise exception 'El alumno ya está de baja';
  end if;
  update public.inscripciones set fecha_baja = v_fecha where id = p_inscripcion;
end;
$$;

create or replace function public.revertir_baja(p_inscripcion uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_baja date;
begin
  perform private.materia_de_inscripcion_editable(p_inscripcion);
  select i.fecha_baja into v_baja from public.inscripciones i where i.id = p_inscripcion;
  if v_baja is null then
    raise exception 'El alumno no está de baja';
  end if;
  update public.inscripciones set fecha_baja = null where id = p_inscripcion;
end;
$$;

create or replace function public.cargar_resultado_final(p_inscripcion uuid, p_resultado text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.materia_de_inscripcion_editable(p_inscripcion);
  if p_resultado is null or p_resultado not in ('pendiente', 'aprobado', 'desaprobado') then
    raise exception 'El resultado final debe ser pendiente, aprobado o desaprobado';
  end if;
  update public.inscripciones set resultado_final = p_resultado where id = p_inscripcion;
end;
$$;

revoke execute on function public.dar_de_baja(uuid, date)            from public, anon;
revoke execute on function public.revertir_baja(uuid)                from public, anon;
revoke execute on function public.cargar_resultado_final(uuid, text) from public, anon;
grant  execute on function public.dar_de_baja(uuid, date)            to authenticated;
grant  execute on function public.revertir_baja(uuid)                to authenticated;
grant  execute on function public.cargar_resultado_final(uuid, text) to authenticated;

-- ---------- Pieza 4: auditoría de asistencias y de inscripciones ----------

-- Quién y cuándo en cada asistencia (el "cuándo" de la creación ya existía: creado_en)
alter table public.asistencias
  add column creado_por        uuid references public.personas (id) on delete set null,
  add column modificado_por    uuid references public.personas (id) on delete set null,
  add column modificado_en     timestamptz,
  add column motivo_correccion text;   -- de paso: el profesor lo escribe al corregir (opcional) y se pasa al historial

-- Historial único e inmutable de asistencias e inscripciones
create table public.historial_cambios (
  id                 uuid primary key default gen_random_uuid(),
  materia_id         uuid not null references public.materias (id) on delete cascade,
  inscripcion_id     uuid not null references public.inscripciones (id) on delete cascade,
  clase_id           uuid references public.clases (id) on delete cascade,
  tabla              text not null check (tabla in ('asistencias', 'inscripciones')),
  antes              jsonb not null,
  despues            jsonb not null,
  motivo_correccion  text,
  otro_dia           boolean not null default false,   -- cambio hecho un día distinto al de la clase (hora de Argentina)
  hecho_por          uuid references public.personas (id) on delete set null,
  hecho_en           timestamptz not null default clock_timestamp()   -- hora real de cada cambio (now() repetiría la hora de toda la transacción)
);
create index on public.historial_cambios (materia_id, hecho_en);
create index on public.historial_cambios (inscripcion_id);

alter table public.historial_cambios enable row level security;
revoke all on public.historial_cambios from anon, authenticated;
grant select on public.historial_cambios to authenticated;   -- nadie escribe desde la app: lo hacen los disparadores

-- Quién ve una materia (su historial y sus porcentajes): el profesor de la materia,
-- el coordinador de su carrera y el administrador de su institución
create or replace function private.puede_ver_materia(p_materia uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.es_profesor_de(p_materia)
      or exists (
           select 1
           from public.materias m
           join public.coordinadores c on c.carrera_id = m.carrera_id
           where m.id = p_materia and c.persona_id = private.mi_persona_id()
         )
      or (
           private.soy_admin()
           and exists (
             select 1 from public.materias m
             where m.id = p_materia and m.institucion_id = private.mi_institucion_id()
           )
         )
$$;
revoke execute on function private.puede_ver_materia(uuid) from public, anon;
grant  execute on function private.puede_ver_materia(uuid) to authenticated;

create policy "ver historial segun mi rol" on public.historial_cambios
  for select to authenticated
  using (private.puede_ver_materia(materia_id));

-- Nadie modifica el historial (los borrados solo ocurren en cascada si se purga una materia)
create or replace function private.historial_inmutable()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  raise exception 'El historial no se puede modificar';
end;
$$;
revoke execute on function private.historial_inmutable() from public, anon, authenticated;
create trigger historial_no_modificar
  before update on public.historial_cambios
  for each row execute function private.historial_inmutable();

-- ---------- Asistencias: alta ----------
create or replace function private.auditar_asistencia_alta()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.creado_por        := private.mi_persona_id();   -- siempre la sesión real, nunca un valor enviado
  new.modificado_por    := null;
  new.modificado_en     := null;
  new.motivo_correccion := null;
  return new;
end;
$$;
revoke execute on function private.auditar_asistencia_alta() from public, anon, authenticated;
create trigger asistencias_auditoria_alta
  before insert on public.asistencias
  for each row execute function private.auditar_asistencia_alta();

-- ---------- Asistencias: corrección ----------
create or replace function private.auditar_asistencia_cambio()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_fecha date;
begin
  -- los datos de creación no se tocan
  new.creado_por := old.creado_por;
  new.creado_en  := old.creado_en;

  -- si no cambió nada real, no se registra nada
  if (new.estado, new.motivo, new.observacion)
       is not distinct from (old.estado, old.motivo, old.observacion) then
    new.motivo_correccion := null;
    new.modificado_por    := old.modificado_por;
    new.modificado_en     := old.modificado_en;
    return new;
  end if;

  select c.fecha into v_fecha from public.clases c where c.id = new.clase_id;

  new.modificado_por := private.mi_persona_id();
  new.modificado_en  := now();

  insert into public.historial_cambios (
    materia_id, inscripcion_id, clase_id, tabla, antes, despues,
    motivo_correccion, otro_dia, hecho_por
  )
  values (
    new.materia_id, new.inscripcion_id, new.clase_id, 'asistencias',
    jsonb_build_object('estado', old.estado, 'motivo', old.motivo, 'observacion', old.observacion),
    jsonb_build_object('estado', new.estado, 'motivo', new.motivo, 'observacion', new.observacion),
    nullif(btrim(coalesce(new.motivo_correccion, '')), ''),
    private.fecha_ar(now()) <> v_fecha,
    private.mi_persona_id()
  );

  new.motivo_correccion := null;
  return new;
end;
$$;
revoke execute on function private.auditar_asistencia_cambio() from public, anon, authenticated;
create trigger asistencias_auditoria_cambio
  before update on public.asistencias
  for each row execute function private.auditar_asistencia_cambio();

-- ---------- Inscripciones: bajas, reversiones y resultado final ----------
create or replace function private.auditar_inscripcion_cambio()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (new.fecha_baja, new.resultado_final)
       is not distinct from (old.fecha_baja, old.resultado_final) then
    return new;
  end if;

  insert into public.historial_cambios (
    materia_id, inscripcion_id, tabla, antes, despues, hecho_por
  )
  values (
    new.materia_id, new.id, 'inscripciones',
    jsonb_build_object('fecha_baja', old.fecha_baja, 'resultado_final', old.resultado_final),
    jsonb_build_object('fecha_baja', new.fecha_baja, 'resultado_final', new.resultado_final),
    private.mi_persona_id()
  );
  return new;
end;
$$;
revoke execute on function private.auditar_inscripcion_cambio() from public, anon, authenticated;
create trigger inscripciones_auditoria
  after update on public.inscripciones
  for each row execute function private.auditar_inscripcion_cambio();

-- ---------- Borrados ----------
-- El profesor no borra asistencias: las corrige.
drop policy "borrar asistencias de mis materias" on public.asistencias;
revoke delete on public.asistencias from authenticated;

-- Una clase solo se borra si no tiene asistencias. (Si se purga una materia entera,
-- el borrado llega en cascada, a mayor profundidad de disparadores, y no se frena.)
create or replace function private.proteger_clase_con_asistencias()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if pg_trigger_depth() = 1
     and exists (select 1 from public.asistencias a where a.clase_id = old.id) then
    raise exception 'No se puede borrar una clase con asistencias registradas';
  end if;
  return old;
end;
$$;
revoke execute on function private.proteger_clase_con_asistencias() from public, anon, authenticated;
create trigger clases_proteger_borrado
  before delete on public.clases
  for each row execute function private.proteger_clase_con_asistencias();

-- ---------- Pieza 5: porcentaje de asistencia (una sola fórmula, en la base) ----------
-- Reglas:
--  * Cuenta desde la primera clase de la materia hasta la fecha de baja del alumno (si la tiene) y hasta la fecha pedida.
--  * Presente y ausente justificada cuentan como asistidas. Ausente injustificada, no.
--  * Una clase sin registro para el alumno cuenta como ausente injustificada (inscripción tardía, baja revertida, clase sin cargar).
--  * El porcentaje se trunca a 2 decimales (nunca se redondea hacia arriba) para que lo que se ve coincida con el color.

-- Color según los umbrales del ciclo: verde desde el umbral de aprobado, amarillo desde el de regular, rojo por debajo.
-- Se compara con la fracción exacta, no con el número redondeado.
create or replace function private.color_asistencia(
  p_asistidas int, p_total int, p_aprobado numeric, p_regular numeric
)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_total is null or p_total = 0           then null
    when p_asistidas * 100 >= p_aprobado * p_total then 'verde'
    when p_asistidas * 100 >= p_regular  * p_total then 'amarillo'
    else 'rojo'
  end
$$;
revoke execute on function private.color_asistencia(int, int, numeric, numeric) from public, anon;
grant  execute on function private.color_asistencia(int, int, numeric, numeric) to authenticated;

-- Porcentajes de todos los alumnos de una materia: del período pedido y acumulado.
create or replace function public.porcentajes_materia(
  p_materia uuid,
  p_desde   date default null,
  p_hasta   date default null
)
returns table (
  inscripcion_id        uuid,
  alumno_id             uuid,
  clases_periodo        int,
  asistidas_periodo     int,
  porcentaje_periodo    numeric,
  clases_acumuladas     int,
  asistidas_acumuladas  int,
  porcentaje_acumulado  numeric,
  color                 text
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_aprobado numeric;
  v_regular  numeric;
  v_hasta    date := coalesce(p_hasta, private.hoy_ar());
begin
  if not private.puede_ver_materia(p_materia) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select c.umbral_aprobado, c.umbral_regular into v_aprobado, v_regular
  from public.materias m
  join public.ciclos_lectivos c on c.id = m.ciclo_id
  where m.id = p_materia;

  return query
  with base as (
    select i.id as insc, i.alumno_id as alumno, cl.fecha,
           coalesce(a.estado = 'presente' or a.motivo = 'justificada', false) as asistio
    from public.inscripciones i
    join public.clases cl
      on cl.materia_id = i.materia_id
     and cl.fecha <= v_hasta
     and (i.fecha_baja is null or cl.fecha <= i.fecha_baja)
    left join public.asistencias a
      on a.clase_id = cl.id and a.inscripcion_id = i.id
    where i.materia_id = p_materia
  ),
  suma as (
    select insc, alumno,
           count(*) filter (where p_desde is null or fecha >= p_desde)                    as cp,
           count(*) filter (where asistio and (p_desde is null or fecha >= p_desde))      as ap,
           count(*)                                                                       as ca,
           count(*) filter (where asistio)                                                as aa
    from base
    group by insc, alumno
  )
  select s.insc, s.alumno,
         s.cp::int, s.ap::int,
         case when s.cp = 0 then null else trunc(100.0 * s.ap / s.cp, 2) end,
         s.ca::int, s.aa::int,
         case when s.ca = 0 then null else trunc(100.0 * s.aa / s.ca, 2) end,
         private.color_asistencia(s.aa::int, s.ca::int, v_aprobado, v_regular)
  from suma s
  union all
  -- alumnos sin ninguna clase contada (materia sin clases, o baja anterior a la primera clase)
  select i.id, i.alumno_id, 0, 0, null::numeric, 0, 0, null::numeric, null::text
  from public.inscripciones i
  where i.materia_id = p_materia
    and not exists (select 1 from suma s where s.insc = i.id);
end;
$$;

revoke execute on function public.porcentajes_materia(uuid, date, date) from public, anon;
grant  execute on function public.porcentajes_materia(uuid, date, date) to authenticated;

commit;
