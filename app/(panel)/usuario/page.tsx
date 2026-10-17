"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cerrarSesion, obtenerUsuario } from "@/lib/sesion";
import { obtenerMisMaterias, type Materia } from "@/lib/datos";

export default function UsuarioPage() {
  const router = useRouter();
  const [usuario] = useState(() => obtenerUsuario());
  const [materias, setMaterias] = useState<Materia[] | null>(null);

  useEffect(() => {
    obtenerMisMaterias()
      .then(setMaterias)
      .catch(() => setMaterias([]));
  }, []);

  if (!usuario) return null;

  const textoMaterias =
    materias === null
      ? "Cargando..."
      : materias.length === 0
        ? "Todavía no tenés materias."
        : materias.map((m) => `${m.nombre} (${m.anio}.º Año)`).join(", ");

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
            <strong>Correo:</strong> {usuario.email}
          </p>
          <p style={{ fontSize: "0.88rem", color: "var(--text-muted)" }}>
            <strong>Materias:</strong> {textoMaterias}
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