-- =====================================================================
-- 0005_carreras.sql
-- Carreras, coordinadores y vínculos de profesores y alumnos con carreras.
--
-- Esta migración SOLO crea la estructura y sus reglas de integridad.
-- Todavía no da permisos nuevos a nadie: las funciones para crear carreras,
-- designar coordinadores, asignar carrera a las materias y cargar profesores
-- vienen en la migración siguiente.
--
-- Decisión de diseño (opción A): al inscribir a un alumno en una materia
-- que tiene carrera, el alumno queda vinculado a esa carrera automáticamente.
-- El flujo actual de pegar listas no cambia.
--
-- Las materias que ya existen NO se tocan: quedan con carrera_id vacío
-- hasta que se les asigne una carrera.
-- =====================================================================

-- ---------- Carreras ----------
create table public.carreras (
  id              uuid primary key default gen_random_uuid(),
  institucion_id  uuid not null references public.instituciones (id),
  nombre          text not null check (btrim(nombre) <> ''),
  creado_en       timestamptz not null default now(),
  -- Permite que otras tablas verifiquen que la carrera es de la misma institución
  unique (id, institucion_id)
);

-- El nombre no se repite dentro de una institución (sin importar mayúsculas)
create unique index carreras_nombre_unico
  on public.carreras (institucion_id, lower(btrim(nombre)));

-- ---------- Quién coordina qué carrera ----------
create table public.coordinadores (
  persona_id  uuid not null references public.personas (id) on delete cascade,
  carrera_id  uuid not null references public.carreras (id) on delete cascade,
  creado_en   timestamptz not null default now(),
  primary key (persona_id, carrera_id)
);

-- ---------- En qué carreras trabaja cada profesor ----------
create table public.profesor_carreras (
  profesor_id  uuid not null references public.personas (id) on delete cascade,
  carrera_id   uuid not null references public.carreras (id) on delete cascade,
  creado_en    timestamptz not null default now(),
  primary key (profesor_id, carrera_id)
);

-- ---------- En qué carreras cursa cada alumno (puede ser más de una) ----------
create table public.alumno_carreras (
  alumno_id   uuid not null references public.personas (id) on delete cascade,
  carrera_id  uuid not null references public.carreras (id) on delete cascade,
  creado_en   timestamptz not null default now(),
  primary key (alumno_id, carrera_id)
);

create index on public.carreras (institucion_id);
create index on public.coordinadores (carrera_id);
create index on public.profesor_carreras (carrera_id);
create index on public.alumno_carreras (carrera_id);

-- ---------- Cada materia pertenece (opcionalmente, por ahora) a una carrera ----------
alter table public.materias add column carrera_id uuid;

-- La carrera de una materia tiene que ser de la misma institución que la materia
alter table public.materias
  add constraint materias_carrera_fk
  foreign key (carrera_id, institucion_id)
  references public.carreras (id, institucion_id);

-- Dentro de una carrera no se repiten nombre y año (los duplicados accidentales
-- se frenan). Las materias sin carrera quedan fuera de esta regla.
create unique index materias_unica_por_carrera
  on public.materias (carrera_id, lower(btrim(nombre)), anio)
  where carrera_id is not null;

create index on public.materias (carrera_id);

-- ---------- Reglas de integridad de los vínculos ----------
-- La persona debe ser del tipo correcto y de la misma institución que la carrera.
-- (Una clave foránea no puede comprobar el tipo de persona, por eso se usa un disparador.)
create or replace function private.validar_vinculo_carrera()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_columna  text := tg_argv[0];
  v_tipo     text := tg_argv[1];
  v_persona  uuid := (to_jsonb(new) ->> v_columna)::uuid;
  v_tipo_real     text;
  v_inst_persona  uuid;
  v_inst_carrera  uuid;
begin
  select p.tipo, p.institucion_id into v_tipo_real, v_inst_persona
  from public.personas p where p.id = v_persona;

  select c.institucion_id into v_inst_carrera
  from public.carreras c where c.id = new.carrera_id;

  if v_tipo_real is distinct from v_tipo then
    raise exception 'La persona debe ser de tipo %', v_tipo;
  end if;
  if v_inst_persona is distinct from v_inst_carrera then
    raise exception 'La persona y la carrera deben ser de la misma institución';
  end if;
  return new;
end;
$$;

create trigger coordinadores_valida
  before insert or update on public.coordinadores
  for each row execute function private.validar_vinculo_carrera('persona_id', 'profesor');

create trigger profesor_carreras_valida
  before insert or update on public.profesor_carreras
  for each row execute function private.validar_vinculo_carrera('profesor_id', 'profesor');

create trigger alumno_carreras_valida
  before insert or update on public.alumno_carreras
  for each row execute function private.validar_vinculo_carrera('alumno_id', 'alumno');

-- ---------- Opción A: vinculación automática del alumno a la carrera ----------
-- 1) Al inscribir a un alumno en una materia que tiene carrera.
create or replace function private.vincular_alumno_a_carrera()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.alumno_carreras (alumno_id, carrera_id)
  select new.alumno_id, m.carrera_id
  from public.materias m
  where m.id = new.materia_id and m.carrera_id is not null
  on conflict do nothing;
  return new;
end;
$$;

create trigger inscripciones_vincula_carrera
  after insert on public.inscripciones
  for each row execute function private.vincular_alumno_a_carrera();

-- 2) Al asignarle una carrera a una materia que ya tiene alumnos inscriptos.
--    Si más adelante se cambia la carrera, los vínculos anteriores NO se borran
--    (el alumno sí cursó en esa carrera).
create or replace function private.vincular_alumnos_de_materia()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.carrera_id is not null and new.carrera_id is distinct from old.carrera_id then
    insert into public.alumno_carreras (alumno_id, carrera_id)
    select i.alumno_id, new.carrera_id
    from public.inscripciones i
    where i.materia_id = new.id
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger materias_vincula_alumnos
  after update of carrera_id on public.materias
  for each row execute function private.vincular_alumnos_de_materia();

-- Las funciones nuevas nacen ejecutables por todos: se cierra explícitamente.
-- (Los disparadores no necesitan permiso de ejecución para funcionar.)
revoke execute on function private.validar_vinculo_carrera()      from public, anon, authenticated;
revoke execute on function private.vincular_alumno_a_carrera()    from public, anon, authenticated;
revoke execute on function private.vincular_alumnos_de_materia()  from public, anon, authenticated;

-- ---------- Seguridad ----------
alter table public.carreras           enable row level security;
alter table public.coordinadores      enable row level security;
alter table public.profesor_carreras  enable row level security;
alter table public.alumno_carreras    enable row level security;

revoke all on public.carreras, public.coordinadores,
              public.profesor_carreras, public.alumno_carreras
  from anon, authenticated;

-- La app solo puede LEER sus propias coordinaciones (para saber si es coordinador).
-- Carreras, profesor_carreras y alumno_carreras se manejan solo por funciones.
grant select on public.coordinadores to authenticated;

create policy "ver mis coordinaciones" on public.coordinadores
  for select to authenticated
  using (persona_id = private.mi_persona_id());

-- Cerrar un hueco: hasta ahora un profesor podía modificar CUALQUIER columna de
-- sus materias. Con la nueva columna carrera_id, podría cambiarle la carrera a su
-- materia. Desde ahora solo puede editar nombre y año; la carrera la asignan el
-- administrador o el coordinador, mediante funciones.
revoke update on public.materias from authenticated;
grant  update (nombre, anio) on public.materias to authenticated;
