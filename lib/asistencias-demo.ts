// Guarda las planillas de asistencia en el navegador (localStorage).
// TEMPORAL: en el paso 16b se reemplaza por las tablas "clases" y "asistencias".

export type RegistroAlumno = {
  alumnoId: string; // id de la persona
  estado: "presente" | "ausente";
  motivo: string;
  observacion: string;
};

export type Planilla = {
  materiaId: string;
  fecha: string; // formato AAAA-MM-DD
  registros: RegistroAlumno[];
};

const CLAVE = "isfd_planillas_v2";

export function obtenerPlanillas(): Planilla[] {
  try {
    const datos = localStorage.getItem(CLAVE);
    return datos ? (JSON.parse(datos) as Planilla[]) : [];
  } catch {
    return [];
  }
}

export function obtenerPlanilla(materiaId: string, fecha: string): Planilla | null {
  return (
    obtenerPlanillas().find((p) => p.materiaId === materiaId && p.fecha === fecha) ??
    null
  );
}

export function guardarPlanilla(planilla: Planilla) {
  const otras = obtenerPlanillas().filter(
    (p) => !(p.materiaId === planilla.materiaId && p.fecha === planilla.fecha)
  );
  localStorage.setItem(CLAVE, JSON.stringify([...otras, planilla]));
}

export function eliminarPlanilla(materiaId: string, fecha: string) {
  const resto = obtenerPlanillas().filter(
    (p) => !(p.materiaId === materiaId && p.fecha === fecha)
  );
  localStorage.setItem(CLAVE, JSON.stringify(resto));
}