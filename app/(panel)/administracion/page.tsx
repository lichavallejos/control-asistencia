"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { esAdministrador } from "@/lib/sesion";
import {
  asignarMateria,
  crearProfesor,
  editarProfesor,
  listarMateriasInstitucion,
  listarProfesores,
  quitarMateria,
  type MateriaConProfesores,
  type Profesor,
} from "@/lib/datos";

const ANIOS = [1, 2, 3, 4];

type FormProfesor = {
  id: string | null;
  nombre: string;
  dni: string;
  email: string;
};

export default function AdministracionPage() {
  const router = useRouter();
  const [profesores, setProfesores] = useState<Profesor[] | null>(null);
  const [materias, setMaterias] = useState<MateriaConProfesores[]>([]);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [formProfesor, setFormProfesor] = useState<FormProfesor | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Materia elegida en el selector de cada profesor (id del profesor -> id de la materia)
  const [seleccion, setSeleccion] = useState<Record<string, string>>({});

  useEffect(() => {
    let activo = true;
    esAdministrador()
      .then((admin) => {
        if (!activo) return null;
        // Quien no es administrador vuelve al inicio (la seguridad real la da la base)
        if (!admin) {
          router.replace("/dashboard");
          return null;
        }
        return Promise.all([listarProfesores(), listarMateriasInstitucion()]);
      })
      .then((resultado) => {
        if (!activo || !resultado) return;
        setProfesores(resultado[0]);
        setMaterias(resultado[1]);
      })
      .catch((e: Error) => {
        if (activo) setError(e.message);
      });
    return () => {
      activo = false;
    };
  }, [router, version]);

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

  function abrirNuevoProfesor() {
    setFormProfesor({ id: null, nombre: "", dni: "", email: "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function abrirEditarProfesor(p: Profesor) {
    setFormProfesor({ id: p.id, nombre: p.nombre, dni: p.dni, email: p.email });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function guardarProfesor() {
    if (!formProfesor) return;
    const nombre = formProfesor.nombre.trim();
    const dni = formProfesor.dni.trim();
    const email = formProfesor.email.trim();
    if (!nombre) {
      alert("Ingresa Apellido y Nombre.");
      return;
    }
    await ejecutar(async () => {
      if (formProfesor.id) {
        await editarProfesor(formProfesor.id, nombre, dni, email);
      } else {
        await crearProfesor(nombre, dni, email);
      }
      setFormProfesor(null);
      refrescar();
    });
  }

  async function asignar(p: Profesor) {
    const materiaId = seleccion[p.id];
    if (!materiaId) return;
    await ejecutar(async () => {
      await asignarMateria(p.id, materiaId);
      setSeleccion((actual) => ({ ...actual, [p.id]: "" }));
      refrescar();
    });
  }

  async function quitar(p: Profesor, m: MateriaConProfesores) {
    // Solo se quita la asignación: clases, alumnos y asistencias quedan intactos
    if (!confirm(`¿Quitar la materia "${m.nombre}" (${m.anio}.º Año) a ${p.nombre}?`))
      return;
    await ejecutar(async () => {
      await quitarMateria(p.id, m.id);
      refrescar();
    });
  }

  // Materias que dicta cada profesor (a partir de la lista de materias)
  function materiasDe(profesorId: string): MateriaConProfesores[] {
    return materias.filter((m) =>
      m.profesores.some((p) => p.id === profesorId)
    );
  }

  return (
    <section className="seccion active">
      <div className="section__header">
        <h2 className="section__title">Administración</h2>
        <div className="section__line"></div>
      </div>

      {error && (
        <p className="error-msg" style={{ marginBottom: "12px" }}>
          {error}
        </p>
      )}

      {formProfesor && (
        <div className="card" style={{ borderTopColor: "var(--accent)" }}>
          <div className="card-title">
            {formProfesor.id === null ? "Agregar Profesor Nuevo" : "Editar Profesor"}
          </div>
          <div className="form-group">
            <label htmlFor="profesor-nombre">Apellido y Nombre</label>
            <input
              type="text"
              id="profesor-nombre"
              placeholder="Ej: Gomez, Laura"
              value={formProfesor.nombre}
              onChange={(e) =>
                setFormProfesor({ ...formProfesor, nombre: e.target.value })
              }
            />
          </div>
          <div className="form-group">
            <label htmlFor="profesor-dni">DNI</label>
            <input
              type="text"
              id="profesor-dni"
              placeholder="Ej: 30123456"
              value={formProfesor.dni}
              onChange={(e) =>
                setFormProfesor({ ...formProfesor, dni: e.target.value })
              }
            />
          </div>
          <div className="form-group">
            <label htmlFor="profesor-email">Correo</label>
            <input
              type="email"
              id="profesor-email"
              placeholder="Ej: laura@correo.com"
              value={formProfesor.email}
              onChange={(e) =>
                setFormProfesor({ ...formProfesor, email: e.target.value })
              }
            />
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={guardarProfesor}
              disabled={guardando}
              className="btn btn-primary"
              style={{ flex: 1 }}
            >
              Guardar
            </button>
            <button
              onClick={() => setFormProfesor(null)}
              className="btn btn-outline"
              style={{ flex: 1 }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">
          <span>Profesores</span>
          <button
            onClick={abrirNuevoProfesor}
            className="btn btn-outline btn-sm"
          >
            + Nuevo profesor
          </button>
        </div>

        {profesores === null && !error && (
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Cargando...
          </p>
        )}

        {profesores !== null && profesores.length === 0 && (
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Todavía no hay profesores cargados.
          </p>
        )}

        {profesores?.map((p) => {
          const suyas = materiasDe(p.id);
          const disponibles = materias.filter(
            (m) => !m.profesores.some((x) => x.id === p.id)
          );
          return (
            <div className="alumno-card" key={p.id}>
              <div className="alumno-info">
                <div>
                  <span className="alumno-nombre">{p.nombre}</span>
                  <div className="alumno-sub">
                    DNI: {p.dni || "Sin datos"} · {p.email || "Sin correo"}
                  </div>
                </div>
                {!p.tieneCuenta && (
                  <span className="badge badge-warning">Sin cuenta</span>
                )}
              </div>
              <div
                style={{
                  fontSize: "0.85rem",
                  color: "var(--text-muted)",
                  marginTop: "6px",
                }}
              >
                <strong>Materias:</strong>
                {suyas.length === 0 && " Sin materias asignadas."}
              </div>
              {suyas.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "0.85rem",
                    color: "var(--text-muted)",
                    marginTop: "4px",
                  }}
                >
                  <span>
                    {m.nombre} ({m.anio}.º Año)
                  </span>
                  <button
                    onClick={() => quitar(p, m)}
                    disabled={guardando}
                    className="btn btn-outline btn-sm"
                    style={{ color: "var(--danger)" }}
                    aria-label={`Quitar ${m.nombre}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {disponibles.length > 0 && (
                <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                  <select
                    value={seleccion[p.id] ?? ""}
                    onChange={(e) =>
                      setSeleccion({ ...seleccion, [p.id]: e.target.value })
                    }
                    aria-label={`Materia a asignar a ${p.nombre}`}
                    style={{ flex: 1 }}
                  >
                    <option value="">Elegí una materia...</option>
                    {ANIOS.map((anio) => {
                      const delAnio = disponibles.filter((m) => m.anio === anio);
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
                  <button
                    onClick={() => asignar(p)}
                    disabled={guardando || !seleccion[p.id]}
                    className="btn btn-primary btn-sm"
                  >
                    Asignar
                  </button>
                </div>
              )}
              <div style={{ marginTop: "6px" }}>
                <button
                  onClick={() => abrirEditarProfesor(p)}
                  className="btn btn-outline btn-sm"
                  style={{ width: "100%" }}
                >
                  Editar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}