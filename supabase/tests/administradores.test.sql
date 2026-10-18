-- =====================================================================
-- Prueba de 0003_administradores.sql  (SOLO para correr en un PostgreSQL
-- local con 0001, 0002 y 0003 aplicadas. NO correr en Supabase.)
-- Todo ocurre dentro de una transacción que se deshace al final.
-- =====================================================================
\set ON_ERROR_STOP on
begin;

-- ---- Datos de prueba (como superusuario) ----
insert into public.instituciones (id, nombre)
  values ('00000000-0000-0000-0000-0000000000a1', 'ISFD de prueba');
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@prueba.test'),
  ('22222222-2222-2222-2222-222222222222', 'docente@prueba.test');
insert into public.personas (id, institucion_id, user_id, tipo, apellido_nombre) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a1',
   '11111111-1111-1111-1111-111111111111', 'profesor', 'Admin, Ana'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-0000000000a1',
   '22222222-2222-2222-2222-222222222222', 'profesor', 'Docente, Beto');
insert into public.administradores (persona_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- ---- 1) anon no accede a nada ----
set local role anon;
do $$ begin
  begin perform 1 from public.administradores;
    raise exception 'FALLO 1a: anon pudo leer administradores';
  exception when insufficient_privilege then null; end;
  begin perform private.soy_admin();
    raise exception 'FALLO 1b: anon pudo ejecutar soy_admin()';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---- 2) docente común: no ve administradores y no es admin ----
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$ begin
  if (select count(*) from public.administradores) <> 0 then
    raise exception 'FALLO 2a: el docente ve filas de administradores'; end if;
  if private.soy_admin() then
    raise exception 'FALLO 2b: el docente figura como admin'; end if;
  begin
    insert into public.administradores (persona_id) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    raise exception 'FALLO 2c: el docente pudo hacerse admin';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---- 3) administradora: ve solo su fila, es admin, pero no puede cambiar nada ----
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
do $$ begin
  if (select count(*) from public.administradores) <> 1 then
    raise exception 'FALLO 3a: la admin deberia ver exactamente 1 fila'; end if;
  if not private.soy_admin() then
    raise exception 'FALLO 3b: la admin no figura como admin'; end if;
  begin
    insert into public.administradores (persona_id) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    raise exception 'FALLO 3c: la admin pudo agregar otro admin desde la app';
  exception when insufficient_privilege then null; end;
  begin
    update public.administradores set creado_en = now();
    raise exception 'FALLO 3d: la admin pudo modificar administradores';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.administradores;
    raise exception 'FALLO 3e: la admin pudo borrar administradores';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---- 4) lo que ya funcionaba sigue igual (crear_materia y ver solo lo mio) ----
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
declare v uuid;
begin
  v := public.crear_materia('Materia de prueba', 1::smallint);
  if (select count(*) from public.materias) <> 1 then
    raise exception 'FALLO 4a: el docente deberia ver solo su materia'; end if;
end $$;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
do $$ begin
  if (select count(*) from public.materias) <> 0 then
    raise exception 'FALLO 4b: ser admin NO deberia dar acceso a materias ajenas todavia'; end if;
end $$;
reset role;

-- ---- 5) si se borra la persona, se va su permiso ----
delete from public.personas where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
do $$ begin
  if (select count(*) from public.administradores) <> 0 then
    raise exception 'FALLO 5: quedo un administrador huerfano'; end if;
end $$;

select 'TODAS LAS PRUEBAS PASARON' as resultado;
rollback;