-- =====================================================================
-- 0007_carreras_administrador.test.sql
-- Pruebas de la migración 0007. Se corren con psql contra el PostgreSQL local
-- (con los roles anon y authenticated y auth.uid() leyendo el ajuste
-- request.jwt.claim.sub), DESPUÉS de aplicar las migraciones 0001 a 0007.
-- Todo con datos inventados; el bloque termina en ROLLBACK, así que no deja
-- nada en la base. Cualquier comprobación que falle corta la ejecución con
-- el mensaje «FALLÓ: ...».
--
-- Lo que este archivo NO puede probar por sí solo (se probó aparte, aplicando
-- la 0007 sobre dos bases): que la migración elimine las dos funciones sueltas
-- cuando existen (escenario producción) y que no falle cuando no existen
-- (escenario staging). Acá solo se comprueba que ya no estén.
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
-- PREPARACIÓN (datos inventados)
-- #####################################################################
begin;

insert into public.instituciones (id, nombre) values
  ('11111111-0000-0000-0000-000000000001', 'Instituto de prueba A'),
  ('11111111-0000-0000-0000-000000000002', 'Instituto de prueba B');
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001',  'admin@prueba.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'profe@prueba.test'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'adminb@prueba.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'coord@prueba.test');
insert into public.personas (id, institucion_id, user_id, tipo, apellido_nombre) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',  'profesor', 'Admin Prueba'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'profesor', 'Profe Prueba'),
  ('bbbbbbbb-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000003', 'profesor', 'Admin B Prueba'),
  ('bbbbbbbb-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004', 'profesor', 'Coord Prueba');
insert into public.administradores (persona_id) values
  ('bbbbbbbb-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000003');

-- Ayudas para ubicar ids por nombre (solo de la institución A; viven en la transacción)
create schema ptest;
grant usage on schema ptest to authenticated, anon;
create function ptest.ca(n text) returns uuid language sql security definer set search_path = '' as $$
  select id from public.carreras where institucion_id = '11111111-0000-0000-0000-000000000001' and nombre = n $$;
create function ptest.ci(a int) returns uuid language sql security definer set search_path = '' as $$
  select id from public.ciclos_lectivos where institucion_id = '11111111-0000-0000-0000-000000000001' and anio = a $$;
create function ptest.ma(n text) returns uuid language sql security definer set search_path = '' as $$
  select id from public.materias where institucion_id = '11111111-0000-0000-0000-000000000001' and nombre = n $$;
create function ptest.cb() returns uuid language sql security definer set search_path = '' as $$
  select id from public.carreras where institucion_id = '11111111-0000-0000-0000-000000000002' limit 1 $$;
grant execute on all functions in schema ptest to authenticated;

select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.crear_ciclo(2026::smallint)$$, 'preparación: ciclo 2026');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.crear_ciclo(2025::smallint)$$, 'preparación: ciclo 2025');

-- #####################################################################
-- 1. PERMISOS DE CARRERAS: solo el administrador crea, edita y cambia el estado
-- #####################################################################
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.crear_carrera('Profesorado de Inglés')$$,
  'el administrador crea la carrera de Inglés');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.crear_carrera('  Profesorado de Lengua  ')$$,
  'el administrador crea la carrera de Lengua (se recortan los espacios)');
select pg_temp.ok(
  (select activo from public.carreras where nombre = 'Profesorado de Lengua'),
  'una carrera nueva nace activa');
select pg_temp.ok(
  (select count(*) = 1 from public.carreras where nombre = 'Profesorado de Lengua'),
  'el nombre se guarda sin los espacios sobrantes');

-- coordinador: es profesor con una coordinación, pero no administrador
insert into public.coordinadores (persona_id, carrera_id) values
  ('bbbbbbbb-0000-0000-0000-000000000004', ptest.ca('Profesorado de Inglés'));

select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002', $$select public.crear_carrera('Intrusa')$$,
  'No autorizado', 'un profesor no administrador no crea carreras');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002', $$select public.editar_carrera(ptest.ca('Profesorado de Inglés'), 'Hackeada')$$,
  'No autorizado', 'un profesor no administrador no edita carreras');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002', $$select public.cambiar_estado_carrera(ptest.ca('Profesorado de Inglés'), false)$$,
  'No autorizado', 'un profesor no administrador no desactiva carreras');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002', $$select * from public.listar_carreras()$$,
  'No autorizado', 'un profesor no administrador no usa el listado de carreras');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000004', $$select public.crear_carrera('Intrusa')$$,
  'No autorizado', 'el coordinador (solo lectura) no crea carreras');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000004', $$select public.cambiar_estado_carrera(ptest.ca('Profesorado de Inglés'), false)$$,
  'No autorizado', 'el coordinador no desactiva carreras');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000004', $$select * from public.listar_carreras()$$,
  'No autorizado', 'el coordinador no usa el listado de carreras del administrador');

do $$
begin
  set local role anon;
  begin
    perform public.crear_carrera('Anonima');
    reset role;
    raise exception 'FALLÓ: anon pudo crear una carrera';
  exception when insufficient_privilege then
    reset role;
    raise notice 'ok: un usuario sin sesión no crea carreras';
  end;
  set local role anon;
  begin
    perform * from public.listar_carreras();
    reset role;
    raise exception 'FALLÓ: anon pudo listar carreras';
  exception when insufficient_privilege then
    reset role;
    raise notice 'ok: un usuario sin sesión no lista carreras';
  end;
end $$;

-- caso permitido y aislamiento entre instituciones
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.editar_carrera(ptest.ca('Profesorado de Lengua'), 'Profesorado de Lengua y Literatura')$$,
  'el administrador edita el nombre de una carrera');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.editar_carrera(ptest.ca('Profesorado de Lengua y Literatura'), 'Profesorado de Lengua')$$,
  'el administrador vuelve a dejar el nombre original');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000003', $$select public.editar_carrera(ptest.ca('Profesorado de Inglés'), 'Ajena')$$,
  'no existe en tu institución', 'el administrador de otra institución no edita carreras ajenas');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000003', $$select public.cambiar_estado_carrera(ptest.ca('Profesorado de Inglés'), false)$$,
  'no existe en tu institución', 'el administrador de otra institución no desactiva carreras ajenas');
select pg_temp.como_verifica('aaaaaaaa-0000-0000-0000-000000000003', $$(select count(*) = 0 from public.listar_carreras())$$,
  'el administrador de otra institución no ve las carreras ajenas');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001', $$select public.cambiar_estado_carrera(ptest.ca('Profesorado de Lengua'), null)$$,
  'Hay que indicar', 'el estado de una carrera no puede quedar vacío');

-- #####################################################################
-- 2. NOMBRE ÚNICO, IGNORANDO MAYÚSCULAS Y TILDES
-- #####################################################################
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001', $$select public.crear_carrera('PROFESORADO DE INGLES')$$,
  'Ya existe una carrera', 'no se repite el nombre cambiando mayúsculas y tildes');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001', $$select public.crear_carrera('  profesorado de inglés ')$$,
  'Ya existe una carrera', 'no se repite el nombre cambiando espacios y mayúsculas');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001', $$select public.crear_carrera('   ')$$,
  'obligatorio', 'el nombre de la carrera es obligatorio');
select pg_temp.dueno_falla(
  $$insert into public.carreras (institucion_id, nombre) values ('11111111-0000-0000-0000-000000000001', 'profesorado de INGLES')$$,
  'carreras_nombre_unico_normalizado', 'la base misma frena el duplicado (sin pasar por la función)');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001', $$select public.editar_carrera(ptest.ca('Profesorado de Lengua'), 'PROFESORADO DE INGLÉS')$$,
  'Ya existe una carrera', 'no se puede renombrar una carrera con el nombre de otra');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.editar_carrera(ptest.ca('Profesorado de Lengua'), 'PROFESORADO DE LENGUA')$$,
  'caso límite: cambiar solo mayúsculas del propio nombre sí se puede');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.editar_carrera(ptest.ca('PROFESORADO DE LENGUA'), 'Profesorado de Lengua')$$,
  'se restituye el nombre de Lengua');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000003', $$select public.crear_carrera('Profesorado de Inglés')$$,
  'otra institución sí puede tener una carrera con el mismo nombre');

-- #####################################################################
-- PREPARACIÓN DE MATERIAS (para los bloques 3 a 8)
-- #####################################################################
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.crear_materia('Didáctica de la Lengua', 1::smallint, 'materia', 'anual', null, ptest.ca('Profesorado de Lengua'), ptest.ci(2026))$$, 'preparación: materia M1 (Lengua, anual)');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.crear_materia('Fonética', 2::smallint, 'taller', 'cuatrimestral', 1::smallint, ptest.ca('Profesorado de Inglés'), ptest.ci(2026))$$, 'preparación: materia M2 (Inglés, cuatrimestral, taller)');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.crear_materia('Gramática Inglesa', 1::smallint, 'materia', 'anual', null, ptest.ca('Profesorado de Inglés'), ptest.ci(2026))$$, 'preparación: materia M3 (Inglés, anual)');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.crear_materia('Historia de la Educación', 1::smallint, 'materia', 'anual', null, ptest.ca('Profesorado de Inglés'), ptest.ci(2025))$$, 'preparación: materia M4 (Inglés, ciclo 2025)');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.asignar_materia('bbbbbbbb-0000-0000-0000-000000000002', ptest.ma('Didáctica de la Lengua'))$$, 'preparación: el profesor dicta M1');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.asignar_materia('bbbbbbbb-0000-0000-0000-000000000002', ptest.ma('Fonética'))$$, 'preparación: el profesor dicta M2');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.cambiar_estado_materia(ptest.ma('Fonética'), false)$$, 'preparación: M2 queda inactiva');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.cerrar_ciclo(ptest.ci(2025))$$, 'preparación: el ciclo 2025 queda cerrado');

-- #####################################################################
-- 3. CARRERA DESACTIVADA: sin materias nuevas, pero lo existente se sigue viendo
-- #####################################################################
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.cambiar_estado_carrera(ptest.ca('Profesorado de Lengua'), false)$$,
  'el administrador desactiva la carrera de Lengua');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.crear_materia('Literatura', 2::smallint, 'materia', 'anual', null, ptest.ca('Profesorado de Lengua'), ptest.ci(2026))$$,
  'desactivada', 'una carrera desactivada no admite materias nuevas');
select pg_temp.ok(
  (select count(*) = 0 from public.materias where nombre = 'Literatura'),
  'la materia rechazada no quedó guardada');
select pg_temp.como_verifica('aaaaaaaa-0000-0000-0000-000000000002',
  $$(select count(*) = 1 from public.materias where carrera_id = ptest.ca('Profesorado de Lengua'))$$,
  'el profesor sigue viendo su materia de la carrera desactivada');
select pg_temp.como_verifica('aaaaaaaa-0000-0000-0000-000000000001',
  $$(select count(*) = 1 from public.listar_materias_institucion() l where l.nombre = 'Didáctica de la Lengua')$$,
  'el administrador sigue viendo la materia de la carrera desactivada');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.editar_carrera(ptest.ca('Profesorado de Lengua'), 'Profesorado de Lengua y Literatura')$$,
  'una carrera desactivada se puede renombrar');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.editar_carrera(ptest.ca('Profesorado de Lengua y Literatura'), 'Profesorado de Lengua')$$,
  'se restituye el nombre');

-- #####################################################################
-- 4. DESACTIVAR UNA CARRERA NO DESACTIVA SUS MATERIAS
-- #####################################################################
select pg_temp.ok(
  (select activo from public.materias where nombre = 'Didáctica de la Lengua'),
  'la materia de la carrera desactivada sigue activa');
select pg_temp.ok(
  private.materia_editable(ptest.ma('Didáctica de la Lengua')),
  'la materia de la carrera desactivada sigue admitiendo clases y asistencias');

-- #####################################################################
-- 5. EL ADMINISTRADOR NO BORRA CARRERAS (ni toca la tabla a mano)
-- #####################################################################
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001', $$delete from public.carreras where nombre = 'Profesorado de Lengua'$$,
  'permission denied', 'el administrador no puede borrar carreras desde la API');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001', $$update public.carreras set activo = true where nombre = 'Profesorado de Lengua'$$,
  'permission denied', 'el administrador no modifica carreras a mano: usa las funciones');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001', $$insert into public.carreras (institucion_id, nombre) values ('11111111-0000-0000-0000-000000000001', 'Directa')$$,
  'permission denied', 'el administrador no inserta carreras a mano: usa las funciones');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002', $$select * from public.carreras$$,
  'permission denied', 'el profesor no lee la tabla de carreras directamente');

-- #####################################################################
-- 6. EDITAR MATERIAS Y CARRERAS DESACTIVADAS (decisión del 01/11/2026)
-- #####################################################################
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.editar_materia(ptest.ma('Didáctica de la Lengua'), 'Didáctica de la Lengua I', 1::smallint, 'materia', 'anual', null, ptest.ca('Profesorado de Lengua'))$$,
  'se puede editar una materia que está en una carrera desactivada si no cambia de carrera');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.editar_materia(ptest.ma('Didáctica de la Lengua I'), 'Didáctica de la Lengua', 1::smallint, 'materia', 'anual', null, ptest.ca('Profesorado de Lengua'))$$,
  'se restituye el nombre de la materia');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.editar_materia(ptest.ma('Gramática Inglesa'), 'Gramática Inglesa', 1::smallint, 'materia', 'anual', null, ptest.ca('Profesorado de Lengua'))$$,
  'de destino está desactivada', 'no se puede mover una materia a una carrera desactivada');
select pg_temp.ok(
  (select carrera_id = ptest.ca('Profesorado de Inglés') from public.materias where nombre = 'Gramática Inglesa'),
  'la materia rechazada sigue en su carrera original');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.editar_materia(ptest.ma('Gramática Inglesa'), 'Gramática Inglesa II', 1::smallint, 'materia', 'anual', null, ptest.ca('Profesorado de Inglés'))$$,
  'una materia de una carrera activa se edita con normalidad');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.editar_materia(ptest.ma('Gramática Inglesa II'), 'Gramática Inglesa', 1::smallint, 'materia', 'anual', null, ptest.ca('Profesorado de Inglés'))$$,
  'se restituye el nombre de la materia de Inglés');

-- #####################################################################
-- 7. LISTADO DE MATERIAS DEL ADMINISTRADOR: trae todas, con todos los datos
-- #####################################################################
select pg_temp.como_verifica('aaaaaaaa-0000-0000-0000-000000000001', $$(select count(*) = 4 from public.listar_materias_institucion())$$,
  'el listado trae las 4 materias: activas, inactivas y de un ciclo cerrado');
select pg_temp.como_verifica('aaaaaaaa-0000-0000-0000-000000000001',
  $$exists (select 1 from public.listar_materias_institucion() l
     where l.nombre = 'Didáctica de la Lengua' and l.activo and l.tipo = 'materia' and l.duracion = 'anual'
       and l.cuatrimestre is null and l.anio = 1 and l.carrera_nombre = 'Profesorado de Lengua'
       and l.carrera_activa = false and l.ciclo_anio = 2026 and l.ciclo_estado = 'abierto'
       and jsonb_array_length(l.profesores) = 1)$$,
  'el listado muestra carrera, ciclo, tipo, duración y profesor; y marca la carrera desactivada');
select pg_temp.como_verifica('aaaaaaaa-0000-0000-0000-000000000001',
  $$exists (select 1 from public.listar_materias_institucion() l
     where l.nombre = 'Fonética' and l.activo = false and l.tipo = 'taller'
       and l.duracion = 'cuatrimestral' and l.cuatrimestre = 1 and l.carrera_activa
       and jsonb_array_length(l.profesores) = 1)$$,
  'el listado incluye la materia inactiva, con su cuatrimestre');
select pg_temp.como_verifica('aaaaaaaa-0000-0000-0000-000000000001',
  $$exists (select 1 from public.listar_materias_institucion() l
     where l.nombre = 'Historia de la Educación' and l.ciclo_anio = 2025 and l.ciclo_estado = 'cerrado'
       and l.profesores = '[]'::jsonb)$$,
  'el listado incluye la materia de un ciclo cerrado, sin profesores');
select pg_temp.como_verifica('aaaaaaaa-0000-0000-0000-000000000001',
  $$(select array_agg(l.ciclo_anio) = array[2026, 2026, 2026, 2025]::smallint[] from public.listar_materias_institucion() l)$$,
  'el listado viene ordenado: ciclo más nuevo primero');
select pg_temp.como_verifica('aaaaaaaa-0000-0000-0000-000000000001',
  $$(select count(*) = 2 from public.listar_carreras() c where c.nombre in ('Profesorado de Inglés', 'Profesorado de Lengua'))
    and (select c.cantidad_materias = 3 from public.listar_carreras() c where c.nombre = 'Profesorado de Inglés')
    and (select c.cantidad_materias = 1 and not c.activo from public.listar_carreras() c where c.nombre = 'Profesorado de Lengua')$$,
  'el listado de carreras muestra estado y cantidad de materias');

-- #####################################################################
-- 8. EL LISTADO ES SOLO PARA EL ADMINISTRADOR DE SU INSTITUCIÓN
-- #####################################################################
select pg_temp.como_verifica('aaaaaaaa-0000-0000-0000-000000000003', $$(select count(*) = 0 from public.listar_materias_institucion())$$,
  'el administrador de otra institución no ve materias ajenas');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000003', $$select public.crear_ciclo(2026::smallint)$$, 'preparación: ciclo 2026 de la institución B');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000003',
  $$select public.crear_materia('Materia B', 1::smallint, 'materia', 'anual', null,
      (select id from public.listar_carreras() limit 1), (select id from public.ciclos_lectivos limit 1))$$,
  'preparación: el administrador B crea una materia propia');
select pg_temp.como_verifica('aaaaaaaa-0000-0000-0000-000000000003',
  $$(select count(*) = 1 and bool_and(l.nombre = 'Materia B') from public.listar_materias_institucion() l)$$,
  'el administrador B ve solo su materia');
select pg_temp.como_verifica('aaaaaaaa-0000-0000-0000-000000000001',
  $$(select count(*) = 4 and not bool_or(l.nombre = 'Materia B') from public.listar_materias_institucion() l)$$,
  'el administrador A sigue viendo solo las suyas');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002', $$select * from public.listar_materias_institucion()$$,
  'No autorizado', 'un profesor no administrador no usa el listado del administrador');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000004', $$select * from public.listar_materias_institucion()$$,
  'No autorizado', 'el coordinador no usa el listado del administrador');
do $$
begin
  set local role anon;
  begin
    perform * from public.listar_materias_institucion();
    reset role;
    raise exception 'FALLÓ: anon pudo listar materias';
  exception when insufficient_privilege then
    reset role;
    raise notice 'ok: un usuario sin sesión no lista materias';
  end;
end $$;

-- ---------- 3 (cierre): reactivar la carrera permite materias nuevas ----------
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.cambiar_estado_carrera(ptest.ca('Profesorado de Lengua'), true)$$,
  'el administrador reactiva la carrera de Lengua');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.crear_materia('Literatura', 2::smallint, 'materia', 'anual', null, ptest.ca('Profesorado de Lengua'), ptest.ci(2026))$$,
  'reactivada la carrera, admite materias nuevas');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000001',
  $$select public.crear_materia('Otra', 1::smallint, 'materia', 'anual', null, ptest.cb(), ptest.ci(2026))$$,
  'no existe en tu institución', 'no se crean materias en carreras de otra institución');

-- #####################################################################
-- 9. LAS DOS FUNCIONES SUELTAS YA NO EXISTEN
-- #####################################################################
select pg_temp.ok(
  (select count(*) = 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('crear_alumno_matricular', 'guardar_planilla_asistencia')),
  'crear_alumno_matricular y guardar_planilla_asistencia ya no existen');
select pg_temp.ok(
  (select count(*) = 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'listar_materias_institucion'),
  'listar_materias_institucion existe una sola vez (sin versión vieja)');

rollback;
select 'TODAS LAS PRUEBAS DE LA 0007 PASARON' as resultado;
