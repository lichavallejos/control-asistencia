// Guarda las planillas de asistencia en el navegador (localStorage).
// TEMPORAL: en el paso de Supabase se reemplaza por la tabla "asistencias".

export type RegistroAlumno = {
  alumnoId: number;
  estado: "presente" | "ausente";
  motivo: string;
  observacion: string;
};

export type Planilla = {
  cursoId: number;
  fecha: string; // formato AAAA-MM-DD
  registros: RegistroAlumno[];
};

const CLAVE = "isfd_planillas";

export function obtenerPlanillas(): Planilla[] {
  try {
    const datos = localStorage.getItem(CLAVE);
    return datos ? (JSON.parse(datos) as Planilla[]) : [];
  } catch {
    return [];
  }
}

export function obtenerPlanilla(cursoId: number, fecha: string): Planilla | null {
  return (
    obtenerPlanillas().find((p) => p.cursoId === cursoId && p.fecha === fecha) ??
    null
  );
}

export function guardarPlanilla(planilla: Planilla) {
  const otras = obtenerPlanillas().filter(
    (p) => !(p.cursoId === planilla.cursoId && p.fecha === planilla.fecha)
  );
  localStorage.setItem(CLAVE, JSON.stringify([...otras, planilla]));
}

export function eliminarPlanilla(cursoId: number, fecha: string) {
  const resto = obtenerPlanillas().filter(
    (p) => !(p.cursoId === cursoId && p.fecha === fecha)
  );
  localStorage.setItem(CLAVE, JSON.stringify(resto));
}
