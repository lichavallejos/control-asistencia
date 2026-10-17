// Sesión TEMPORAL para probar el diseño. Se reemplaza por Supabase Auth.
import { profesores, type Profesor } from "./datos-demo";

const CLAVE = "isfd_usuario_id";

export function iniciarSesion(usuario: string, password: string): Profesor | null {
  const profe = profesores.find(
    (p) => p.usuario === usuario && p.password === password
  );
  if (!profe) return null;
  sessionStorage.setItem(CLAVE, String(profe.id));
  return profe;
}

export function obtenerUsuario(): Profesor | null {
  const id = sessionStorage.getItem(CLAVE);
  if (!id) return null;
  return profesores.find((p) => p.id === Number(id)) ?? null;
}

export function cerrarSesion() {
  sessionStorage.removeItem(CLAVE);
}
