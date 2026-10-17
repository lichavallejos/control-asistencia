"use client";

import { useState } from "react";
import { obtenerUsuario } from "@/lib/sesion";
import type { Curso } from "@/lib/datos-demo";
import { obtenerAlumnos, obtenerMisCursos } from "@/lib/datos-local";
import {
  eliminarPlanilla,
  guardarPlanilla,
  obtenerPlanilla,
  obtenerPlanillas,
  type RegistroAlumno,
} from "@/lib/asistencias-demo";

const ANIOS = [1, 2, 3, 4];

type Registros = Record<number, RegistroAlumno>;

function hoy() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

// Arma el estado de cada alumno: usa la planilla guardada si existe,
// y si no, todos presentes (igual que en el HTML original).
function armarRegistros(cursoId: number, fecha: string): Registros {
  const planilla = obtenerPlanilla(cursoId, fecha);
  const resultado: Registros = {};
  obtenerAlumnos()
    .filter((a) => a.cursoId === cursoId)
    .forEach((a) => {
      const guardado = planilla?.registros.find((r) => r.alumnoId === a.id);
      resultado[a.id] = {
        alumnoId: a.id,
        estado: guardado?.estado ?? "presente",
        motivo: guardado?.motivo || "injustificada",
        observacion: guardado?.observacion ?? "",
      };
    });
  return resultado;
}

export default function AsistenciasPage() {
  const [usuario] = useState(() => obtenerUsuario());
  const [curso, setCurso] = useState<Curso | null>(null);
  const [fecha, setFecha] = useState("");
  const [filtro, setFiltro] = useState("");
  const [registros, setRegistros] = useState<Registros>({});
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const [planillas, setPlanillas] = useState(() => obtenerPlanillas());

  if (!usuario) return null;

  const misCursos = obtenerMisCursos(usuario);

  function abrirCurso(c: Curso) {
    const f = hoy();
    setCurso(c);
    setFecha(f);
    setFiltro("");
    setHistorialAbierto(false);
    setRegistros(armarRegistros(c.id, f));
  }

  function cambiarFecha(f: string) {
    setFecha(f);
    if (curso && f) setRegistros(armarRegistros(curso.id, f));
  }

  function setEstado(id: number, estado: "presente" | "ausente") {
    setRegistros((prev) => ({ ...prev, [id]: { ...prev[id], estado } }));
  }

  function setMotivo(id: number, motivo: string) {
    setRegistros((prev) => ({ ...prev, [id]: { ...prev[id], motivo } }));
  }

  function setObservacion(id: number, observacion: string) {
    setRegistros((prev) => ({ ...prev, [id]: { ...prev[id], observacion } }));
  }

  function marcarTodos(estado: "presente" | "ausente") {
    setRegistros((prev) => {
      const nuevo: Registros = {};
      Object.values(prev).forEach((r) => {
        nuevo[r.alumnoId] = { ...r, estado };
      });
      return nuevo;
    });
  }

  function guardar() {
    if (!curso) return;
    if (!fecha) {
      alert("Selecciona una fecha válida.");
      return;
    }
    guardarPlanilla({
      cursoId: curso.id,
      fecha,
      registros: Object.values(registros).map((r) => ({
        ...r,
        motivo: r.estado === "ausente" ? r.motivo : "",
      })),
    });
    setPlanillas(obtenerPlanillas());
    alert("✅ Planilla de asistencia guardada correctamente.");
  }

  function eliminarFecha(f: string) {
    if (!curso) return;
    if (confirm(`¿Eliminar la asistencia del día ${f}?`)) {
      eliminarPlanilla(curso.id, f);
      setPlanillas(obtenerPlanillas());
      if (f === fecha) setRegistros(armarRegistros(curso.id, fecha));
    }
  }

  function cargarFecha(f: string) {
    cambiarFecha(f);
    setHistorialAbierto(false);
  }

  const alumnosCurso = curso
    ? obtenerAlumnos().filter(
        (a) =>
          a.cursoId === curso.id &&
          a.nombre.toLowerCase().includes(filtro.toLowerCase())
      )
    : [];

  const historialCurso = curso
    ? planillas
        .filter((p) => p.cursoId === curso.id)
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
    : [];

  return (
    <section className="seccion active">
      <div className="section__header">
        <h2 className="section__title">Tomar asistencia</h2>
        <div className="section__line"></div>
      </div>

      {!curso && (
        <div className="card">
          <div className="card-title">Selecciona una Materia</div>
          <div>
            {misCursos.length === 0 && (
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                No tienes materias asignadas.
              </p>
            )}
            {ANIOS.map((anio) => {
              const cursosAnio = misCursos.filter((c) => (c.anio || 1) === anio);
              if (cursosAnio.length === 0) return null;
              return (
                <div key={anio}>
                  <div className="grupo-anio-header">🎓 {anio}.º Año</div>
                  {cursosAnio.map((c) => (
                    <button
                      key={c.id}
                      className="btn btn-outline course-btn"
                      onClick={() => abrirCurso(c)}
                    >
                      <span>📚 {c.nombre}</span>
                      <span>➔</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {curso && (
        <div className="card">
          <div className="card-title">
            <div>
              <span>{curso.nombre}</span>
              <span className="badge badge-anio" style={{ marginLeft: "6px" }}>
                {curso.anio}.º Año
              </span>
            </div>
            <button
              onClick={() => setHistorialAbierto(!historialAbierto)}
              className="btn btn-outline btn-sm"
            >
              Historial
            </button>
          </div>

          {historialAbierto && (
            <div
              style={{
                background: "var(--primary-light)",
                padding: "12px",
                borderRadius: "8px",
                marginBottom: "14px",
              }}
            >
              <strong style={{ fontSize: "0.85rem", color: "var(--primary)" }}>
                Clases Registradas Anteriores:
              </strong>
              <div>
                {historialCurso.length === 0 && (
                  <p
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--text-muted)",
                      marginTop: "4px",
                    }}
                  >
                    No hay clases tomadas aún.
                  </p>
                )}
                {historialCurso.map((h) => (
                  <div className="historial-item" key={h.fecha}>
                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                      📅 {h.fecha}
                    </span>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        onClick={() => cargarFecha(h.fecha)}
                        className="btn btn-primary btn-sm"
                      >
                        Cargar
                      </button>
                      <button
                        onClick={() => eliminarFecha(h.fecha)}
                        className="btn btn-outline btn-sm"
                        style={{ color: "var(--danger)" }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="fecha-asistencia">Fecha de la Clase</label>
            <input
              type="date"
              id="fecha-asistencia"
              value={fecha}
              onChange={(e) => cambiarFecha(e.target.value)}
            />
          </div>

          <div className="quick-actions">
            <button
              onClick={() => marcarTodos("presente")}
              className="btn btn-outline btn-sm"
              style={{
                flex: 1,
                color: "var(--primary-dark)",
                borderColor: "var(--success)",
              }}
            >
              🟢 Todos Presentes
            </button>
            <button
              onClick={() => marcarTodos("ausente")}
              className="btn btn-outline btn-sm"
              style={{ flex: 1, color: "#c0392b", borderColor: "var(--danger)" }}
            >
              🔴 Todos Ausentes
            </button>
          </div>

          <div className="form-group">
            <input
              type="text"
              placeholder="Buscar alumno..."
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
            />
          </div>

          <div>
            {alumnosCurso.length === 0 && (
              <p
                style={{
                  fontSize: "0.85rem",
                  color: "var(--text-muted)",
                  padding: "12px 0",
                }}
              >
                No hay alumnos para mostrar.
              </p>
            )}
            {alumnosCurso.map((a) => {
              const reg = registros[a.id];
              if (!reg) return null;
              const esPresente = reg.estado === "presente";
              return (
                <div
                  className="alumno-card"
                  key={a.id}
                  data-estado={reg.estado}
                >
                  <div className="alumno-info">
                    <span className="alumno-nombre">{a.nombre}</span>
                    <span className="badge badge-success">
                      DNI {a.dni || "S/D"}
                    </span>
                  </div>

                  <div className="btn-toggle-container">
                    <button
                      type="button"
                      className={`btn-estado btn-estado-presente ${esPresente ? "active" : ""}`}
                      onClick={() => setEstado(a.id, "presente")}
                    >
                      ➕ Presente
                    </button>
                    <button
                      type="button"
                      className={`btn-estado btn-estado-ausente ${!esPresente ? "active" : ""}`}
                      onClick={() => setEstado(a.id, "ausente")}
                    >
                      ✖ Ausente
                    </button>
                  </div>

                  {!esPresente && (
                    <select
                      value={reg.motivo}
                      onChange={(e) => setMotivo(a.id, e.target.value)}
                      style={{ borderColor: "var(--danger)", marginTop: "4px" }}
                    >
                      <option value="injustificada">Ausencia Injustificada</option>
                      <option value="justificada">Ausencia Justificada</option>
                    </select>
                  )}

                  <input
                    type="text"
                    value={reg.observacion}
                    onChange={(e) => setObservacion(a.id, e.target.value)}
                    placeholder="💬 Nota u observación rápida (opcional)..."
                    style={{ fontSize: "0.8rem", height: "34px" }}
                  />
                </div>
              );
            })}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              marginTop: "16px",
            }}
          >
            <button onClick={guardar} className="btn btn-success">
              Guardar Planilla del Día
            </button>
            {/* Provisorio: abre el diálogo de impresión. El PDF real va en el paso 18 */}
            <button onClick={() => window.print()} className="btn btn-primary">
              Imprimir / Guardar PDF
            </button>
            <button onClick={() => setCurso(null)} className="btn btn-outline">
              Volver a Selección
            </button>
          </div>
        </div>
      )}
    </section>
  );
}