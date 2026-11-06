"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cerrarSesion, esAdministrador, obtenerUsuario } from "@/lib/sesion";
import { obtenerMisMaterias, type MateriaPropia } from "@/lib/datos";
import { agruparPorCarreraYAnio, detalleMateria } from "@/lib/materias";
import { generarRespaldo } from "@/lib/respaldo";

// Texto de cada materia: nombre + cuatrimestre y ciclo (+ inactiva)
function textoMateria(m: MateriaPropia): string {
  const extra = !m.activo ? "inactiva · solo lectura" : "";
  return [m.nombre, detalleMateria(m), extra].filter(Boolean).join(" · ");
}

export default function UsuarioPage() {
  const router = useRouter();
  const [usuario] = useState(() => obtenerUsuario());
  const [materias, setMaterias] = useState<MateriaPropia[] | null>(null);
  const [descargando, setDescargando] = useState(false);
  const [mensajeRespaldo, setMensajeRespaldo] = useState("");
  const [esAdmin, setEsAdmin] = useState(false);
  useEffect(() => {
    obtenerMisMaterias()
      .then(setMaterias)
      .catch(() => setMaterias([]));
      esAdministrador().then(setEsAdmin);
  }, []);

  if (!usuario) return null;

  const grupos = agruparPorCarreraYAnio(materias ?? []);

  async function salir() {
    await cerrarSesion();
    router.push("/");
  }
  async function descargarRespaldo() {
      setDescargando(true);
      setMensajeRespaldo("");
      try {
        const respaldo = await generarRespaldo();
        const contenido = JSON.stringify(respaldo, null, 2);
        const blob = new Blob([contenido], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement("a");
        const fecha = new Date().toLocaleDateString("en-CA");
        enlace.href = url;
        enlace.download = `copia-asistencia-${fecha}.json`;
        document.body.appendChild(enlace);
        enlace.click();
        enlace.remove();
        URL.revokeObjectURL(url);

        const t = respaldo.totales;
        setMensajeRespaldo(
          `Copia descargada: ${t.materias} materias, ${t.alumnos} inscripciones, ${t.clases} clases, ${t.asistencias} asistencias.`
        );
      } catch (e) {
        console.error(e);
        setMensajeRespaldo(
          e instanceof Error ? e.message : "No se pudo generar la copia."
        );
      } finally {
        setDescargando(false);
      }
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
                    {esAdmin && (
            <p style={{ marginBottom: "8px" }}>
              <strong>Rol:</strong> Administrador
            </p>
          )}
          <div style={{ fontSize: "0.88rem", color: "var(--text-muted)" }}>
            <strong>Materias:</strong>
            {materias === null && " Cargando..."}
            {materias !== null && materias.length === 0 && " Todavía no tenés materias."}
            {grupos.map((g) => (
              <div key={g.etiqueta} style={{ marginTop: "8px" }}>
                <div style={{ fontWeight: 600 }}>🎓 {g.etiqueta}</div>
                <ul style={{ margin: "4px 0 0 18px", padding: 0 }}>
                  {g.materias.map((m) => (
                    <li key={m.id}>{textoMateria(m)}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <button
          onClick={salir}
          className="btn btn-danger"
          style={{ marginTop: "20px" }}
        >
          Cerrar Sesión
        </button>
      </div>
      <div className="card" style={{ marginTop: "16px" }}>
        <div className="card-title">Copia de seguridad</div>
        <p
          style={{
            fontSize: "0.88rem",
            color: "var(--text-muted)",
            marginBottom: "12px",
          }}
        >
          Descarga un archivo con tus materias, alumnos, clases y asistencias.
        </p>
        <button
          onClick={descargarRespaldo}
          className="btn"
          disabled={descargando}
        >
          {descargando ? "Preparando..." : "Descargar copia (JSON)"}
        </button>
        {mensajeRespaldo && (
          <p style={{ marginTop: "12px", fontSize: "0.88rem" }}>
            {mensajeRespaldo}
          </p>
        )}
      </div>
    </section>
  );
}