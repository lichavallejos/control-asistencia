-- =====================================================================
-- Pruebas de las políticas RLS (0002_politicas_rls.sql)
-- Simula distintos usuarios y comprueba qué ven y qué pueden hacer.
-- Todo corre dentro de una transacción que termina en ROLLBACK:
-- no deja datos de prueba.
-- Requiere un entorno de prueba (no correr sobre datos reales).
-- =====================================================================
begin;

-- ---------- Datos de prueba (como administrador) ----------
insert into auth.users (id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'),  -- profesor A (inst 1)
  ('aaaaaaaa-0000-0000-0000-000000000002'),  -- profesor B (inst 1)
  ('aaaaaaaa-0000-0000-0000-000000000003'),  -- profesor C (inst 2)
  ('aaaaaaaa-0000-0000-0000-000000000009');  -- usuario sin persona

insert into instituciones (id, nombre) values
  ('11111111-0000-0000-0000-000000000001', 'Institucion 1'),
  ('11111111-0000-0000-0000-000000000002', 'Institucion 2');

insert into personas (id, institucion_id, user_id, tipo, apellido_nombre) values
  ('22222222-0000-0000-0000-00000000000a','11111111-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','profesor','Profe A'),
  ('22222222-0000-0000-0000-00000000000b','11111111-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002','profesor','Profe B'),
  ('22222222-0000-0000-0000-00000000000c','11111111-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000003','profesor','Profe C'),
  ('22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001',null,'alumno','Alumno 1'),
  ('22222222-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000001',null,'alumno','Alumno 2'),
  ('22222222-0000-0000-0000-000000000003','11111111-0000-0000-0000-000000000002',null,'alumno','Alumno 3');

insert into materias (id, institucion_id, nombre, anio) values
  ('33333333-0000-0000-0000-00000000000a','11111111-0000-0000-0000-000000000001','Materia A',1),
  ('33333333-0000-0000-0000-00000000000b','11111111-0000-0000-0000-000000000001','Materia B',1),
  ('33333333-0000-0000-0000-00000000000c','11111111-0000-0000-0000-000000000002','Materia C',1);

insert into profesor_materias (profesor_id, materia_id) values
  ('22222222-0000-0000-0000-00000000000a','33333333-0000-0000-0000-00000000000a'),
  ('22222222-0000-0000-0000-00000000000b','33333333-0000-0000-0000-00000000000b'),
  ('22222222-0000-0000-0000-00000000000c','33333333-0000-0000-0000-00000000000c');

insert into inscripciones (id, alumno_id, materia_id) values
  ('44444444-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000001','33333333-0000-0000-0000-00000000000a'),
  ('44444444-0000-0000-0000-000000000002','22222222-0000-0000-0000-000000000002','33333333-0000-0000-0000-00000000000b'),
  ('44444444-0000-0000-0000-000000000003','22222222-0000-0000-0000-000000000003','33333333-0000-0000-0000-00000000000c');

insert into clases (id, materia_id, fecha) values
  ('55555555-0000-0000-0000-00000000000a','33333333-0000-0000-0000-00000000000a','2026-10-16'),
  ('55555555-0000-0000-0000-00000000000b','33333333-0000-0000-0000-00000000000b','2026-10-16');

-- =====================================================================
-- PROFESOR A (institución 1, dicta Materia A)
-- =====================================================================
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);
set local role authenticated;

do $$ declare n int; begin
  select count(*) into n from public.materias;
  if n <> 1 then raise exception 'FALLO A1: ve % materias (esperado 1)', n; end if;
  select count(*) into n from public.inscripciones;
  if n <> 1 then raise exception 'FALLO A2: ve % inscripciones (esperado 1)', n; end if;
  select count(*) into n from public.clases;
  if n <> 1 then raise exception 'FALLO A3: ve % clases (esperado 1)', n; end if;
  select count(*) into n from public.personas;
  if n <> 3 then raise exception 'FALLO A4: ve % personas (esperado 3: 2 alumnos de su institucion + el mismo)', n; end if;
  select count(*) into n from public.instituciones;
  if n <> 1 then raise exception 'FALLO A5: ve % instituciones (esperado 1)', n; end if;
  raise notice 'OK  A1-A5: el profesor A ve solo lo suyo';
end $$;

do $$ declare ok boolean := false; begin
  begin
    insert into public.clases (materia_id, fecha)
    values ('33333333-0000-0000-0000-00000000000b', '2026-10-20');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FALLO A6: pudo crear una clase en la materia de otro profesor'; end if;
  raise notice 'OK  A6: no puede crear clases en materias ajenas';
end $$;

do $$ declare ok boolean := false; begin
  begin
    insert into public.asistencias (clase_id, inscripcion_id, materia_id, estado)
    values ('55555555-0000-0000-0000-00000000000b','44444444-0000-0000-0000-000000000002','33333333-0000-0000-0000-00000000000b','presente');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FALLO A7: pudo cargar asistencia en materia ajena'; end if;
  raise notice 'OK  A7: no puede cargar asistencias en materias ajenas';
end $$;

do $$ begin
  insert into public.asistencias (clase_id, inscripcion_id, materia_id, estado)
  values ('55555555-0000-0000-0000-00000000000a','44444444-0000-0000-0000-000000000001','33333333-0000-0000-0000-00000000000a','presente');
  raise notice 'OK  A8: carga asistencia en su materia';
end $$;

do $$ declare ok boolean := false; begin
  begin
    insert into public.inscripciones (alumno_id, materia_id)
    values ('22222222-0000-0000-0000-000000000001','33333333-0000-0000-0000-00000000000b');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FALLO A9: pudo inscribir en materia ajena'; end if;
  raise notice 'OK  A9: no puede inscribir en materias ajenas';
end $$;

do $$ declare ok boolean := false; begin
  begin
    insert into public.inscripciones (alumno_id, materia_id)
    values ('22222222-0000-0000-0000-000000000003','33333333-0000-0000-0000-00000000000a');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FALLO A10: pudo inscribir a un alumno de otra institucion'; end if;
  raise notice 'OK  A10: no puede inscribir alumnos de otra institucion';
end $$;

do $$ begin
  insert into public.inscripciones (alumno_id, materia_id)
  values ('22222222-0000-0000-0000-000000000002','33333333-0000-0000-0000-00000000000a');
  raise notice 'OK  A11: inscribe a un alumno de su institucion en su materia';
end $$;

do $$ declare ok boolean := false; begin
  begin
    insert into public.personas (institucion_id, tipo, apellido_nombre)
    values ('11111111-0000-0000-0000-000000000002','alumno','Intruso');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FALLO A12: pudo crear persona en otra institucion'; end if;
  raise notice 'OK  A12: no puede crear personas en otra institucion';
end $$;

do $$ declare ok boolean := false; begin
  begin
    insert into public.personas (institucion_id, tipo, apellido_nombre)
    values ('11111111-0000-0000-0000-000000000001','profesor','Falso profe');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FALLO A13: pudo crear un profesor'; end if;
  raise notice 'OK  A13: no puede crear profesores';
end $$;

do $$ begin
  insert into public.personas (institucion_id, tipo, apellido_nombre, dni)
  values ('11111111-0000-0000-0000-000000000001','alumno','Alumno Nuevo','40111222');
  raise notice 'OK  A14: crea un alumno en su institucion';
end $$;

do $$ declare n int; begin
  update public.personas set apellido_nombre = 'Hackeado'
   where id = '22222222-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO A15: edito un alumno ajeno'; end if;
  update public.personas set apellido_nombre = 'Alumno 2 editado'
   where id = '22222222-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO A16: no pudo editar un alumno propio'; end if;
  raise notice 'OK  A15-A16: edita solo alumnos propios';
end $$;

do $$ declare n int; begin
  update public.materias set nombre = 'Hackeada'
   where id = '33333333-0000-0000-0000-00000000000b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO A17: edito una materia ajena'; end if;
  raise notice 'OK  A17: no edita materias ajenas';
end $$;

do $$ declare ok boolean := false; begin
  begin
    update public.materias set institucion_id = '11111111-0000-0000-0000-000000000002'
     where id = '33333333-0000-0000-0000-00000000000a';
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FALLO A18: pudo mover una materia a otra institucion'; end if;
  raise notice 'OK  A18: no puede mover materias a otra institucion';
end $$;

do $$ declare ok boolean := false; begin
  begin
    delete from public.materias where id = '33333333-0000-0000-0000-00000000000a';
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FALLO A19: pudo borrar una materia'; end if;
  raise notice 'OK  A19: no puede borrar materias';
end $$;

do $$ declare nuevo uuid; n int; begin
  nuevo := public.crear_materia('  Materia Nueva  ', 2::smallint);
  select count(*) into n from public.materias;
  if n <> 2 then raise exception 'FALLO A20: no ve la materia que creo (ve %)', n; end if;
  raise notice 'OK  A20: crear_materia la crea y la asigna al profesor';
end $$;

do $$ declare ok boolean := false; begin
  begin perform public.crear_materia('Mala', 9::smallint);
  exception when check_violation then ok := true; end;
  if not ok then raise exception 'FALLO A21: acepto un anio invalido'; end if;
  raise notice 'OK  A21: rechaza anios invalidos';
end $$;

do $$ declare ok boolean := false; begin
  begin perform public.crear_materia('   ', 1::smallint);
  exception when others then ok := true; end;
  if not ok then raise exception 'FALLO A22: acepto un nombre vacio'; end if;
  raise notice 'OK  A22: rechaza nombres vacios';
end $$;

-- =====================================================================
-- PROFESOR C (otra institución)
-- =====================================================================
reset role;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000003"}', true);
set local role authenticated;

do $$ declare n int; begin
  select count(*) into n from public.materias;
  if n <> 1 then raise exception 'FALLO C1: ve % materias (esperado 1)', n; end if;
  select count(*) into n from public.personas;
  if n <> 2 then raise exception 'FALLO C2: ve % personas (esperado 2)', n; end if;
  select count(*) into n from public.asistencias;
  if n <> 0 then raise exception 'FALLO C3: ve asistencias de otra institucion'; end if;
  raise notice 'OK  C1-C3: el profesor de otra institucion no ve nada ajeno';
end $$;

-- =====================================================================
-- USUARIO CON SESIÓN PERO SIN PERSONA (por ejemplo, un alumno con cuenta)
-- =====================================================================
reset role;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000009"}', true);
set local role authenticated;

do $$ declare n int; ok boolean := false; begin
  select count(*) into n from public.materias;
  if n <> 0 then raise exception 'FALLO U1: ve materias'; end if;
  select count(*) into n from public.personas;
  if n <> 0 then raise exception 'FALLO U2: ve personas'; end if;
  begin perform public.crear_materia('X', 1::smallint);
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FALLO U3: pudo crear una materia sin ser profesor'; end if;
  raise notice 'OK  U1-U3: un usuario sin persona de profesor no accede a nada';
end $$;

-- =====================================================================
-- SIN SESIÓN (anon)
-- =====================================================================
reset role;
set local role anon;

do $$ declare ok boolean := false; begin
  begin perform 1 from public.materias limit 1;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FALLO N1: anon pudo leer materias'; end if;
  ok := false;
  begin perform 1 from public.personas limit 1;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FALLO N2: anon pudo leer personas'; end if;
  ok := false;
  begin perform public.crear_materia('X', 1::smallint);
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FALLO N3: anon pudo ejecutar crear_materia'; end if;
  raise notice 'OK  N1-N3: sin sesion no se accede a nada';
end $$;

reset role;
rollback;
