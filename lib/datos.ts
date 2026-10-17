// Acceso a los datos REALES en Supabase (materias, alumnos e inscripciones).
// La seguridad la dan las políticas RLS: cada profesor solo ve lo suyo.

import { crearClienteNavegador } from "./supabase/client";

export type Materia = {
  id: string;
  nombre: string;
  anio: number;
};

// Un alumno visto dentro de una materia
export type AlumnoDeMateria = {
  inscripcionId: string; // la inscripción (alumno + materia)
  personaId: string; // la persona
  nombre: string;
  dni: string;
};

type ErrorSupabase = { message: string; code?: string };

type FilaInscripcion = {
  id: string;
  alumno_id: string;
  personas: { apellido_nombre: string; dni: string | null } | null;
};

function aError(error: ErrorSupabase, porDefecto: string): Error {
  if (error.message.includes("personas_dni_unico")) {
    return new Error("Ya existe un alumno con ese DNI.");
  }
  if (error.message.includes("inscripciones_alumno_id_materia_id_key")) {
    return new Error("Ese alumno ya está inscripto en esta materia.");
  }
  console.error(error);
  return new Error(porDefecto);
}

// ---------- Materias ----------

export async function obtenerMisMaterias(): Promise<Materia[]> {
  const { data, error } = await crearClienteNavegador()
    .from("materias")
    .select("id, nombre, anio")
    .order("anio")
    .order("nombre");
  if (error) throw aError(error, "No se pudieron cargar las materias.");
  return data as Materia[];
}

export async function crearMateria(nombre: string, anio: number): Promise<string> {
  const { data, error } = await crearClienteNavegador().rpc("crear_materia", {
    p_nombre: nombre,
    p_anio: anio,
  });
  if (error) throw aError(error, "No se pudo crear la materia.");
  return data as string;
}

// ---------- Alumnos ----------

export async function obtenerAlumnosDeMateria(
  materiaId: string
): Promise<AlumnoDeMateria[]> {
  const { data, error } = await crearClienteNavegador()
    .from("inscripciones")
    .select("id, alumno_id, personas ( apellido_nombre, dni )")
    .eq("materia_id", materiaId);
  if (error) throw aError(error, "No se pudieron cargar los alumnos.");

  const filas = data as unknown as FilaInscripcion[];
  return filas
    .map((fila) => ({
      inscripcionId: fila.id,
      personaId: fila.alumno_id,
      nombre: fila.personas?.apellido_nombre ?? "",
      dni: fila.personas?.dni ?? "",
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

// Cantidad de alumnos por materia (para el panel de inicio)
export async function contarAlumnosPorMateria(): Promise<Record<string, number>> {
  const { data, error } = await crearClienteNavegador()
    .from("inscripciones")
    .select("materia_id");
  if (error) throw aError(error, "No se pudo contar los alumnos.");

  const conteo: Record<string, number> = {};
  (data as { materia_id: string }[]).forEach((f) => {
    conteo[f.materia_id] = (conteo[f.materia_id] ?? 0) + 1;
  });
  return conteo;
}

async function miInstitucionId(): Promise<string> {
  const { data, error } = await crearClienteNavegador()
    .from("instituciones")
    .select("id")
    .maybeSingle();
  if (error || !data) throw new Error("No se pudo identificar tu institución.");
  return data.id as string;
}

// Agrega un alumno a una materia. Si ya existe una persona con ese DNI,
// la reutiliza (una misma persona puede cursar varias materias).
export async function agregarAlumno(
  nombre: string,
  dni: string,
  materiaId: string
): Promise<void> {
  const supabase = crearClienteNavegador();
  let personaId: string | null = null;

  if (dni) {
    const { data, error } = await supabase
      .from("personas")
      .select("id")
      .eq("tipo", "alumno")
      .eq("dni", dni)
      .maybeSingle();
    if (error) throw aError(error, "No se pudo buscar al alumno.");
    personaId = data?.id ?? null;
  }

  if (!personaId) {
    const institucionId = await miInstitucionId();
    const { data, error } = await supabase
      .from("personas")
      .insert({
        institucion_id: institucionId,
        tipo: "alumno",
        apellido_nombre: nombre,
        dni: dni || null,
      })
      .select("id")
      .single();
    if (error) throw aError(error, "No se pudo guardar al alumno.");
    personaId = data.id as string;
  }

  const { error } = await supabase
    .from("inscripciones")
    .insert({ alumno_id: personaId, materia_id: materiaId });
  if (error) throw aError(error, "No se pudo inscribir al alumno.");
}

export async function editarAlumno(
  personaId: string,
  nombre: string,
  dni: string
): Promise<void> {
  const { data, error } = await crearClienteNavegador()
    .from("personas")
    .update({ apellido_nombre: nombre, dni: dni || null })
    .eq("id", personaId)
    .select("id");
  if (error) throw aError(error, "No se pudo guardar los cambios.");
  if (!data || data.length === 0) {
    throw new Error("No tenés permiso para editar a este alumno.");
  }
}

// "Eliminar" quita al alumno de esta materia (no lo borra del sistema)
export async function quitarAlumnoDeMateria(inscripcionId: string): Promise<void> {
  const { error } = await crearClienteNavegador()
    .from("inscripciones")
    .delete()
    .eq("id", inscripcionId);
  if (error) throw aError(error, "No se pudo quitar al alumno.");
}

// Carga masiva: un nombre por línea. Devuelve cuántos se inscribieron.
export async function matricularLista(
  nombres: string[],
  materiaId: string
): Promise<number> {
  const supabase = crearClienteNavegador();
  const institucionId = await miInstitucionId();

  const { data: personas, error } = await supabase
    .from("personas")
    .insert(
      nombres.map((nombre) => ({
        institucion_id: institucionId,
        tipo: "alumno",
        apellido_nombre: nombre,
      }))
    )
    .select("id");
  if (error) throw aError(error, "No se pudo guardar la lista.");

  const { error: errorInsc } = await supabase.from("inscripciones").insert(
    (personas as { id: string }[]).map((p) => ({
      alumno_id: p.id,
      materia_id: materiaId,
    }))
  );
  if (errorInsc) throw aError(errorInsc, "No se pudo inscribir la lista.");

  return (personas as { id: string }[]).length;
}
