// Copia de seguridad: junta materias, alumnos, clases y asistencias del
// profesor en un solo objeto. La seguridad la dan las políticas RLS:
// solo se descarga lo que la cuenta puede ver.

import { crearClienteNavegador } from "./supabase/client";
import { leerTodo, obtenerMisMaterias, type Materia } from "./datos";

type Respuesta<T> = {
  data: T[] | null;
  error: { message: string; code?: string } | null;
};

type FilaInscripcion = {
  id: string;
  alumno_id: string;
  materia_id: string;
  personas: { apellido_nombre: string; dni: string | null } | null;
};

type FilaClase = { id: string; materia_id: string; fecha: string };

type FilaAsistencia = {
  clase_id: string;
  inscripcion_id: string;
  materia_id: string;
  estado: string;
  motivo: string | null;
  observacion: string | null;
};

export type Respaldo = {
  version: number;
  generadoEn: string;
  totales: {
    materias: number;
    alumnos: number;
    clases: number;
    asistencias: number;
  };
  materias: Materia[];
  alumnos: {
    inscripcionId: string;
    personaId: string;
    materiaId: string;
    nombre: string;
    dni: string;
  }[];
  clases: { id: string; materiaId: string; fecha: string }[];
  asistencias: {
    claseId: string;
    inscripcionId: string;
    materiaId: string;
    estado: string;
    motivo: string;
    observacion: string;
  }[];
};

export async function generarRespaldo(): Promise<Respaldo> {
  const supabase = crearClienteNavegador();

  const materias = await obtenerMisMaterias();

  const inscripciones = await leerTodo<FilaInscripcion>(
    (desde, hasta) =>
      supabase
        .from("inscripciones")
        .select("id, alumno_id, materia_id, personas ( apellido_nombre, dni )")
        .order("id")
        .range(desde, hasta) as unknown as PromiseLike<Respuesta<FilaInscripcion>>,
    "No se pudieron leer los alumnos para la copia."
  );

  const clases = await leerTodo<FilaClase>(
    (desde, hasta) =>
      supabase
        .from("clases")
        .select("id, materia_id, fecha")
        .order("id")
        .range(desde, hasta) as unknown as PromiseLike<Respuesta<FilaClase>>,
    "No se pudieron leer las clases para la copia."
  );

  const asistencias = await leerTodo<FilaAsistencia>(
    (desde, hasta) =>
      supabase
        .from("asistencias")
        .select(
          "clase_id, inscripcion_id, materia_id, estado, motivo, observacion"
        )
        .order("id")
        .range(desde, hasta) as unknown as PromiseLike<Respuesta<FilaAsistencia>>,
    "No se pudieron leer las asistencias para la copia."
  );

  const alumnos = inscripciones.map((f) => ({
    inscripcionId: f.id,
    personaId: f.alumno_id,
    materiaId: f.materia_id,
    nombre: f.personas?.apellido_nombre ?? "",
    dni: f.personas?.dni ?? "",
  }));

  const clasesCopia = clases.map((c) => ({
    id: c.id,
    materiaId: c.materia_id,
    fecha: c.fecha,
  }));

  const asistenciasCopia = asistencias.map((a) => ({
    claseId: a.clase_id,
    inscripcionId: a.inscripcion_id,
    materiaId: a.materia_id,
    estado: a.estado,
    motivo: a.motivo ?? "",
    observacion: a.observacion ?? "",
  }));

  return {
    version: 1,
    generadoEn: new Date().toISOString(),
    totales: {
      materias: materias.length,
      alumnos: alumnos.length,
      clases: clasesCopia.length,
      asistencias: asistenciasCopia.length,
    },
    materias,
    alumnos,
    clases: clasesCopia,
    asistencias: asistenciasCopia,
  };
}