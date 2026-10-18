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

// Supabase devuelve como máximo 1000 filas por consulta: esto las pide por tandas.
const TAMANO_PAGINA = 1000;

export async function leerTodo<T>(
  pedir: (
    desde: number,
    hasta: number
  ) => PromiseLike<{ data: T[] | null; error: ErrorSupabase | null }>,
  mensaje: string
): Promise<T[]> {
  const todo: T[] = [];
  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    const { data, error } = await pedir(desde, desde + TAMANO_PAGINA - 1);
    if (error) throw aError(error, mensaje);
    todo.push(...(data ?? []));
    if (!data || data.length < TAMANO_PAGINA) break;
  }
  return todo;
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
  const supabase = crearClienteNavegador();
  const filas = await leerTodo<{ materia_id: string }>(
    (desde, hasta) =>
      supabase
        .from("inscripciones")
        .select("materia_id")
        .order("id")
        .range(desde, hasta),
    "No se pudo contar los alumnos."
  );

  const conteo: Record<string, number> = {};
  filas.forEach((f) => {
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

// ---------- Clases y asistencias ----------

export type EstadoAsistencia = "presente" | "ausente";

// Un registro de asistencia, ligado a la inscripción del alumno en la materia
export type RegistroAsistencia = {
  inscripcionId: string;
  estado: EstadoAsistencia;
  motivo: string; // "justificada" | "injustificada" (solo si está ausente)
  observacion: string;
};

export type ClaseGuardada = { id: string; fecha: string };

// Fechas en las que ya se tomó asistencia en la materia (la más reciente primero)
export async function obtenerClases(materiaId: string): Promise<ClaseGuardada[]> {
  const { data, error } = await crearClienteNavegador()
    .from("clases")
    .select("id, fecha")
    .eq("materia_id", materiaId)
    .order("fecha", { ascending: false });
  if (error) throw aError(error, "No se pudo cargar el historial.");
  return data as ClaseGuardada[];
}

// Asistencia ya guardada para una fecha (lista vacía si todavía no se tomó)
export async function obtenerAsistenciaDeClase(
  materiaId: string,
  fecha: string
): Promise<RegistroAsistencia[]> {
  const supabase = crearClienteNavegador();

  const { data: clase, error } = await supabase
    .from("clases")
    .select("id")
    .eq("materia_id", materiaId)
    .eq("fecha", fecha)
    .maybeSingle();
  if (error) throw aError(error, "No se pudo cargar la clase.");
  if (!clase) return [];

  const filas = await leerTodo<{
    inscripcion_id: string;
    estado: EstadoAsistencia;
    motivo: string | null;
    observacion: string | null;
  }>(
    (desde, hasta) =>
      supabase
        .from("asistencias")
        .select("inscripcion_id, estado, motivo, observacion")
        .eq("clase_id", clase.id)
        .order("id")
        .range(desde, hasta),
    "No se pudo cargar la asistencia."
  );

  return filas.map((f) => ({
    inscripcionId: f.inscripcion_id,
    estado: f.estado,
    motivo: f.motivo ?? "",
    observacion: f.observacion ?? "",
  }));
}

// Guarda la planilla del día: crea la clase si no existe y registra cada alumno.
// Si ya había una planilla para esa fecha, la reemplaza.
export async function guardarAsistencia(
  materiaId: string,
  fecha: string,
  registros: RegistroAsistencia[]
): Promise<void> {
  const supabase = crearClienteNavegador();

  const { data: clase, error } = await supabase
    .from("clases")
    .upsert({ materia_id: materiaId, fecha }, { onConflict: "materia_id,fecha" })
    .select("id")
    .single();
  if (error) throw aError(error, "No se pudo guardar la clase.");
  if (registros.length === 0) return;

  const filas = registros.map((r) => ({
    clase_id: clase.id,
    inscripcion_id: r.inscripcionId,
    materia_id: materiaId,
    estado: r.estado,
    motivo: r.estado === "ausente" ? r.motivo || "injustificada" : null,
    observacion: r.observacion.trim() || null,
  }));

  const { error: errorAsist } = await supabase
    .from("asistencias")
    .upsert(filas, { onConflict: "clase_id,inscripcion_id" });
  if (errorAsist) throw aError(errorAsist, "No se pudo guardar la asistencia.");
}

// Borra la clase y, con ella, toda su asistencia
export async function eliminarClase(claseId: string): Promise<void> {
  const { error } = await crearClienteNavegador()
    .from("clases")
    .delete()
    .eq("id", claseId);
  if (error) throw aError(error, "No se pudo eliminar la clase.");
}

// Cantidad de clases registradas por materia (para el panel de inicio)
export async function contarClasesPorMateria(): Promise<Record<string, number>> {
  const supabase = crearClienteNavegador();
  const filas = await leerTodo<{ materia_id: string }>(
    (desde, hasta) =>
      supabase
        .from("clases")
        .select("materia_id")
        .order("id")
        .range(desde, hasta),
    "No se pudo contar las clases."
  );

  const conteo: Record<string, number> = {};
  filas.forEach((f) => {
    conteo[f.materia_id] = (conteo[f.materia_id] ?? 0) + 1;
  });
  return conteo;
}

export type EstadisticasMateria = {
  totalClases: number;
  presentesPorInscripcion: Record<string, number>;
};

// Para calcular el % de asistencia de cada alumno de una materia
export async function obtenerEstadisticasMateria(
  materiaId: string
): Promise<EstadisticasMateria> {
  const supabase = crearClienteNavegador();

  const { count, error } = await supabase
    .from("clases")
    .select("id", { count: "exact", head: true })
    .eq("materia_id", materiaId);
  if (error) throw aError(error, "No se pudieron calcular las estadísticas.");

  const filas = await leerTodo<{ inscripcion_id: string }>(
    (desde, hasta) =>
      supabase
        .from("asistencias")
        .select("inscripcion_id")
        .eq("materia_id", materiaId)
        .eq("estado", "presente")
        .order("id")
        .range(desde, hasta),
    "No se pudieron calcular las estadísticas."
  );

  const presentesPorInscripcion: Record<string, number> = {};
  filas.forEach((f) => {
    presentesPorInscripcion[f.inscripcion_id] =
      (presentesPorInscripcion[f.inscripcion_id] ?? 0) + 1;
  });

  return { totalClases: count ?? 0, presentesPorInscripcion };
}

// ---------- Importación desde el sistema anterior ----------

export function normalizarTexto(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, " ");
}

export type AlumnoParaImportar = { nombre: string; dni: string };

function enLotes<T>(lista: T[], tamano: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) lotes.push(lista.slice(i, i + tamano));
  return lotes;
}

// Inscribe una lista de alumnos en una materia sin duplicar:
// - si ya está inscripto (mismo DNI, o mismo nombre si no tiene DNI), lo saltea;
// - si ya existe una persona con ese DNI, la reutiliza.
export async function importarAlumnosEnMateria(
  materiaId: string,
  lista: AlumnoParaImportar[]
): Promise<{ nuevos: number; yaEstaban: number }> {
  const supabase = crearClienteNavegador();
  const clave = (a: AlumnoParaImportar) =>
    a.dni ? `d:${a.dni}` : `n:${normalizarTexto(a.nombre)}`;

  const yaInscriptos = await obtenerAlumnosDeMateria(materiaId);
  const clavesInscriptas = new Set(yaInscriptos.map((a) => clave(a)));

  // Sin repetidos dentro de la propia lista y sin los que ya están
  const vistos = new Set<string>();
  const pendientes: AlumnoParaImportar[] = [];
  for (const a of lista) {
    const k = clave(a);
    if (clavesInscriptas.has(k) || vistos.has(k)) continue;
    vistos.add(k);
    pendientes.push(a);
  }
  const yaEstaban = lista.length - pendientes.length;
  if (pendientes.length === 0) return { nuevos: 0, yaEstaban };

  // Personas que ya existen por DNI
  const idPorClave = new Map<string, string>();
  const dnis = pendientes.filter((a) => a.dni).map((a) => a.dni);
  for (const lote of enLotes(dnis, 100)) {
    const { data, error } = await supabase
      .from("personas")
      .select("id, dni")
      .eq("tipo", "alumno")
      .in("dni", lote);
    if (error) throw aError(error, "No se pudo buscar a los alumnos existentes.");
    (data as { id: string; dni: string }[]).forEach((p) =>
      idPorClave.set(`d:${p.dni}`, p.id)
    );
  }

  // Crear las personas que faltan
  const aCrear = pendientes.filter((a) => !idPorClave.has(clave(a)));
  if (aCrear.length > 0) {
    const institucionId = await miInstitucionId();
    for (const lote of enLotes(aCrear, 200)) {
      const { data, error } = await supabase
        .from("personas")
        .insert(
          lote.map((a) => ({
            institucion_id: institucionId,
            tipo: "alumno",
            apellido_nombre: a.nombre,
            dni: a.dni || null,
          }))
        )
        .select("id");
      if (error) throw aError(error, "No se pudo guardar a los alumnos.");
      (data as { id: string }[]).forEach((p, i) => idPorClave.set(clave(lote[i]), p.id));
    }
  }

  // Inscribirlos en la materia
  for (const lote of enLotes(pendientes, 200)) {
    const { error } = await supabase.from("inscripciones").insert(
      lote.map((a) => ({
        alumno_id: idPorClave.get(clave(a)) as string,
        materia_id: materiaId,
      }))
    );
    if (error) throw aError(error, "No se pudo inscribir a los alumnos.");
  }

  return { nuevos: pendientes.length, yaEstaban };
}

// ---------- Informe de asistencia (PDF) ----------

export type ConteoAlumno = {
  presentes: number;
  ausJustificadas: number;
  ausInjustificadas: number;
};

export type ResumenAsistencia = {
  totalClases: number;
  porInscripcion: Record<string, ConteoAlumno>;
};

// Cuenta presentes y ausencias (justificadas / injustificadas) de cada inscripción
export function resumirAsistencias(
  filas: { inscripcion_id: string; estado: string; motivo: string | null }[]
): Record<string, ConteoAlumno> {
  const resumen: Record<string, ConteoAlumno> = {};
  for (const f of filas) {
    const c = (resumen[f.inscripcion_id] ??= {
      presentes: 0,
      ausJustificadas: 0,
      ausInjustificadas: 0,
    });
    if (f.estado === "presente") c.presentes++;
    else if (f.motivo === "justificada") c.ausJustificadas++;
    else c.ausInjustificadas++;
  }
  return resumen;
}

export async function obtenerResumenAsistencia(
  materiaId: string
): Promise<ResumenAsistencia> {
  const supabase = crearClienteNavegador();

  const { count, error } = await supabase
    .from("clases")
    .select("id", { count: "exact", head: true })
    .eq("materia_id", materiaId);
  if (error) throw aError(error, "No se pudo armar el informe.");

  const filas = await leerTodo<{
    inscripcion_id: string;
    estado: string;
    motivo: string | null;
  }>(
    (desde, hasta) =>
      supabase
        .from("asistencias")
        .select("inscripcion_id, estado, motivo")
        .eq("materia_id", materiaId)
        .order("id")
        .range(desde, hasta),
    "No se pudo armar el informe."
  );

  return { totalClases: count ?? 0, porInscripcion: resumirAsistencias(filas) };
}