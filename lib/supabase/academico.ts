import { crearClienteNavegador } from "@/lib/supabase/client";

export type MateriaDB = { id: string; nombre: string; anio: number };
export type AlumnoDB = { id: string; nombre: string; dni: string; inscripcionId: string };
export type RegistroDB = {
  alumnoId: string;
  estado: "presente" | "ausente";
  motivo: "justificada" | "injustificada" | "";
  observacion: string;
};
export type PlanillaDB = { id: string; fecha: string; registros: RegistroDB[] };

function exigir<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("Supabase no devolvió datos.");
  return data;
}

export async function obtenerMateriasDB(): Promise<MateriaDB[]> {
  const supabase = crearClienteNavegador();
  const { data, error } = await supabase.from("materias").select("id,nombre,anio").order("anio").order("nombre");
  return exigir(data, error) as MateriaDB[];
}

export async function crearMateriaDB(nombre: string, anio: number): Promise<string> {
  const supabase = crearClienteNavegador();
  const { data, error } = await supabase.rpc("crear_materia", { p_nombre: nombre, p_anio: anio });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No se pudo crear la materia.");
  return data as string;
}

export async function obtenerAlumnosDB(materiaId: string): Promise<AlumnoDB[]> {
  const supabase = crearClienteNavegador();
  const { data: inscripciones, error: errorIns } = await supabase
    .from("inscripciones").select("id,alumno_id").eq("materia_id", materiaId);
  if (errorIns) throw new Error(errorIns.message);
  if (!inscripciones?.length) return [];

  const ids = inscripciones.map((i) => i.alumno_id);
  const { data: personas, error: errorPersonas } = await supabase
    .from("personas").select("id,apellido_nombre,dni").in("id", ids).order("apellido_nombre");
  if (errorPersonas) throw new Error(errorPersonas.message);

  const porId = new Map((personas ?? []).map((p) => [p.id, p]));
  return inscripciones.flatMap((i) => {
    const p = porId.get(i.alumno_id);
    return p ? [{ id: p.id, nombre: p.apellido_nombre, dni: p.dni ?? "", inscripcionId: i.id }] : [];
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export async function crearAlumnoDB(nombre: string, dni: string, materiaId: string): Promise<void> {
  const supabase = crearClienteNavegador();
  const { error } = await supabase.rpc("crear_alumno_matricular", {
    p_nombre: nombre, p_dni: dni, p_materia: materiaId,
  });
  if (error) throw new Error(error.message);
}

export async function editarAlumnoDB(id: string, nombre: string, dni: string): Promise<void> {
  const supabase = crearClienteNavegador();
  const { error } = await supabase.from("personas").update({
    apellido_nombre: nombre, dni: dni || null,
  }).eq("id", id).eq("tipo", "alumno");
  if (error) throw new Error(error.message);
}

export async function quitarAlumnoDB(alumnoId: string, materiaId: string): Promise<void> {
  const supabase = crearClienteNavegador();
  const { error } = await supabase.from("inscripciones").delete()
    .eq("alumno_id", alumnoId).eq("materia_id", materiaId);
  if (error) throw new Error(error.message);
}

export async function obtenerPlanillasDB(materiaId: string): Promise<PlanillaDB[]> {
  const supabase = crearClienteNavegador();
  const { data: clases, error: errorClases } = await supabase
    .from("clases").select("id,fecha").eq("materia_id", materiaId).order("fecha", { ascending: false });
  if (errorClases) throw new Error(errorClases.message);
  if (!clases?.length) return [];

  const classIds = clases.map((c) => c.id);
  const { data: asistencias, error: errorAsistencias } = await supabase
    .from("asistencias").select("clase_id,inscripcion_id,estado,motivo,observacion").in("clase_id", classIds);
  if (errorAsistencias) throw new Error(errorAsistencias.message);

  const { data: inscripciones, error: errorIns } = await supabase
    .from("inscripciones").select("id,alumno_id").eq("materia_id", materiaId);
  if (errorIns) throw new Error(errorIns.message);
  const alumnoPorInscripcion = new Map((inscripciones ?? []).map((i) => [i.id, i.alumno_id]));

  return clases.map((clase) => ({
    id: clase.id,
    fecha: clase.fecha,
    registros: (asistencias ?? []).filter((a) => a.clase_id === clase.id).flatMap((a) => {
      const alumnoId = alumnoPorInscripcion.get(a.inscripcion_id);
      return alumnoId ? [{
        alumnoId,
        estado: a.estado as "presente" | "ausente",
        motivo: (a.motivo ?? "") as "justificada" | "injustificada" | "",
        observacion: a.observacion ?? "",
      }] : [];
    }),
  }));
}

export async function guardarPlanillaDB(materiaId: string, fecha: string, registros: RegistroDB[]): Promise<void> {
  const supabase = crearClienteNavegador();
  const { error } = await supabase.rpc("guardar_planilla_asistencia", {
    p_materia: materiaId,
    p_fecha: fecha,
    p_registros: registros.map((r) => ({
      alumno_id: r.alumnoId,
      estado: r.estado,
      motivo: r.estado === "ausente" ? (r.motivo || "injustificada") : null,
      observacion: r.observacion || null,
    })),
  });
  if (error) throw new Error(error.message);
}

export async function eliminarPlanillaDB(id: string): Promise<void> {
  const supabase = crearClienteNavegador();
  const { error } = await supabase.from("clases").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
