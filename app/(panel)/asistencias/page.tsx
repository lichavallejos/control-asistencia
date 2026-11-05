"use client";

import { useEffect, useRef, useState } from "react";
import {
  guardarAsistencia,
  obtenerAlumnosDeMateria,
  obtenerAsistenciaDeClase,
  obtenerClases,
  obtenerMisMaterias,
  obtenerResumenAsistencia,
  type AlumnoDeMateria,
  type ClaseGuardada,
  type EstadoAsistencia,
  type MateriaPropia,
  type RegistroAsistencia,
} from "@/lib/datos";
import { obtenerUsuario } from "@/lib/sesion";
import { agruparPorCarreraYAnio, detalleMateria } from "@/lib/materias";
import InformeAsistencia, {
  type DatosInforme,
} from "@/components/attendance/InformeAsistencia";
import PlanillaAsistencia from "@/components/attendance/PlanillaAsistencia";

// Los registros se indexan por inscripción (alumno + materia)
type Registros = Record<string, RegistroAsistencia>;

function hoy() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

// Un alumno cuenta en una fecha si no tiene baja, o si la baja es posterior a esa fecha
// (la base rechaza asistencias de clases posteriores a la baja).
function activoEn(alumno: AlumnoDeMateria, fecha: string): boolean {
  return !alumno.fechaBaja || fecha <= alumno.fechaBaja;
}

// Usa lo ya guardado para esa fecha. Los alumnos sin registro:
// - si la clase es NUEVA, arrancan presentes (el profesor marca a los ausentes);
// - si la clase YA EXISTE, figuran ausentes injustificados, igual que en el
//   porcentaje (quien se inscribió después arrastra las ausencias anteriores).
function armarRegistros(
  alumnos: AlumnoDeMateria[],
  guardados: RegistroAsistencia[],
  claseExiste: boolean
): Registros {
  const resultado: Registros = {};
  alumnos.forEach((a) => {
    const g = guardados.find((r) => r.inscripcionId === a.inscripcionId);
    resultado[a.inscripcionId] = {
      inscripcionId: a.inscripcionId,
      estado: g?.estado ?? (claseExiste ? "ausente" : "presente"),
      motivo: g?.motivo || "injustificada",
      observacion: g?.observacion ?? "",
    };
  });
  return resultado;
}

export default function AsistenciasPage() {
  const [materias, setMaterias] = useState<MateriaPropia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [materia, setMateria] = useState<MateriaPropia | null>(null);
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
        // El profesor no ve acá las materias inactivas (siguen visibles en Alumnos).
        // Las de ciclos cerrados se ven, pero en solo lectura.
        setMaterias(lista.filter((m) => m.activo));
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
    m: MateriaPropia,
    lista: AlumnoDeMateria[],
    f: string,
    claseExiste: boolean
  ) {
    const numero = ++ultimaSolicitud.current;
    const guardados = await obtenerAsistenciaDeClase(m.id, f);
    if (numero !== ultimaSolicitud.current) return;
    setRegistros(
      armarRegistros(
        lista.filter((a) => activoEn(a, f)),
        guardados,
        claseExiste
      )
    );
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
        materia: `${materia.nombre} (${materia.carreraNombre})`,
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

  async function abrirMateria(m: MateriaPropia) {
    setOcupado(true);
    try {
      const [lista, historial] = await Promise.all([
        obtenerAlumnosDeMateria(m.id),
        obtenerClases(m.id),
      ]);
      // En un ciclo cerrado (solo lectura) se arranca en la última clase registrada
      // y con el Historial abierto; si no, en la fecha de hoy.
      const cerrada = m.cicloEstado === "cerrado";
      const f =
        cerrada && historial.length > 0
          ? historial.reduce((a, c) => (c.fecha > a ? c.fecha : a), "")
          : hoy();
      await cargarFecha(m, lista, f, historial.some((c) => c.fecha === f));
      setAlumnos(lista);
      setClases(historial);
      setMateria(m);
      setFecha(f);
      setFiltro("");
      setFaltantes([]);
      setHistorialAbierto(cerrada);
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
      await cargarFecha(materia, alumnos, f, clases.some((c) => c.fecha === f));
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
    if (!materia || soloLectura) return;
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

  async function cargarDesdeHistorial(f: string) {
    await cambiarFecha(f);
    setHistorialAbierto(false);
  }

  // Ciclo cerrado: la materia se puede consultar, pero no modificar
  const soloLectura = materia?.cicloEstado === "cerrado";
  const hayClaseEnFecha = clases.some((c) => c.fecha === fecha);

  // Solo los alumnos que estaban activos en la fecha elegida
  const alumnosEnFecha = fecha ? alumnos.filter((a) => activoEn(a, fecha)) : alumnos;
  const textoFiltro = filtro.toLowerCase();
  const alumnosFiltrados = alumnosEnFecha.filter((a) =>
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
                No tenés materias activas asignadas. Pedile al administrador que
                te asigne las tuyas.
              </p>
            )}
            {agruparPorCarreraYAnio(materias).map((g) => (
              <div key={g.etiqueta}>
                <div className="grupo-anio-header">🎓 {g.etiqueta}</div>
                {g.materias.map((m) => (
                  <button
                    key={m.id}
                    className="btn btn-outline course-btn"
                    onClick={() => abrirMateria(m)}
                    disabled={ocupado}
                  >
                    <span style={{ textAlign: "left" }}>
                      📚 {m.nombre}
                      <small
                        style={{ display: "block", fontWeight: 400, opacity: 0.8 }}
                      >
                        {detalleMateria(m)}
                      </small>
                    </span>
                    <span>➔</span>
                  </button>
                ))}
              </div>
            ))}
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
              <div
                style={{
                  fontSize: "0.8rem",
                  color: "var(--text-muted)",
                  marginTop: "2px",
                }}
              >
                {materia.carreraNombre} · {detalleMateria(materia)}
              </div>
            </div>
            <button
              onClick={() => setHistorialAbierto(!historialAbierto)}
              className="btn btn-outline btn-sm"
            >
              Historial
            </button>
          </div>

          {soloLectura && (
            <div
              style={{
                background: "var(--primary-light)",
                padding: "12px",
                borderRadius: "8px",
                marginBottom: "14px",
                fontSize: "0.85rem",
              }}
            >
              <strong>Ciclo cerrado: solo lectura.</strong> Podés consultar las
              clases anteriores desde el Historial y descargar el PDF, pero no
              cargar ni modificar asistencias. Si hace falta, pedile al
              administrador que reabra el ciclo.
            </div>
          )}

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
                    <button
                      onClick={() => cargarDesdeHistorial(c.fecha)}
                      className="btn btn-primary btn-sm"
                    >
                      Cargar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {soloLectura && !hayClaseEnFecha ? (
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              {clases.length === 0
                ? "Esta materia no tiene clases registradas."
                : "No hay una clase registrada en esa fecha. Elegí una desde el Historial."}
            </p>
          ) : (
            <PlanillaAsistencia
              alumnos={alumnosEnFecha}
              visibles={alumnosFiltrados}
              registros={registros}
              fecha={fecha}
              filtro={filtro}
              ocupado={ocupado}
              faltantes={faltantes}
              soloLectura={soloLectura}
              onFecha={cambiarFecha}
              onFiltro={setFiltro}
              onEstado={setEstados}
              onMotivo={setMotivo}
              onObservacion={setObservacion}
              onGuardar={guardar}
            />
          )}

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