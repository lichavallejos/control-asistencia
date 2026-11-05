// Ayudas para mostrar las materias del profesor (carrera, ciclo y cuatrimestre).
// Las usan las pantallas de Asistencia y Alumnos.

import type { MateriaPropia } from "./datos";

// "1.er cuatrimestre", "2.º cuatrimestre", o vacío si la materia es anual
export function textoCuatrimestre(
  m: Pick<MateriaPropia, "duracion" | "cuatrimestre">
): string {
  if (m.duracion !== "cuatrimestral") return "";
  return m.cuatrimestre === 1 ? "1.er cuatrimestre" : "2.º cuatrimestre";
}

// Detalle corto que distingue materias parecidas, por ejemplo
// "1.er cuatrimestre · Ciclo 2026" o "Ciclo 2025 · cerrado · solo lectura"
export function detalleMateria(
  m: Pick<MateriaPropia, "duracion" | "cuatrimestre" | "cicloAnio" | "cicloEstado">
): string {
  return [
    textoCuatrimestre(m),
    `Ciclo ${m.cicloAnio}`,
    m.cicloEstado === "cerrado" ? "cerrado · solo lectura" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

// Agrupa por carrera y año. Dentro de cada grupo: ciclo más nuevo primero,
// después cuatrimestre y nombre.
export function agruparPorCarreraYAnio<
  T extends Pick<
    MateriaPropia,
    "carreraNombre" | "anio" | "cicloAnio" | "cuatrimestre" | "nombre"
  >
>(lista: T[]): { etiqueta: string; materias: T[] }[] {
  const ordenadas = [...lista].sort(
    (a, b) =>
      a.carreraNombre.localeCompare(b.carreraNombre, "es") ||
      a.anio - b.anio ||
      b.cicloAnio - a.cicloAnio ||
      (a.cuatrimestre ?? 0) - (b.cuatrimestre ?? 0) ||
      a.nombre.localeCompare(b.nombre, "es")
  );
  const grupos: { etiqueta: string; materias: T[] }[] = [];
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
