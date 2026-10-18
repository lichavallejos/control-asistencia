"use client";

import { useState } from "react";
import Link from "next/link";
import { pedirEnlaceRecuperacion } from "@/lib/sesion";

export default function RecuperarPage() {
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function manejarEnvio(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    const email = String(datos.get("email") ?? "").trim();

    setError("");
    setAviso("");
    setEnviando(true);
    try {
      const resultado = await pedirEnlaceRecuperacion(email);
      if (resultado.ok) {
        setAviso(
          "Si el correo está registrado, te va a llegar un enlace para elegir una contraseña nueva. Revisá también la carpeta de spam."
        );
      } else {
        setError(resultado.error);
      }
    } catch (e) {
      console.error("Error al pedir el enlace:", e);
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
              <label htmlFor="email">Correo electrónico</label>
              <input
                type="text"
                id="email"
                name="email"
                inputMode="email"
                placeholder="Ingrese su correo"
                autoComplete="username"
                required
              />

              <input
                type="submit"
                className="btn"
                value={enviando ? "Enviando..." : "Enviar enlace"}
                disabled={enviando}
              />
              <div className="separador">
                <span></span>
                <p>o</p>
                <span></span>
              </div>
              <p id="login-error" className="error-msg">
                {error}
              </p>
              {aviso && <p style={{ marginTop: "12px" }}>{aviso}</p>}
             
              <Link href="/" className="enlace-form">
                ← Volver al inicio de sesión
              </Link>

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