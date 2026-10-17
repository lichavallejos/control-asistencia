"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cerrarSesion, obtenerUsuario } from "@/lib/sesion";
import { obtenerMisCursos } from "@/lib/datos-local";

export default function UsuarioPage() {
  const router = useRouter();
  const [usuario] = useState(() => obtenerUsuario());

  if (!usuario) return null;

  const materias = obtenerMisCursos(usuario)
    .map((c) => `${c.nombre} (${c.anio || 1}.º Año)`)
    .join(", ");

  async function salir() {
    await cerrarSesion();
    router.push("/");
  }

  return (
    <section className="seccion active">
      <div className="section__header">
        <h2 className="section__title">Mi perfil</h2>
        <div className="section__line"></div>
      </div>

      <div className="card">
        <div className="card-title">Perfil Docente</div>
        <div>
          <p style={{ marginBottom: "8px" }}>
            <strong>Nombre:</strong> {usuario.nombre}
          </p>
          <p style={{ marginBottom: "8px" }}>
            <strong>Usuario:</strong> {usuario.usuario}
          </p>
          <p style={{ fontSize: "0.88rem", color: "var(--text-muted)" }}>
            <strong>Materias:</strong> {materias}
          </p>
        </div>
        <button
          onClick={salir}
          className="btn btn-danger"
          style={{ marginTop: "20px" }}
        >
          Cerrar Sesión
        </button>
      </div>
    </section>
  );
}