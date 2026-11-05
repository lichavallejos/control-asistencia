// Acceso a los datos REALES en Supabase (materias, alumnos e inscripciones).
// La seguridad la dan las políticas RLS: cada profesor solo ve lo suyo.

import { crearClienteNavegador } from "./supabase/client";

export type Materia = {
  id: string;
  nombre: string;
  anio: number;
  activo: boolean; // el administrador desactiva (no borra): una inactiva es de solo lectura
};

// Una materia que dicta el profesor, con su carrera y su ciclo (viene de mis_materias)
export type MateriaPropia = Materia & {
  tipo: "materia" | "taller";
  duracion: "anual" | "cuatrimestral";
  cuatrimestre: number | null;
  carreraId: string;
  carreraNombre: string;
  carreraActiva: boolean;
  cicloId: string;
  cicloAnio: number;
  cicloEstado: "abierto" | "cerrado";
};

type FilaMisMaterias = {
  id: string;
  nombre: string;
  anio: number;
  tipo: "materia" | "taller";
  duracion: "anual" | "cuatrimestral";
  cuatrimestre: number | null;
  activo: boolean;
  carrera_id: string;
  carrera_nombre: string;
  carrera_activa: boolean;
  ciclo_id: string;
  ciclo_anio: number;
  ciclo_estado: "abierto" | "cerrado";
};

// Un alumno visto dentro de una materia
export type AlumnoDeMateria = {
  inscripcionId: string; // la inscripción (alumno + materia)
  personaId: string; // la persona
  nombre: string;
  dni: string;
  fechaBaja: string | null; // AAAA-MM-DD; vacía si el alumno está activo
};

type ErrorSupabase = { message: string; code?: string };

type FilaInscripcion = {
  id: string;
  alumno_id: string;
  fecha_baja: string | null;
  personas: { apellido_nombre: string; dni: string | null } | null;
};

const MENSAJES_ADMIN = [
  "El nombre del profesor es obligatorio",
  "El correo no es válido",
  "Ya existe una persona con ese DNI",
  "El profesor no existe en tu institución",
  "La materia no existe en tu institución",
  "La fecha de baja no puede ser futura",
  "El alumno ya está de baja",
  "El alumno no está de baja",
  "La inscripción no existe en tus materias",
  "La materia está inactiva o su ciclo está cerrado: solo lectura",
  "El nombre de la carrera es obligatorio",
  "Ya existe una carrera con ese nombre",
  "La carrera no existe en tu institución",
  "Hay que indicar si la carrera queda activa o inactiva",
  "El año del ciclo es obligatorio",
  "Ya existe un ciclo lectivo para ese año",
  "El ciclo no existe en tu institución",
  "El ciclo está cerrado: reabrilo para editarlo",
  "El nombre de la materia es obligatorio",
  "La carrera es obligatoria",
  "El ciclo lectivo es obligatorio",
  "Una materia anual no lleva cuatrimestre",
  "Una materia cuatrimestral necesita cuatrimestre (1 o 2)",
  "La carrera está desactivada: reactivala para crear materias",
  "El ciclo está cerrado: reabrilo para crear materias",
  "El ciclo está cerrado: reabrilo para editar la materia",
  "La carrera de destino está desactivada: reactivala para mover materias a ella",
  "Ya existe una materia con ese nombre, año y cuatrimestre en esa carrera y ciclo",
  "Hay que indicar si la materia queda activa o inactiva",
];

function aError(error: ErrorSupabase, porDefecto: string): Error {
  if (error.message.includes("personas_dni_unico")) {
    return new Error("Ya existe un alumno con ese DNI.");
  }
  if (error.message.includes("inscripciones_alumno_id_materia_id_key")) {
    return new Error("Ese alumno ya está inscripto en esta materia.");
  }
  // Reglas de la tabla de ciclos (las avisa la base con el nombre de la restricción)
  if (error.message.includes("ciclos_umbrales_validos")) {
    return new Error(
      "Los umbrales no son válidos: el de regular tiene que ser menor al de aprobado, y el de aprobado no puede pasar de 100."
    );
  }
  if (
    error.message.includes("ciclos_cuat1_orden") ||
    error.message.includes("ciclos_cuat2_orden")
  ) {
    return new Error(
      "En cada cuatrimestre, la fecha de inicio no puede ser posterior a la de fin."
    );
  }
  if (error.message.includes("ciclos_cuats_sin_pisarse")) {
    return new Error(
      "El 1.er cuatrimestre tiene que terminar antes de que empiece el 2.º."
    );
  }
  if (error.message.includes("ciclos_anio_valido")) {
    return new Error("El año del ciclo tiene que estar entre 2000 y 2100.");
  }
  if (error.message.includes("ciclos_anio_unico")) {
    return new Error("Ya existe un ciclo lectivo para ese año.");
  }
  const mensajeAdmin = MENSAJES_ADMIN.find((m) => error.message.includes(m));
  if (mensajeAdmin) {
    return new Error(mensajeAdmin);
  }
  if (error.message.includes("row-level security")) {
    return new Error(
      "No se pudo guardar: la materia está en solo lectura (inactiva o con el ciclo cerrado) o no tenés permiso."
    );
  }
  if (error.message.includes("No autorizado")) {
    return new Error("No tenés permiso para hacer esto.");
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

// Las materias del profesor, con carrera y ciclo (función mis_materias de la 0008:
// el profesor no puede leer la tabla de carreras). Incluye las inactivas y las de
// ciclos cerrados; cada pantalla decide cuáles muestra.
export async function obtenerMisMaterias(): Promise<MateriaPropia[]> {
  const { data, error } = await crearClienteNavegador().rpc("mis_materias");
  if (error) throw aError(error, "No se pudieron cargar las materias.");
  return (data as FilaMisMaterias[]).map((f) => ({
    id: f.id,
    nombre: f.nombre,
    anio: f.anio,
    activo: f.activo,
    tipo: f.tipo,
    duracion: f.duracion,
    cuatrimestre: f.cuatrimestre,
    carreraId: f.carrera_id,
    carreraNombre: f.carrera_nombre,
    carreraActiva: f.carrera_activa,
    cicloId: f.ciclo_id,
    cicloAnio: f.ciclo_anio,
    cicloEstado: f.ciclo_estado,
  }));
}

// ---------- Alumnos ----------

export async function obtenerAlumnosDeMateria(
  materiaId: string
): Promise<AlumnoDeMateria[]> {
  const { data, error } = await crearClienteNavegador()
    .from("inscripciones")
    .select("id, alumno_id, fecha_baja, personas ( apellido_nombre, dni )")
    .eq("materia_id", materiaId);
  if (error) throw aError(error, "No se pudieron cargar los alumnos.");

  const filas = data as unknown as FilaInscripcion[];
  return filas
    .map((fila) => ({
      inscripcionId: fila.id,
      personaId: fila.alumno_id,
      nombre: fila.personas?.apellido_nombre ?? "",
      dni: fila.personas?.dni ?? "",
      fechaBaja: fila.fecha_baja,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

// Cantidad de alumnos ACTIVOS por materia (los dados de baja no cuentan)
export async function contarAlumnosPorMateria(): Promise<Record<string, number>> {
  const supabase = crearClienteNavegador();
  const filas = await leerTodo<{ materia_id: string; fecha_baja: string | null }>(
    (desde, hasta) =>
      supabase
        .from("inscripciones")
        .select("materia_id, fecha_baja")
        .order("id")
        .range(desde, hasta),
    "No se pudo contar los alumnos."
  );

  const conteo: Record<string, number> = {};
  filas.forEach((f) => {
    if (f.fecha_baja) return;
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

// Dar de baja NO borra nada: el alumno deja de contar asistencias desde esa fecha
// (por defecto, hoy) y el historial se conserva. Se puede revertir.
export async function darDeBajaAlumno(inscripcionId: string): Promise<void> {
  const { error } = await crearClienteNavegador().rpc("dar_de_baja", {
    p_inscripcion: inscripcionId,
  });
  if (error) throw aError(error, "No se pudo dar de baja al alumno.");
}

export async function revertirBajaAlumno(inscripcionId: string): Promise<void> {
  const { error } = await crearClienteNavegador().rpc("revertir_baja", {
    p_inscripcion: inscripcionId,
  });
  if (error) throw aError(error, "No se pudo revertir la baja.");
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

export type PorcentajeAlumno = {
  clases: number; // clases contadas para este alumno (hasta su baja, si la tiene)
  asistidas: number; // presentes + ausentes justificadas
  porcentaje: number | null; // truncado a 2 decimales; vacío si todavía no hay clases
  color: "verde" | "amarillo" | "rojo" | null;
};

// El porcentaje y el color salen de la base (umbrales del ciclo lectivo):
// la pantalla solo los muestra, no calcula nada.
export async function obtenerPorcentajesMateria(
  materiaId: string
): Promise<Record<string, PorcentajeAlumno>> {
  const { data, error } = await crearClienteNavegador().rpc("porcentajes_materia", {
    p_materia: materiaId,
  });
  if (error) throw aError(error, "No se pudieron calcular los porcentajes.");

  type Fila = {
    inscripcion_id: string;
    clases_acumuladas: number;
    asistidas_acumuladas: number;
    porcentaje_acumulado: number | string | null;
    color: PorcentajeAlumno["color"];
  };
  const resultado: Record<string, PorcentajeAlumno> = {};
  ((data ?? []) as Fila[]).forEach((f) => {
    resultado[f.inscripcion_id] = {
      clases: f.clases_acumuladas,
      asistidas: f.asistidas_acumuladas,
      porcentaje:
        f.porcentaje_acumulado === null ? null : Number(f.porcentaje_acumulado),
      color: f.color,
    };
  });
  return resultado;
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
// ---------- Administración de profesores ----------
// Usan las funciones de la migración 0004. Solo funcionan para administradores:
// la base rechaza a cualquier otro aunque se llame desde el navegador.

export type Profesor = {
  id: string;
  nombre: string;
  dni: string;
  email: string;
  tieneCuenta: boolean;
};

export type MateriaConProfesores = {
  id: string;
  nombre: string;
  anio: number;
  profesores: { id: string; nombre: string }[];
};

type FilaProfesor = {
  id: string;
  apellido_nombre: string;
  dni: string | null;
  email: string | null;
  tiene_cuenta: boolean;
};

type FilaMateriaConProfesores = {
  id: string;
  nombre: string;
  anio: number;
  profesores: { id: string; apellido_nombre: string }[];
};

export async function listarProfesores(): Promise<Profesor[]> {
  const { data, error } = await crearClienteNavegador().rpc("listar_profesores");
  if (error) throw aError(error, "No se pudieron cargar los profesores.");
  return (data as FilaProfesor[]).map((f) => ({
    id: f.id,
    nombre: f.apellido_nombre,
    dni: f.dni ?? "",
    email: f.email ?? "",
    tieneCuenta: f.tiene_cuenta,
  }));
}

export async function crearProfesor(
  nombre: string,
  dni: string,
  email: string
): Promise<string> {
  const { data, error } = await crearClienteNavegador().rpc("crear_profesor", {
    p_nombre: nombre,
    p_dni: dni,
    p_email: email,
  });
  if (error) throw aError(error, "No se pudo crear el profesor.");
  return data as string;
}

export async function editarProfesor(
  id: string,
  nombre: string,
  dni: string,
  email: string
): Promise<void> {
  const { error } = await crearClienteNavegador().rpc("editar_profesor", {
    p_id: id,
    p_nombre: nombre,
    p_dni: dni,
    p_email: email,
  });
  if (error) throw aError(error, "No se pudo guardar los cambios.");
}

export async function listarMateriasInstitucion(): Promise<
  MateriaConProfesores[]
> {
  const { data, error } = await crearClienteNavegador().rpc(
    "listar_materias_institucion"
  );
  if (error) throw aError(error, "No se pudieron cargar las materias.");
  return (data as FilaMateriaConProfesores[]).map((f) => ({
    id: f.id,
    nombre: f.nombre,
    anio: f.anio,
    profesores: f.profesores.map((p) => ({
      id: p.id,
      nombre: p.apellido_nombre,
    })),
  }));
}

export async function asignarMateria(
  profesorId: string,
  materiaId: string
): Promise<void> {
  const { error } = await crearClienteNavegador().rpc("asignar_materia", {
    p_profesor: profesorId,
    p_materia: materiaId,
  });
  if (error) throw aError(error, "No se pudo asignar la materia.");
}

export async function quitarMateria(
  profesorId: string,
  materiaId: string
): Promise<void> {
  const { error } = await crearClienteNavegador().rpc("quitar_materia", {
    p_profesor: profesorId,
    p_materia: materiaId,
  });
  if (error) throw aError(error, "No se pudo quitar la materia.");
}

// ---------- Administración de carreras ----------
// Usan las funciones de la migración 0007. Solo funcionan para administradores:
// la base rechaza a cualquier otro aunque se llame desde el navegador.
// El administrador no borra carreras: las desactiva.

export type Carrera = {
  id: string;
  nombre: string;
  activo: boolean;
  cantidadMaterias: number;
};

type FilaCarrera = {
  id: string;
  nombre: string;
  activo: boolean;
  cantidad_materias: number | string; // la base devuelve un bigint
};

export async function listarCarreras(): Promise<Carrera[]> {
  const { data, error } = await crearClienteNavegador().rpc("listar_carreras");
  if (error) throw aError(error, "No se pudieron cargar las carreras.");
  return (data as FilaCarrera[]).map((f) => ({
    id: f.id,
    nombre: f.nombre,
    activo: f.activo,
    cantidadMaterias: Number(f.cantidad_materias),
  }));
}

export async function crearCarrera(nombre: string): Promise<string> {
  const { data, error } = await crearClienteNavegador().rpc("crear_carrera", {
    p_nombre: nombre,
  });
  if (error) throw aError(error, "No se pudo crear la carrera.");
  return data as string;
}

export async function editarCarrera(id: string, nombre: string): Promise<void> {
  const { error } = await crearClienteNavegador().rpc("editar_carrera", {
    p_id: id,
    p_nombre: nombre,
  });
  if (error) throw aError(error, "No se pudo guardar los cambios.");
}

// Desactivar una carrera NO desactiva sus materias.
export async function cambiarEstadoCarrera(
  id: string,
  activo: boolean
): Promise<void> {
  const { error } = await crearClienteNavegador().rpc("cambiar_estado_carrera", {
    p_id: id,
    p_activo: activo,
  });
  if (error) throw aError(error, "No se pudo cambiar el estado de la carrera.");
}

// ---------- Administración de ciclos lectivos ----------
// La lectura sale de la tabla (la política deja ver los ciclos de la propia
// institución); crear, editar, cerrar y reabrir son funciones de la base que
// exigen ser administrador. Las fechas viajan como texto "aaaa-mm-dd".

export type Ciclo = {
  id: string;
  anio: number;
  estado: "abierto" | "cerrado";
  inicio1: string | null;
  fin1: string | null;
  inicio2: string | null;
  fin2: string | null;
  umbralAprobado: number;
  umbralRegular: number;
};

export type FechasCiclo = {
  inicio1: string | null;
  fin1: string | null;
  inicio2: string | null;
  fin2: string | null;
};

type FilaCiclo = {
  id: string;
  anio: number;
  estado: "abierto" | "cerrado";
  inicio_cuatrimestre_1: string | null;
  fin_cuatrimestre_1: string | null;
  inicio_cuatrimestre_2: string | null;
  fin_cuatrimestre_2: string | null;
  umbral_aprobado: number | string;
  umbral_regular: number | string;
};

export async function listarCiclos(): Promise<Ciclo[]> {
  const { data, error } = await crearClienteNavegador()
    .from("ciclos_lectivos")
    .select(
      "id, anio, estado, inicio_cuatrimestre_1, fin_cuatrimestre_1, inicio_cuatrimestre_2, fin_cuatrimestre_2, umbral_aprobado, umbral_regular"
    )
    .order("anio", { ascending: false });
  if (error) throw aError(error, "No se pudieron cargar los ciclos lectivos.");
  return (data as FilaCiclo[]).map((f) => ({
    id: f.id,
    anio: f.anio,
    estado: f.estado,
    inicio1: f.inicio_cuatrimestre_1,
    fin1: f.fin_cuatrimestre_1,
    inicio2: f.inicio_cuatrimestre_2,
    fin2: f.fin_cuatrimestre_2,
    umbralAprobado: Number(f.umbral_aprobado),
    umbralRegular: Number(f.umbral_regular),
  }));
}

// Los umbrales no se envían: la base los copia del ciclo anterior (o usa 85 y 75).
export async function crearCiclo(
  anio: number,
  fechas: FechasCiclo
): Promise<string> {
  const { data, error } = await crearClienteNavegador().rpc("crear_ciclo", {
    p_anio: anio,
    p_inicio_1: fechas.inicio1,
    p_fin_1: fechas.fin1,
    p_inicio_2: fechas.inicio2,
    p_fin_2: fechas.fin2,
  });
  if (error) throw aError(error, "No se pudo crear el ciclo lectivo.");
  return data as string;
}

export async function editarCiclo(
  id: string,
  fechas: FechasCiclo,
  umbralAprobado: number,
  umbralRegular: number
): Promise<void> {
  const { error } = await crearClienteNavegador().rpc("editar_ciclo", {
    p_id: id,
    p_inicio_1: fechas.inicio1,
    p_fin_1: fechas.fin1,
    p_inicio_2: fechas.inicio2,
    p_fin_2: fechas.fin2,
    p_umbral_aprobado: umbralAprobado,
    p_umbral_regular: umbralRegular,
  });
  if (error) throw aError(error, "No se pudo guardar los cambios del ciclo.");
}

// Un ciclo cerrado deja sus materias en solo lectura; se puede reabrir.
export async function cerrarCiclo(id: string): Promise<void> {
  const { error } = await crearClienteNavegador().rpc("cerrar_ciclo", {
    p_id: id,
  });
  if (error) throw aError(error, "No se pudo cerrar el ciclo.");
}

export async function reabrirCiclo(id: string): Promise<void> {
  const { error } = await crearClienteNavegador().rpc("reabrir_ciclo", {
    p_id: id,
  });
  if (error) throw aError(error, "No se pudo reabrir el ciclo.");
}

// ---------- Administración de materias ----------
// Usan las funciones de las migraciones 0006 y 0007. Solo funcionan para
// administradores. El administrador no borra materias: las desactiva.
// Una materia nace en un ciclo y no cambia de ciclo; no se crean ni se editan
// materias en un ciclo cerrado ni en una carrera desactivada.

export type MateriaAdmin = {
  id: string;
  nombre: string;
  anio: number;
  tipo: "materia" | "taller";
  duracion: "anual" | "cuatrimestral";
  cuatrimestre: number | null;
  carreraId: string;
  carreraNombre: string;
  carreraActiva: boolean;
  cicloId: string;
  cicloAnio: number;
  cicloEstado: "abierto" | "cerrado";
  activo: boolean;
  profesores: { id: string; nombre: string }[];
};

type FilaMateriaAdmin = {
  id: string;
  nombre: string;
  anio: number;
  tipo: "materia" | "taller";
  duracion: "anual" | "cuatrimestral";
  cuatrimestre: number | null;
  carrera_id: string;
  carrera_nombre: string;
  carrera_activa: boolean;
  ciclo_id: string;
  ciclo_anio: number;
  ciclo_estado: "abierto" | "cerrado";
  activo: boolean;
  profesores: { id: string; apellido_nombre: string }[];
};

export type DatosMateria = {
  nombre: string;
  anio: number;
  tipo: "materia" | "taller";
  duracion: "anual" | "cuatrimestral";
  cuatrimestre: number | null; // solo si la duración es cuatrimestral
};

// Todas las materias de la institución (activas, inactivas y de ciclos cerrados).
export async function listarMateriasAdmin(): Promise<MateriaAdmin[]> {
  const { data, error } = await crearClienteNavegador().rpc(
    "listar_materias_institucion"
  );
  if (error) throw aError(error, "No se pudieron cargar las materias.");
  return (data as FilaMateriaAdmin[]).map((f) => ({
    id: f.id,
    nombre: f.nombre,
    anio: f.anio,
    tipo: f.tipo,
    duracion: f.duracion,
    cuatrimestre: f.cuatrimestre,
    carreraId: f.carrera_id,
    carreraNombre: f.carrera_nombre,
    carreraActiva: f.carrera_activa,
    cicloId: f.ciclo_id,
    cicloAnio: f.ciclo_anio,
    cicloEstado: f.ciclo_estado,
    activo: f.activo,
    profesores: f.profesores.map((p) => ({
      id: p.id,
      nombre: p.apellido_nombre,
    })),
  }));
}

export async function crearMateriaAdmin(
  datos: DatosMateria,
  carreraId: string,
  cicloId: string
): Promise<string> {
  const { data, error } = await crearClienteNavegador().rpc("crear_materia", {
    p_nombre: datos.nombre,
    p_anio: datos.anio,
    p_tipo: datos.tipo,
    p_duracion: datos.duracion,
    p_cuatrimestre: datos.cuatrimestre,
    p_carrera_id: carreraId,
    p_ciclo_id: cicloId,
  });
  if (error) throw aError(error, "No se pudo crear la materia.");
  return data as string;
}

export async function editarMateriaAdmin(
  id: string,
  datos: DatosMateria,
  carreraId: string
): Promise<void> {
  const { error } = await crearClienteNavegador().rpc("editar_materia", {
    p_id: id,
    p_nombre: datos.nombre,
    p_anio: datos.anio,
    p_tipo: datos.tipo,
    p_duracion: datos.duracion,
    p_cuatrimestre: datos.cuatrimestre,
    p_carrera_id: carreraId,
  });
  if (error) throw aError(error, "No se pudo guardar los cambios de la materia.");
}

// Una materia desactivada deja de verla el profesor en Asistencia; el
// administrador y la planilla PDF la siguen mostrando. No se borra nada.
export async function cambiarEstadoMateria(
  id: string,
  activo: boolean
): Promise<void> {
  const { error } = await crearClienteNavegador().rpc("cambiar_estado_materia", {
    p_id: id,
    p_activo: activo,
  });
  if (error) throw aError(error, "No se pudo cambiar el estado de la materia.");
}