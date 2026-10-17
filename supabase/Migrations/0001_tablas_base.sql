-- =====================================================================
-- 0001_tablas_base.sql
-- Tablas mínimas del MVP de control de asistencia.
-- Todas las tablas nacen con RLS activado: sin políticas, nadie puede
-- leer ni escribir desde la API. Las políticas se agregan en el paso 14.
-- =====================================================================

-- Instituciones (por ahora una sola, pero el diseño ya admite varias)
create table public.instituciones (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  creado_en  timestamptz not null default now()
);

-- Personas: pueden existir sin cuenta de acceso (user_id queda vacío)
create table public.personas (
  id              uuid primary key default gen_random_uuid(),
  institucion_id  uuid not null references public.instituciones (id),
  user_id         uuid unique references auth.users (id) on delete set null,
  tipo            text not null check (tipo in ('profesor', 'alumno')),
  apellido_nombre text not null,
  dni             text,
  email           text,
  creado_en       timestamptz not null default now()
);

-- El DNI no se repite dentro de una institución (si está cargado)
create unique index personas_dni_unico
  on public.personas (institucion_id, dni)
  where dni is not null and dni <> '';

-- Materias
create table public.materias (
  id              uuid primary key default gen_random_uuid(),
  institucion_id  uuid not null references public.instituciones (id),
  nombre          text not null,
  anio            smallint not null check (anio between 1 and 4),
  creado_en       timestamptz not null default now()
);

-- Qué profesor dicta qué materia (un profesor puede tener varias)
create table public.profesor_materias (
  profesor_id  uuid not null references public.personas (id) on delete cascade,
  materia_id   uuid not null references public.materias (id) on delete cascade,
  primary key (profesor_id, materia_id)
);

-- Inscripciones de alumnos a materias
create table public.inscripciones (
  id          uuid primary key default gen_random_uuid(),
  alumno_id   uuid not null references public.personas (id) on delete cascade,
  materia_id  uuid not null references public.materias (id) on delete cascade,
  creado_en   timestamptz not null default now(),
  unique (alumno_id, materia_id),
  unique (id, materia_id)
);

-- Clases (una por materia y fecha)
create table public.clases (
  id          uuid primary key default gen_random_uuid(),
  materia_id  uuid not null references public.materias (id) on delete cascade,
  fecha       date not null,
  creado_en   timestamptz not null default now(),
  unique (materia_id, fecha),
  unique (id, materia_id)
);

-- Asistencias: siempre de un alumno inscripto y de una clase concreta.
-- Las claves compuestas obligan a que la clase y la inscripción
-- pertenezcan a la MISMA materia.
create table public.asistencias (
  id              uuid primary key default gen_random_uuid(),
  clase_id        uuid not null,
  inscripcion_id  uuid not null,
  materia_id      uuid not null,
  estado          text not null check (estado in ('presente', 'ausente')),
  motivo          text check (motivo in ('justificada', 'injustificada')),
  observacion     text,
  creado_en       timestamptz not null default now(),
  unique (clase_id, inscripcion_id),
  foreign key (clase_id, materia_id)
    references public.clases (id, materia_id) on delete cascade,
  foreign key (inscripcion_id, materia_id)
    references public.inscripciones (id, materia_id) on delete cascade,
  check (estado = 'ausente' or motivo is null)
);

-- Índices para las consultas más comunes
create index on public.personas (institucion_id);
create index on public.materias (institucion_id);
create index on public.inscripciones (materia_id);
create index on public.clases (materia_id);
create index on public.asistencias (clase_id);
create index on public.asistencias (inscripcion_id);

-- Seguridad: activar RLS en todas las tablas
alter table public.instituciones      enable row level security;
alter table public.personas           enable row level security;
alter table public.materias           enable row level security;
alter table public.profesor_materias  enable row level security;
alter table public.inscripciones      enable row level security;
alter table public.clases             enable row level security;
alter table public.asistencias        enable row level security;
