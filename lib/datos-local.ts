// Capa de datos TEMPORAL: guarda materias y alumnos en el navegador (localStorage).
// Arranca con los datos de prueba de datos-demo.ts.
// En el paso de Supabase se reemplaza por consultas a la base de datos.

import {
  alumnos as alumnosBase,
  cursos as cursosBase,
  type Alumno,
  type Curso,
  type Profesor,
} from "./datos-demo";

const CLAVE_CURSOS = "isfd_cursos";
const CLAVE_ALUMNOS = "isfd_alumnos";
const CLAVE_PROPIAS = "isfd_materias_propias";

function leer<T>(clave: string, porDefecto: T): T {
  try {
    const datos = localStorage.getItem(clave);
    return datos ? (JSON.parse(datos) as T) : porDefecto;
  } catch {
    return porDefecto;
  }
}

function escribir(clave: string, valor: unknown) {
  localStorage.setItem(clave, JSON.stringify(valor));
}

// ---------- Materias ----------

export function obtenerCursos(): Curso[] {
  return leer<Curso[]>(CLAVE_CURSOS, cursosBase);
}

// Materias del docente: las que ya tenía asignadas + las que creó
export function obtenerMisCursos(usuario: Profesor): Curso[] {
  const propias = leer<number[]>(CLAVE_PROPIAS, []);
  return obtenerCursos().filter(
    (c) => usuario.materias.includes(c.id) || propias.includes(c.id)
  );
}

export function crearMateria(nombre: string, anio: number): Curso {
  const cursos = obtenerCursos();
  const id = cursos.length > 0 ? Math.max(...cursos.map((c) => c.id)) + 1 : 101;
  const nueva: Curso = { id, nombre, anio };
  escribir(CLAVE_CURSOS, [...cursos, nueva]);
  escribir(CLAVE_PROPIAS, [...leer<number[]>(CLAVE_PROPIAS, []), id]);
  return nueva;
}

// ---------- Alumnos ----------

export function obtenerAlumnos(): Alumno[] {
  return leer<Alumno[]>(CLAVE_ALUMNOS, alumnosBase);
}

function siguienteId(alumnos: Alumno[]) {
  return alumnos.length > 0 ? Math.max(...alumnos.map((a) => a.id)) + 1 : 1;
}

export function crearAlumno(nombre: string, dni: string, cursoId: number) {
  const alumnos = obtenerAlumnos();
  escribir(CLAVE_ALUMNOS, [
    ...alumnos,
    { id: siguienteId(alumnos), nombre, dni, cursoId },
  ]);
}

export function editarAlumno(id: number, nombre: string, dni: string) {
  escribir(
    CLAVE_ALUMNOS,
    obtenerAlumnos().map((a) => (a.id === id ? { ...a, nombre, dni } : a))
  );
}

export function eliminarAlumno(id: number) {
  escribir(
    CLAVE_ALUMNOS,
    obtenerAlumnos().filter((a) => a.id !== id)
  );
}

// Carga masiva: un nombre por línea. Devuelve cuántos se matricularon.
export function matricularLista(nombres: string[], cursoId: number): number {
  const alumnos = obtenerAlumnos();
  let id = siguienteId(alumnos);
  const nuevos = nombres.map((nombre) => ({
    id: id++,
    nombre,
    dni: "",
    cursoId,
  }));
  escribir(CLAVE_ALUMNOS, [...alumnos, ...nuevos]);
  return nuevos.length;
}
