-- =====================================================================
-- 0008_mis_materias.sql
-- Función mis_materias(): las materias del profesor con la sesión iniciada,
-- con el nombre de su carrera y el año y estado de su ciclo.
--
-- PROBLEMA QUE RESUELVE: la tabla carreras está cerrada a la API (0005), así
-- que el profesor no podía ver a qué carrera pertenece cada materia. Si dicta
-- materias con el mismo nombre en dos carreras (por ejemplo Matemática en dos
-- profesorados), las pantallas mostraban dos materias idénticas.
--
-- DECISIÓN (04/11/2026): se resuelve con una función y no con una política
-- nueva sobre carreras. No se abre ningún permiso nuevo sobre tablas.
--
-- QUÉ DEVUELVE: solo las materias que dicta quien llama (mismo criterio que
-- la política «ver mis materias»), incluidas las inactivas y las de ciclos
-- cerrados, cada una con su estado. Un administrador que no dicta una materia
-- no la ve acá: para eso están sus funciones propias (listar_materias_institucion).
-- Quien no es profesor recibe una lista vacía, no un error.
--
-- COMPATIBILIDAD: no cambia nada existente; las pantallas actuales siguen
-- andando. Es segura en staging y en producción.
--
-- Esta migración no se edita una vez aplicada: las correcciones van en una nueva.
-- =====================================================================

begin;

create function public.mis_materias()
returns table (
  id             uuid,
  nombre         text,
  anio           smallint,
  tipo           text,
  duracion       text,
  cuatrimestre   smallint,
  activo         boolean,
  carrera_id     uuid,
  carrera_nombre text,
  carrera_activa boolean,
  ciclo_id       uuid,
  ciclo_anio     smallint,
  ciclo_estado   text
)
language sql stable security definer set search_path = ''
as $$
  select m.id, m.nombre, m.anio, m.tipo, m.duracion, m.cuatrimestre, m.activo,
         m.carrera_id, ca.nombre, ca.activo,
         m.ciclo_id, ci.anio, ci.estado
  from public.materias m
  join public.carreras ca on ca.id = m.carrera_id
  join public.ciclos_lectivos ci on ci.id = m.ciclo_id
  where private.es_profesor_de(m.id)
  order by ci.anio desc,
           private.texto_normalizado(ca.nombre),
           m.anio,
           coalesce(m.cuatrimestre, 0),
           private.texto_normalizado(m.nombre)
$$;

revoke execute on function public.mis_materias() from public, anon;
grant  execute on function public.mis_materias() to authenticated;

commit;
