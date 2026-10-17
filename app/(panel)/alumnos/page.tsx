"use client";

import { useEffect, useState } from "react";
import {
  agregarAlumno,
  crearMateria,
  editarAlumno,
  matricularLista,
  obtenerAlumnosDeMateria,
  obtenerMisMaterias,
  quitarAlumnoDeMateria,
  type AlumnoDeMateria,
  type Materia,
} from "@/lib/datos";
import { obtenerPlanillas } from "@/lib/asistencias-demo";

const ANIOS = [1, 2, 3, 4];

type FormAlumno = { personaId: string | null; nombre: string; dni: string };

export default function AlumnosPage() {
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [materiaId, setMateriaId] = useState<string | null>(null);
  const [alumnos, setAlumnos] = useState<AlumnoDeMateria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [filtro, setFiltro] = useState("");

  const [formMateriaAbierto, setFormMateriaAbierto] = useState(false);
  const [materiaNombre, setMateriaNombre] = useState("");
  const [materiaAnio, setMateriaAnio] = useState(1);

  const [formAlumno, setFormAlumno] = useState<FormAlumno | null>(null);
  const [cargaAbierta, setCargaAbierta] = useState(false);
  const [textoMasivo, setTextoMasivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Planillas guardadas en el navegador (hasta el paso 16b) para calcular el %
  const [planillas] = useState(() => obtenerPlanillas());

  // Cargar materias
  useEffect(() => {
    let activo = true;
    obtenerMisMaterias()
      .then((lista) => {
        if (!activo) return;
        setMaterias(lista);
        setMateriaId((actual) => actual ?? lista[0]?.id ?? null);
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
  }, [version]);

  // Cargar alumnos de la materia elegida
  useEffect(() => {
    if (!materiaId) return;
    let activo = true;
    obtenerAlumnosDeMateria(materiaId)
      .then((lista) => {
        if (activo) setAlumnos(lista);
      })
      .catch((e: Error) => {
        if (activo) setError(e.message);
      });
    return () => {
      activo = false;
    };
  }, [materiaId, version]);

  const refrescar = () => setVersion((v) => v + 1);

  async function ejecutar(accion: () => Promise<void>) {
    setGuardando(true);
    try {
      await accion();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function guardarMateria() {
    const nombre = materiaNombre.trim();
    if (!nombre) {
      alert("Ingresa el nombre de la materia.");
      return;
    }
    await ejecutar(async () => {
      const id = await crearMateria(nombre, materiaAnio);
      setMateriaNombre("");
      setFormMateriaAbierto(false);
      setMateriaId(id);
      refrescar();
      alert(`✅ Materia '${nombre}' guardada para ${materiaAnio}.º Año.`);
    });
  }

  function abrirNuevoAlumno() {
    setCargaAbierta(false);
    setFormAlumno({ personaId: null, nombre: "", dni: "" });
  }

  function abrirEditarAlumno(a: AlumnoDeMateria) {
    setCargaAbierta(false);
    setFormAlumno({ personaId: a.personaId, nombre: a.nombre, dni: a.dni });
  }

  async function guardarAlumno() {
    if (!formAlumno || !materiaId) return;
    const nombre = formAlumno.nombre.trim();
    const dni = formAlumno.dni.trim();
    if (!nombre) {
      alert("Ingresa Apellido y Nombre.");
      return;
    }
    await ejecutar(async () => {
      if (formAlumno.personaId) {
        await editarAlumno(formAlumno.personaId, nombre, dni);
      } else {
        await agregarAlumno(nombre, dni, materiaId);
      }
      setFormAlumno(null);
      refrescar();
    });
  }

  async function quitarAlumno(a: AlumnoDeMateria) {
    if (!confirm(`¿Quitar a ${a.nombre} de esta materia?`)) return;
    await ejecutar(async () => {
      await quitarAlumnoDeMateria(a.inscripcionId);
      refrescar();
    });
  }

  function abrirCargaMasiva() {
    setFormAlumno(null);
    setTextoMasivo("");
    setCargaAbierta(true);
  }

  async function guardarCargaMasiva() {
    if (!materiaId) return;
    const lineas = textoMasivo
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lineas.length === 0) {
      alert("Ingresa al menos un nombre de alumno.");
      return;
    }
    await ejecutar(async () => {
      const creados = await matricularLista(lineas, materiaId);
      alert(`✅ Se matricularon ${creados} alumnos correctamente.`);
      setCargaAbierta(false);
      refrescar();
    });
  }

  const textoFiltro = filtro.toLowerCase();
  const alumnosFiltrados = alumnos.filter(
    (a) =>
      a.nombre.toLowerCase().includes(textoFiltro) || a.dni.includes(textoFiltro)
  );
  const historialMateria = planillas.filter((p) => p.materiaId === materiaId);

  return (
    <section className="seccion active">
      <div className="section__header">
        <h2 className="section__title">Materias y alumnos</h2>
        <div className="section__line"></div>
      </div>

      {error && (
        <p className="error-msg" style={{ marginBottom: "12px" }}>
          {error}
        </p>
      )}

      <div className="card">
        <div className="card-title">
          <span>Nueva Materia</span>
          <button
            onClick={() => setFormMateriaAbierto(!formMateriaAbierto)}
            className="btn btn-outline btn-sm"
          >
            + Crear Materia
          </button>
        </div>
        {formMateriaAbierto && (
          <div style={{ marginTop: "10px" }}>
            <div className="form-group">
              <label htmlFor="nueva-materia-nombre">Nombre de la Materia</label>
              <input
                type="text"
                id="nueva-materia-nombre"
                placeholder="Ej: Sujetos de la Educación"
                value={materiaNombre}
                onChange={(e) => setMateriaNombre(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="nueva-materia-anio">Año de Cursada</label>
              <select
                id="nueva-materia-anio"
                value={materiaAnio}
                onChange={(e) => setMateriaAnio(Number(e.target.value))}
              >
                {ANIOS.map((a) => (
                  <option key={a} value={a}>
                    {a}.º Año
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={guardarMateria}
              disabled={guardando}
              className="btn btn-primary btn-sm"
              style={{ width: "100%" }}
            >
              Guardar Materia
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Gestión de Alumnos</div>

        {!cargando && materias.length === 0 ? (
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Todavía no tenés materias. Creá la primera con “+ Crear Materia”.
          </p>
        ) : (
          <>
            <div className="form-group">
              <label htmlFor="select-curso-alumnos">Materia / Curso</label>
              <select
                id="select-curso-alumnos"
                value={materiaId ?? ""}
                onChange={(e) => setMateriaId(e.target.value)}
              >
                {ANIOS.map((anio) => {
                  const delAnio = materias.filter((m) => m.anio === anio);
                  if (delAnio.length === 0) return null;
                  return (
                    <optgroup key={anio} label={`🎓 ${anio}.º Año`}>
                      {delAnio.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nombre}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={abrirNuevoAlumno}
                className="btn btn-success btn-sm"
                style={{ flex: 1 }}
              >
                + Alumno Individual
              </button>
              <button
                onClick={abrirCargaMasiva}
                className="btn btn-primary btn-sm"
                style={{ flex: 1 }}
              >
                Carga Masiva
              </button>
            </div>
          </>
        )}
      </div>

      {cargaAbierta && (
        <div className="card" style={{ borderTopColor: "var(--accent)" }}>
          <div className="card-title">Carga Masiva (Copiar y Pegar)</div>
          <p
            style={{
              fontSize: "0.8rem",
              color: "var(--text-muted)",
              marginBottom: "8px",
            }}
          >
            Pega la lista de alumnos de esta materia (un nombre completo por línea):
          </p>
          <div className="form-group">
            <textarea
              rows={6}
              placeholder={"Perez, Maria\nGomez, Juan\nLopez, Sofia"}
              value={textoMasivo}
              onChange={(e) => setTextoMasivo(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={guardarCargaMasiva}
              disabled={guardando}
              className="btn btn-primary"
              style={{ flex: 1 }}
            >
              Matricular Lista
            </button>
            <button
              onClick={() => setCargaAbierta(false)}
              className="btn btn-outline"
              style={{ flex: 1 }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {formAlumno && (
        <div className="card" style={{ borderTopColor: "var(--accent)" }}>
          <div className="card-title">
            {formAlumno.personaId === null
              ? "Agregar Alumno Nuevo"
              : "Editar Alumno"}
          </div>
          <div className="form-group">
            <label htmlFor="alumno-nombre">Apellido y Nombre</label>
            <input
              type="text"
              id="alumno-nombre"
              placeholder="Ej: Perez, Maria"
              value={formAlumno.nombre}
              onChange={(e) =>
                setFormAlumno({ ...formAlumno, nombre: e.target.value })
              }
            />
          </div>
          <div className="form-group">
            <label htmlFor="alumno-dni">DNI / Legajo</label>
            <input
              type="text"
              id="alumno-dni"
              placeholder="Ej: 42123456"
              value={formAlumno.dni}
              onChange={(e) =>
                setFormAlumno({ ...formAlumno, dni: e.target.value })
              }
            />
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={guardarAlumno}
              disabled={guardando}
              className="btn btn-primary"
              style={{ flex: 1 }}
            >
              Guardar
            </button>
            <button
              onClick={() => setFormAlumno(null)}
              className="btn btn-outline"
              style={{ flex: 1 }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {materiaId && (
        <div className="card">
          <div className="form-group">
            <input
              type="text"
              placeholder="Filtrar por nombre o DNI..."
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
                  padding: "8px 0",
                }}
              >
                Sin alumnos registrados.
              </p>
            )}
            {alumnosFiltrados.map((a) => {
              const totalClases = historialMateria.length;
              const presentes = historialMateria.filter((c) =>
                c.registros.some(
                  (r) => r.alumnoId === a.personaId && r.estado === "presente"
                )
              ).length;
              const pct =
                totalClases > 0
                  ? Math.round((presentes / totalClases) * 100)
                  : 100;

              let badgeClass = "badge-success";
              if (pct < 65) badgeClass = "badge-danger";
              else if (pct < 75) badgeClass = "badge-warning";

              return (
                <div className="alumno-card" key={a.inscripcionId}>
                  <div className="alumno-info">
                    <div>
                      <span className="alumno-nombre">{a.nombre}</span>
                      <div className="alumno-sub">
                        DNI: {a.dni || "Sin datos"}
                      </div>
                    </div>
                    <span className={`badge ${badgeClass}`}>{pct}% Asist.</span>
                  </div>
                  <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                    <button
                      onClick={() => abrirEditarAlumno(a)}
                      className="btn btn-outline btn-sm"
                      style={{ flex: 1 }}
                    >
                      ✏️ Editar
                    </button>
                    <button
                      onClick={() => quitarAlumno(a)}
                      className="btn btn-outline btn-sm"
                      style={{ flex: 1, color: "var(--danger)" }}
                    >
                      🗑️ Quitar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}