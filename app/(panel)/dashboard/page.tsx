"use client";

import { useEffect, useState } from "react";
import {
  contarAlumnosPorMateria,
  contarClasesPorMateria,
  obtenerMisMaterias,
  type MateriaPropia,
} from "@/lib/datos";

// Agrupa las materias por carrera y año, ordenadas
function agruparPorCarreraYAnio(
  lista: MateriaPropia[]
): { etiqueta: string; materias: MateriaPropia[] }[] {
  const ordenadas = [...lista].sort(
    (a, b) =>
      a.carreraNombre.localeCompare(b.carreraNombre, "es") ||
      a.anio - b.anio ||
      (a.cuatrimestre ?? 0) - (b.cuatrimestre ?? 0) ||
      a.nombre.localeCompare(b.nombre, "es")
  );
  const grupos: { etiqueta: string; materias: MateriaPropia[] }[] = [];
  for (const m of ordenadas) {
    const etiqueta = `${m.carreraNombre} · ${m.anio}.º Año`;
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.etiqueta === etiqueta) {
      ultimo.materias.push(m);
    } else {
      grupos.push({ etiqueta, materias: [m] });
    }
  }
  return grupos;
}

export default function DashboardPage() {
  const [materias, setMaterias] = useState<MateriaPropia[]>([]);
  const [conteo, setConteo] = useState<Record<string, number>>({});
  const [clases, setClases] = useState<Record<string, number>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let activo = true;
    Promise.all([
      obtenerMisMaterias(),
      contarAlumnosPorMateria(),
      contarClasesPorMateria(),
    ])
      .then(([m, c, cl]) => {
        if (!activo) return;
        setMaterias(m);
        setConteo(c);
        setClases(cl);
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

  // El Inicio muestra solo lo que se dicta ahora: materias activas de ciclos abiertos
  const vigentes = materias.filter(
    (m) => m.activo && m.cicloEstado === "abierto"
  );
  const ids = vigentes.map((m) => m.id);
  const totalAlumnos = ids.reduce((suma, id) => suma + (conteo[id] ?? 0), 0);
  const totalClases = ids.reduce((suma, id) => suma + (clases[id] ?? 0), 0);

  const stats = [
    [vigentes.length, "materias a cargo"],
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
              No tenés materias asignadas todavía. Pedile al administrador que te
              las asigne.
            </p>
          )}
          {!cargando && materias.length > 0 && vigentes.length === 0 && (
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              No tenés materias activas en un ciclo abierto. Las anteriores se
              consultan en la pantalla de Alumnos.
            </p>
          )}
          {agruparPorCarreraYAnio(vigentes).map((g) => (
            <div key={g.etiqueta}>
              <div className="grupo-anio-header"> {g.etiqueta}</div>
              {g.materias.map((m) => (
                <div className="materia-row" key={m.id}>
                  <strong>{m.nombre}</strong>
                  <div className="materia-meta">
                    {m.duracion === "cuatrimestral"
                      ? `${m.cuatrimestre === 1 ? "1.er" : "2.º"} cuatrimestre · `
                      : ""}
                    Ciclo {m.cicloAnio}
                  </div>
                  <div className="materia-meta">
                    👥 {conteo[m.id] ?? 0} Inscriptos | {clases[m.id] ?? 0}{" "}
                    Clases registradas
                  </div>
                </div>
              ))}
            </div>
          ))}
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