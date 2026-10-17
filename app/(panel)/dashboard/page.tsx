"use client";

import { useEffect, useState } from "react";
import {
  contarAlumnosPorMateria,
  obtenerMisMaterias,
  type Materia,
} from "@/lib/datos";
import { obtenerPlanillas, type Planilla } from "@/lib/asistencias-demo";

const ANIOS = [1, 2, 3, 4];

export default function DashboardPage() {
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [conteo, setConteo] = useState<Record<string, number>>({});
  const [planillas, setPlanillas] = useState<Planilla[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let activo = true;
    Promise.all([obtenerMisMaterias(), contarAlumnosPorMateria()])
      .then(([m, c]) => {
        if (!activo) return;
        setMaterias(m);
        setConteo(c);
        setPlanillas(obtenerPlanillas());
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

  const ids = materias.map((m) => m.id);
  const totalAlumnos = ids.reduce((suma, id) => suma + (conteo[id] ?? 0), 0);
  const totalClases = planillas.filter((p) => ids.includes(p.materiaId)).length;

  const stats = [
    [materias.length, "materias a cargo"],
    [totalAlumnos, "estudiantes inscriptos"],
    [totalClases, "clases registradas"],
  ] as const;

  return (
    <section className="seccion active">
      <div className="section__header">
        <h2 className="section__title">Panel docente</h2>
        <div className="section__line"></div>
      </div>

      {error && (
        <p className="error-msg" style={{ marginBottom: "12px" }}>
          {error}
        </p>
      )}

      <div className="stats-grid">
        {stats.map(([n, t]) => (
          <div className="stat" key={t}>
            <div className="stat__number">{cargando ? "…" : n}</div>
            <div className="stat__label">{t}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title">Resumen por Año y Materia</div>
        <div>
          {cargando && (
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              Cargando...
            </p>
          )}
          {!cargando && materias.length === 0 && (
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              No hay materias registradas. Creá la primera desde la pestaña
              Alumnos.
            </p>
          )}
          {ANIOS.map((anio) => {
            const delAnio = materias.filter((m) => m.anio === anio);
            if (delAnio.length === 0) return null;
            return (
              <div key={anio}>
                <div className="grupo-anio-header">🎓 {anio}.º Año</div>
                {delAnio.map((m) => {
                  const clases = planillas.filter(
                    (p) => p.materiaId === m.id
                  ).length;
                  return (
                    <div className="materia-row" key={m.id}>
                      <strong>{m.nombre}</strong>
                      <div className="materia-meta">
                        👥 {conteo[m.id] ?? 0} Inscriptos | 📅 {clases} Clases
                        registradas
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Noticias Institucionales</div>
        <div>
          <p style={{ fontSize: "0.88rem", marginBottom: "8px" }}>
            📌 <strong>Ciclo Lectivo:</strong> Bienvenida a las clases del Profesorado.
          </p>
          <p style={{ fontSize: "0.88rem" }}>
            📌 <strong>Secretaría:</strong> Entrega de planillas habilitada hasta fin de mes.
          </p>
        </div>
      </div>
    </section>
  );
}