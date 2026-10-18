"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { esAdministrador } from "@/lib/sesion";
import {
  listarMateriasInstitucion,
  listarProfesores,
  type MateriaConProfesores,
  type Profesor,
} from "@/lib/datos";

export default function AdministracionPage() {
  const router = useRouter();
  const [profesores, setProfesores] = useState<Profesor[] | null>(null);
  const [materias, setMaterias] = useState<MateriaConProfesores[]>([]);
  const [error, setError] = useState("");

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
  }, [router]);

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

      <div className="card">
        <div className="card-title">Profesores</div>

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
                <strong>Materias:</strong>{" "}
                {suyas.length === 0
                  ? "Sin materias asignadas."
                  : suyas.map((m) => `${m.nombre} (${m.anio}.º Año)`).join(", ")}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}