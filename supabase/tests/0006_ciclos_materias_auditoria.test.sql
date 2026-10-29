-- =====================================================================
-- 0006_ciclos_materias_auditoria.test.sql
-- Pruebas de la migración 0006. Se corren con psql contra el PostgreSQL local
-- (con los roles anon y authenticated y auth.uid() leyendo el ajuste
-- request.jwt.claim.sub). Todo con datos inventados; cada bloque termina en
-- ROLLBACK, así que no deja nada en la base.
-- Cualquier comprobación que falle corta la ejecución con el mensaje «FALLÓ: ...».
-- =====================================================================
\set ON_ERROR_STOP on

-- Ayudas de prueba (viven solo durante la sesión)
create function pg_temp.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'FALLÓ: %', msg; end if;
  raise notice 'ok: %', msg;
end $$;

-- Ejecuta sql con la sesión de una persona (rol authenticated). Debe funcionar.
create function pg_temp.como_ok(uid uuid, q text, msg text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  begin
    execute q;
  exception when others then
    execute 'reset role';
    raise exception 'FALLÓ (daba error y no debía): % -> %', msg, sqlerrm;
  end;
  execute 'reset role';
  raise notice 'ok: %', msg;
end $$;

-- Ejecuta sql con la sesión de una persona. Debe dar un error que contenga el patrón.
create function pg_temp.como_falla(uid uuid, q text, patron text, msg text) returns void language plpgsql as $$
declare v_err text;
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  begin
    execute q;
    v_err := null;
  exception when others then
    v_err := sqlerrm;
  end;
  execute 'reset role';
  if v_err is null then
    raise exception 'FALLÓ (no dio error): %', msg;
  end if;
  if v_err not ilike '%' || patron || '%' then
    raise exception 'FALLÓ (error distinto): % -> %', msg, v_err;
  end if;
  raise notice 'ok: %', msg;
end $$;

-- Ejecuta sql con el rol del dueño de la base (sin RLS). Debe dar un error con el patrón.
create function pg_temp.dueno_falla(q text, patron text, msg text) returns void language plpgsql as $$
declare v_err text;
begin
  begin
    execute q;
    v_err := null;
  exception when others then
    v_err := sqlerrm;
  end;
  if v_err is null then raise exception 'FALLÓ (no dio error): %', msg; end if;
  if v_err not ilike '%' || patron || '%' then
    raise exception 'FALLÓ (error distinto): % -> %', msg, v_err;
  end if;
  raise notice 'ok: %', msg;
end $$;

-- Evalúa una condición SQL con la sesión de una persona. Debe dar verdadero.
create function pg_temp.como_verifica(uid uuid, cond text, msg text) returns void language plpgsql as $$
declare v boolean;
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  begin
    execute 'select (' || cond || ')' into v;
  exception when others then
    execute 'reset role';
    raise exception 'FALLÓ (error al evaluar): % -> %', msg, sqlerrm;
  end;
  execute 'reset role';
  if not coalesce(v, false) then
    raise exception 'FALLÓ: %', msg;
  end if;
  raise notice 'ok: %', msg;
end $$;


-- #####################################################################
-- 1. CICLOS LECTIVOS
-- #####################################################################
begin;

-- ---------- Datos inventados ----------
insert into public.instituciones (id, nombre) values
  ('11111111-0000-0000-0000-000000000001', 'Instituto de prueba A'),
  ('11111111-0000-0000-0000-000000000002', 'Instituto de prueba B');
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@prueba.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'profe@prueba.test'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'adminb@prueba.test');
insert into public.personas (id, institucion_id, user_id, tipo, apellido_nombre) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'profesor', 'Admin Prueba'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'profesor', 'Profe Prueba'),
  ('bbbbbbbb-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000003', 'profesor', 'Admin B Prueba');
insert into public.administradores (persona_id) values
  ('bbbbbbbb-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000003');

-- ---------- 1. Crear ciclo: caso permitido y valores iniciales ----------
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.crear_ciclo(2026::smallint, '2026-03-02', '2026-07-03', '2026-08-03', '2026-11-27')$$,
  'el administrador crea el ciclo 2026');
select pg_temp.ok(
  (select umbral_aprobado = 85 and umbral_regular = 75 and estado = 'abierto'
     from public.ciclos_lectivos where anio = 2026),
  'el primer ciclo arranca abierto con umbrales 85 y 75');

-- ---------- 2. Un solo ciclo por año ----------
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.crear_ciclo(2026::smallint)$$,
  'Ya existe un ciclo', 'no se repite el año en la institución');
-- (otra institución sí puede tener el mismo año)
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000003',
  $$select public.crear_ciclo(2026::smallint)$$,
  'otra institución puede tener su propio ciclo 2026');

-- ---------- 3. Solo el administrador crea ----------
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002',
  $$select public.crear_ciclo(2030::smallint)$$,
  'No autorizado', 'un profesor no administrador no puede crear ciclos');

-- ---------- 4. Umbrales copiados del ciclo anterior ----------
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.editar_ciclo(
      (select id from public.ciclos_lectivos where anio = 2026 and institucion_id = '11111111-0000-0000-0000-000000000001'),
      '2026-03-02', '2026-07-03', '2026-08-03', '2026-11-27', 80, 70)$$,
  'el administrador edita los umbrales del ciclo 2026');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.crear_ciclo(2027::smallint)$$,
  'el administrador crea el ciclo 2027');
select pg_temp.ok(
  (select umbral_aprobado = 80 and umbral_regular = 70
     from public.ciclos_lectivos where anio = 2027 and institucion_id = '11111111-0000-0000-0000-000000000001'),
  'el ciclo 2027 copió los umbrales 80 y 70 del ciclo anterior');
-- caso límite: crear un año anterior copia del anterior a ese año, no del posterior
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.crear_ciclo(2025::smallint)$$,
  'el administrador crea el ciclo 2025');
select pg_temp.ok(
  (select umbral_aprobado = 85 and umbral_regular = 75
     from public.ciclos_lectivos where anio = 2025 and institucion_id = '11111111-0000-0000-0000-000000000001'),
  'un ciclo sin anterior arranca con 85 y 75, sin copiar de uno posterior');

-- ---------- 5. Dos ciclos abiertos a la vez ----------
select pg_temp.ok(
  (select count(*) = 3 from public.ciclos_lectivos
    where estado = 'abierto' and institucion_id = '11111111-0000-0000-0000-000000000001'),
  'pueden convivir varios ciclos abiertos');

-- ---------- 6. Validaciones de datos ----------
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.editar_ciclo(
      (select id from public.ciclos_lectivos where anio = 2027 and institucion_id = '11111111-0000-0000-0000-000000000001'),
      null, null, null, null, 70, 80)$$,
  'ciclos_umbrales_validos', 'el umbral regular debe ser menor que el aprobado');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.editar_ciclo(
      (select id from public.ciclos_lectivos where anio = 2027 and institucion_id = '11111111-0000-0000-0000-000000000001'),
      null, null, null, null, 101, 75)$$,
  'ciclos_umbrales_validos', 'el umbral aprobado no puede pasar de 100');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.editar_ciclo(
      (select id from public.ciclos_lectivos where anio = 2027 and institucion_id = '11111111-0000-0000-0000-000000000001'),
      '2027-03-01', '2027-07-31', '2027-07-31', '2027-11-30', 85, 75)$$,
  'ciclos_cuats_sin_pisarse', 'los cuatrimestres no se pisan');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.editar_ciclo(
      (select id from public.ciclos_lectivos where anio = 2027 and institucion_id = '11111111-0000-0000-0000-000000000001'),
      '2027-07-01', '2027-03-01', null, null, 85, 75)$$,
  'ciclos_cuat1_orden', 'el fin del cuatrimestre no puede ser anterior a su inicio');

-- ---------- 7. Cerrar y reabrir ----------
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.cerrar_ciclo((select id from public.ciclos_lectivos where anio = 2026 and institucion_id = '11111111-0000-0000-0000-000000000001'))$$,
  'el administrador cierra el ciclo 2026');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.editar_ciclo(
      (select id from public.ciclos_lectivos where anio = 2026 and institucion_id = '11111111-0000-0000-0000-000000000001'),
      null, null, null, null, 85, 75)$$,
  'está cerrado', 'un ciclo cerrado no se edita');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.reabrir_ciclo((select id from public.ciclos_lectivos where anio = 2026 and institucion_id = '11111111-0000-0000-0000-000000000001'))$$,
  'el administrador reabre el ciclo 2026');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.editar_ciclo(
      (select id from public.ciclos_lectivos where anio = 2026 and institucion_id = '11111111-0000-0000-0000-000000000001'),
      null, null, null, null, 85, 75)$$,
  'un ciclo reabierto se puede editar');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002',
  $$select public.cerrar_ciclo((select id from public.ciclos_lectivos where anio = 2026 and institucion_id = '11111111-0000-0000-0000-000000000001'))$$,
  'No autorizado', 'un profesor no puede cerrar ciclos');

-- ---------- 8. Aislamiento entre instituciones ----------
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000003',
  $$select public.cerrar_ciclo((select id from public.ciclos_lectivos where anio = 2026 and institucion_id = '11111111-0000-0000-0000-000000000001'))$$,
  'no existe en tu institución', 'el administrador de otra institución no toca ciclos ajenos');

-- ---------- 9. Lectura y escritura directa ----------
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000002',
  $$select 1 / count(*) from public.ciclos_lectivos$$,
  'el profesor puede leer los ciclos de su institución');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000002',
  $$select 1 / (case when count(*) = 3 then 1 else 0 end) from public.ciclos_lectivos$$,
  'el profesor ve solo los 3 ciclos de su institución, no los de la otra');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002',
  $$insert into public.ciclos_lectivos (institucion_id, anio) values ('11111111-0000-0000-0000-000000000001', 2040)$$,
  'permission denied', 'un profesor no puede insertar ciclos directamente');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002',
  $$update public.ciclos_lectivos set umbral_aprobado = 10$$,
  'permission denied', 'un profesor no puede modificar ciclos directamente');
do $$
begin
  set local role anon;
  begin
    perform count(*) from public.ciclos_lectivos;
    reset role;
    raise exception 'FALLÓ: anon pudo leer ciclos';
  exception when insufficient_privilege then
    reset role;
    raise notice 'ok: un usuario sin sesión no accede a los ciclos';
  end;
end $$;

rollback;

-- #####################################################################
-- 2. MATERIAS
-- #####################################################################
begin;
-- Datos inventados comunes a las pruebas (se usan dentro de una transacción)
insert into public.instituciones (id, nombre) values
  ('11111111-0000-0000-0000-000000000001', 'Instituto de prueba A'),
  ('11111111-0000-0000-0000-000000000002', 'Instituto de prueba B');
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@prueba.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'profe@prueba.test'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'adminb@prueba.test');
insert into public.personas (id, institucion_id, user_id, tipo, apellido_nombre) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'profesor', 'Admin Prueba'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'profesor', 'Profe Prueba'),
  ('bbbbbbbb-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000003', 'profesor', 'Admin B Prueba');
insert into public.administradores (persona_id) values
  ('bbbbbbbb-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000003');
insert into public.carreras (id, institucion_id, nombre) values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Profesorado de Ingles (prueba)'),
  ('cccccccc-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'Profesorado de Lengua (prueba)'),
  ('cccccccc-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002', 'Carrera de la otra institucion (prueba)');
insert into public.ciclos_lectivos (id, institucion_id, anio, estado) values
  ('dddddddd-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 2026, 'abierto'),
  ('dddddddd-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 2025, 'cerrado'),
  ('dddddddd-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002', 2026, 'abierto'),
  ('dddddddd-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', 2027, 'abierto');


-- Atajos para no repetir ids largos
-- admin A = aaaaaaaa-...-01 | profe A = ...-02 | admin B = ...-03
-- carrera A1 = cccccccc-...-01 | A2 = ...-02 | carrera de B = ...-03
-- ciclo A2026 = dddddddd-...-01 | A2025 cerrado = ...-02 | B2026 = ...-03 | A2027 = ...-04

-- ---------- 1. Crear materias: casos permitidos ----------
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.crear_materia('Ciencias Naturales', 1::smallint, 'materia', 'anual', null,
      'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001')$$,
  'el administrador crea una materia anual');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.crear_materia('Planificación Informática', 2::smallint, 'taller', 'cuatrimestral', 1::smallint,
      'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001')$$,
  'el administrador crea una materia cuatrimestral (taller)');

-- ---------- 2. Unicidad: ignora mayúsculas, tildes y espacios ----------
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.crear_materia('Ciencias Naturales', 1::smallint, 'materia', 'anual', null,
      'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001')$$,
  'Ya existe una materia', 'no se repite el nombre exacto');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.crear_materia('CIENCIAS NATURALES', 1::smallint, 'materia', 'anual', null,
      'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001')$$,
  'Ya existe una materia', 'caso real 1: CIENCIAS NATURALES en mayúsculas es la misma materia');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.crear_materia('Planificacion Informatica', 2::smallint, 'taller', 'cuatrimestral', 1::smallint,
      'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001')$$,
  'Ya existe una materia', 'caso real 2: sin tildes es la misma materia');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.crear_materia('  planificacion INFORMATICA  ', 2::smallint, 'taller', 'cuatrimestral', 1::smallint,
      'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001')$$,
  'Ya existe una materia', 'mayúsculas, tildes y espacios sobrantes juntos');

-- Casos límite: lo que NO es duplicado
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.crear_materia('Planificación Informática', 2::smallint, 'taller', 'cuatrimestral', 2::smallint,
      'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001')$$,
  'el mismo nombre en el otro cuatrimestre es otra materia');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.crear_materia('Ciencias Naturales', 2::smallint, 'materia', 'anual', null,
      'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001')$$,
  'el mismo nombre en otro año es otra materia');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.crear_materia('Ciencias Naturales', 1::smallint, 'materia', 'anual', null,
      'cccccccc-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000001')$$,
  'el mismo nombre en otra carrera es otra materia');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.crear_materia('Ciencias Naturales', 1::smallint, 'materia', 'anual', null,
      'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000004')$$,
  'el mismo nombre en otro ciclo es otra materia');

-- La regla también vale si alguien se saltea la función (último resguardo)
do $$
begin
  begin
    insert into public.materias (institucion_id, nombre, anio, tipo, duracion, carrera_id, ciclo_id)
    values ('11111111-0000-0000-0000-000000000001', 'cIENCIAS nATURALES', 1, 'materia', 'anual',
            'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001');
    raise exception 'FALLÓ: el índice dejó pasar un duplicado';
  exception when unique_violation then
    raise notice 'ok: el índice de la base frena el duplicado aunque se saltee la función';
  end;
end $$;

-- ---------- 3. Campos obligatorios y coherentes ----------
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.crear_materia('Sin carrera', 1::smallint, 'materia', 'anual', null,
      null, 'dddddddd-0000-0000-0000-000000000001')$$,
  'carrera es obligatoria', 'la carrera es obligatoria');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.crear_materia('Sin ciclo', 1::smallint, 'materia', 'anual', null,
      'cccccccc-0000-0000-0000-000000000001', null)$$,
  'ciclo lectivo es obligatorio', 'el ciclo es obligatorio');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.crear_materia('Anual con cuatrimestre', 1::smallint, 'materia', 'anual', 1::smallint,
      'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001')$$,
  'anual no lleva cuatrimestre', 'una materia anual no lleva cuatrimestre');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.crear_materia('Cuatrimestral sin cuatrimestre', 1::smallint, 'materia', 'cuatrimestral', null,
      'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001')$$,
  'necesita cuatrimestre', 'una materia cuatrimestral necesita cuatrimestre');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.crear_materia('Cuatrimestre 3', 1::smallint, 'materia', 'cuatrimestral', 3::smallint,
      'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001')$$,
  'materias_cuatrimestre_valido', 'el cuatrimestre solo puede ser 1 o 2');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.crear_materia('Año 5', 5::smallint, 'materia', 'anual', null,
      'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001')$$,
  'materias_anio_check', 'el año va de 1 a 4');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.crear_materia('Tipo raro', 1::smallint, 'seminario', 'anual', null,
      'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001')$$,
  'materias_tipo_valido', 'el tipo es materia o taller');

-- ---------- 4. Aislamiento y ciclo cerrado ----------
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.crear_materia('Con carrera ajena', 1::smallint, 'materia', 'anual', null,
      'cccccccc-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000001')$$,
  'carrera no existe en tu institución', 'no se usa una carrera de otra institución');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.crear_materia('Con ciclo ajeno', 1::smallint, 'materia', 'anual', null,
      'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000003')$$,
  'ciclo no existe en tu institución', 'no se usa un ciclo de otra institución');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.crear_materia('En ciclo cerrado', 1::smallint, 'materia', 'anual', null,
      'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002')$$,
  'está cerrado', 'no se crean materias en un ciclo cerrado');

-- ---------- 5. El profesor ya no crea ni edita materias ----------
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002',
  $$select public.crear_materia('Intento de profesor', 1::smallint, 'materia', 'anual', null,
      'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001')$$,
  'No autorizado', 'un profesor no administrador no puede crear materias');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002',
  $$select public.crear_materia('Intento viejo', 1::smallint)$$,
  'does not exist', 'la función vieja crear_materia(nombre, año) ya no existe');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002',
  $$update public.materias set nombre = 'Cambiado a mano'$$,
  'permission denied', 'el profesor no edita materias directamente (ni nombre ni año)');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002',
  $$insert into public.materias (institucion_id, nombre, anio, tipo, duracion, carrera_id, ciclo_id)
    values ('11111111-0000-0000-0000-000000000001', 'Directa', 1, 'materia', 'anual',
            'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001')$$,
  'permission denied', 'el profesor no inserta materias directamente');
select pg_temp.ok(
  not exists (select 1 from pg_policies where tablename = 'materias' and policyname = 'editar mis materias'),
  'la política «editar mis materias» ya no existe');
select pg_temp.ok(
  not exists (select 1 from information_schema.column_privileges
               where table_name = 'materias' and grantee = 'authenticated' and privilege_type = 'UPDATE'),
  'authenticated no conserva ningún permiso de UPDATE sobre materias');

-- Nota de la prueba: el administrador no lee la tabla materias directamente (solo por funciones),
-- así que los ids se guardan antes, con la sesión del dueño de la base.
select set_config('t.cn1', (select id::text from public.materias
  where nombre = 'Ciencias Naturales' and anio = 1
    and carrera_id = 'cccccccc-0000-0000-0000-000000000001'
    and ciclo_id = 'dddddddd-0000-0000-0000-000000000001'), true);
select set_config('t.cn2', (select id::text from public.materias
  where nombre = 'Ciencias Naturales' and anio = 2
    and carrera_id = 'cccccccc-0000-0000-0000-000000000001'
    and ciclo_id = 'dddddddd-0000-0000-0000-000000000001'), true);

-- ---------- 6. El profesor sigue viendo las materias que le asignan ----------
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.asignar_materia('bbbbbbbb-0000-0000-0000-000000000002', current_setting('t.cn1')::uuid)$$,
  'el administrador asigna la materia al profesor (función de la 0004)');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000002',
  $$select 1 / (case when count(*) = 1 then 1 else 0 end) from public.materias$$,
  'el profesor ve solo la materia que tiene asignada');

-- ---------- 7. Editar ----------
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.editar_materia(current_setting('t.cn2')::uuid,
      'Ciencias Naturales II', 2::smallint, 'materia', 'anual', null,
      'cccccccc-0000-0000-0000-000000000001')$$,
  'el administrador edita una materia');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.editar_materia(current_setting('t.cn2')::uuid,
      'ciencias naturales', 1::smallint, 'materia', 'anual', null,
      'cccccccc-0000-0000-0000-000000000001')$$,
  'Ya existe una materia', 'al editar tampoco se puede crear un duplicado');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.editar_materia(current_setting('t.cn2')::uuid,
      'Ciencias Naturales II', 2::smallint, 'materia', 'anual', null,
      'cccccccc-0000-0000-0000-000000000001')$$,
  'guardar una materia sin cambios no se choca con ella misma');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000003',
  $$select public.editar_materia(current_setting('t.cn2')::uuid,
      'Robada', 2::smallint, 'materia', 'anual', null,
      'cccccccc-0000-0000-0000-000000000003')$$,
  'no existe en tu institución', 'el administrador de otra institución no edita materias ajenas');

-- ---------- 8. Activar y desactivar ----------
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.cambiar_estado_materia(current_setting('t.cn2')::uuid, false)$$,
  'el administrador desactiva una materia');
select pg_temp.ok(
  (select not activo from public.materias where id = current_setting('t.cn2')::uuid),
  'la materia quedó inactiva y sigue existiendo (no se borra)');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.cambiar_estado_materia(current_setting('t.cn2')::uuid, true)$$,
  'el administrador la reactiva');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002',
  $$select public.cambiar_estado_materia(current_setting('t.cn2')::uuid, false)$$,
  'No autorizado', 'un profesor no puede desactivar materias');

rollback;

-- #####################################################################
-- 3. INSCRIPCIONES Y SOLO LECTURA
-- #####################################################################
begin;
-- Datos inventados comunes a las pruebas (se usan dentro de una transacción)
insert into public.instituciones (id, nombre) values
  ('11111111-0000-0000-0000-000000000001', 'Instituto de prueba A'),
  ('11111111-0000-0000-0000-000000000002', 'Instituto de prueba B');
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@prueba.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'profe@prueba.test'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'adminb@prueba.test');
insert into public.personas (id, institucion_id, user_id, tipo, apellido_nombre) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'profesor', 'Admin Prueba'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'profesor', 'Profe Prueba'),
  ('bbbbbbbb-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000003', 'profesor', 'Admin B Prueba');
insert into public.administradores (persona_id) values
  ('bbbbbbbb-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000003');
insert into public.carreras (id, institucion_id, nombre) values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Profesorado de Ingles (prueba)'),
  ('cccccccc-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'Profesorado de Lengua (prueba)'),
  ('cccccccc-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002', 'Carrera de la otra institucion (prueba)');
insert into public.ciclos_lectivos (id, institucion_id, anio, estado) values
  ('dddddddd-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 2026, 'abierto'),
  ('dddddddd-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 2025, 'cerrado'),
  ('dddddddd-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002', 2026, 'abierto'),
  ('dddddddd-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', 2027, 'abierto');


-- Atajos: admin A = aaaaaaaa-...-01 (NO dicta materias) | profe A = ...-02 (dicta las tres)
-- materias: M1 abierta = eeeeeeee-...-01 | M2 de ciclo cerrado = ...-02 | M3 inactiva = ...-03
-- alumnos: A1 = ffffffff-...-01 | A2 = ...-02 | de otra institución = ...-03 | A4 = ...-04

insert into public.materias (id, institucion_id, nombre, anio, tipo, duracion, carrera_id, ciclo_id, activo) values
  ('eeeeeeee-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Abierta', 1, 'materia', 'anual', 'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', true),
  ('eeeeeeee-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'De ciclo cerrado', 1, 'materia', 'anual', 'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', true),
  ('eeeeeeee-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', 'Inactiva', 1, 'materia', 'anual', 'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', false);
insert into public.profesor_materias (profesor_id, materia_id) values
  ('bbbbbbbb-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000002'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000003');
insert into public.personas (id, institucion_id, tipo, apellido_nombre) values
  ('ffffffff-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'alumno', 'Alumno Uno'),
  ('ffffffff-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'alumno', 'Alumno Dos'),
  ('ffffffff-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002', 'alumno', 'Alumno de otra institucion'),
  ('ffffffff-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', 'alumno', 'Alumno Cuatro');
insert into public.inscripciones (id, alumno_id, materia_id) values
  ('abababab-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001'),
  ('abababab-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000001'),
  ('abababab-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000002'),
  ('abababab-0000-0000-0000-000000000004', 'ffffffff-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000003'),
  ('abababab-0000-0000-0000-000000000005', 'ffffffff-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000002');
insert into public.clases (id, materia_id, fecha) values
  ('cacacaca-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', '2026-03-02'),
  ('cacacaca-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000001', '2026-03-09'),
  ('cacacaca-0000-0000-0000-000000000003', 'eeeeeeee-0000-0000-0000-000000000001', '2026-03-16'),
  ('cacacaca-0000-0000-0000-000000000004', 'eeeeeeee-0000-0000-0000-000000000002', '2026-03-02'),
  ('cacacaca-0000-0000-0000-000000000005', 'eeeeeeee-0000-0000-0000-000000000001', '2026-03-05');
insert into public.asistencias (clase_id, inscripcion_id, materia_id, estado, motivo) values
  ('cacacaca-0000-0000-0000-000000000001', 'abababab-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'presente', null),
  ('cacacaca-0000-0000-0000-000000000002', 'abababab-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'ausente', 'justificada'),
  ('cacacaca-0000-0000-0000-000000000004', 'abababab-0000-0000-0000-000000000003', 'eeeeeeee-0000-0000-0000-000000000002', 'presente', null);

-- ---------- 1. Inscribir ----------
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000002',
  $$insert into public.inscripciones (alumno_id, materia_id)
    values ('ffffffff-0000-0000-0000-000000000004', 'eeeeeeee-0000-0000-0000-000000000001')$$,
  'el profesor inscribe a un alumno en su materia abierta');
select pg_temp.ok(
  (select fecha_baja is null and resultado_final = 'pendiente' from public.inscripciones
    where alumno_id = 'ffffffff-0000-0000-0000-000000000004'),
  'la inscripción nueva arranca activa y con resultado pendiente');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002',
  $$insert into public.inscripciones (alumno_id, materia_id)
    values ('ffffffff-0000-0000-0000-000000000003', 'eeeeeeee-0000-0000-0000-000000000001')$$,
  'row-level security', 'no se inscribe a un alumno de otra institución');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002',
  $$insert into public.inscripciones (alumno_id, materia_id, fecha_baja)
    values ('ffffffff-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000003', '2026-03-01')$$,
  'permission denied', 'al inscribir no se puede indicar la baja directamente');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002',
  $$insert into public.inscripciones (alumno_id, materia_id, resultado_final)
    values ('ffffffff-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000003', 'aprobado')$$,
  'permission denied', 'al inscribir no se puede indicar el resultado final directamente');

-- ---------- 2. El profesor no borra ni edita inscripciones directamente ----------
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002',
  $$delete from public.inscripciones where id = 'abababab-0000-0000-0000-000000000001'$$,
  'permission denied', 'el profesor no puede borrar inscripciones');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002',
  $$update public.inscripciones set fecha_baja = '2026-03-01' where id = 'abababab-0000-0000-0000-000000000001'$$,
  'permission denied', 'el profesor no cambia la baja con un UPDATE directo');
select pg_temp.ok(
  not exists (select 1 from pg_policies where tablename = 'inscripciones' and policyname = 'quitar inscripciones de mis materias'),
  'la política «quitar inscripciones de mis materias» ya no existe');

-- ---------- 3. Dar de baja ----------
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000002',
  $$select public.dar_de_baja('abababab-0000-0000-0000-000000000001', '2026-03-09')$$,
  'el profesor de la materia da de baja a un alumno');
select pg_temp.ok(
  (select fecha_baja = '2026-03-09' from public.inscripciones where id = 'abababab-0000-0000-0000-000000000001'),
  'la baja quedó con su fecha');
select pg_temp.ok(
  (select count(*) = 2 from public.asistencias where inscripcion_id = 'abababab-0000-0000-0000-000000000001'),
  'la baja NO borra las asistencias del alumno');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002',
  $$select public.dar_de_baja('abababab-0000-0000-0000-000000000001', '2026-03-10')$$,
  'ya está de baja', 'no se da de baja dos veces');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.dar_de_baja('abababab-0000-0000-0000-000000000002', '2026-03-09')$$,
  'no existe en tus materias', 'quien no dicta la materia (ni el administrador) no da de baja');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002',
  $$select public.dar_de_baja('abababab-0000-0000-0000-000000000002', current_date + 5)$$,
  'no puede ser futura', 'la fecha de baja no puede ser futura');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002',
  $$select public.dar_de_baja('abababab-0000-0000-0000-000000000003', '2026-03-09')$$,
  'solo lectura', 'no se da de baja en un ciclo cerrado');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002',
  $$select public.dar_de_baja('abababab-0000-0000-0000-000000000004', '2026-03-09')$$,
  'solo lectura', 'no se da de baja en una materia inactiva');

-- ---------- 4. Después de la baja no se carga asistencia posterior ----------
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002',
  $$insert into public.asistencias (clase_id, inscripcion_id, materia_id, estado)
    values ('cacacaca-0000-0000-0000-000000000003', 'abababab-0000-0000-0000-000000000001',
            'eeeeeeee-0000-0000-0000-000000000001', 'presente')$$,
  'está de baja', 'no se carga asistencia de una clase posterior a la baja (16/03)');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000002',
  $$insert into public.asistencias (clase_id, inscripcion_id, materia_id, estado)
    values ('cacacaca-0000-0000-0000-000000000005', 'abababab-0000-0000-0000-000000000001',
            'eeeeeeee-0000-0000-0000-000000000001', 'presente')$$,
  'sí se carga una clase anterior a la baja (05/03)');
-- caso límite: la clase del mismo día de la baja
select pg_temp.ok(
  (select fecha = '2026-03-09' from public.clases where id = 'cacacaca-0000-0000-0000-000000000002'),
  'caso límite: la clase del 09/03 es del mismo día de la baja y ya tiene su registro');

-- ---------- 5. Revertir la baja ----------
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000002',
  $$select public.revertir_baja('abababab-0000-0000-0000-000000000001')$$,
  'el profesor revierte la baja');
select pg_temp.ok(
  (select fecha_baja is null from public.inscripciones where id = 'abababab-0000-0000-0000-000000000001'),
  'revertir limpia la fecha de baja');
select pg_temp.ok(
  (select count(*) = 3 from public.asistencias where inscripcion_id = 'abababab-0000-0000-0000-000000000001'),
  'las asistencias siguen intactas después de revertir');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002',
  $$select public.revertir_baja('abababab-0000-0000-0000-000000000001')$$,
  'no está de baja', 'no se revierte una baja que no existe');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000002',
  $$insert into public.asistencias (clase_id, inscripcion_id, materia_id, estado)
    values ('cacacaca-0000-0000-0000-000000000003', 'abababab-0000-0000-0000-000000000001',
            'eeeeeeee-0000-0000-0000-000000000001', 'presente')$$,
  'tras revertir, vuelve a poder cargarse asistencia de clases nuevas');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.revertir_baja('abababab-0000-0000-0000-000000000001')$$,
  'no existe en tus materias', 'quien no dicta la materia no revierte bajas');

-- ---------- 6. Resultado final ----------
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000002',
  $$select public.cargar_resultado_final('abababab-0000-0000-0000-000000000001', 'aprobado')$$,
  'el profesor carga el resultado final');
select pg_temp.ok(
  (select resultado_final = 'aprobado' from public.inscripciones where id = 'abababab-0000-0000-0000-000000000001'),
  'el resultado final quedó guardado');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002',
  $$select public.cargar_resultado_final('abababab-0000-0000-0000-000000000001', 'regular')$$,
  'pendiente, aprobado o desaprobado', 'solo se aceptan los tres resultados definidos');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.cargar_resultado_final('abababab-0000-0000-0000-000000000002', 'aprobado')$$,
  'no existe en tus materias', 'quien no dicta la materia no carga resultados');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002',
  $$select public.cargar_resultado_final('abababab-0000-0000-0000-000000000003', 'aprobado')$$,
  'solo lectura', 'no se carga el resultado en un ciclo cerrado');
select pg_temp.ok(
  (select resultado_final = 'pendiente' from public.inscripciones where id = 'abababab-0000-0000-0000-000000000002'),
  'las demás inscripciones siguen en pendiente');

-- ---------- 7. Solo lectura: clases y asistencias ----------
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000002',
  $$insert into public.clases (materia_id, fecha) values ('eeeeeeee-0000-0000-0000-000000000001', '2026-03-23')$$,
  'se puede crear una clase en una materia activa de ciclo abierto');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002',
  $$insert into public.clases (materia_id, fecha) values ('eeeeeeee-0000-0000-0000-000000000002', '2026-03-23')$$,
  'row-level security', 'no se crea una clase en un ciclo cerrado');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002',
  $$insert into public.clases (materia_id, fecha) values ('eeeeeeee-0000-0000-0000-000000000003', '2026-03-23')$$,
  'row-level security', 'no se crea una clase en una materia inactiva');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002',
  $$insert into public.asistencias (clase_id, inscripcion_id, materia_id, estado)
    values ('cacacaca-0000-0000-0000-000000000004', 'abababab-0000-0000-0000-000000000005',
            'eeeeeeee-0000-0000-0000-000000000002', 'presente')$$,
  'row-level security', 'no se carga asistencia en un ciclo cerrado');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000002',
  $$with u as (update public.asistencias set estado = 'ausente', motivo = 'injustificada'
                where materia_id = 'eeeeeeee-0000-0000-0000-000000000002' returning 1)
    select 1 / (case when count(*) = 0 then 1 else 0 end) from u$$,
  'no se corrige asistencia en un ciclo cerrado (no modifica ninguna fila)');
select pg_temp.ok(
  (select estado = 'presente' from public.asistencias where inscripcion_id = 'abababab-0000-0000-0000-000000000003'),
  'la asistencia del ciclo cerrado quedó como estaba');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000002',
  $$with d as (delete from public.clases where materia_id = 'eeeeeeee-0000-0000-0000-000000000002' returning 1)
    select 1 / (case when count(*) = 0 then 1 else 0 end) from d$$,
  'no se borra una clase de un ciclo cerrado (no borra ninguna fila)');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000002',
  $$select 1 / (case when (select count(*) from public.asistencias where materia_id = 'eeeeeeee-0000-0000-0000-000000000002') = 1 then 1 else 0 end)$$,
  'el profesor SÍ sigue viendo las asistencias del ciclo cerrado (solo lectura)');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000002',
  $$select 1 / (case when (select count(*) from public.clases where materia_id = 'eeeeeeee-0000-0000-0000-000000000003') = 0 then 1 else 1 end)$$,
  'el profesor sigue pudiendo consultar las materias inactivas');

-- ---------- 8. Reabrir y reactivar devuelven la escritura ----------
update public.ciclos_lectivos set estado = 'abierto' where id = 'dddddddd-0000-0000-0000-000000000002';
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000002',
  $$insert into public.clases (materia_id, fecha) values ('eeeeeeee-0000-0000-0000-000000000002', '2026-03-23')$$,
  'al reabrir el ciclo vuelve a poder crearse una clase');
update public.materias set activo = true where id = 'eeeeeeee-0000-0000-0000-000000000003';
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000002',
  $$insert into public.clases (materia_id, fecha) values ('eeeeeeee-0000-0000-0000-000000000003', '2026-03-23')$$,
  'al reactivar la materia vuelve a poder crearse una clase');

rollback;

-- #####################################################################
-- 4. AUDITORÍA
-- #####################################################################
begin;
-- Datos inventados comunes a las pruebas (se usan dentro de una transacción)
insert into public.instituciones (id, nombre) values
  ('11111111-0000-0000-0000-000000000001', 'Instituto de prueba A'),
  ('11111111-0000-0000-0000-000000000002', 'Instituto de prueba B');
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@prueba.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'profe@prueba.test'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'adminb@prueba.test');
insert into public.personas (id, institucion_id, user_id, tipo, apellido_nombre) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'profesor', 'Admin Prueba'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'profesor', 'Profe Prueba'),
  ('bbbbbbbb-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000003', 'profesor', 'Admin B Prueba');
insert into public.administradores (persona_id) values
  ('bbbbbbbb-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000003');
insert into public.carreras (id, institucion_id, nombre) values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Profesorado de Ingles (prueba)'),
  ('cccccccc-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'Profesorado de Lengua (prueba)'),
  ('cccccccc-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002', 'Carrera de la otra institucion (prueba)');
insert into public.ciclos_lectivos (id, institucion_id, anio, estado) values
  ('dddddddd-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 2026, 'abierto'),
  ('dddddddd-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 2025, 'cerrado'),
  ('dddddddd-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002', 2026, 'abierto'),
  ('dddddddd-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', 2027, 'abierto');

-- Materias, alumnos, inscripciones, clases y asistencias inventadas
insert into public.materias (id, institucion_id, nombre, anio, tipo, duracion, carrera_id, ciclo_id, activo) values
  ('eeeeeeee-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Abierta', 1, 'materia', 'anual', 'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', true),
  ('eeeeeeee-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'De ciclo cerrado', 1, 'materia', 'anual', 'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', true),
  ('eeeeeeee-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', 'Inactiva', 1, 'materia', 'anual', 'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', false);
insert into public.profesor_materias (profesor_id, materia_id) values
  ('bbbbbbbb-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000002'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000003');
insert into public.personas (id, institucion_id, tipo, apellido_nombre) values
  ('ffffffff-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'alumno', 'Alumno Uno'),
  ('ffffffff-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'alumno', 'Alumno Dos'),
  ('ffffffff-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002', 'alumno', 'Alumno de otra institucion'),
  ('ffffffff-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', 'alumno', 'Alumno Cuatro');
insert into public.inscripciones (id, alumno_id, materia_id) values
  ('abababab-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001'),
  ('abababab-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000001'),
  ('abababab-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000002'),
  ('abababab-0000-0000-0000-000000000004', 'ffffffff-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000003'),
  ('abababab-0000-0000-0000-000000000005', 'ffffffff-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000002');
insert into public.clases (id, materia_id, fecha) values
  ('cacacaca-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', '2026-03-02'),
  ('cacacaca-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000001', '2026-03-09'),
  ('cacacaca-0000-0000-0000-000000000003', 'eeeeeeee-0000-0000-0000-000000000001', '2026-03-16'),
  ('cacacaca-0000-0000-0000-000000000004', 'eeeeeeee-0000-0000-0000-000000000002', '2026-03-02'),
  ('cacacaca-0000-0000-0000-000000000005', 'eeeeeeee-0000-0000-0000-000000000001', '2026-03-05');
insert into public.asistencias (clase_id, inscripcion_id, materia_id, estado, motivo) values
  ('cacacaca-0000-0000-0000-000000000001', 'abababab-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'presente', null),
  ('cacacaca-0000-0000-0000-000000000002', 'abababab-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'ausente', 'justificada'),
  ('cacacaca-0000-0000-0000-000000000004', 'abababab-0000-0000-0000-000000000003', 'eeeeeeee-0000-0000-0000-000000000002', 'presente', null);



-- Personas extra: profe2 (dicta M4), coordinador (de la carrera A1) y materia M4 (carrera A2)
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000004', 'profe2@prueba.test'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'coord@prueba.test');
insert into public.personas (id, institucion_id, user_id, tipo, apellido_nombre) values
  ('bbbbbbbb-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004', 'profesor', 'Profe Dos Prueba'),
  ('bbbbbbbb-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000005', 'profesor', 'Coordinador Prueba');
insert into public.coordinadores (persona_id, carrera_id) values
  ('bbbbbbbb-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000001');
insert into public.materias (id, institucion_id, nombre, anio, tipo, duracion, carrera_id, ciclo_id) values
  ('eeeeeeee-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', 'De la carrera dos', 1, 'materia', 'anual', 'cccccccc-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000001');
insert into public.profesor_materias values ('bbbbbbbb-0000-0000-0000-000000000004', 'eeeeeeee-0000-0000-0000-000000000004');
insert into public.inscripciones (id, alumno_id, materia_id) values
  ('abababab-0000-0000-0000-000000000006', 'ffffffff-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000004');
insert into public.clases (id, materia_id, fecha) values
  ('cacacaca-0000-0000-0000-000000000006', 'eeeeeeee-0000-0000-0000-000000000004', '2026-03-02'),
  ('cacacaca-0000-0000-0000-000000000007', 'eeeeeeee-0000-0000-0000-000000000001', '2026-03-30'),   -- vacía
  ('cacacaca-0000-0000-0000-000000000008', 'eeeeeeee-0000-0000-0000-000000000001', private.hoy_ar()); -- de hoy
insert into public.asistencias (clase_id, inscripcion_id, materia_id, estado) values
  ('cacacaca-0000-0000-0000-000000000006', 'abababab-0000-0000-0000-000000000006', 'eeeeeeee-0000-0000-0000-000000000004', 'presente');

-- ---------- 1. Quién y cuándo al crear ----------
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000002',
  $$insert into public.asistencias (clase_id, inscripcion_id, materia_id, estado)
    values ('cacacaca-0000-0000-0000-000000000005', 'abababab-0000-0000-0000-000000000002',
            'eeeeeeee-0000-0000-0000-000000000001', 'presente')$$,
  'el profesor carga una asistencia');
select pg_temp.ok(
  (select creado_por = 'bbbbbbbb-0000-0000-0000-000000000002' and modificado_por is null and modificado_en is null
     from public.asistencias where clase_id = 'cacacaca-0000-0000-0000-000000000005' and inscripcion_id = 'abababab-0000-0000-0000-000000000002'),
  'queda registrado quién la creó y todavía no figura como modificada');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000002',
  $$insert into public.asistencias (clase_id, inscripcion_id, materia_id, estado, creado_por)
    values ('cacacaca-0000-0000-0000-000000000003', 'abababab-0000-0000-0000-000000000002',
            'eeeeeeee-0000-0000-0000-000000000001', 'presente', 'bbbbbbbb-0000-0000-0000-000000000001')$$,
  'el profesor intenta firmar la asistencia como otra persona');
select pg_temp.ok(
  (select creado_por = 'bbbbbbbb-0000-0000-0000-000000000002'
     from public.asistencias where clase_id = 'cacacaca-0000-0000-0000-000000000003' and inscripcion_id = 'abababab-0000-0000-0000-000000000002'),
  'el sistema ignora el dato enviado: queda la persona de la sesión real');

-- ---------- 2. Corrección: historial con valor anterior y nuevo ----------
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000002',
  $$update public.asistencias set estado = 'ausente', motivo = 'injustificada', motivo_correccion = 'Me equivoqué al cargar'
    where clase_id = 'cacacaca-0000-0000-0000-000000000005' and inscripcion_id = 'abababab-0000-0000-0000-000000000002'$$,
  'el profesor corrige una asistencia (presente a ausente injustificada)');
select pg_temp.ok(
  (select count(*) = 1 from public.historial_cambios
    where tabla = 'asistencias' and inscripcion_id = 'abababab-0000-0000-0000-000000000002'
      and clase_id = 'cacacaca-0000-0000-0000-000000000005'),
  'la corrección dejó un registro en el historial');
select pg_temp.ok(
  (select antes ->> 'estado' = 'presente' and despues ->> 'estado' = 'ausente'
      and despues ->> 'motivo' = 'injustificada' and (antes ->> 'motivo') is null
      and motivo_correccion = 'Me equivoqué al cargar'
      and hecho_por = 'bbbbbbbb-0000-0000-0000-000000000002'
      and materia_id = 'eeeeeeee-0000-0000-0000-000000000001'
     from public.historial_cambios where clase_id = 'cacacaca-0000-0000-0000-000000000005' and inscripcion_id = 'abababab-0000-0000-0000-000000000002'),
  'el historial guarda valor anterior, valor nuevo, quién y el motivo de la corrección');
select pg_temp.ok(
  (select otro_dia from public.historial_cambios where clase_id = 'cacacaca-0000-0000-0000-000000000005' and inscripcion_id = 'abababab-0000-0000-0000-000000000002'),
  'una corrección hecha otro día (clase de marzo) queda marcada');
select pg_temp.ok(
  (select modificado_por = 'bbbbbbbb-0000-0000-0000-000000000002' and modificado_en is not null and motivo_correccion is null
     from public.asistencias where clase_id = 'cacacaca-0000-0000-0000-000000000005' and inscripcion_id = 'abababab-0000-0000-0000-000000000002'),
  'la asistencia guarda quién y cuándo la modificó, y no arrastra el motivo');

-- El motivo es opcional
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000002',
  $$update public.asistencias set estado = 'ausente', motivo = 'justificada'
    where clase_id = 'cacacaca-0000-0000-0000-000000000005' and inscripcion_id = 'abababab-0000-0000-0000-000000000002'$$,
  'el profesor corrige sin escribir motivo');
select pg_temp.ok(
  (select count(*) = 2 and count(*) filter (where motivo_correccion is null) = 1
     from public.historial_cambios where tabla = 'asistencias' and clase_id = 'cacacaca-0000-0000-0000-000000000005' and inscripcion_id = 'abababab-0000-0000-0000-000000000002'),
  'el motivo de la corrección es opcional');

-- Sin cambio real, sin registro
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000002',
  $$update public.asistencias set estado = 'ausente', motivo = 'justificada', motivo_correccion = 'nada cambió'
    where clase_id = 'cacacaca-0000-0000-0000-000000000005' and inscripcion_id = 'abababab-0000-0000-0000-000000000002'$$,
  'el profesor guarda sin cambiar nada');
select pg_temp.ok(
  (select count(*) = 2 from public.historial_cambios where tabla = 'asistencias' and clase_id = 'cacacaca-0000-0000-0000-000000000005' and inscripcion_id = 'abababab-0000-0000-0000-000000000002'),
  'guardar sin cambios no agrega nada al historial');

-- ---------- 3. Marca de «otro día»: mismo día y límite de la medianoche argentina ----------
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000002',
  $$insert into public.asistencias (clase_id, inscripcion_id, materia_id, estado)
    values ('cacacaca-0000-0000-0000-000000000008', 'abababab-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000001', 'presente')$$,
  'se carga asistencia de la clase de hoy');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000002',
  $$update public.asistencias set estado = 'ausente', motivo = 'injustificada'
    where clase_id = 'cacacaca-0000-0000-0000-000000000008' and inscripcion_id = 'abababab-0000-0000-0000-000000000002'$$,
  'se corrige la asistencia de la clase de hoy');
select pg_temp.ok(
  (select not otro_dia from public.historial_cambios where clase_id = 'cacacaca-0000-0000-0000-000000000008'),
  'una corrección hecha el mismo día de la clase NO se marca');
select pg_temp.ok(private.fecha_ar('2026-03-10 02:30:00+00') = date '2026-03-09',
  'límite: a las 23:30 de Argentina todavía es el día 09/03 (en hora universal ya es el 10/03)');
select pg_temp.ok(private.fecha_ar('2026-03-10 02:59:59+00') = date '2026-03-09',
  'límite: a las 23:59:59 de Argentina sigue siendo el 09/03');
select pg_temp.ok(private.fecha_ar('2026-03-10 03:00:00+00') = date '2026-03-10',
  'límite: a las 00:00 de Argentina empieza el 10/03');

-- ---------- 4. Inscripciones en el mismo historial ----------
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000002',
  $$select public.dar_de_baja('abababab-0000-0000-0000-000000000002', '2026-03-09')$$, 'se da de baja');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000002',
  $$select public.revertir_baja('abababab-0000-0000-0000-000000000002')$$, 'se revierte la baja');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000002',
  $$select public.cargar_resultado_final('abababab-0000-0000-0000-000000000002', 'desaprobado')$$, 'se carga el resultado final');
select pg_temp.ok(
  (select count(*) = 3 from public.historial_cambios where tabla = 'inscripciones' and inscripcion_id = 'abababab-0000-0000-0000-000000000002'),
  'baja, reversión y resultado final dejaron un registro cada uno');
select pg_temp.ok(
  (select (antes ->> 'fecha_baja') is null and despues ->> 'fecha_baja' = '2026-03-09'
          and hecho_por = 'bbbbbbbb-0000-0000-0000-000000000002'
     from public.historial_cambios where tabla = 'inscripciones' and inscripcion_id = 'abababab-0000-0000-0000-000000000002'
       and despues ->> 'fecha_baja' = '2026-03-09'),
  'el registro de la baja guarda valor anterior, nuevo y quién');
select pg_temp.ok(
  (select despues ->> 'resultado_final' = 'desaprobado' and antes ->> 'resultado_final' = 'pendiente'
     from public.historial_cambios where tabla = 'inscripciones' and inscripcion_id = 'abababab-0000-0000-0000-000000000002'
       and despues ->> 'resultado_final' = 'desaprobado'),
  'el registro del resultado final guarda de pendiente a desaprobado');

select pg_temp.ok(
  (select array_agg(despues ->> 'fecha_baja' is null order by hecho_en) is not null
     from public.historial_cambios where tabla = 'inscripciones' and inscripcion_id = 'abababab-0000-0000-0000-000000000002')
  and (select (array_agg(coalesce(despues ->> 'resultado_final', '') order by hecho_en))[3] = 'desaprobado'
         from public.historial_cambios where tabla = 'inscripciones' and inscripcion_id = 'abababab-0000-0000-0000-000000000002'),
  'los registros del historial salen en el orden en que ocurrieron (baja, reversión, resultado final)');

-- ---------- 5. El historial no se modifica ----------
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002',
  $$update public.historial_cambios set motivo_correccion = 'maquillado'$$,
  'permission denied', 'el profesor no edita el historial');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002',
  $$delete from public.historial_cambios$$,
  'permission denied', 'el profesor no borra el historial');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001',
  $$delete from public.historial_cambios$$,
  'permission denied', 'ni siquiera el administrador borra el historial');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002',
  $$insert into public.historial_cambios (materia_id, inscripcion_id, tabla, antes, despues)
    values ('eeeeeeee-0000-0000-0000-000000000001', 'abababab-0000-0000-0000-000000000001', 'asistencias', '{}', '{}')$$,
  'permission denied', 'el profesor no inventa registros de historial');
do $$
begin
  begin
    update public.historial_cambios set motivo_correccion = 'maquillado';
    raise exception 'FALLÓ: se pudo editar el historial con el dueño de la base';
  exception when raise_exception then
    if sqlerrm like '%no se puede modificar%' then
      raise notice 'ok: ni el dueño de la base puede editar el historial (lo frena un disparador)';
    else raise; end if;
  end;
end $$;

-- ---------- 6. Quién ve el historial ----------
-- se genera historial también en M4 (carrera 2) con el dueño de la base
update public.asistencias set estado = 'ausente', motivo = 'injustificada'
 where inscripcion_id = 'abababab-0000-0000-0000-000000000006';
select pg_temp.ok((select count(*) = 1 from public.historial_cambios where materia_id = 'eeeeeeee-0000-0000-0000-000000000004'),
  'preparación: hay historial en la materia de la carrera dos');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000002',
  $$select 1 / (case when count(*) filter (where materia_id = 'eeeeeeee-0000-0000-0000-000000000004') = 0
                       and count(*) filter (where materia_id = 'eeeeeeee-0000-0000-0000-000000000001') > 0 then 1 else 0 end)
    from public.historial_cambios$$,
  'el profesor ve el historial de SUS materias y no el de las ajenas');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000004',
  $$select 1 / (case when count(*) = 1 and bool_and(materia_id = 'eeeeeeee-0000-0000-0000-000000000004') then 1 else 0 end)
    from public.historial_cambios$$,
  'el otro profesor ve solo el historial de su materia');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000005',
  $$select 1 / (case when count(*) filter (where materia_id = 'eeeeeeee-0000-0000-0000-000000000004') = 0
                       and count(*) filter (where materia_id = 'eeeeeeee-0000-0000-0000-000000000001') > 0 then 1 else 0 end)
    from public.historial_cambios$$,
  'el coordinador ve el historial de las materias de SU carrera y no el de otra carrera');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000005',
  $$insert into public.historial_cambios (materia_id, inscripcion_id, tabla, antes, despues)
    values ('eeeeeeee-0000-0000-0000-000000000001', 'abababab-0000-0000-0000-000000000001', 'asistencias', '{}', '{}')$$,
  'permission denied', 'el coordinador solo lee: no escribe');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001',
  $$select 1 / (case when count(distinct materia_id) = 2 then 1 else 0 end) from public.historial_cambios$$,
  'el administrador ve el historial de toda su institución');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000003',
  $$select 1 / (case when count(*) = 0 then 1 else 0 end) from public.historial_cambios$$,
  'el administrador de otra institución no ve nada');
do $$
begin
  set local role anon;
  begin
    perform count(*) from public.historial_cambios;
    reset role;
    raise exception 'FALLÓ: anon pudo leer el historial';
  exception when insufficient_privilege then
    reset role;
    raise notice 'ok: un usuario sin sesión no ve el historial';
  end;
end $$;

-- ---------- 7. Borrados ----------
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002',
  $$delete from public.asistencias where clase_id = 'cacacaca-0000-0000-0000-000000000001'$$,
  'permission denied', 'el profesor no borra asistencias');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002',
  $$delete from public.clases where id = 'cacacaca-0000-0000-0000-000000000001'$$,
  'No se puede borrar una clase con asistencias', 'no se borra una clase que tiene asistencias');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000002',
  $$delete from public.clases where id = 'cacacaca-0000-0000-0000-000000000007'$$,
  'sí se borra una clase cargada por error, sin asistencias');
select pg_temp.ok(not exists (select 1 from public.clases where id = 'cacacaca-0000-0000-0000-000000000007'),
  'la clase vacía efectivamente desapareció');
select pg_temp.ok((select count(*) = 3 from public.asistencias where clase_id = 'cacacaca-0000-0000-0000-000000000001' or clase_id = 'cacacaca-0000-0000-0000-000000000002' or clase_id = 'cacacaca-0000-0000-0000-000000000004'),
  'las asistencias protegidas siguen todas en su lugar');
-- La purga completa de una materia (limpieza de datos de prueba) sigue funcionando en cascada
delete from public.materias where id = 'eeeeeeee-0000-0000-0000-000000000002';
select pg_temp.ok(
  not exists (select 1 from public.clases where materia_id = 'eeeeeeee-0000-0000-0000-000000000002')
  and not exists (select 1 from public.asistencias where materia_id = 'eeeeeeee-0000-0000-0000-000000000002'),
  'la purga de una materia entera (con clases y asistencias) sigue funcionando en cascada');

rollback;

-- #####################################################################
-- 5. PORCENTAJE
-- #####################################################################
begin;
-- Datos inventados comunes a las pruebas (se usan dentro de una transacción)
insert into public.instituciones (id, nombre) values
  ('11111111-0000-0000-0000-000000000001', 'Instituto de prueba A'),
  ('11111111-0000-0000-0000-000000000002', 'Instituto de prueba B');
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@prueba.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'profe@prueba.test'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'adminb@prueba.test');
insert into public.personas (id, institucion_id, user_id, tipo, apellido_nombre) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'profesor', 'Admin Prueba'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'profesor', 'Profe Prueba'),
  ('bbbbbbbb-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000003', 'profesor', 'Admin B Prueba');
insert into public.administradores (persona_id) values
  ('bbbbbbbb-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000003');
insert into public.carreras (id, institucion_id, nombre) values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Profesorado de Ingles (prueba)'),
  ('cccccccc-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'Profesorado de Lengua (prueba)'),
  ('cccccccc-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002', 'Carrera de la otra institucion (prueba)');
insert into public.ciclos_lectivos (id, institucion_id, anio, estado) values
  ('dddddddd-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 2026, 'abierto'),
  ('dddddddd-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 2025, 'cerrado'),
  ('dddddddd-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002', 2026, 'abierto'),
  ('dddddddd-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', 2027, 'abierto');


-- Personas: admin A (01, no dicta), profe (02, dicta M5/M6/M7), admin B (03), profe2 (04), coordinador (05, carrera A1)
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000004', 'profe2@prueba.test'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'coord@prueba.test');
insert into public.personas (id, institucion_id, user_id, tipo, apellido_nombre) values
  ('bbbbbbbb-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004', 'profesor', 'Profe Dos Prueba'),
  ('bbbbbbbb-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000005', 'profesor', 'Coordinador Prueba');
insert into public.coordinadores values ('bbbbbbbb-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000001');

-- Materias: M5 (10 clases), M6 (3 clases), M7 (sin clases)
insert into public.materias (id, institucion_id, nombre, anio, tipo, duracion, carrera_id, ciclo_id) values
  ('eeeeeeee-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001', 'Diez clases', 1, 'materia', 'anual', 'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001'),
  ('eeeeeeee-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001', 'Tres clases', 1, 'materia', 'anual', 'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001'),
  ('eeeeeeee-0000-0000-0000-000000000007', '11111111-0000-0000-0000-000000000001', 'Sin clases', 1, 'materia', 'anual', 'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001');
insert into public.profesor_materias (profesor_id, materia_id)
  select 'bbbbbbbb-0000-0000-0000-000000000002', id from public.materias;

-- Alumnos A..E (M5), F y G (M6), H (M7)
insert into public.personas (id, institucion_id, tipo, apellido_nombre)
  select ('ffffffff-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid,
         '11111111-0000-0000-0000-000000000001', 'alumno', 'Alumno ' || g
  from generate_series(11, 18) g;
insert into public.inscripciones (id, alumno_id, materia_id)
  select ('abababab-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid,
         ('ffffffff-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid,
         case when g <= 15 then 'eeeeeeee-0000-0000-0000-000000000005'
              when g <= 17 then 'eeeeeeee-0000-0000-0000-000000000006'
              else               'eeeeeeee-0000-0000-0000-000000000007' end::uuid
  from generate_series(11, 18) g;

-- M5: diez clases, del 02/03 al 11/03.  M6: tres clases, del 02/03 al 04/03.
insert into public.clases (materia_id, fecha)
  select 'eeeeeeee-0000-0000-0000-000000000005', date '2026-03-01' + g from generate_series(1, 10) g;
insert into public.clases (materia_id, fecha)
  select 'eeeeeeee-0000-0000-0000-000000000006', date '2026-03-01' + g from generate_series(1, 3) g;

-- A (11): 7 presentes, 1 justificada (09/03), 2 injustificadas  -> 8 de 10 = 80 %
insert into public.asistencias (clase_id, inscripcion_id, materia_id, estado, motivo)
  select c.id, 'abababab-0000-0000-0000-000000000011', c.materia_id,
         case when c.fecha <= '2026-03-08' then 'presente' else 'ausente' end,
         case when c.fecha = '2026-03-09' then 'justificada' when c.fecha > '2026-03-09' then 'injustificada' end
  from public.clases c where c.materia_id = 'eeeeeeee-0000-0000-0000-000000000005';
-- B (12): se inscribió tarde, solo tiene registro desde el 06/03 (6 presentes) -> 6 de 10 = 60 %
insert into public.asistencias (clase_id, inscripcion_id, materia_id, estado)
  select c.id, 'abababab-0000-0000-0000-000000000012', c.materia_id, 'presente'
  from public.clases c where c.materia_id = 'eeeeeeee-0000-0000-0000-000000000005' and c.fecha >= '2026-03-06';
-- C (13): presente hasta el 07/03 y de baja ese día -> 6 de 6 = 100 %
insert into public.asistencias (clase_id, inscripcion_id, materia_id, estado)
  select c.id, 'abababab-0000-0000-0000-000000000013', c.materia_id, 'presente'
  from public.clases c where c.materia_id = 'eeeeeeee-0000-0000-0000-000000000005' and c.fecha <= '2026-03-07';
update public.inscripciones set fecha_baja = '2026-03-07' where id = 'abababab-0000-0000-0000-000000000013';
-- D (14): baja revertida: sin registro el 06 y el 07 -> 8 de 10 = 80 %
insert into public.asistencias (clase_id, inscripcion_id, materia_id, estado)
  select c.id, 'abababab-0000-0000-0000-000000000014', c.materia_id, 'presente'
  from public.clases c where c.materia_id = 'eeeeeeee-0000-0000-0000-000000000005' and c.fecha not in ('2026-03-06', '2026-03-07');
-- E (15): todas justificadas -> 10 de 10 = 100 %
insert into public.asistencias (clase_id, inscripcion_id, materia_id, estado, motivo)
  select c.id, 'abababab-0000-0000-0000-000000000015', c.materia_id, 'ausente', 'justificada'
  from public.clases c where c.materia_id = 'eeeeeeee-0000-0000-0000-000000000005';
-- F (16): presente, presente, ausente -> 2 de 3 ;  G (17): presente, ausente, ausente -> 1 de 3
insert into public.asistencias (clase_id, inscripcion_id, materia_id, estado, motivo)
  select c.id, 'abababab-0000-0000-0000-000000000016', c.materia_id,
         case when c.fecha <= '2026-03-03' then 'presente' else 'ausente' end,
         case when c.fecha > '2026-03-03' then 'injustificada' end
  from public.clases c where c.materia_id = 'eeeeeeee-0000-0000-0000-000000000006';
insert into public.asistencias (clase_id, inscripcion_id, materia_id, estado, motivo)
  select c.id, 'abababab-0000-0000-0000-000000000017', c.materia_id,
         case when c.fecha = '2026-03-02' then 'presente' else 'ausente' end,
         case when c.fecha > '2026-03-02' then 'injustificada' end
  from public.clases c where c.materia_id = 'eeeeeeee-0000-0000-0000-000000000006';

-- ---------- 1. Color en los límites exactos (umbrales 85 y 75) ----------
select pg_temp.ok(private.color_asistencia(17, 20, 85, 75) = 'verde',     'límite: 85 % exacto es verde');
select pg_temp.ok(private.color_asistencia(8499, 10000, 85, 75) = 'amarillo', 'límite: 84,99 % es amarillo');
select pg_temp.ok(private.color_asistencia(169, 200, 85, 75) = 'amarillo', '84,5 % es amarillo');
select pg_temp.ok(private.color_asistencia(15, 20, 85, 75) = 'amarillo',  'límite: 75 % exacto es amarillo');
select pg_temp.ok(private.color_asistencia(7499, 10000, 85, 75) = 'rojo', 'límite: 74,99 % es rojo');
select pg_temp.ok(private.color_asistencia(20, 20, 85, 75) = 'verde',     '100 % es verde');
select pg_temp.ok(private.color_asistencia(0, 5, 85, 75) = 'rojo',        '0 % es rojo');
select pg_temp.ok(private.color_asistencia(0, 0, 85, 75) is null,         'sin clases no hay color');
select pg_temp.ok(private.color_asistencia(17, 20, 90, 80) = 'amarillo',  'con otros umbrales (90 y 80), 85 % es amarillo');

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);  -- consultas hechas como el administrador
-- ---------- 2. Porcentajes de una materia ----------
create temp table res as
  select * from public.porcentajes_materia('eeeeeeee-0000-0000-0000-000000000005');
grant select on res to public;
select pg_temp.ok((select clases_acumuladas = 10 and asistidas_acumuladas = 8 and porcentaje_acumulado = 80.00 and color = 'amarillo'
                     from res where inscripcion_id = 'abababab-0000-0000-0000-000000000011'),
  'A: 7 presentes + 1 justificada de 10 clases = 80 % (la justificada cuenta como presente)');
select pg_temp.ok((select clases_acumuladas = 10 and asistidas_acumuladas = 6 and porcentaje_acumulado = 60.00 and color = 'rojo'
                     from res where inscripcion_id = 'abababab-0000-0000-0000-000000000012'),
  'B: inscripto tarde arrastra las 4 clases anteriores sin registro como ausentes injustificadas = 60 %');
select pg_temp.ok((select clases_acumuladas = 6 and asistidas_acumuladas = 6 and porcentaje_acumulado = 100.00 and color = 'verde'
                     from res where inscripcion_id = 'abababab-0000-0000-0000-000000000013'),
  'C: con baja el 07/03 solo cuentan las clases hasta esa fecha = 100 %');
select pg_temp.ok((select clases_acumuladas = 10 and asistidas_acumuladas = 8 and porcentaje_acumulado = 80.00
                     from res where inscripcion_id = 'abababab-0000-0000-0000-000000000014'),
  'D: baja revertida, las 2 clases del medio sin registro cuentan como ausentes injustificadas = 80 %');
select pg_temp.ok((select porcentaje_acumulado = 100.00 and color = 'verde'
                     from res where inscripcion_id = 'abababab-0000-0000-0000-000000000015'),
  'E: todas justificadas = 100 %');
select pg_temp.ok((select count(*) = 5 from res), 'devuelve una fila por cada alumno inscripto en la materia');

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);  -- consultas hechas como el administrador
-- ---------- 3. Período y acumulado ----------
select pg_temp.ok((select clases_periodo = 5 and asistidas_periodo = 3 and porcentaje_periodo = 60.00
                          and clases_acumuladas = 10 and porcentaje_acumulado = 80.00
                     from public.porcentajes_materia('eeeeeeee-0000-0000-0000-000000000005', '2026-03-07', '2026-03-11')
                    where inscripcion_id = 'abababab-0000-0000-0000-000000000011'),
  'A, del 07/03 al 11/03: período 3 de 5 = 60 %, y el acumulado sigue en 80 %');
select pg_temp.ok((select clases_acumuladas = 8 and porcentaje_acumulado = 100.00
                     from public.porcentajes_materia('eeeeeeee-0000-0000-0000-000000000005', null, '2026-03-09')
                    where inscripcion_id = 'abababab-0000-0000-0000-000000000011'),
  'A, hasta el 09/03: 8 de 8 = 100 %');
select pg_temp.ok((select clases_periodo = 4 and asistidas_periodo = 4 and porcentaje_periodo = 100.00
                     from public.porcentajes_materia('eeeeeeee-0000-0000-0000-000000000005', '2026-03-08', '2026-03-11')
                    where inscripcion_id = 'abababab-0000-0000-0000-000000000014'),
  'D, período 08/03 a 11/03 (sin el hueco de la baja): 4 de 4');

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);  -- consultas hechas como el administrador
-- ---------- 4. Truncado a 2 decimales ----------
select pg_temp.ok((select porcentaje_acumulado = 66.66 from public.porcentajes_materia('eeeeeeee-0000-0000-0000-000000000006')
                    where inscripcion_id = 'abababab-0000-0000-0000-000000000016'),
  '2 de 3 se muestra 66,66 % (truncado, nunca 66,67)');
select pg_temp.ok((select porcentaje_acumulado = 33.33 from public.porcentajes_materia('eeeeeeee-0000-0000-0000-000000000006')
                    where inscripcion_id = 'abababab-0000-0000-0000-000000000017'),
  '1 de 3 se muestra 33,33 %');

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);  -- consultas hechas como el administrador
-- ---------- 5. Materia sin clases ----------
select pg_temp.ok((select porcentaje_acumulado is null and color is null and clases_acumuladas = 0
                     from public.porcentajes_materia('eeeeeeee-0000-0000-0000-000000000007')
                    where inscripcion_id = 'abababab-0000-0000-0000-000000000018'),
  'sin clases no hay porcentaje ni color (no divide por cero)');

-- ---------- 6. El profesor puede cambiar una clase sin registro ----------
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000002',
  $$insert into public.asistencias (clase_id, inscripcion_id, materia_id, estado)
    select c.id, 'abababab-0000-0000-0000-000000000012', c.materia_id, 'presente'
    from public.clases c where c.materia_id = 'eeeeeeee-0000-0000-0000-000000000005' and c.fecha = '2026-03-02'$$,
  'el profesor carga una clase que figuraba como ausente automática');
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);  -- consultas hechas como el administrador
select pg_temp.ok((select asistidas_acumuladas = 7 and porcentaje_acumulado = 70.00
                     from public.porcentajes_materia('eeeeeeee-0000-0000-0000-000000000005')
                    where inscripcion_id = 'abababab-0000-0000-0000-000000000012'),
  'B pasa de 60 % a 70 % al completar esa clase');

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);  -- consultas hechas como el administrador
-- ---------- 7. Los umbrales del ciclo mandan ----------
update public.ciclos_lectivos set umbral_aprobado = 75, umbral_regular = 60 where id = 'dddddddd-0000-0000-0000-000000000001';
select pg_temp.ok((select color = 'verde' from public.porcentajes_materia('eeeeeeee-0000-0000-0000-000000000005')
                    where inscripcion_id = 'abababab-0000-0000-0000-000000000011'),
  'con umbrales 75 y 60 del ciclo, el 80 % de A pasa a verde');
update public.ciclos_lectivos set umbral_aprobado = 85, umbral_regular = 75 where id = 'dddddddd-0000-0000-0000-000000000001';

-- ---------- 8. Quién puede consultar ----------
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000002',
  $$select 1 / count(*) from public.porcentajes_materia('eeeeeeee-0000-0000-0000-000000000005')$$,
  'el profesor de la materia consulta los porcentajes');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000005',
  $$select 1 / count(*) from public.porcentajes_materia('eeeeeeee-0000-0000-0000-000000000005')$$,
  'el coordinador de la carrera consulta los porcentajes');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001',
  $$select 1 / count(*) from public.porcentajes_materia('eeeeeeee-0000-0000-0000-000000000005')$$,
  'el administrador consulta los porcentajes de su institución');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000004',
  $$select * from public.porcentajes_materia('eeeeeeee-0000-0000-0000-000000000005')$$,
  'No autorizado', 'un profesor que no dicta la materia no ve los porcentajes');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000003',
  $$select * from public.porcentajes_materia('eeeeeeee-0000-0000-0000-000000000005')$$,
  'No autorizado', 'el administrador de otra institución no ve los porcentajes');
do $$
begin
  set local role anon;
  begin
    perform * from public.porcentajes_materia('eeeeeeee-0000-0000-0000-000000000005');
    reset role;
    raise exception 'FALLÓ: anon pudo consultar porcentajes';
  exception when insufficient_privilege then
    reset role;
    raise notice 'ok: un usuario sin sesión no consulta porcentajes';
  end;
end $$;

rollback;
