"use client";

import { createPortal } from "react-dom";

export type FilaInforme = {
  nombre: string;
  dni: string;
  presentes: number;
  ausJustificadas: number;
  ausInjustificadas: number;
};

export type DatosInforme = {
  materia: string;
  anio: number;
  docente: string;
  totalClases: number;
  filas: FilaInforme[];
};

// Informe que solo se ve al imprimir o guardar como PDF (ver reglas @media print en globals.css).
// Se dibuja directamente en <body> para que la impresión no arrastre el resto de la página.
export default function InformeAsistencia({ datos }: { datos: DatosInforme }) {
  return createPortal(
    <div
      id="contenedor-impresion"
      style={{
        padding: "20px",
        fontFamily: "Arial, sans-serif",
        background: "#ffffff",
        color: "#111827",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: "20px" }}>
        <h2 style={{ color: "#078a78", marginBottom: "5px" }}>
          Informe de Asistencia
        </h2>
        <p>
          <strong>Materia:</strong> {datos.materia} ({datos.anio}.º Año) |{" "}
          <strong>Docente:</strong> {datos.docente}
        </p>
        <p style={{ fontSize: "0.85em", color: "#666" }}>
          Total de clases registradas: {datos.totalClases}
        </p>
      </div>

      <table
        style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85em" }}
      >
        <thead>
          <tr style={{ background: "#078a78", color: "white" }}>
            <th style={{ padding: "8px", textAlign: "left" }}>Alumno</th>
            <th style={{ padding: "8px" }}>Presentes</th>
            <th style={{ padding: "8px" }}>Aus. Just.</th>
            <th style={{ padding: "8px" }}>Aus. Injust.</th>
            <th style={{ padding: "8px" }}>% Asistencia</th>
          </tr>
        </thead>
        <tbody>
          {datos.filas.map((f, i) => {
            const pct = (f.presentes / datos.totalClases) * 100;
            return (
              <tr key={i} style={{ borderBottom: "1px solid #ddd" }}>
                <td style={{ padding: "8px" }}>
                  {f.nombre} ({f.dni || "S/D"})
                </td>
                <td style={{ padding: "8px", textAlign: "center" }}>
                  {f.presentes}
                </td>
                <td style={{ padding: "8px", textAlign: "center" }}>
                  {f.ausJustificadas}
                </td>
                <td style={{ padding: "8px", textAlign: "center" }}>
                  {f.ausInjustificadas}
                </td>
                <td
                  style={{
                    padding: "8px",
                    textAlign: "center",
                    fontWeight: "bold",
                    color: pct >= 75 ? "#10B981" : "#EF4444",
                  }}
                >
                  {pct.toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>,
    document.body
  );
}
