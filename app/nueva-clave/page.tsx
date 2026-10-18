"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { guardarClaveNueva, hayEnlaceDeRecuperacion } from "@/lib/sesion";

type Estado = "verificando" | "listo" | "invalido" | "terminado";

export default function NuevaClavePage() {
  const [estado, setEstado] = useState<Estado>("verificando");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    hayEnlaceDeRecuperacion()
      .then((hay) => setEstado(hay ? "listo" : "invalido"))
      .catch(() => setEstado("invalido"));
  }, []);

  async function manejarEnvio(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    const clave = String(datos.get("password") ?? "");
    const repetida = String(datos.get("password2") ?? "");

    if (clave !== repetida) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setError("");
    setEnviando(true);
    try {
      const resultado = await guardarClaveNueva(clave);
      if (resultado.ok) {
        setEstado("terminado");
      } else {
        setError(resultado.error);
      }
    } catch (e) {
      console.error("Error al guardar la clave:", e);
      setError("No se pudo conectar. Revisá tu conexión e intentá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div id="login-view" className="view active">
      <div className="wrapper">
        <div className="content">
          <div className="imagen">
            <img src="/imagen/40aniversarioblanco.png" alt="logo" />
            <label htmlFor="ISFD">ISFD Mercedes</label>
          </div>

          <div className="Formulario">
            {estado === "verificando" && <p>Verificando el enlace...</p>}

            {estado === "invalido" && (
              <>
                <p>
                  El enlace no es válido o ya venció. Pedí uno nuevo e intentá
                  abrirlo en el mismo navegador desde el que lo pediste.
                </p>
                <Link href="/recuperar" className="enlace-form">
                ← Pedir un enlace nuevo
                </Link>
              </>
            )}

            {estado === "terminado" && (
              <>
                <p>Listo, tu contraseña se cambió correctamente.</p>
                <p style={{ marginTop: "12px" }}>
                  <Link href="/" className="enlace-form"> ← Ir al inicio de sesión</Link>
                </p>
              </>
            )}

            {estado === "listo" && (
              <form onSubmit={manejarEnvio}>
                <label htmlFor="password">Contraseña nueva</label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  placeholder="Mínimo 8 caracteres"
                  autoComplete="new-password"
                  required
                />

                <label htmlFor="password2">Repetir contraseña</label>
                <input
                  type="password"
                  id="password2"
                  name="password2"
                  placeholder="Repetí la contraseña"
                  autoComplete="new-password"
                  required
                />

                <input
                  type="submit"
                  className="btn"
                  value={enviando ? "Guardando..." : "Guardar contraseña"}
                  disabled={enviando}
                />
                <p id="login-error" className="error-msg">
                  {error}
                </p>
              </form>
            )}
          </div>
        </div>

        <div className="content2">
          <div className="lado-imagen">
            <img
              src="/imagen/Nuestroinstituto.png"
              alt="logoderecha"
              className="imgderecha"
            />
          </div>
        </div>
      </div>
    </div>
  );
}