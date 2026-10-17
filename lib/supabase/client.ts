import { createBrowserClient } from "@supabase/ssr";

// Cliente de Supabase para usar en el navegador.
// Usa solo la clave pública (publishable): la seguridad real la dan las políticas RLS.
export function crearClienteNavegador() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_KEY;

  if (!url || !clave) {
    throw new Error(
      "Faltan las variables NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_KEY en .env.local"
    );
  }

  return createBrowserClient(url, clave);
}
