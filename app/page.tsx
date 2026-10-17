"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { iniciarSesion } from "@/lib/sesion";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function manejarEnvio(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    const email = String(datos.get("username") ?? "").trim();
    const password = String(datos.get("password") ?? "");

    setError("");
    setEnviando(true);
    try {
      const resultado = await iniciarSesion(email, password);
      if (resultado.ok) {
        router.push("/dashboard");
      } else {
        setError(resultado.error);
      }
      } catch (e) {
      console.error("Error al iniciar sesión:", e);
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
            <form onSubmit={manejarEnvio}>
              <label htmlFor="username">Correo electrónico</label>
              <input
                type="text"
                id="username"
                name="username"
                inputMode="email"
                placeholder="Ingrese su correo"
                autoComplete="username"
                required
              />

              <label htmlFor="password">Contraseña</label>
              <input
                type="password"
                id="password"
                name="password"
                placeholder="Ingrese su contraseña"
                autoComplete="current-password"
                required
              />

              <input
                type="submit"
                className="btn"
                value={enviando ? "Ingresando..." : "Enviar"}
                disabled={enviando}
              />
              <div className="separador">
                <span></span>
                <p>o</p>
                <span></span>
              </div>
              <p id="login-error" className="error-msg">{error}</p>
            </form>
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