"use client";

import { useEffect, useRef, useState } from "react";
import {
  eliminarClase,
  guardarAsistencia,
  obtenerAlumnosDeMateria,
  obtenerAsistenciaDeClase,
  obtenerClases,
  obtenerMisMaterias,
  obtenerResumenAsistencia,
  type AlumnoDeMateria,
  type ClaseGuardada,
  type EstadoAsistencia,
  type Materia,
  type RegistroAsistencia,
} from "@/lib/datos";
import { obtenerUsuario } from "@/lib/sesion";
import InformeAsistencia, {
  type DatosInforme,
} from "@/components/attendance/InformeAsistencia";
import PlanillaAsistencia from "@/components/attendance/PlanillaAsistencia";

const ANIOS = [1, 2, 3, 4];

// Los registros se indexan por inscripción (alumno + materia)
type Registros = Record<string, RegistroAsistencia>;

function hoy() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

// Usa lo ya guardado para esa fecha; los alumnos sin registro quedan presentes
// (igual que en el HTML original).
function armarRegistros(
  alumnos: AlumnoDeMateria[],
  guardados: RegistroAsistencia[]
): Registros {
  const resultado: Registros = {};
  alumnos.forEach((a) => {
    const g = guardados.find((r) => r.inscripcionId === a.inscripcionId);
    resultado[a.inscripcionId] = {
      inscripcionId: a.inscripcionId,
      estado: g?.estado ?? "presente",
      motivo: g?.motivo || "injustificada",
      observacion: g?.observacion ?? "",
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
  const [clases, setClases] = useState<ClaseGuardada[]>([]);
  const [fecha, setFecha] = useState("");
  const [filtro, setFiltro] = useState("");
  const [registros, setRegistros] = useState<Registros>({});
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [informe, setInforme] = useState<DatosInforme | null>(null);
  const [faltantes, setFaltantes] = useState<string[]>([]);

  // Evita que una respuesta lenta pise a una más nueva al cambiar de fecha rápido
  const ultimaSolicitud = useRef(0);

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

  async function cargarFecha(
    m: Materia,
    lista: AlumnoDeMateria[],
    f: string
  ) {
    const numero = ++ultimaSolicitud.current;
    const guardados = await obtenerAsistenciaDeClase(m.id, f);
    if (numero !== ultimaSolicitud.current) return;
    setRegistros(armarRegistros(lista, guardados));
  }

  // Cuando el informe ya está dibujado, abre el diálogo de impresión / guardar como PDF
  useEffect(() => {
    if (!informe) return;
    const limpiar = () => setInforme(null);
    window.addEventListener("afterprint", limpiar);
    const espera = setTimeout(() => window.print(), 150);
    return () => {
      clearTimeout(espera);
      window.removeEventListener("afterprint", limpiar);
    };
  }, [informe]);

  async function exportarPDF() {
    if (!materia) return;
    setOcupado(true);
    try {
      const resumen = await obtenerResumenAsistencia(materia.id);
      if (resumen.totalClases === 0) {
        alert("Guarda al menos una planilla de asistencia antes de exportar.");
        return;
      }
      setInforme({
        materia: materia.nombre,
        anio: materia.anio,
        docente: obtenerUsuario()?.nombre ?? "",
        totalClases: resumen.totalClases,
        filas: alumnos.map((a) => {
          const c = resumen.porInscripcion[a.inscripcionId];
          return {
            nombre: a.nombre,
            dni: a.dni,
            presentes: c?.presentes ?? 0,
            ausJustificadas: c?.ausJustificadas ?? 0,
            ausInjustificadas: c?.ausInjustificadas ?? 0,
          };
        }),
      });
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function abrirMateria(m: Materia) {
    setOcupado(true);
    try {
      const [lista, historial] = await Promise.all([
        obtenerAlumnosDeMateria(m.id),
        obtenerClases(m.id),
      ]);
      const f = hoy();
      await cargarFecha(m, lista, f);
      setAlumnos(lista);
      setClases(historial);
      setMateria(m);
      setFecha(f);
      setFiltro("");
      setFaltantes([]);
      setHistorialAbierto(false);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function cambiarFecha(f: string) {
    setFecha(f);
    setFaltantes([]);
    if (!materia || !f) return;
    try {
      await cargarFecha(materia, alumnos, f);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  // Cambia el estado de uno o varios alumnos a la vez (por inscripción)
  function setEstados(ids: string[], estado: EstadoAsistencia) {
    setRegistros((prev) => {
      const nuevo: Registros = { ...prev };
      ids.forEach((id) => {
        if (nuevo[id]) nuevo[id] = { ...nuevo[id], estado };
      });
      return nuevo;
    });
  }

  function setMotivo(id: string, motivo: string) {
    setRegistros((prev) => ({ ...prev, [id]: { ...prev[id], motivo } }));
  }

  function setObservacion(id: string, observacion: string) {
    setRegistros((prev) => ({ ...prev, [id]: { ...prev[id], observacion } }));
  }

  async function guardar() {
    if (!materia) return;
    if (!fecha) {
      alert("Selecciona una fecha válida.");
      return;
    }
    // El comentario es obligatorio en las ausencias justificadas
    const sinComentario = Object.values(registros)
      .filter(
        (r) =>
          r.estado === "ausente" &&
          r.motivo === "justificada" &&
          !r.observacion.trim()
      )
      .map((r) => r.inscripcionId);
    if (sinComentario.length > 0) {
      setFaltantes(sinComentario);
      const n = sinComentario.length;
      alert(
        n === 1
          ? "Falta el comentario obligatorio de 1 ausencia justificada."
          : `Faltan los comentarios obligatorios de ${n} ausencias justificadas.`
      );
      return;
    }
    setFaltantes([]);
    setOcupado(true);
    try {
      await guardarAsistencia(materia.id, fecha, Object.values(registros));
      setClases(await obtenerClases(materia.id));
      alert("✅ Planilla de asistencia guardada correctamente.");
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function eliminarFecha(clase: ClaseGuardada) {
    if (!materia) return;
    if (!confirm(`¿Eliminar la asistencia del día ${clase.fecha}?`)) return;
    setOcupado(true);
    try {
      await eliminarClase(clase.id);
      setClases(await obtenerClases(materia.id));
      if (clase.fecha === fecha) await cargarFecha(materia, alumnos, fecha);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function cargarDesdeHistorial(f: string) {
    await cambiarFecha(f);
    setHistorialAbierto(false);
  }

  const textoFiltro = filtro.toLowerCase();
  const alumnosFiltrados = alumnos.filter((a) =>
    a.nombre.toLowerCase().includes(textoFiltro)
  );

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
                      disabled={ocupado}
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
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
              marginBottom: "14px",
            }}
          >
            <div>
              <span style={{ fontWeight: 700, fontSize: "1.1rem" }}>
                {materia.nombre}
              </span>
              <span className="badge badge-anio" style={{ marginLeft: "8px" }}>
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
                {clases.length === 0 && (
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
                {clases.map((c) => (
                  <div className="historial-item" key={c.id}>
                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                      📅 {c.fecha}
                    </span>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        onClick={() => cargarDesdeHistorial(c.fecha)}
                        className="btn btn-primary btn-sm"
                      >
                        Cargar
                      </button>
                      <button
                        onClick={() => eliminarFecha(c)}
                        disabled={ocupado}
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

          <PlanillaAsistencia
            alumnos={alumnos}
            visibles={alumnosFiltrados}
            registros={registros}
            fecha={fecha}
            filtro={filtro}
            ocupado={ocupado}
            faltantes={faltantes}
            onFecha={cambiarFecha}
            onFiltro={setFiltro}
            onEstado={setEstados}
            onMotivo={setMotivo}
            onObservacion={setObservacion}
            onGuardar={guardar}
          />

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              marginTop: "16px",
            }}
          >
            <button
              onClick={exportarPDF}
              disabled={ocupado}
              className="btn btn-primary"
            >
              Imprimir / Guardar PDF
            </button>
            <button onClick={() => setMateria(null)} className="btn btn-outline">
              Volver a Selección
            </button>
          </div>
        </>
      )}
      {informe && <InformeAsistencia datos={informe} />}
    </section>
  );
}