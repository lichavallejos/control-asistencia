"use client";

import { useState } from "react";
import { obtenerUsuario } from "@/lib/sesion";
import {
  crearAlumno,
  crearMateria,
  editarAlumno,
  eliminarAlumno,
  matricularLista,
  obtenerAlumnos,
  obtenerMisCursos,
} from "@/lib/datos-local";
import { obtenerPlanillas } from "@/lib/asistencias-demo";

const ANIOS = [1, 2, 3, 4];

type FormAlumno = { id: number | null; nombre: string; dni: string };

export default function AlumnosPage() {
  const [usuario] = useState(() => obtenerUsuario());
  const [, setTick] = useState(0);
  const [cursoElegido, setCursoElegido] = useState<number | null>(null);
  const [filtro, setFiltro] = useState("");

  const [formMateriaAbierto, setFormMateriaAbierto] = useState(false);
  const [materiaNombre, setMateriaNombre] = useState("");
  const [materiaAnio, setMateriaAnio] = useState(1);

  const [formAlumno, setFormAlumno] = useState<FormAlumno | null>(null);
  const [cargaAbierta, setCargaAbierta] = useState(false);
  const [textoMasivo, setTextoMasivo] = useState("");

  if (!usuario) return null;

  // Fuerza a volver a leer los datos guardados
  const refrescar = () => setTick((t) => t + 1);

  const misCursos = obtenerMisCursos(usuario);
  const cursoId = cursoElegido ?? misCursos[0]?.id ?? null;

  const textoFiltro = filtro.toLowerCase();
  const alumnosCurso =
    cursoId === null
      ? []
      : obtenerAlumnos().filter(
          (a) =>
            a.cursoId === cursoId &&
            (a.nombre.toLowerCase().includes(textoFiltro) ||
              a.dni.includes(textoFiltro))
        );

  const historialCurso =
    cursoId === null
      ? []
      : obtenerPlanillas().filter((p) => p.cursoId === cursoId);

  function guardarMateria() {
    const nombre = materiaNombre.trim();
    if (!nombre) {
      alert("Ingresa el nombre de la materia.");
      return;
    }
    const nueva = crearMateria(nombre, materiaAnio);
    setMateriaNombre("");
    setFormMateriaAbierto(false);
    setCursoElegido(nueva.id);
    refrescar();
    alert(`✅ Materia '${nombre}' guardada para ${materiaAnio}.º Año.`);
  }

  function abrirNuevoAlumno() {
    setCargaAbierta(false);
    setFormAlumno({ id: null, nombre: "", dni: "" });
  }

  function abrirEditarAlumno(id: number) {
    const al = obtenerAlumnos().find((a) => a.id === id);
    if (!al) return;
    setCargaAbierta(false);
    setFormAlumno({ id: al.id, nombre: al.nombre, dni: al.dni || "" });
  }

  function guardarAlumno() {
    if (!formAlumno || cursoId === null) return;
    const nombre = formAlumno.nombre.trim();
    const dni = formAlumno.dni.trim();
    if (!nombre) {
      alert("Ingresa Apellido y Nombre.");
      return;
    }
    if (formAlumno.id !== null) {
      editarAlumno(formAlumno.id, nombre, dni);
    } else {
      crearAlumno(nombre, dni, cursoId);
    }
    setFormAlumno(null);
    refrescar();
  }

  function borrarAlumno(id: number) {
    if (confirm("¿Eliminar a este estudiante?")) {
      eliminarAlumno(id);
      refrescar();
    }
  }

  function abrirCargaMasiva() {
    setFormAlumno(null);
    setTextoMasivo("");
    setCargaAbierta(true);
  }

  function guardarCargaMasiva() {
    if (cursoId === null) return;
    const lineas = textoMasivo
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lineas.length === 0) {
      alert("Ingresa al menos un nombre de alumno.");
      return;
    }
    const creados = matricularLista(lineas, cursoId);
    alert(`✅ Se matricularon ${creados} alumnos correctamente.`);
    setCargaAbierta(false);
    refrescar();
  }

  return (
    <section className="seccion active">
      <div className="section__header">
        <h2 className="section__title">Materias y alumnos</h2>
        <div className="section__line"></div>
      </div>

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
        <div className="form-group">
          <label htmlFor="select-curso-alumnos">Materia / Curso</label>
          <select
            id="select-curso-alumnos"
            value={cursoId ?? ""}
            onChange={(e) => setCursoElegido(Number(e.target.value))}
          >
            {ANIOS.map((anio) => {
              const cursosAnio = misCursos.filter((c) => (c.anio || 1) === anio);
              if (cursosAnio.length === 0) return null;
              return (
                <optgroup key={anio} label={`🎓 ${anio}.º Año`}>
                  {cursosAnio.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
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
            {formAlumno.id === null ? "Agregar Alumno Nuevo" : "Editar Alumno"}
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
          {alumnosCurso.length === 0 && (
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
          {alumnosCurso.map((a) => {
            const totalClases = historialCurso.length;
            const presentes = historialCurso.filter((c) =>
              c.registros.some(
                (r) => r.alumnoId === a.id && r.estado === "presente"
              )
            ).length;
            const pct =
              totalClases > 0 ? Math.round((presentes / totalClases) * 100) : 100;

            let badgeClass = "badge-success";
            if (pct < 65) badgeClass = "badge-danger";
            else if (pct < 75) badgeClass = "badge-warning";

            return (
              <div className="alumno-card" key={a.id}>
                <div className="alumno-info">
                  <div>
                    <span className="alumno-nombre">{a.nombre}</span>
                    <div className="alumno-sub">DNI: {a.dni || "Sin datos"}</div>
                  </div>
                  <span className={`badge ${badgeClass}`}>{pct}% Asist.</span>
                </div>
                <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                  <button
                    onClick={() => abrirEditarAlumno(a.id)}
                    className="btn btn-outline btn-sm"
                    style={{ flex: 1 }}
                  >
                    ✏️ Editar
                  </button>
                  <button
                    onClick={() => borrarAlumno(a.id)}
                    className="btn btn-outline btn-sm"
                    style={{ flex: 1, color: "var(--danger)" }}
                  >
                    🗑️ Eliminar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}