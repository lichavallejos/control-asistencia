"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { esAdministrador } from "@/lib/sesion";
import NavAdministracion from "@/components/NavAdministracion";
import {
  cambiarEstadoMateria,
  crearMateriaAdmin,
  editarMateriaAdmin,
  listarCarreras,
  listarCiclos,
  listarMateriasAdmin,
  type Carrera,
  type Ciclo,
  type MateriaAdmin,
} from "@/lib/datos";

const ANIOS = [1, 2, 3, 4];

type FormMateria = {
  id: string | null; // vacío si es una materia nueva
  nombre: string;
  anio: string;
  tipo: "materia" | "taller";
  duracion: "anual" | "cuatrimestral";
  cuatrimestre: string; // "1" o "2"; solo se usa si es cuatrimestral
};

function textoTipo(tipo: MateriaAdmin["tipo"]): string {
  return tipo === "taller" ? "Taller" : "Materia";
}

function textoDuracion(m: MateriaAdmin): string {
  if (m.duracion === "anual") return "Anual";
  return m.cuatrimestre === 1 ? "1.er cuatrimestre" : "2.º cuatrimestre";
}

// Ciclo que se muestra al entrar: el abierto más nuevo (o el más nuevo si no hay abiertos)
function cicloPorDefecto(ciclos: Ciclo[]): string {
  const abiertos = ciclos.filter((c) => c.estado === "abierto");
  const lista = abiertos.length > 0 ? abiertos : ciclos;
  if (lista.length === 0) return "";
  return lista.reduce((a, b) => (b.anio > a.anio ? b : a)).id;
}

export default function MateriasDeCarreraPage() {
  const router = useRouter();
  const { id: carreraId } = useParams<{ id: string }>();
  const [cargado, setCargado] = useState(false);
  const [carrera, setCarrera] = useState<Carrera | null>(null);
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [materias, setMaterias] = useState<MateriaAdmin[]>([]);
  const [cicloId, setCicloId] = useState("");
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [form, setForm] = useState<FormMateria | null>(null);
  const [guardando, setGuardando] = useState(false);

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
        return Promise.all([
          listarCarreras(),
          listarCiclos(),
          listarMateriasAdmin(),
        ]);
      })
      .then((resultado) => {
        if (!activo || !resultado) return;
        const [listaCarreras, listaCiclos, listaMaterias] = resultado;
        setCarrera(listaCarreras.find((c) => c.id === carreraId) ?? null);
        setCiclos(listaCiclos);
        setMaterias(listaMaterias);
        // Se conserva el ciclo elegido; si no hay uno válido, se usa el de por defecto
        setCicloId((actual) =>
          actual && listaCiclos.some((c) => c.id === actual)
            ? actual
            : cicloPorDefecto(listaCiclos)
        );
        setCargado(true);
      })
      .catch((e: Error) => {
        if (activo) setError(e.message);
      });
    return () => {
      activo = false;
    };
  }, [router, version, carreraId]);

  const refrescar = () => setVersion((v) => v + 1);

  const ciclo = ciclos.find((c) => c.id === cicloId) ?? null;
  const cerrado = ciclo?.estado === "cerrado";
  const materiasDelCiclo = materias.filter(
    (m) => m.carreraId === carreraId && m.cicloId === cicloId
  );
  const puedeCrear = !!carrera && carrera.activo && !!ciclo && !cerrado;

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

  function abrirNueva() {
    setForm({
      id: null,
      nombre: "",
      anio: "1",
      tipo: "materia",
      duracion: "anual",
      cuatrimestre: "1",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function abrirEditar(m: MateriaAdmin) {
    setForm({
      id: m.id,
      nombre: m.nombre,
      anio: String(m.anio),
      tipo: m.tipo,
      duracion: m.duracion,
      cuatrimestre: String(m.cuatrimestre ?? 1),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function guardar() {
    if (!form || !carrera) return;
    const nombre = form.nombre.trim();
    if (!nombre) {
      alert("Ingresá el nombre de la materia.");
      return;
    }
    const datos = {
      nombre,
      anio: Number(form.anio),
      tipo: form.tipo,
      duracion: form.duracion,
      cuatrimestre:
        form.duracion === "cuatrimestral" ? Number(form.cuatrimestre) : null,
    };
    const id = form.id;
    await ejecutar(async () => {
      if (id) {
        await editarMateriaAdmin(id, datos, carrera.id);
      } else {
        await crearMateriaAdmin(datos, carrera.id, cicloId);
      }
      setForm(null);
      refrescar();
    });
  }

  async function cambiarEstado(m: MateriaAdmin) {
    if (m.activo) {
      const ok = confirm(
        `¿Desactivar la materia "${m.nombre}"?\n\n` +
          `Los profesores dejan de verla en Asistencia. El administrador y la planilla ` +
          `PDF la siguen mostrando. No se borra nada y se puede volver a activar.`
      );
      if (!ok) return;
    }
    await ejecutar(async () => {
      await cambiarEstadoMateria(m.id, !m.activo);
      refrescar();
    });
  }

  return (
    <section className="seccion active">
      <div className="section__header">
        <h2 className="section__title">Administración</h2>
        <div className="section__line"></div>
      </div>

      <NavAdministracion actual="carreras" />

      <div style={{ marginBottom: "12px" }}>
        <Link
          href="/administracion/carreras"
          style={{ fontSize: "0.85rem", textDecoration: "none" }}
        >
          ← Volver a Carreras
        </Link>
      </div>

      {error && (
        <p className="error-msg" style={{ marginBottom: "12px" }}>
          {error}
        </p>
      )}

      {!cargado && !error && (
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
          Cargando...
        </p>
      )}

      {cargado && !carrera && (
        <div className="card">
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            No se encontró esa carrera. Volvé a la lista de carreras y elegí una.
          </p>
        </div>
      )}

      {cargado && carrera && form && (
        <div className="card" style={{ borderTopColor: "var(--accent)" }}>
          <div className="card-title">
            {form.id === null ? "Agregar Materia Nueva" : "Editar Materia"}
          </div>
          <p
            style={{
              fontSize: "0.8rem",
              color: "var(--text-muted)",
              margin: "0 0 12px",
            }}
          >
            {carrera.nombre}
            {ciclo ? ` · Ciclo ${ciclo.anio}` : ""}
          </p>

          <div className="form-group">
            <label htmlFor="materia-nombre">Nombre de la materia</label>
            <input
              type="text"
              id="materia-nombre"
              placeholder="Ej: Didáctica de la Lengua"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            />
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="materia-anio">Año</label>
              <select
                id="materia-anio"
                value={form.anio}
                onChange={(e) => setForm({ ...form, anio: e.target.value })}
              >
                {ANIOS.map((a) => (
                  <option key={a} value={a}>
                    {a}.º Año
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="materia-tipo">Tipo</label>
              <select
                id="materia-tipo"
                value={form.tipo}
                onChange={(e) =>
                  setForm({
                    ...form,
                    tipo: e.target.value as FormMateria["tipo"],
                  })
                }
              >
                <option value="materia">Materia</option>
                <option value="taller">Taller</option>
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="materia-duracion">Duración</label>
              <select
                id="materia-duracion"
                value={form.duracion}
                onChange={(e) =>
                  setForm({
                    ...form,
                    duracion: e.target.value as FormMateria["duracion"],
                  })
                }
              >
                <option value="anual">Anual</option>
                <option value="cuatrimestral">Cuatrimestral</option>
              </select>
            </div>
            {form.duracion === "cuatrimestral" && (
              <div className="form-group" style={{ flex: 1 }}>
                <label htmlFor="materia-cuatrimestre">Cuatrimestre</label>
                <select
                  id="materia-cuatrimestre"
                  value={form.cuatrimestre}
                  onChange={(e) =>
                    setForm({ ...form, cuatrimestre: e.target.value })
                  }
                >
                  <option value="1">1.er cuatrimestre</option>
                  <option value="2">2.º cuatrimestre</option>
                </select>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={guardar}
              disabled={guardando}
              className="btn btn-primary"
              style={{ flex: 1 }}
            >
              Guardar
            </button>
            <button
              onClick={() => setForm(null)}
              disabled={guardando}
              className="btn btn-outline"
              style={{ flex: 1 }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {cargado && carrera && (
        <div className="card">
          <div className="card-title">
            <span>
              {carrera.nombre}
              {!carrera.activo && (
                <span
                  className="badge badge-warning"
                  style={{ marginLeft: "8px" }}
                >
                  Inactiva
                </span>
              )}
            </span>
            <button
              onClick={abrirNueva}
              disabled={!puedeCrear || guardando}
              className="btn btn-outline btn-sm"
            >
              + Nueva materia
            </button>
          </div>

          {ciclos.length === 0 ? (
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
              Todavía no hay ciclos lectivos. Creá uno en la sección Ciclos para
              poder cargar materias.
            </p>
          ) : (
            <>
              <div className="form-group">
                <label htmlFor="materias-ciclo">Ciclo lectivo</label>
                <select
                  id="materias-ciclo"
                  value={cicloId}
                  onChange={(e) => {
                    setCicloId(e.target.value);
                    setForm(null);
                  }}
                >
                  {ciclos.map((c) => (
                    <option key={c.id} value={c.id}>
                      Ciclo {c.anio} ({c.estado})
                    </option>
                  ))}
                </select>
              </div>

              {!carrera.activo && (
                <p
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--text-muted)",
                    margin: "0 0 12px",
                  }}
                >
                  La carrera está desactivada: no admite materias nuevas.
                  Reactivala desde la lista de carreras para crear materias. Las
                  que ya tiene se siguen viendo.
                </p>
              )}
              {carrera.activo && cerrado && (
                <p
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--text-muted)",
                    margin: "0 0 12px",
                  }}
                >
                  El ciclo {ciclo?.anio} está cerrado: no se pueden crear ni
                  editar materias. Reabrilo desde la sección Ciclos si hace
                  falta.
                </p>
              )}

              {materiasDelCiclo.length === 0 && (
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  Esta carrera no tiene materias en el ciclo {ciclo?.anio}.
                </p>
              )}

              {materiasDelCiclo.map((m) => (
                <div className="alumno-card" key={m.id}>
                  <div className="alumno-info">
                    <div>
                      <span className="alumno-nombre">{m.nombre}</span>
                      <div className="alumno-sub">
                        {m.anio}.º Año · {textoTipo(m.tipo)} · {textoDuracion(m)}
                      </div>
                      <div className="alumno-sub">
                        {m.profesores.length === 0
                          ? "Sin profesores asignados"
                          : m.profesores.map((p) => p.nombre).join(" · ")}
                      </div>
                    </div>
                    {!m.activo && (
                      <span className="badge badge-warning">Inactiva</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                    <button
                      onClick={() => abrirEditar(m)}
                      disabled={guardando || cerrado}
                      className="btn btn-outline btn-sm"
                      style={{ flex: 1 }}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => cambiarEstado(m)}
                      disabled={guardando}
                      className="btn btn-outline btn-sm"
                      style={{
                        flex: 1,
                        color: m.activo ? "var(--danger)" : undefined,
                      }}
                    >
                      {m.activo ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}