"use client";

import { useEffect, useState } from "react";
import { obtenerUsuario } from "@/lib/sesion";
import { alumnos, cursos, type Profesor } from "@/lib/datos-demo";
import { obtenerPlanillas, type Planilla } from "@/lib/asistencias-demo";



const ANIOS = [1, 2, 3, 4];

export default function DashboardPage() {
  const [usuario, setUsuario] = useState<Profesor | null>(null);
  const [planillas, setPlanillas] = useState<Planilla[]>([]);

  useEffect(() => {
    setUsuario(obtenerUsuario());
    setPlanillas(obtenerPlanillas());
  }, []);

  if (!usuario) return null;

  const misCursos = cursos.filter((c) => usuario.materias.includes(c.id));
  const idsMis = misCursos.map((c) => c.id);

  const stats = [
    [misCursos.length, "materias a cargo"],
    [
      alumnos.filter((a) => idsMis.includes(a.cursoId)).length,
      "estudiantes inscriptos",
    ],
    [
      planillas.filter((h) => idsMis.includes(h.cursoId)).length,
      "clases registradas",
    ],
  ] as const;

  return (
    <section className="seccion active">
      <div className="section__header">
        <h2 className="section__title">Panel docente</h2>
        <div className="section__line"></div>
      </div>

      <div className="stats-grid">
        {stats.map(([n, t]) => (
          <div className="stat" key={t}>
            <div className="stat__number">{n}</div>
            <div className="stat__label">{t}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title">Resumen por Año y Materia</div>
        <div>
          {misCursos.length === 0 && (
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              No hay materias registradas.
            </p>
          )}
          {ANIOS.map((anio) => {
            const cursosAnio = misCursos.filter((c) => (c.anio || 1) === anio);
            if (cursosAnio.length === 0) return null;
            return (
              <div key={anio}>
                <div className="grupo-anio-header">🎓 {anio}.º Año</div>
                {cursosAnio.map((c) => {
                  const cantAlumnos = alumnos.filter(
                    (a) => a.cursoId === c.id
                  ).length;
                  const clases = planillas.filter(
                    (h) => h.cursoId === c.id
                  ).length;
                  return (
                    <div className="materia-row" key={c.id}>
                      <strong>{c.nombre}</strong>
                      <div className="materia-meta">
                        👥 {cantAlumnos} Inscriptos | 📅 {clases} Clases registradas
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