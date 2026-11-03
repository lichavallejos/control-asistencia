"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { esAdministrador } from "@/lib/sesion";
import NavAdministracion from "@/components/NavAdministracion";
import {
  cerrarCiclo,
  crearCiclo,
  editarCiclo,
  listarCiclos,
  reabrirCiclo,
  type Ciclo,
} from "@/lib/datos";

type FormCiclo = {
  id: string | null; // vacío si es un ciclo nuevo
  anio: string;
  inicio1: string;
  fin1: string;
  inicio2: string;
  fin2: string;
  aprobado: string; // solo se usa al editar
  regular: string; // solo se usa al editar
};

// "2026-03-02" -> "02/03/2026" (sin pasar por Date, para evitar corrimientos de zona horaria)
function verFecha(f: string | null): string {
  if (!f) return "";
  const [a, m, d] = f.split("-");
  return `${d}/${m}/${a}`;
}

function verPeriodo(inicio: string | null, fin: string | null): string {
  if (inicio && fin) return `del ${verFecha(inicio)} al ${verFecha(fin)}`;
  if (inicio) return `desde el ${verFecha(inicio)}`;
  if (fin) return `hasta el ${verFecha(fin)}`;
  return "sin fechas cargadas";
}

function verNumero(n: number): string {
  return String(n).replace(".", ",");
}

function aNumero(texto: string): number {
  return Number(texto.trim().replace(",", "."));
}

const nulaSiVacia = (v: string): string | null => (v === "" ? null : v);

export default function CiclosPage() {
  const router = useRouter();
  const [ciclos, setCiclos] = useState<Ciclo[] | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [form, setForm] = useState<FormCiclo | null>(null);
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
        return listarCiclos();
      })
      .then((resultado) => {
        if (!activo || !resultado) return;
        setCiclos(resultado);
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

  function abrirNuevo() {
    // Se sugiere el año siguiente al último ciclo (o el año actual si no hay ninguno)
    const sugerido =
      ciclos && ciclos.length > 0
        ? Math.max(...ciclos.map((c) => c.anio)) + 1
        : new Date().getFullYear();
    setForm({
      id: null,
      anio: String(sugerido),
      inicio1: "",
      fin1: "",
      inicio2: "",
      fin2: "",
      aprobado: "",
      regular: "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function abrirEditar(c: Ciclo) {
    setForm({
      id: c.id,
      anio: String(c.anio),
      inicio1: c.inicio1 ?? "",
      fin1: c.fin1 ?? "",
      inicio2: c.inicio2 ?? "",
      fin2: c.fin2 ?? "",
      aprobado: verNumero(c.umbralAprobado),
      regular: verNumero(c.umbralRegular),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function guardar() {
    if (!form) return;
    const fechas = {
      inicio1: nulaSiVacia(form.inicio1),
      fin1: nulaSiVacia(form.fin1),
      inicio2: nulaSiVacia(form.inicio2),
      fin2: nulaSiVacia(form.fin2),
    };

    if (form.id === null) {
      const anio = Number(form.anio);
      if (!Number.isInteger(anio)) {
        alert("Ingresá un año válido, por ejemplo 2026.");
        return;
      }
      await ejecutar(async () => {
        await crearCiclo(anio, fechas);
        setForm(null);
        refrescar();
      });
      return;
    }

    const id = form.id;
    const aprobado = aNumero(form.aprobado);
    const regular = aNumero(form.regular);
    if (Number.isNaN(aprobado) || Number.isNaN(regular) || form.aprobado.trim() === "" || form.regular.trim() === "") {
      alert("Ingresá los dos umbrales como números, por ejemplo 85 y 75.");
      return;
    }
    await ejecutar(async () => {
      await editarCiclo(id, fechas, aprobado, regular);
      setForm(null);
      refrescar();
    });
  }

  async function cerrar(c: Ciclo) {
    const ok = confirm(
      `¿Cerrar el ciclo ${c.anio}?\n\n` +
        `Las materias de este ciclo pasan a solo lectura: los profesores no podrán ` +
        `cargar clases ni asistencias, corregirlas ni dar bajas. ` +
        `Podés reabrirlo cuando quieras.`
    );
    if (!ok) return;
    await ejecutar(async () => {
      await cerrarCiclo(c.id);
      refrescar();
    });
  }

  async function reabrir(c: Ciclo) {
    await ejecutar(async () => {
      await reabrirCiclo(c.id);
      refrescar();
    });
  }

  return (
    <section className="seccion active">
      <div className="section__header">
        <h2 className="section__title">Administración</h2>
        <div className="section__line"></div>
      </div>

      <NavAdministracion actual="ciclos" />

      {error && (
        <p className="error-msg" style={{ marginBottom: "12px" }}>
          {error}
        </p>
      )}

      {form && (
        <div className="card" style={{ borderTopColor: "var(--accent)" }}>
          <div className="card-title">
            {form.id === null
              ? "Agregar Ciclo Lectivo Nuevo"
              : `Editar Ciclo ${form.anio}`}
          </div>

          {form.id === null && (
            <div className="form-group">
              <label htmlFor="ciclo-anio">Año</label>
              <input
                type="number"
                id="ciclo-anio"
                placeholder="Ej: 2026"
                value={form.anio}
                onChange={(e) => setForm({ ...form, anio: e.target.value })}
              />
            </div>
          )}

          <div style={{ display: "flex", gap: "10px" }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="ciclo-inicio1">1.er cuatrimestre: inicio</label>
              <input
                type="date"
                id="ciclo-inicio1"
                value={form.inicio1}
                onChange={(e) => setForm({ ...form, inicio1: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="ciclo-fin1">1.er cuatrimestre: fin</label>
              <input
                type="date"
                id="ciclo-fin1"
                value={form.fin1}
                onChange={(e) => setForm({ ...form, fin1: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="ciclo-inicio2">2.º cuatrimestre: inicio</label>
              <input
                type="date"
                id="ciclo-inicio2"
                value={form.inicio2}
                onChange={(e) => setForm({ ...form, inicio2: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="ciclo-fin2">2.º cuatrimestre: fin</label>
              <input
                type="date"
                id="ciclo-fin2"
                value={form.fin2}
                onChange={(e) => setForm({ ...form, fin2: e.target.value })}
              />
            </div>
          </div>

          {form.id === null ? (
            <p
              style={{
                fontSize: "0.8rem",
                color: "var(--text-muted)",
                margin: "0 0 12px",
              }}
            >
              Las fechas se pueden dejar vacías y cargar después. Los umbrales de
              asistencia se copian del ciclo anterior (85 % y 75 % si es el
              primero); se cambian con «Editar».
            </p>
          ) : (
            <div style={{ display: "flex", gap: "10px" }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label htmlFor="ciclo-aprobado">Aprobado desde (%)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  id="ciclo-aprobado"
                  placeholder="Ej: 85"
                  value={form.aprobado}
                  onChange={(e) =>
                    setForm({ ...form, aprobado: e.target.value })
                  }
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label htmlFor="ciclo-regular">Regular desde (%)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  id="ciclo-regular"
                  placeholder="Ej: 75"
                  value={form.regular}
                  onChange={(e) => setForm({ ...form, regular: e.target.value })}
                />
              </div>
            </div>
          )}

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
          <span>Ciclos lectivos</span>
          <button onClick={abrirNuevo} className="btn btn-outline btn-sm">
            + Nuevo ciclo
          </button>
        </div>

        {ciclos === null && !error && (
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Cargando...
          </p>
        )}

        {ciclos !== null && ciclos.length === 0 && (
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Todavía no hay ciclos lectivos cargados.
          </p>
        )}

        {ciclos?.map((c) => (
          <div className="alumno-card" key={c.id}>
            <div className="alumno-info">
              <div>
                <span className="alumno-nombre">Ciclo {c.anio}</span>
                <div className="alumno-sub">
                  1.er cuatrimestre: {verPeriodo(c.inicio1, c.fin1)}
                </div>
                <div className="alumno-sub">
                  2.º cuatrimestre: {verPeriodo(c.inicio2, c.fin2)}
                </div>
                <div className="alumno-sub">
                  Aprobado desde {verNumero(c.umbralAprobado)} % · Regular desde{" "}
                  {verNumero(c.umbralRegular)} %
                </div>
              </div>
              {c.estado === "cerrado" && (
                <span className="badge badge-warning">Cerrado</span>
              )}
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              {c.estado === "abierto" ? (
                <>
                  <button
                    onClick={() => abrirEditar(c)}
                    disabled={guardando}
                    className="btn btn-outline btn-sm"
                    style={{ flex: 1 }}
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => cerrar(c)}
                    disabled={guardando}
                    className="btn btn-outline btn-sm"
                    style={{ flex: 1, color: "var(--danger)" }}
                  >
                    Cerrar ciclo
                  </button>
                </>
              ) : (
                <button
                  onClick={() => reabrir(c)}
                  disabled={guardando}
                  className="btn btn-outline btn-sm"
                  style={{ flex: 1 }}
                >
                  Reabrir ciclo
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
