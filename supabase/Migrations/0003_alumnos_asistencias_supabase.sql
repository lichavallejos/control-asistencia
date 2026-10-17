-- 0003_alumnos_asistencias_supabase.sql
-- Operaciones atomicas para alta de alumnos y guardado de planillas.

create or replace function public.crear_alumno_matricular(
  p_nombre text,
  p_dni text,
  p_materia uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_institucion uuid := private.mi_institucion_id();
  v_alumno uuid;
begin
  if v_institucion is null or not private.es_profesor_de(p_materia) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if btrim(coalesce(p_nombre, '')) = '' then
    raise exception 'El apellido y nombre es obligatorio';
  end if;

  if nullif(btrim(coalesce(p_dni, '')), '') is not null then
    select p.id into v_alumno
    from public.personas p
    where p.institucion_id = v_institucion
      and p.tipo = 'alumno'
      and p.dni = btrim(p_dni)
    limit 1;
  end if;

  if v_alumno is null then
    insert into public.personas (institucion_id, tipo, apellido_nombre, dni)
    values (v_institucion, 'alumno', btrim(p_nombre), nullif(btrim(coalesce(p_dni, '')), ''))
    returning id into v_alumno;
  end if;

  insert into public.inscripciones (alumno_id, materia_id)
  values (v_alumno, p_materia)
  on conflict (alumno_id, materia_id) do nothing;

  return v_alumno;
end;
$$;

revoke execute on function public.crear_alumno_matricular(text, text, uuid) from public, anon;
grant execute on function public.crear_alumno_matricular(text, text, uuid) to authenticated;

create or replace function public.guardar_planilla_asistencia(
  p_materia uuid,
  p_fecha date,
  p_registros jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clase uuid;
  v_registro jsonb;
  v_alumno uuid;
  v_inscripcion uuid;
  v_estado text;
  v_motivo text;
begin
  if not private.es_profesor_de(p_materia) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if p_fecha is null or jsonb_typeof(p_registros) <> 'array' then
    raise exception 'Fecha o registros inválidos';
  end if;

  insert into public.clases (materia_id, fecha)
  values (p_materia, p_fecha)
  on conflict (materia_id, fecha) do update set fecha = excluded.fecha
  returning id into v_clase;

  for v_registro in select value from jsonb_array_elements(p_registros)
  loop
    v_alumno := (v_registro->>'alumno_id')::uuid;
    v_estado := v_registro->>'estado';
    v_motivo := nullif(v_registro->>'motivo', '');

    if v_estado not in ('presente', 'ausente') then
      raise exception 'Estado de asistencia inválido';
    end if;

    select i.id into v_inscripcion
    from public.inscripciones i
    where i.alumno_id = v_alumno and i.materia_id = p_materia;

    if v_inscripcion is null then
      raise exception 'El alumno no está inscripto en esta materia';
    end if;

    if v_estado = 'presente' then
      v_motivo := null;
    elsif v_motivo is null then
      v_motivo := 'injustificada';
    end if;

    insert into public.asistencias
      (clase_id, inscripcion_id, materia_id, estado, motivo, observacion)
    values
      (v_clase, v_inscripcion, p_materia, v_estado, v_motivo,
       nullif(v_registro->>'observacion', ''))
    on conflict (clase_id, inscripcion_id)
    do update set
      estado = excluded.estado,
      motivo = excluded.motivo,
      observacion = excluded.observacion;
  end loop;

  return v_clase;
end;
$$;

revoke execute on function public.guardar_planilla_asistencia(uuid, date, jsonb) from public, anon;
grant execute on function public.guardar_planilla_asistencia(uuid, date, jsonb) to authenticated;
