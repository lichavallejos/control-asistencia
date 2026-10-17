// Sesión REAL con Supabase Auth.
// Las materias y alumnos siguen siendo de prueba hasta el paso 16.

import { crearClienteNavegador } from "./supabase/client";
import { profesores, type Profesor } from "./datos-demo";

const CLAVE_CACHE = "isfd_perfil";

type Perfil = { nombre: string; email: string };

function guardarPerfil(perfil: Perfil) {
  sessionStorage.setItem(CLAVE_CACHE, JSON.stringify(perfil));
}

function leerPerfil(): Perfil | null {
  try {
    const datos = sessionStorage.getItem(CLAVE_CACHE);
    return datos ? (JSON.parse(datos) as Perfil) : null;
  } catch {
    return null;
  }
}

// Busca la ficha del profesor en la tabla "personas" (la protegen las políticas RLS)
async function cargarPerfil(userId: string, emailSesion: string): Promise<Perfil | null> {
  const supabase = crearClienteNavegador();
  const { data, error } = await supabase
    .from("personas")
    .select("apellido_nombre, email")
    .eq("user_id", userId)
    .eq("tipo", "profesor")
    .maybeSingle();

  if (error || !data) return null;
  return { nombre: data.apellido_nombre, email: data.email ?? emailSesion };
}

export type ResultadoLogin = { ok: true } | { ok: false; error: string };

export async function iniciarSesion(
  email: string,
  password: string
): Promise<ResultadoLogin> {
  const supabase = crearClienteNavegador();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { ok: false, error: "Correo o contraseña incorrectos." };
  }

  const perfil = await cargarPerfil(data.user.id, email);
  if (!perfil) {
    await supabase.auth.signOut();
    return {
      ok: false,
      error: "Tu cuenta todavía no está habilitada como profesor.",
    };
  }

  guardarPerfil(perfil);
  return { ok: true };
}

// Datos del usuario para las pantallas (lectura inmediata desde el navegador)
export function obtenerUsuario(): Profesor | null {
  const perfil = leerPerfil();
  if (!perfil) return null;
  return { ...profesores[0], nombre: perfil.nombre, usuario: perfil.email };
}

// Verifica con Supabase que la sesión siga vigente y recupera el perfil si hace falta.
export async function restaurarUsuario(): Promise<Profesor | null> {
  const supabase = crearClienteNavegador();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    sessionStorage.removeItem(CLAVE_CACHE);
    return null;
  }

  if (!leerPerfil()) {
    const perfil = await cargarPerfil(data.user.id, data.user.email ?? "");
    if (!perfil) {
      await supabase.auth.signOut();
      return null;
    }
    guardarPerfil(perfil);
  }
  return obtenerUsuario();
}

export async function cerrarSesion() {
  const supabase = crearClienteNavegador();
  await supabase.auth.signOut();
  sessionStorage.removeItem(CLAVE_CACHE);
}