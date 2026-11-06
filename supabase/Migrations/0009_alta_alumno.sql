-- =====================================================================
-- 0009_alta_alumno.sql
-- Pieza 1 de alumnos: dar de alta a un alumno en una materia, con una sola
-- función de la base (inscribir_alumno), con todas las validaciones.
--
-- QUÉ HACE
--   * Recibe la materia, Apellido y Nombre (un solo campo), DNI y correo (opcional).
--   * Si el DNI ya existe en la institución y es de un alumno, lo reutiliza SIN
--     pisar su nombre ni su correo. Si no existe, crea la persona como alumno.
--   * Inscribe al alumno en la materia. La vinculación con la carrera la hace
--     sola el disparador de la 0005.
--   * Todo o nada: si algo falla, no queda nada a medias.
--
-- DECISIONES (06/11/2026)
--   * La regla de los 2 meses para crear alumnos después del alta del ciclo
--     NO se incluye acá: va en una migración aparte.
--   * Si el DNI pertenece a un profesor, se rechaza.
--   * «Datos incompletos» no es una columna: un alumno sin correo es incompleto.
--
-- QUÉ NO CAMBIA
--   * Esta migración solo AGREGA una función. No toca políticas ni permisos de
--     tablas, así que las pantallas actuales siguen funcionando igual.
--     Cerrar los caminos directos (insertar en personas y en inscripciones desde
--     la app) queda para un paso posterior, cuando la pantalla use la función.
--
-- Esta migración no se edita una vez aplicada: las correcciones van en una nueva.
-- =====================================================================

begin;

create or replace function public.inscribir_alumno(
  p_materia uuid,
  p_nombre  text,
  p_dni     text,
  p_email   text default null
)
returns table (
  inscripcion_id  uuid,
  alumno_id       uuid,
  persona_creada  boolean
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_profesor uuid := private.mi_persona_id();
  v_inst     uuid := private.mi_institucion_id();
  v_nombre   text := regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_dni      text := btrim(coalesce(p_dni, ''));
  v_email    text := nullif(btrim(coalesce(p_email, '')), '');
  v_alumno   uuid;
  v_tipo     text;
  v_creada   boolean := false;
  v_insc     uuid;
  v_baja     date;
begin
  -- 1) Quién llama: un profesor con sesión que dicta esa materia, de su institución.
  --    (Esta función se saltea RLS, por eso lo comprueba ella misma.)
  if v_profesor is null then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_materia is null
     or not private.es_profesor_de(p_materia)
     or not exists (
       select 1 from public.materias m
       where m.id = p_materia and m.institucion_id = v_inst
     ) then
    raise exception 'La materia no existe en tus materias';
  end if;
  if not private.materia_editable(p_materia) then
    raise exception 'La materia está inactiva o su ciclo está cerrado: solo lectura';
  end if;

  -- 2) Validaciones de los datos
  if v_nombre = '' then
    raise exception 'El apellido y nombre del alumno es obligatorio';
  end if;
  if v_dni !~ '^[0-9]{7,8}$' then
    raise exception 'El DNI debe tener 7 u 8 números, sin puntos ni espacios';
  end if;
  if v_email is not null and position('@' in v_email) = 0 then
    raise exception 'El correo no es válido';
  end if;

  -- 3) ¿Existe ya una persona con ese DNI en la institución?
  select p.id, p.tipo into v_alumno, v_tipo
  from public.personas p
  where p.institucion_id = v_inst and p.dni = v_dni;

  if v_alumno is not null then
    if v_tipo = 'profesor' then
      raise exception 'Ese DNI pertenece a un profesor';
    end if;

    -- ¿Ya está inscripto en esta materia?
    select i.id, i.fecha_baja into v_insc, v_baja
    from public.inscripciones i
    where i.alumno_id = v_alumno and i.materia_id = p_materia;

    if v_insc is not null then
      if v_baja is not null then
        raise exception 'El alumno ya está inscripto en esta materia y figura de baja: usá «Revertir baja»';
      end if;
      raise exception 'El alumno ya está inscripto en esta materia';
    end if;
  else
    -- Persona nueva (si otra llamada la creó justo ahora, se la reutiliza)
    begin
      insert into public.personas (institucion_id, tipo, apellido_nombre, dni, email)
      values (v_inst, 'alumno', v_nombre, v_dni, v_email)
      returning id into v_alumno;
      v_creada := true;
    exception when unique_violation then
      select p.id, p.tipo into v_alumno, v_tipo
      from public.personas p
      where p.institucion_id = v_inst and p.dni = v_dni;
      if v_tipo = 'profesor' then
        raise exception 'Ese DNI pertenece a un profesor';
      end if;
    end;
  end if;

  -- 4) Inscribir (el disparador de la 0005 vincula al alumno con la carrera)
  begin
    insert into public.inscripciones (alumno_id, materia_id)
    values (v_alumno, p_materia)
    returning id into v_insc;
  exception when unique_violation then
    raise exception 'El alumno ya está inscripto en esta materia';
  end;

  return query select v_insc, v_alumno, v_creada;
end;
$$;

revoke execute on function public.inscribir_alumno(uuid, text, text, text) from public, anon;
grant  execute on function public.inscribir_alumno(uuid, text, text, text) to authenticated;

commit;
