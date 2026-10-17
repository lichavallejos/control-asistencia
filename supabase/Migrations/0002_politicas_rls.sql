-- =====================================================================
-- 0002_politicas_rls.sql
-- Permisos (RLS) del MVP.
-- Regla general: un profesor con cuenta solo ve y modifica lo que
-- pertenece a SUS materias y a SU institución. Un usuario sin sesión
-- (anon) no accede a nada.
-- Los alumnos con cuenta propia se agregan en una etapa posterior.
-- =====================================================================

-- ---------- Funciones auxiliares (esquema privado, no expuesto a la API) ----------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ID de persona del profesor que tiene la sesión iniciada
create or replace function private.mi_persona_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.id from public.personas p
  where p.user_id = auth.uid() and p.tipo = 'profesor'
$$;

create or replace function private.mi_institucion_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.institucion_id from public.personas p
  where p.user_id = auth.uid() and p.tipo = 'profesor'
$$;

-- ¿Dicta este profesor esta materia?
create or replace function private.es_profesor_de(p_materia uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profesor_materias pm
    where pm.materia_id = p_materia
      and pm.profesor_id = private.mi_persona_id()
  )
$$;

-- ¿Es un alumno de mi institución?
create or replace function private.alumno_es_de_mi_institucion(p_persona uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.personas p
    where p.id = p_persona
      and p.tipo = 'alumno'
      and p.institucion_id = private.mi_institucion_id()
  )
$$;

-- ¿Es un alumno inscripto en alguna de mis materias?
create or replace function private.alumno_es_mio(p_persona uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.inscripciones i
    join public.profesor_materias pm on pm.materia_id = i.materia_id
    where i.alumno_id = p_persona
      and pm.profesor_id = private.mi_persona_id()
  )
$$;

revoke execute on all functions in schema private from public, anon;
grant  execute on all functions in schema private to authenticated;

-- ---------- Crear materia (la crea y se la asigna al profesor, todo junto) ----------
create or replace function public.crear_materia(p_nombre text, p_anio smallint)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_profesor uuid := private.mi_persona_id();
  v_inst     uuid := private.mi_institucion_id();
  v_id       uuid;
begin
  if v_profesor is null then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if btrim(coalesce(p_nombre, '')) = '' then
    raise exception 'El nombre de la materia es obligatorio';
  end if;

  insert into public.materias (institucion_id, nombre, anio)
  values (v_inst, btrim(p_nombre), p_anio)
  returning id into v_id;

  insert into public.profesor_materias (profesor_id, materia_id)
  values (v_profesor, v_id);

  return v_id;
end;
$$;

revoke execute on function public.crear_materia(text, smallint) from public, anon;
grant  execute on function public.crear_materia(text, smallint) to authenticated;

-- ---------- Permisos mínimos sobre las tablas ----------
revoke all on public.instituciones, public.personas, public.materias,
              public.profesor_materias, public.inscripciones,
              public.clases, public.asistencias
  from anon, authenticated;

grant select                         on public.instituciones     to authenticated;
grant select, insert, update         on public.personas          to authenticated;
grant select, update                 on public.materias          to authenticated;
grant select                         on public.profesor_materias to authenticated;
grant select, insert, delete         on public.inscripciones     to authenticated;
grant select, insert, update, delete on public.clases            to authenticated;
grant select, insert, update, delete on public.asistencias       to authenticated;

-- ---------- Políticas ----------

-- instituciones: solo ver la propia
create policy "ver mi institucion" on public.instituciones
  for select to authenticated
  using (id = private.mi_institucion_id());

-- personas: ver los alumnos de mi institución y a mí mismo
create policy "ver alumnos de mi institucion y a mi" on public.personas
  for select to authenticated
  using (
    institucion_id = private.mi_institucion_id()
    and (tipo = 'alumno' or id = private.mi_persona_id())
  );

-- personas: crear alumnos nuevos en mi institución
create policy "crear alumnos en mi institucion" on public.personas
  for insert to authenticated
  with check (
    tipo = 'alumno'
    and institucion_id = private.mi_institucion_id()
  );

-- personas: editar alumnos inscriptos en mis materias
create policy "editar mis alumnos" on public.personas
  for update to authenticated
  using (private.alumno_es_mio(id))
  with check (
    tipo = 'alumno'
    and institucion_id = private.mi_institucion_id()
  );

-- materias: ver y editar solo las mías (se crean con crear_materia)
create policy "ver mis materias" on public.materias
  for select to authenticated
  using (private.es_profesor_de(id));

create policy "editar mis materias" on public.materias
  for update to authenticated
  using (private.es_profesor_de(id))
  with check (
    private.es_profesor_de(id)
    and institucion_id = private.mi_institucion_id()
  );

-- profesor_materias: ver solo mis asignaciones
create policy "ver mis asignaciones" on public.profesor_materias
  for select to authenticated
  using (profesor_id = private.mi_persona_id());

-- inscripciones: de mis materias, y solo con alumnos de mi institución
create policy "ver inscripciones de mis materias" on public.inscripciones
  for select to authenticated
  using (private.es_profesor_de(materia_id));

create policy "inscribir en mis materias" on public.inscripciones
  for insert to authenticated
  with check (
    private.es_profesor_de(materia_id)
    and private.alumno_es_de_mi_institucion(alumno_id)
  );

create policy "quitar inscripciones de mis materias" on public.inscripciones
  for delete to authenticated
  using (private.es_profesor_de(materia_id));

-- clases: solo de mis materias
create policy "ver clases de mis materias" on public.clases
  for select to authenticated
  using (private.es_profesor_de(materia_id));

create policy "crear clases en mis materias" on public.clases
  for insert to authenticated
  with check (private.es_profesor_de(materia_id));

create policy "editar clases de mis materias" on public.clases
  for update to authenticated
  using (private.es_profesor_de(materia_id))
  with check (private.es_profesor_de(materia_id));

create policy "borrar clases de mis materias" on public.clases
  for delete to authenticated
  using (private.es_profesor_de(materia_id));

-- asistencias: solo de mis materias
create policy "ver asistencias de mis materias" on public.asistencias
  for select to authenticated
  using (private.es_profesor_de(materia_id));

create policy "cargar asistencias en mis materias" on public.asistencias
  for insert to authenticated
  with check (private.es_profesor_de(materia_id));

create policy "editar asistencias de mis materias" on public.asistencias
  for update to authenticated
  using (private.es_profesor_de(materia_id))
  with check (private.es_profesor_de(materia_id));

create policy "borrar asistencias de mis materias" on public.asistencias
  for delete to authenticated
  using (private.es_profesor_de(materia_id));
