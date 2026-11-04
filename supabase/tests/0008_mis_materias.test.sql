-- =====================================================================
-- 0008_mis_materias.test.sql
-- Pruebas de la migración 0008 (función mis_materias). Se corren con psql
-- contra el PostgreSQL local (roles anon y authenticated y auth.uid() leyendo
-- el ajuste request.jwt.claim.sub), DESPUÉS de aplicar las migraciones 0001 a
-- 0008. Datos inventados; el bloque termina en ROLLBACK y no deja nada en la
-- base. Cualquier comprobación que falle corta con «FALLÓ: ...».
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
  ('aaaaaaaa-0000-0000-0000-000000000001',  'admin@prueba.test'), ('aaaaaaaa-0000-0000-0000-000000000002', 'p@prueba.test'), ('aaaaaaaa-0000-0000-0000-000000000003', 'q@prueba.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'adminb@prueba.test'), ('aaaaaaaa-0000-0000-0000-000000000005', 'pb@prueba.test'), ('aaaaaaaa-0000-0000-0000-000000000009', 'sinpersona@prueba.test');
insert into public.personas (id, institucion_id, user_id, tipo, apellido_nombre) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',  'profesor', 'Admin Prueba'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002',  'profesor', 'Profe P'),
  ('bbbbbbbb-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003',  'profesor', 'Profe Q'),
  ('bbbbbbbb-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'profesor', 'Admin B'),
  ('bbbbbbbb-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000005', 'profesor', 'Profe B');
insert into public.administradores (persona_id) values
  ('bbbbbbbb-0000-0000-0000-000000000001'), ('bbbbbbbb-0000-0000-0000-000000000004');

create schema ptest;
grant usage on schema ptest to authenticated, anon;
create function ptest.ca(n text) returns uuid language sql security definer set search_path = '' as $$
  select id from public.carreras where institucion_id = '11111111-0000-0000-0000-000000000001' and nombre = n $$;
create function ptest.ci(a int) returns uuid language sql security definer set search_path = '' as $$
  select id from public.ciclos_lectivos where institucion_id = '11111111-0000-0000-0000-000000000001' and anio = a $$;
create function ptest.ma(n text, c text) returns uuid language sql security definer set search_path = '' as $$
  select m.id from public.materias m join public.carreras ca on ca.id = m.carrera_id
   where m.institucion_id = '11111111-0000-0000-0000-000000000001' and m.nombre = n and ca.nombre = c $$;
grant execute on all functions in schema ptest to authenticated;

select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.crear_ciclo(2026::smallint)$$, 'preparación: ciclo 2026');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.crear_ciclo(2025::smallint)$$, 'preparación: ciclo 2025');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.crear_carrera('Profesorado de Lengua')$$, 'preparación: carrera Lengua');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.crear_carrera('Profesorado de Inglés')$$, 'preparación: carrera Inglés');

-- Matemática con el MISMO nombre en dos carreras (el caso que motivó la 0008)
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.crear_materia('Matemática', 1::smallint, 'materia', 'anual', null, ptest.ca('Profesorado de Lengua'), ptest.ci(2026))$$, 'preparación: Matemática en Lengua');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.crear_materia('Matemática', 1::smallint, 'materia', 'anual', null, ptest.ca('Profesorado de Inglés'), ptest.ci(2026))$$, 'preparación: Matemática en Inglés');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.crear_materia('Fonética', 2::smallint, 'taller', 'cuatrimestral', 1::smallint, ptest.ca('Profesorado de Inglés'), ptest.ci(2026))$$, 'preparación: Fonética (cuatrimestral, taller)');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.crear_materia('Historia', 1::smallint, 'materia', 'anual', null, ptest.ca('Profesorado de Inglés'), ptest.ci(2025))$$, 'preparación: Historia (ciclo 2025)');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.crear_materia('Gestión', 3::smallint, 'materia', 'anual', null, ptest.ca('Profesorado de Lengua'), ptest.ci(2026))$$, 'preparación: Gestión (la dicta el administrador)');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.crear_materia('Otra', 2::smallint, 'materia', 'anual', null, ptest.ca('Profesorado de Lengua'), ptest.ci(2026))$$, 'preparación: Otra (la dicta Q)');

select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.asignar_materia('bbbbbbbb-0000-0000-0000-000000000002', ptest.ma('Matemática', 'Profesorado de Lengua'))$$, 'P dicta Matemática de Lengua');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.asignar_materia('bbbbbbbb-0000-0000-0000-000000000002', ptest.ma('Matemática', 'Profesorado de Inglés'))$$, 'P dicta Matemática de Inglés');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.asignar_materia('bbbbbbbb-0000-0000-0000-000000000002', ptest.ma('Fonética', 'Profesorado de Inglés'))$$, 'P dicta Fonética');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.asignar_materia('bbbbbbbb-0000-0000-0000-000000000002', ptest.ma('Historia', 'Profesorado de Inglés'))$$, 'P dicta Historia');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.asignar_materia('bbbbbbbb-0000-0000-0000-000000000001', ptest.ma('Gestión', 'Profesorado de Lengua'))$$, 'el administrador dicta Gestión');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.asignar_materia('bbbbbbbb-0000-0000-0000-000000000003', ptest.ma('Otra', 'Profesorado de Lengua'))$$, 'Q dicta Otra');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.cambiar_estado_materia(ptest.ma('Fonética', 'Profesorado de Inglés'), false)$$, 'Fonética queda inactiva');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.cerrar_ciclo(ptest.ci(2025))$$, 'el ciclo 2025 queda cerrado');

-- institución B, con una materia propia
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000004', $$select public.crear_ciclo(2026::smallint)$$, 'preparación B: ciclo');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000004', $$select public.crear_carrera('Profesorado de Inglés')$$, 'preparación B: carrera con el mismo nombre que la de A');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000004',
  $$select public.crear_materia('Materia B', 1::smallint, 'materia', 'anual', null, (select id from public.listar_carreras() limit 1), (select id from public.ciclos_lectivos limit 1))$$,
  'preparación B: materia');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000004',
  $$select public.asignar_materia('bbbbbbbb-0000-0000-0000-000000000005', (select id from public.listar_materias_institucion() limit 1))$$,
  'el profesor de B dicta Materia B');

-- #####################################################################
-- 1. EL PROFESOR VE SUS MATERIAS CON CARRERA Y CICLO
-- #####################################################################
select pg_temp.como_verifica('aaaaaaaa-0000-0000-0000-000000000002', $$(select count(*) = 4 from public.mis_materias())$$,
  'P ve sus 4 materias');
select pg_temp.como_verifica('aaaaaaaa-0000-0000-0000-000000000002',
  $$exists (select 1 from public.mis_materias() m
     where m.nombre = 'Matemática' and m.carrera_nombre = 'Profesorado de Lengua' and m.anio = 1
       and m.tipo = 'materia' and m.duracion = 'anual' and m.cuatrimestre is null
       and m.activo and m.carrera_activa and m.ciclo_anio = 2026 and m.ciclo_estado = 'abierto')$$,
  'trae carrera, ciclo, tipo y duración de Matemática de Lengua');

-- #####################################################################
-- 2. DOS MATERIAS CON EL MISMO NOMBRE SE DISTINGUEN POR CARRERA
-- #####################################################################
select pg_temp.como_verifica('aaaaaaaa-0000-0000-0000-000000000002',
  $$(select count(*) = 2 and count(distinct m.carrera_nombre) = 2 and count(distinct m.id) = 2
       from public.mis_materias() m where m.nombre = 'Matemática')$$,
  'las dos Matemática se distinguen por el nombre de la carrera');

-- #####################################################################
-- 3. INCLUYE INACTIVAS Y DE CICLOS CERRADOS, CADA UNA CON SU ESTADO
-- #####################################################################
select pg_temp.como_verifica('aaaaaaaa-0000-0000-0000-000000000002',
  $$exists (select 1 from public.mis_materias() m
     where m.nombre = 'Fonética' and m.activo = false and m.tipo = 'taller'
       and m.duracion = 'cuatrimestral' and m.cuatrimestre = 1)$$,
  'incluye la materia inactiva, marcada como tal');
select pg_temp.como_verifica('aaaaaaaa-0000-0000-0000-000000000002',
  $$exists (select 1 from public.mis_materias() m
     where m.nombre = 'Historia' and m.ciclo_anio = 2025 and m.ciclo_estado = 'cerrado')$$,
  'incluye la materia de un ciclo cerrado, con su estado');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.cambiar_estado_carrera(ptest.ca('Profesorado de Lengua'), false)$$,
  'se desactiva la carrera de Lengua');
select pg_temp.como_verifica('aaaaaaaa-0000-0000-0000-000000000002',
  $$exists (select 1 from public.mis_materias() m
     where m.nombre = 'Matemática' and m.carrera_nombre = 'Profesorado de Lengua'
       and m.carrera_activa = false and m.activo = true)$$,
  'una carrera desactivada se marca, y su materia sigue activa y visible');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.cambiar_estado_carrera(ptest.ca('Profesorado de Lengua'), true)$$,
  'se reactiva la carrera de Lengua');

-- #####################################################################
-- 4. CADA UNO VE SOLO LO SUYO (profesores, administrador e instituciones)
-- #####################################################################
select pg_temp.como_verifica('aaaaaaaa-0000-0000-0000-000000000002',
  $$(select count(*) = 0 from public.mis_materias() m where m.nombre in ('Otra', 'Gestión', 'Materia B'))$$,
  'P no ve las materias de otro profesor, del administrador ni de otra institución');
select pg_temp.como_verifica('aaaaaaaa-0000-0000-0000-000000000003',
  $$(select count(*) = 1 and bool_and(m.nombre = 'Otra') from public.mis_materias() m)$$,
  'Q ve solo su materia');
select pg_temp.como_verifica('aaaaaaaa-0000-0000-0000-000000000001',
  $$(select count(*) = 1 and bool_and(m.nombre = 'Gestión') from public.mis_materias() m)$$,
  'el administrador ve solo la materia que dicta, no todas las de la institución');
select pg_temp.como_verifica('aaaaaaaa-0000-0000-0000-000000000005',
  $$(select count(*) = 1 and bool_and(m.nombre = 'Materia B') and bool_and(m.carrera_nombre = 'Profesorado de Inglés') from public.mis_materias() m)$$,
  'el profesor de otra institución ve solo la suya, con su propia carrera');
select pg_temp.como_verifica('aaaaaaaa-0000-0000-0000-000000000009', $$(select count(*) = 0 from public.mis_materias())$$,
  'un usuario sin persona de profesor recibe una lista vacía, no un error');

-- #####################################################################
-- 5. SIN SESIÓN NO SE ACCEDE, Y NO SE ABRIERON PERMISOS NUEVOS
-- #####################################################################
do $$
begin
  set local role anon;
  begin
    perform * from public.mis_materias();
    reset role;
    raise exception 'FALLÓ: anon pudo ejecutar mis_materias';
  exception when insufficient_privilege then
    reset role;
    raise notice 'ok: un usuario sin sesión no ejecuta mis_materias';
  end;
end $$;
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002', $$select * from public.carreras$$, 'permission denied',
  'el profesor sigue sin poder leer la tabla de carreras directamente');
select pg_temp.como_falla('aaaaaaaa-0000-0000-0000-000000000002', $$update public.materias set carrera_id = null where nombre = 'Fonética'$$,
  'permission denied', 'el profesor sigue sin poder cambiar la carrera de una materia');

-- #####################################################################
-- 6. ORDEN Y ACTUALIZACIÓN
-- #####################################################################
select pg_temp.como_verifica('aaaaaaaa-0000-0000-0000-000000000002',
  $$(select array_agg(m.ciclo_anio) = array[2026, 2026, 2026, 2025]::smallint[] from public.mis_materias() m)$$,
  'viene ordenada: ciclo más nuevo primero');
select pg_temp.como_ok('aaaaaaaa-0000-0000-0000-000000000001', $$select public.quitar_materia('bbbbbbbb-0000-0000-0000-000000000002', ptest.ma('Matemática', 'Profesorado de Inglés'))$$,
  'se le quita una materia a P');
select pg_temp.como_verifica('aaaaaaaa-0000-0000-0000-000000000002',
  $$(select count(*) = 3 and not bool_or(m.nombre = 'Matemática' and m.carrera_nombre = 'Profesorado de Inglés') from public.mis_materias() m)$$,
  'la lista se actualiza: la materia quitada ya no aparece');

rollback;
select 'TODAS LAS PRUEBAS DE LA 0008 PASARON' as resultado;
