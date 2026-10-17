"use client";

import { useEffect, useState } from "react";
import {
  obtenerAlumnosDeMateria,
  obtenerMisMaterias,
  type AlumnoDeMateria,
  type Materia,
} from "@/lib/datos";
import {
  eliminarPlanilla,
  guardarPlanilla,
  obtenerPlanilla,
  obtenerPlanillas,
  type RegistroAlumno,
} from "@/lib/asistencias-demo";

const ANIOS = [1, 2, 3, 4];

type Registros = Record<string, RegistroAlumno>;

function hoy() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

// Usa la planilla guardada si existe; si no, todos presentes (como en el HTML original)
function armarRegistros(
  materiaId: string,
  fecha: string,
  alumnos: AlumnoDeMateria[]
): Registros {
  const planilla = obtenerPlanilla(materiaId, fecha);
  const resultado: Registros = {};
  alumnos.forEach((a) => {
    const guardado = planilla?.registros.find((r) => r.alumnoId === a.personaId);
    resultado[a.personaId] = {
      alumnoId: a.personaId,
      estado: guardado?.estado ?? "presente",
      motivo: guardado?.motivo || "injustificada",
      observacion: guardado?.observacion ?? "",
    };
  });
  return resultado;
}

export default function AsistenciasPage() {
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [materia, setMateria] = useState<Materia | null>(null);
  const [alumnos, setAlumnos] = useState<AlumnoDeMateria[]>([]);
  const [fecha, setFecha] = useState("");
  const [filtro, setFiltro] = useState("");
  const [registros, setRegistros] = useState<Registros>({});
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const [planillas, setPlanillas] = useState(() => obtenerPlanillas());

  useEffect(() => {
    let activo = true;
    obtenerMisMaterias()
      .then((lista) => {
        if (!activo) return;
        setMaterias(lista);
        setCargando(false);
      })
      .catch((e: Error) => {
        if (!activo) return;
        setError(e.message);
        setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, []);

  async function abrirMateria(m: Materia) {
    try {
      const lista = await obtenerAlumnosDeMateria(m.id);
      const f = hoy();
      setAlumnos(lista);
      setMateria(m);
      setFecha(f);
      setFiltro("");
      setHistorialAbierto(false);
      setRegistros(armarRegistros(m.id, f, lista));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  function cambiarFecha(f: string) {
    setFecha(f);
    if (materia && f) setRegistros(armarRegistros(materia.id, f, alumnos));
  }

  function setEstado(id: string, estado: "presente" | "ausente") {
    setRegistros((prev) => ({ ...prev, [id]: { ...prev[id], estado } }));
  }

  function setMotivo(id: string, motivo: string) {
    setRegistros((prev) => ({ ...prev, [id]: { ...prev[id], motivo } }));
  }

  function setObservacion(id: string, observacion: string) {
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
    if (!materia) return;
    if (!fecha) {
      alert("Selecciona una fecha válida.");
      return;
    }
    guardarPlanilla({
      materiaId: materia.id,
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
    if (!materia) return;
    if (confirm(`¿Eliminar la asistencia del día ${f}?`)) {
      eliminarPlanilla(materia.id, f);
      setPlanillas(obtenerPlanillas());
      if (f === fecha) setRegistros(armarRegistros(materia.id, fecha, alumnos));
    }
  }

  function cargarFecha(f: string) {
    cambiarFecha(f);
    setHistorialAbierto(false);
  }

  const textoFiltro = filtro.toLowerCase();
  const alumnosFiltrados = alumnos.filter((a) =>
    a.nombre.toLowerCase().includes(textoFiltro)
  );

  const historialMateria = materia
    ? planillas
        .filter((p) => p.materiaId === materia.id)
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
    : [];

  return (
    <section className="seccion active">
      <div className="section__header">
        <h2 className="section__title">Tomar asistencia</h2>
        <div className="section__line"></div>
      </div>

      {error && (
        <p className="error-msg" style={{ marginBottom: "12px" }}>
          {error}
        </p>
      )}

      {!materia && (
        <div className="card">
          <div className="card-title">Selecciona una Materia</div>
          <div>
            {cargando && (
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                Cargando...
              </p>
            )}
            {!cargando && materias.length === 0 && (
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                No tienes materias asignadas. Creá la primera desde la pestaña
                Alumnos.
              </p>
            )}
            {ANIOS.map((anio) => {
              const delAnio = materias.filter((m) => m.anio === anio);
              if (delAnio.length === 0) return null;
              return (
                <div key={anio}>
                  <div className="grupo-anio-header">🎓 {anio}.º Año</div>
                  {delAnio.map((m) => (
                    <button
                      key={m.id}
                      className="btn btn-outline course-btn"
                      onClick={() => abrirMateria(m)}
                    >
                      <span>📚 {m.nombre}</span>
                      <span>➔</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {materia && (
        <div className="card">
          <div className="card-title">
            <div>
              <span>{materia.nombre}</span>
              <span className="badge badge-anio" style={{ marginLeft: "6px" }}>
                {materia.anio}.º Año
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
                {historialMateria.length === 0 && (
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
                {historialMateria.map((h) => (
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
            {alumnosFiltrados.length === 0 && (
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
            {alumnosFiltrados.map((a) => {
              const reg = registros[a.personaId];
              if (!reg) return null;
              const esPresente = reg.estado === "presente";
              return (
                <div
                  className="alumno-card"
                  key={a.personaId}
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
                      onClick={() => setEstado(a.personaId, "presente")}
                    >
                      ➕ Presente
                    </button>
                    <button
                      type="button"
                      className={`btn-estado btn-estado-ausente ${!esPresente ? "active" : ""}`}
                      onClick={() => setEstado(a.personaId, "ausente")}
                    >
                      ✖ Ausente
                    </button>
                  </div>

                  {!esPresente && (
                    <select
                      value={reg.motivo}
                      onChange={(e) => setMotivo(a.personaId, e.target.value)}
                      style={{ borderColor: "var(--danger)", marginTop: "4px" }}
                    >
                      <option value="injustificada">Ausencia Injustificada</option>
                      <option value="justificada">Ausencia Justificada</option>
                    </select>
                  )}

                  <input
                    type="text"
                    value={reg.observacion}
                    onChange={(e) => setObservacion(a.personaId, e.target.value)}
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
            <button onClick={() => setMateria(null)} className="btn btn-outline">
              Volver a Selección
            </button>
          </div>
        </div>
      )}
    </section>
  );
}