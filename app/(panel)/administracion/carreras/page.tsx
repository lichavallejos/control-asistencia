"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { esAdministrador } from "@/lib/sesion";
import NavAdministracion from "@/components/NavAdministracion";
import {
  cambiarEstadoCarrera,
  crearCarrera,
  editarCarrera,
  listarCarreras,
  type Carrera,
} from "@/lib/datos";

type FormCarrera = {
  id: string | null; // vacío si es una carrera nueva
  nombre: string;
};

export default function CarrerasPage() {
  const router = useRouter();
  const [carreras, setCarreras] = useState<Carrera[] | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [form, setForm] = useState<FormCarrera | null>(null);
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
        return listarCarreras();
      })
      .then((resultado) => {
        if (!activo || !resultado) return;
        setCarreras(resultado);
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

  function abrirNueva() {
    setForm({ id: null, nombre: "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function abrirEditar(c: Carrera) {
    setForm({ id: c.id, nombre: c.nombre });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function guardar() {
    if (!form) return;
    const nombre = form.nombre.trim();
    if (!nombre) {
      alert("Ingresá el nombre de la carrera.");
      return;
    }
    await ejecutar(async () => {
      if (form.id) {
        await editarCarrera(form.id, nombre);
      } else {
        await crearCarrera(nombre);
      }
      setForm(null);
      refrescar();
    });
  }

  async function cambiarEstado(c: Carrera) {
    if (c.activo) {
      // Solo se desactiva la carrera: sus materias, alumnos e historial no se tocan
      const materias =
        c.cantidadMaterias === 1
          ? "su materia"
          : `sus ${c.cantidadMaterias} materias`;
      const ok = confirm(
        `¿Desactivar la carrera "${c.nombre}"?\n\n` +
          `No se podrán crear materias nuevas en ella. ` +
          `${materias.charAt(0).toUpperCase()}${materias.slice(1)}, los alumnos y el historial no se tocan.`
      );
      if (!ok) return;
    }
    await ejecutar(async () => {
      await cambiarEstadoCarrera(c.id, !c.activo);
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

      {error && (
        <p className="error-msg" style={{ marginBottom: "12px" }}>
          {error}
        </p>
      )}

      {form && (
        <div className="card" style={{ borderTopColor: "var(--accent)" }}>
          <div className="card-title">
            {form.id === null ? "Agregar Carrera Nueva" : "Editar Carrera"}
          </div>
          <div className="form-group">
            <label htmlFor="carrera-nombre">Nombre de la carrera</label>
            <input
              type="text"
              id="carrera-nombre"
              placeholder="Ej: Profesorado de Inglés"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            />
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

      <div className="card">
        <div className="card-title">
          <span>Carreras</span>
          <button onClick={abrirNueva} className="btn btn-outline btn-sm">
            + Nueva carrera
          </button>
        </div>

        {carreras === null && !error && (
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Cargando...
          </p>
        )}

        {carreras !== null && carreras.length === 0 && (
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Todavía no hay carreras cargadas.
          </p>
        )}

        {carreras?.map((c) => (
          <div className="alumno-card" key={c.id}>
            <div className="alumno-info">
              <div>
                <span className="alumno-nombre">{c.nombre}</span>
                <div className="alumno-sub">
                  {c.cantidadMaterias === 1
                    ? "1 materia"
                    : `${c.cantidadMaterias} materias`}
                </div>
              </div>
              {!c.activo && <span className="badge badge-warning">Inactiva</span>}
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              <button
                onClick={() => abrirEditar(c)}
                disabled={guardando}
                className="btn btn-outline btn-sm"
                style={{ flex: 1 }}
              >
                Editar
              </button>
              <button
                onClick={() => cambiarEstado(c)}
                disabled={guardando}
                className="btn btn-outline btn-sm"
                style={{
                  flex: 1,
                  color: c.activo ? "var(--danger)" : undefined,
                }}
              >
                {c.activo ? "Desactivar" : "Activar"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
