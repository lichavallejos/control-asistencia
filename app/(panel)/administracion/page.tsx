"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { esAdministrador } from "@/lib/sesion";
import NavAdministracion from "@/components/NavAdministracion";
import {
  asignarMateria,
  crearProfesor,
  editarProfesor,
  listarMateriasAdmin,
  listarProfesores,
  quitarMateria,
  type MateriaAdmin,
  type Profesor,
} from "@/lib/datos";

type FormProfesor = {
  id: string | null;
  nombre: string;
  dni: string;
  email: string;
};

// Texto que distingue materias parecidas: año, cuatrimestre, carrera y ciclo
function descripcionMateria(m: MateriaAdmin): string {
  const cuatrimestre =
    m.duracion === "cuatrimestral"
      ? ` · ${m.cuatrimestre === 1 ? "1.er" : "2.º"} cuat.`
      : "";
  const estado = !m.activo
    ? " · Inactiva"
    : m.cicloEstado === "cerrado"
    ? " · Ciclo cerrado"
    : "";
  return `${m.nombre} (${m.anio}.º Año${cuatrimestre}) · ${m.carreraNombre} · Ciclo ${m.cicloAnio}${estado}`;
}

// Texto de cada opción del selector (la carrera y el año van en el grupo)
function etiquetaOpcion(m: MateriaAdmin): string {
  const cuatrimestre =
    m.duracion === "cuatrimestral"
      ? ` · ${m.cuatrimestre === 1 ? "1.er" : "2.º"} cuat.`
      : "";
  return `${m.nombre}${cuatrimestre} · Ciclo ${m.cicloAnio}`;
}

// Lo que cada profesor tiene elegido en los tres selectores de «asignar materia»
type SeleccionMateria = { carrera: string; anio: string; materia: string };

const SELECCION_VACIA: SeleccionMateria = { carrera: "", anio: "", materia: "" };

// Calcula qué opciones mostrar en cada selector según lo elegido antes.
// Si lo elegido ya no está disponible (por ejemplo, después de asignar), se descarta.
function opcionesEncadenadas(
  disponibles: MateriaAdmin[],
  sel: SeleccionMateria
) {
  const carreras = Array.from(
    new Set(disponibles.map((m) => m.carreraNombre))
  ).sort((a, b) => a.localeCompare(b, "es"));
  const carrera = carreras.includes(sel.carrera) ? sel.carrera : "";

  const anios = carrera
    ? Array.from(
        new Set(
          disponibles
            .filter((m) => m.carreraNombre === carrera)
            .map((m) => m.anio)
        )
      ).sort((a, b) => a - b)
    : [];
  const anio = anios.includes(Number(sel.anio)) ? sel.anio : "";

  const materias =
    carrera && anio
      ? disponibles
          .filter(
            (m) => m.carreraNombre === carrera && m.anio === Number(anio)
          )
          .sort(
            (a, b) =>
              b.cicloAnio - a.cicloAnio || a.nombre.localeCompare(b.nombre, "es")
          )
      : [];
  const materia = materias.some((m) => m.id === sel.materia)
    ? sel.materia
    : "";

  return { carreras, carrera, anios, anio, materias, materia };
}

export default function AdministracionPage() {
  const router = useRouter();
  const [profesores, setProfesores] = useState<Profesor[] | null>(null);
  const [materias, setMaterias] = useState<MateriaAdmin[]>([]);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [formProfesor, setFormProfesor] = useState<FormProfesor | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Carrera, año y materia elegidos en los selectores de cada profesor (id del profesor -> selección)
  const [seleccion, setSeleccion] = useState<Record<string, SeleccionMateria>>(
    {}
  );

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
        return Promise.all([listarProfesores(), listarMateriasAdmin()]);
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

  function cambiarSeleccion(
    profesorId: string,
    cambios: Partial<SeleccionMateria>
  ) {
    setSeleccion((actual) => ({
      ...actual,
      [profesorId]: { ...(actual[profesorId] ?? SELECCION_VACIA), ...cambios },
    }));
  }

  async function asignar(p: Profesor, materiaId: string) {
    if (!materiaId) return;
    await ejecutar(async () => {
      await asignarMateria(p.id, materiaId);
      // Se conservan la carrera y el año para poder asignar otra materia seguida
      cambiarSeleccion(p.id, { materia: "" });
      refrescar();
    });
  }

  async function quitar(p: Profesor, m: MateriaAdmin) {
    // Solo se quita la asignación: clases, alumnos y asistencias quedan intactos
    if (!confirm(`¿Quitar la materia ${descripcionMateria(m)} a ${p.nombre}?`))
      return;
    await ejecutar(async () => {
      await quitarMateria(p.id, m.id);
      refrescar();
    });
  }

  // Materias que dicta cada profesor (a partir de la lista de materias)
  function materiasDe(profesorId: string): MateriaAdmin[] {
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

      <NavAdministracion actual="profesores" />

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
          // Solo se asignan materias activas de ciclos abiertos
          const disponibles = materias.filter(
            (m) =>
              m.activo &&
              m.cicloEstado === "abierto" &&
              !m.profesores.some((x) => x.id === p.id)
          );
          const f = opcionesEncadenadas(
            disponibles,
            seleccion[p.id] ?? SELECCION_VACIA
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
                    {descripcionMateria(m)}
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
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    marginTop: "8px",
                  }}
                >
                  <select
                    value={f.carrera}
                    onChange={(e) =>
                      cambiarSeleccion(p.id, {
                        carrera: e.target.value,
                        anio: "",
                        materia: "",
                      })
                    }
                    aria-label={`Carrera de la materia a asignar a ${p.nombre}`}
                  >
                    <option value="">1. Elegí la carrera...</option>
                    {f.carreras.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <select
                    value={f.anio}
                    disabled={!f.carrera}
                    onChange={(e) =>
                      cambiarSeleccion(p.id, {
                        anio: e.target.value,
                        materia: "",
                      })
                    }
                    aria-label={`Año de la materia a asignar a ${p.nombre}`}
                  >
                    <option value="">2. Elegí el año...</option>
                    {f.anios.map((a) => (
                      <option key={a} value={String(a)}>
                        {a}.º Año
                      </option>
                    ))}
                  </select>
                  <select
                    value={f.materia}
                    disabled={!f.anio}
                    onChange={(e) =>
                      cambiarSeleccion(p.id, { materia: e.target.value })
                    }
                    aria-label={`Materia a asignar a ${p.nombre}`}
                  >
                    <option value="">3. Elegí la materia...</option>
                    {f.materias.map((m) => (
                      <option key={m.id} value={m.id}>
                        {etiquetaOpcion(m)}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => asignar(p, f.materia)}
                    disabled={guardando || !f.materia}
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