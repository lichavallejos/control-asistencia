"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { iniciarSesion } from "@/lib/sesion";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  function manejarEnvio(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    const usuario = String(datos.get("username") ?? "").trim();
    const password = String(datos.get("password") ?? "").trim();

    const profe = iniciarSesion(usuario, password);
    if (profe) {
      router.push("/dashboard");
    } else {
      setError("Usuario o contraseña incorrectos.");
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
              <label htmlFor="username">Usuario</label>
              <input
                type="text"
                id="username"
                name="username"
                placeholder="Ingrese su usuario"
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

              <input type="submit" className="btn" value="Enviar" />
              <div className="separador">
                <span></span>
                <p>o</p>
                <span></span>
              </div>
              <p id="login-error" className="error-msg">{error}</p>
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  textAlign: "center",
                }}
              >
                Credenciales demo: <strong>profe_inicial</strong> / <strong>123</strong>
              </p>
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