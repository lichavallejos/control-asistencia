// Sesión REAL con Supabase Auth.

import { crearClienteNavegador } from "./supabase/client";

const CLAVE_CACHE = "isfd_perfil";

export type Usuario = { nombre: string; email: string };

function guardarPerfil(perfil: Usuario) {
  sessionStorage.setItem(CLAVE_CACHE, JSON.stringify(perfil));
}

function leerPerfil(): Usuario | null {
  try {
    const datos = sessionStorage.getItem(CLAVE_CACHE);
    return datos ? (JSON.parse(datos) as Usuario) : null;
  } catch {
    return null;
  }
}

// Busca la ficha del profesor en la tabla "personas" (la protegen las políticas RLS)
async function cargarPerfil(userId: string, emailSesion: string): Promise<Usuario | null> {
  const { data, error } = await crearClienteNavegador()
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
export function obtenerUsuario(): Usuario | null {
  return leerPerfil();
}

// Verifica con Supabase que la sesión siga vigente y recupera el perfil si hace falta.
export async function restaurarUsuario(): Promise<Usuario | null> {
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

// ---------- Recuperar contraseña ----------

export type ResultadoSimple = { ok: true } | { ok: false; error: string };

// Pide a Supabase que mande el correo con el enlace de recuperación.
// El enlace vuelve a esta misma app, a la página /nueva-clave.
export async function pedirEnlaceRecuperacion(
  email: string
): Promise<ResultadoSimple> {
  const correo = email.trim();
  if (!correo || !correo.includes("@")) {
    return { ok: false, error: "Escribí un correo válido." };
  }

  const { error } = await crearClienteNavegador().auth.resetPasswordForEmail(
    correo,
    { redirectTo: `${window.location.origin}/nueva-clave` }
  );
  if (error) {
    console.error(error);
    return {
      ok: false,
      error: "No se pudo enviar el correo. Probá de nuevo en unos minutos.",
    };
  }
  return { ok: true };
}

// Indica si la página se abrió con un enlace de recuperación válido
// (o con una sesión vigente). Espera a que Supabase termine de leer el enlace.
export async function hayEnlaceDeRecuperacion(): Promise<boolean> {
  const { data } = await crearClienteNavegador().auth.getSession();
  return !!data.session;
}

// Guarda la contraseña nueva y cierra la sesión de recuperación,
// para que se entre de nuevo por el login normal.
export async function guardarClaveNueva(
  password: string
): Promise<ResultadoSimple> {
  if (password.length < 8) {
    return {
      ok: false,
      error: "La contraseña debe tener al menos 8 caracteres.",
    };
  }

  const supabase = crearClienteNavegador();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error(error);
    return {
      ok: false,
      error:
        "No se pudo cambiar la contraseña. Pedí un enlace nuevo e intentá de nuevo.",
    };
  }

  await supabase.auth.signOut();
  sessionStorage.removeItem(CLAVE_CACHE);
  return { ok: true };
}