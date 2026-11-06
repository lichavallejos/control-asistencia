-- =====================================================================
-- 0009_alta_alumno.test.sql
-- Pruebas de inscribir_alumno(). Datos 100 % inventados (correos @prueba.test).
-- Todo corre dentro de una transacción que se deshace al final.
--
-- Cómo correrlo (PostgreSQL local con las migraciones 0001 a 0009):
--   psql -d <base> -f 0009_alta_alumno.test.sql
-- No está pensado para pegarse en el editor SQL de Supabase.
--
-- Al final muestra cuántas comprobaciones pasaron y cuáles fallaron.
-- =====================================================================
\set ON_ERROR_STOP on
begin;

-- ---------- Ayudantes (viven solo durante la prueba) ----------
create temp table resultados (n serial primary key, prueba text, ok boolean);
create temp table llamadas   (clave text primary key, r jsonb);

create function pg_temp.chequeo(p_prueba text, p_cond boolean) returns void
language sql as $$ insert into resultados (prueba, ok) values (p_prueba, coalesce(p_cond, false)) $$;

-- Llama a la función con el rol y la sesión indicados y devuelve el resultado como json
create function pg_temp.llamar(
  p_rol text, p_sub uuid, p_materia uuid, p_nombre text, p_dni text, p_email text default null
) returns jsonb
language plpgsql as $$
declare
  r record;
  v jsonb;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_sub::text, ''), true);
  execute format('set local role %I', p_rol);
  begin
    select * into r from public.inscribir_alumno(p_materia, p_nombre, p_dni, p_email);
    v := jsonb_build_object('ok', true, 'inscripcion', r.inscripcion_id,
                            'alumno', r.alumno_id, 'creada', r.persona_creada);
  exception when others then
    v := jsonb_build_object('ok', false, 'error', sqlerrm);
  end;
  reset role;
  return v;
end $$;

-- ---------- Datos inventados ----------
insert into public.instituciones (id, nombre) values
  ('a0000000-0000-0000-0000-000000000001', 'Instituto de Prueba Uno'),
  ('a0000000-0000-0000-0000-000000000002', 'Instituto de Prueba Dos');

insert into auth.users (id) values
  ('b0000000-0000-0000-0000-000000000001'),   -- cuenta de la profesora A
  ('b0000000-0000-0000-0000-000000000002');   -- cuenta del profesor B

insert into public.personas (id, institucion_id, user_id, tipo, apellido_nombre, dni, email) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000001', 'profesor', 'Profesora, Prueba Uno',  '30000001', 'a@prueba.test'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000002', 'profesor', 'Profesor, Prueba Dos',   '30111222', 'b@prueba.test'),
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001',
   null,                                   'alumno',   'Pérez, Ana',             '20111222', 'ana@prueba.test'),
  ('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002',
   null,                                   'alumno',   'Alumno, De Otra Institución', '55555555', null);

insert into public.carreras (id, institucion_id, nombre) values
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Carrera de Prueba');

insert into public.ciclos_lectivos (id, institucion_id, anio, estado) values
  ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 2026, 'abierto'),
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 2025, 'cerrado');

insert into public.materias (id, institucion_id, nombre, anio, tipo, duracion, carrera_id, ciclo_id, activo) values
  ('f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Materia Uno (activa)',   1, 'materia', 'anual',
   'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', true),
  ('f0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Materia Dos (del otro profesor)', 1, 'materia', 'anual',
   'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', true),
  ('f0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Materia Tres (inactiva)', 1, 'materia', 'anual',
   'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', false),
  ('f0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Materia Cuatro (ciclo cerrado)', 1, 'materia', 'anual',
   'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', true);

insert into public.profesor_materias (profesor_id, materia_id) values
  ('c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000002'),
  ('c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000003'),
  ('c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000004');

-- Atajos para leer más fácil: A = profesora de las materias 1, 3 y 4; B = profesor de la 2
-- M1 = activa, M3 = inactiva, M4 = ciclo cerrado

-- =====================================================================
-- Prueba 1. Alta de un alumno nuevo (sin correo): se crea, se inscribe y se vincula a la carrera
-- =====================================================================
insert into llamadas values ('t1',
  pg_temp.llamar('authenticated', 'b0000000-0000-0000-0000-000000000001',
                 'f0000000-0000-0000-0000-000000000001', '  Gómez   Luis ', ' 12345678 ', null));

select pg_temp.chequeo('1. alta nueva: la llamada sale bien',
  (select r->>'ok' from llamadas where clave = 't1') = 'true');
select pg_temp.chequeo('1. alta nueva: informa que la persona se creó',
  (select r->>'creada' from llamadas where clave = 't1') = 'true');
select pg_temp.chequeo('1. alta nueva: queda como alumno, con nombre sin espacios de más, DNI limpio y sin correo (incompleto)',
  exists (select 1 from public.personas p
          where p.id = (select (r->>'alumno')::uuid from llamadas where clave = 't1')
            and p.tipo = 'alumno' and p.apellido_nombre = 'Gómez Luis'
            and p.dni = '12345678' and p.email is null
            and p.institucion_id = 'a0000000-0000-0000-0000-000000000001'));
select pg_temp.chequeo('1. alta nueva: queda inscripto en la materia',
  exists (select 1 from public.inscripciones i
          where i.id = (select (r->>'inscripcion')::uuid from llamadas where clave = 't1')
            and i.alumno_id = (select (r->>'alumno')::uuid from llamadas where clave = 't1')
            and i.materia_id = 'f0000000-0000-0000-0000-000000000001'));
select pg_temp.chequeo('7. queda vinculado a la carrera de la materia',
  exists (select 1 from public.alumno_carreras ac
          where ac.alumno_id = (select (r->>'alumno')::uuid from llamadas where clave = 't1')
            and ac.carrera_id = 'd0000000-0000-0000-0000-000000000001'));

-- Con correo
insert into llamadas values ('t1_correo',
  pg_temp.llamar('authenticated', 'b0000000-0000-0000-0000-000000000001',
                 'f0000000-0000-0000-0000-000000000001', 'Díaz, María', '23456789', ' maria@prueba.test '));
select pg_temp.chequeo('1. alta nueva con correo: guarda el correo sin espacios',
  exists (select 1 from public.personas p
          where p.id = (select (r->>'alumno')::uuid from llamadas where clave = 't1_correo')
            and p.email = 'maria@prueba.test'));

-- =====================================================================
-- Prueba 2. Quién puede: solo el profesor de esa materia
-- =====================================================================
insert into llamadas values ('t2_otro',
  pg_temp.llamar('authenticated', 'b0000000-0000-0000-0000-000000000002',
                 'f0000000-0000-0000-0000-000000000001', 'Nuevo, Alumno', '12121212'));
select pg_temp.chequeo('2. un profesor que no dicta la materia no puede',
  (select r->>'ok' from llamadas where clave = 't2_otro') = 'false'
  and (select r->>'error' from llamadas where clave = 't2_otro') = 'La materia no existe en tus materias');
select pg_temp.chequeo('2. el rechazo no deja ninguna persona creada',
  not exists (select 1 from public.personas p where p.dni = '12121212'));

insert into llamadas values ('t2_sinsesion',
  pg_temp.llamar('authenticated', null,
                 'f0000000-0000-0000-0000-000000000001', 'Nuevo, Alumno', '12121212'));
select pg_temp.chequeo('2. una sesión sin persona de profesor no puede',
  (select r->>'error' from llamadas where clave = 't2_sinsesion') = 'No autorizado');

insert into llamadas values ('t2_anon',
  pg_temp.llamar('anon', null,
                 'f0000000-0000-0000-0000-000000000001', 'Nuevo, Alumno', '12121212'));
select pg_temp.chequeo('2. un usuario sin sesión (anon) no puede ejecutar la función',
  (select r->>'error' from llamadas where clave = 't2_anon') ilike '%permission denied%');

insert into llamadas values ('t2_inexistente',
  pg_temp.llamar('authenticated', 'b0000000-0000-0000-0000-000000000001',
                 '99999999-9999-9999-9999-999999999999', 'Nuevo, Alumno', '12121212'));
select pg_temp.chequeo('2. una materia que no existe se rechaza con el mismo mensaje',
  (select r->>'error' from llamadas where clave = 't2_inexistente') = 'La materia no existe en tus materias');

-- =====================================================================
-- Prueba 3. Formato: casos permitidos, prohibidos y límites
-- =====================================================================
-- Permitidos: 7 y 8 dígitos (también con ceros adelante)
insert into llamadas values ('t3_7',
  pg_temp.llamar('authenticated', 'b0000000-0000-0000-0000-000000000001',
                 'f0000000-0000-0000-0000-000000000001', 'Siete, Dígitos', '1234567'));
insert into llamadas values ('t3_8',
  pg_temp.llamar('authenticated', 'b0000000-0000-0000-0000-000000000001',
                 'f0000000-0000-0000-0000-000000000001', 'Ocho, Dígitos', '87654321'));
insert into llamadas values ('t3_ceros',
  pg_temp.llamar('authenticated', 'b0000000-0000-0000-0000-000000000001',
                 'f0000000-0000-0000-0000-000000000001', 'Ceros, Adelante', '01234567'));
select pg_temp.chequeo('3. DNI de 7 dígitos: se acepta',  (select r->>'ok' from llamadas where clave = 't3_7') = 'true');
select pg_temp.chequeo('3. DNI de 8 dígitos: se acepta',  (select r->>'ok' from llamadas where clave = 't3_8') = 'true');
select pg_temp.chequeo('3. DNI con ceros adelante: se acepta y conserva los ceros',
  (select r->>'ok' from llamadas where clave = 't3_ceros') = 'true'
  and exists (select 1 from public.personas p where p.dni = '01234567'));

-- Prohibidos: se rechazan y no dejan nada creado
create temp table conteo as
  select (select count(*) from public.personas) as personas,
         (select count(*) from public.inscripciones) as inscripciones;

insert into llamadas values ('t3_6',
  pg_temp.llamar('authenticated', 'b0000000-0000-0000-0000-000000000001',
                 'f0000000-0000-0000-0000-000000000001', 'Seis, Dígitos', '123456'));
insert into llamadas values ('t3_9',
  pg_temp.llamar('authenticated', 'b0000000-0000-0000-0000-000000000001',
                 'f0000000-0000-0000-0000-000000000001', 'Nueve, Dígitos', '123456789'));
insert into llamadas values ('t3_puntos',
  pg_temp.llamar('authenticated', 'b0000000-0000-0000-0000-000000000001',
                 'f0000000-0000-0000-0000-000000000001', 'Con, Puntos', '12.345.678'));
insert into llamadas values ('t3_letras',
  pg_temp.llamar('authenticated', 'b0000000-0000-0000-0000-000000000001',
                 'f0000000-0000-0000-0000-000000000001', 'Con, Letras', 'abc12345'));
insert into llamadas values ('t3_vacio',
  pg_temp.llamar('authenticated', 'b0000000-0000-0000-0000-000000000001',
                 'f0000000-0000-0000-0000-000000000001', 'Sin, Dni', ''));
insert into llamadas values ('t3_nulo',
  pg_temp.llamar('authenticated', 'b0000000-0000-0000-0000-000000000001',
                 'f0000000-0000-0000-0000-000000000001', 'Dni, Nulo', null));
insert into llamadas values ('t3_nombre_vacio',
  pg_temp.llamar('authenticated', 'b0000000-0000-0000-0000-000000000001',
                 'f0000000-0000-0000-0000-000000000001', '   ', '45454545'));
insert into llamadas values ('t3_nombre_nulo',
  pg_temp.llamar('authenticated', 'b0000000-0000-0000-0000-000000000001',
                 'f0000000-0000-0000-0000-000000000001', null, '45454545'));
insert into llamadas values ('t3_correo',
  pg_temp.llamar('authenticated', 'b0000000-0000-0000-0000-000000000001',
                 'f0000000-0000-0000-0000-000000000001', 'Correo, Malo', '45454545', 'sinarroba'));

select pg_temp.chequeo('3. DNI de 6 dígitos: se rechaza',  (select r->>'error' from llamadas where clave = 't3_6') like 'El DNI debe tener%');
select pg_temp.chequeo('3. DNI de 9 dígitos: se rechaza',  (select r->>'error' from llamadas where clave = 't3_9') like 'El DNI debe tener%');
select pg_temp.chequeo('3. DNI con puntos: se rechaza',     (select r->>'error' from llamadas where clave = 't3_puntos') like 'El DNI debe tener%');
select pg_temp.chequeo('3. DNI con letras: se rechaza',     (select r->>'error' from llamadas where clave = 't3_letras') like 'El DNI debe tener%');
select pg_temp.chequeo('3. DNI vacío: se rechaza',          (select r->>'error' from llamadas where clave = 't3_vacio') like 'El DNI debe tener%');
select pg_temp.chequeo('3. DNI nulo: se rechaza',           (select r->>'error' from llamadas where clave = 't3_nulo') like 'El DNI debe tener%');
select pg_temp.chequeo('3. nombre vacío: se rechaza',       (select r->>'error' from llamadas where clave = 't3_nombre_vacio') like 'El apellido y nombre%');
select pg_temp.chequeo('3. nombre nulo: se rechaza',        (select r->>'error' from llamadas where clave = 't3_nombre_nulo') like 'El apellido y nombre%');
select pg_temp.chequeo('3. correo sin arroba: se rechaza',  (select r->>'error' from llamadas where clave = 't3_correo') = 'El correo no es válido');

select pg_temp.chequeo('8. todo o nada: los rechazos de formato no dejaron personas ni inscripciones',
  (select count(*) from public.personas) = (select personas from conteo)
  and (select count(*) from public.inscripciones) = (select inscripciones from conteo));

-- =====================================================================
-- Prueba 4. DNI de un alumno que ya existe: se reutiliza sin pisar nombre ni correo
-- =====================================================================
insert into llamadas values ('t4',
  pg_temp.llamar('authenticated', 'b0000000-0000-0000-0000-000000000001',
                 'f0000000-0000-0000-0000-000000000001', 'Otro Nombre Distinto', ' 20111222 ', 'otro@prueba.test'));
select pg_temp.chequeo('4. DNI existente: la llamada sale bien e informa que NO se creó persona',
  (select r->>'ok' from llamadas where clave = 't4') = 'true'
  and (select r->>'creada' from llamadas where clave = 't4') = 'false');
select pg_temp.chequeo('4. DNI existente: reutiliza a la misma persona',
  (select (r->>'alumno')::uuid from llamadas where clave = 't4') = 'c0000000-0000-0000-0000-000000000003');
select pg_temp.chequeo('4. DNI existente: NO pisa el nombre ni el correo',
  exists (select 1 from public.personas p
          where p.id = 'c0000000-0000-0000-0000-000000000003'
            and p.apellido_nombre = 'Pérez, Ana' and p.email = 'ana@prueba.test'));
select pg_temp.chequeo('4. DNI existente: queda inscripto en la materia',
  exists (select 1 from public.inscripciones i
          where i.alumno_id = 'c0000000-0000-0000-0000-000000000003'
            and i.materia_id = 'f0000000-0000-0000-0000-000000000001'));
select pg_temp.chequeo('4. DNI existente: no se duplicó la persona',
  (select count(*) from public.personas p where p.dni = '20111222') = 1);

-- =====================================================================
-- Prueba 5. DNI de un profesor: se rechaza
-- =====================================================================
insert into llamadas values ('t5',
  pg_temp.llamar('authenticated', 'b0000000-0000-0000-0000-000000000001',
                 'f0000000-0000-0000-0000-000000000001', 'Falso, Alumno', '30111222'));
select pg_temp.chequeo('5. DNI de un profesor: se rechaza con el mensaje acordado',
  (select r->>'error' from llamadas where clave = 't5') = 'Ese DNI pertenece a un profesor');
select pg_temp.chequeo('5. DNI de un profesor: no se lo inscribe como alumno',
  not exists (select 1 from public.inscripciones i
              where i.alumno_id = 'c0000000-0000-0000-0000-000000000002'));

-- =====================================================================
-- Prueba 6. Materia inactiva o de ciclo cerrado: solo lectura
-- =====================================================================
insert into llamadas values ('t6_inactiva',
  pg_temp.llamar('authenticated', 'b0000000-0000-0000-0000-000000000001',
                 'f0000000-0000-0000-0000-000000000003', 'Solo, Lectura', '66666666'));
insert into llamadas values ('t6_cerrado',
  pg_temp.llamar('authenticated', 'b0000000-0000-0000-0000-000000000001',
                 'f0000000-0000-0000-0000-000000000004', 'Solo, Lectura', '66666666'));
select pg_temp.chequeo('6. materia inactiva: se rechaza como solo lectura',
  (select r->>'error' from llamadas where clave = 't6_inactiva') like '%solo lectura%');
select pg_temp.chequeo('6. materia de ciclo cerrado: se rechaza como solo lectura',
  (select r->>'error' from llamadas where clave = 't6_cerrado') like '%solo lectura%');
select pg_temp.chequeo('8. todo o nada: el rechazo por solo lectura no dejó persona creada',
  not exists (select 1 from public.personas p where p.dni = '66666666'));

-- =====================================================================
-- Prueba 7 (parte 2). Ya inscripto, y ya inscripto pero de baja
-- =====================================================================
insert into llamadas values ('t7_repite',
  pg_temp.llamar('authenticated', 'b0000000-0000-0000-0000-000000000001',
                 'f0000000-0000-0000-0000-000000000001', 'Gómez, Luis', '12345678'));
select pg_temp.chequeo('6b. ya inscripto: se rechaza con mensaje claro',
  (select r->>'error' from llamadas where clave = 't7_repite') = 'El alumno ya está inscripto en esta materia');
select pg_temp.chequeo('6b. ya inscripto: no se duplicó la inscripción',
  (select count(*) from public.inscripciones i
   where i.materia_id = 'f0000000-0000-0000-0000-000000000001'
     and i.alumno_id = (select (r->>'alumno')::uuid from llamadas where clave = 't1')) = 1);

-- Se da de baja (como administrador de la base, solo para armar el caso)
update public.inscripciones
   set fecha_baja = current_date
 where id = (select (r->>'inscripcion')::uuid from llamadas where clave = 't1');

insert into llamadas values ('t7_baja',
  pg_temp.llamar('authenticated', 'b0000000-0000-0000-0000-000000000001',
                 'f0000000-0000-0000-0000-000000000001', 'Gómez, Luis', '12345678'));
select pg_temp.chequeo('6b. ya inscripto pero de baja: el mensaje sugiere revertir la baja',
  (select r->>'error' from llamadas where clave = 't7_baja') like '%de baja%Revertir baja%');

-- =====================================================================
-- Prueba 9. El DNI repetido en OTRA institución no se reutiliza
-- =====================================================================
insert into llamadas values ('t9',
  pg_temp.llamar('authenticated', 'b0000000-0000-0000-0000-000000000001',
                 'f0000000-0000-0000-0000-000000000001', 'Alumno, Misma Cifra', '55555555'));
select pg_temp.chequeo('9. mismo DNI en otra institución: crea una persona nueva en la propia',
  (select r->>'creada' from llamadas where clave = 't9') = 'true'
  and (select (r->>'alumno')::uuid from llamadas where clave = 't9') <> 'c0000000-0000-0000-0000-000000000004'
  and (select count(*) from public.personas p where p.dni = '55555555') = 2);

-- ---------- Resultado ----------
select count(*) filter (where ok)     as pasaron,
       count(*) filter (where not ok) as fallaron,
       count(*)                       as total
from resultados;

select n, prueba as "fallo" from resultados where not ok order by n;

rollback;
