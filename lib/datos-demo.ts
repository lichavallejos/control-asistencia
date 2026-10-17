// DATOS DE PRUEBA copiados de asistencia.html.
// Es temporal: en el paso de Supabase se reemplaza por la base de datos real.

export type Profesor = {
  id: number;
  usuario: string;
  password: string;
  nombre: string;
  materias: number[];
};

export type Curso = {
  id: number;
  nombre: string;
  anio: number;
};

export type Alumno = {
  id: number;
  nombre: string;
  dni: string;
  cursoId: number;
};

export type RegistroAsistencia = {
  cursoId: number;
  fecha: string;
};

export const profesores: Profesor[] = [
  {
    id: 1,
    usuario: "licha2026",
    password: "123",
    nombre: "Lisandro Vallejos",
    materias: [101, 102, 103, 104, 105],
  },
];

export const cursos: Curso[] = [
  { id: 101, nombre: "Didáctica de la Educación Inicial", anio: 1 },
  { id: 102, nombre: "Pedagogía General", anio: 1 },
  { id: 103, nombre: "Psicología Educacional", anio: 2 },
  { id: 104, nombre: "Práctica Profesional III", anio: 3 },
  { id: 105, nombre: "Residencia Pedagógica", anio: 4 },
];

export const alumnos: Alumno[] = [
  { id: 1, nombre: "Alonso, Martina", dni: "44123456", cursoId: 101 },
  { id: 2, nombre: "Gómez, Sofía", dni: "45234567", cursoId: 101 },
  { id: 3, nombre: "Ramírez, Lucas", dni: "43345678", cursoId: 103 },
];

export const historialAsistencias: RegistroAsistencia[] = [];
