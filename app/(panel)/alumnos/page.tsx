"use client";
import { useCallback, useEffect, useState } from "react";
import { crearAlumnoDB, crearMateriaDB, editarAlumnoDB, obtenerAlumnosDB, obtenerMateriasDB, type AlumnoDB, type MateriaDB } from "@/lib/supabase/academico";

export default function AlumnosPage() {
  const [materias,setMaterias]=useState<MateriaDB[]>([]);
  const [materiaId,setMateriaId]=useState("");
  const [alumnos,setAlumnos]=useState<AlumnoDB[]>([]);
  const [nombreMateria,setNombreMateria]=useState("");
  const [anio,setAnio]=useState(1);
  const [nombre,setNombre]=useState("");
  const [dni,setDni]=useState("");
  const [filtro,setFiltro]=useState("");
  const [lista,setLista]=useState("");
  const [editando,setEditando]=useState<string|null>(null);
  const [cargando,setCargando]=useState(true);
  const [guardando,setGuardando]=useState(false);
  const [error,setError]=useState("");
  const [mensaje,setMensaje]=useState("");

  const cargarAlumnos=useCallback(async(id:string)=>{if(!id){setAlumnos([]);return;}setAlumnos(await obtenerAlumnosDB(id));},[]);
  useEffect(()=>{let vivo=true;(async()=>{try{const ms=await obtenerMateriasDB();if(!vivo)return;setMaterias(ms);setMateriaId(ms[0]?.id??"");}catch(e){if(vivo)setError(e instanceof Error?e.message:"Error al cargar materias.");}finally{if(vivo)setCargando(false);}})();return()=>{vivo=false;};},[]);
  useEffect(()=>{let vivo=true;if(!materiaId){setAlumnos([]);return;}setCargando(true);obtenerAlumnosDB(materiaId).then(d=>{if(vivo)setAlumnos(d);}).catch(e=>{if(vivo)setError(e instanceof Error?e.message:"Error al cargar alumnos.");}).finally(()=>{if(vivo)setCargando(false);});return()=>{vivo=false;};},[materiaId]);

  async function crearMateria(){setError("");setMensaje("");if(!nombreMateria.trim()){setError("El nombre de la materia es obligatorio.");return;}setGuardando(true);try{const id=await crearMateriaDB(nombreMateria.trim(),anio);const ms=await obtenerMateriasDB();setMaterias(ms);setMateriaId(id);setNombreMateria("");setMensaje("Materia creada y asignada.");}catch(e){setError(e instanceof Error?e.message:"No se pudo crear la materia.");}finally{setGuardando(false);}}
  async function guardarAlumno(){setError("");setMensaje("");if(!materiaId){setError("Creá o seleccioná una materia primero.");return;}if(!nombre.trim()){setError("Apellido y nombre es obligatorio.");return;}setGuardando(true);try{if(editando)await editarAlumnoDB(editando,nombre.trim(),dni.trim());else await crearAlumnoDB(nombre.trim(),dni.trim(),materiaId);await cargarAlumnos(materiaId);setNombre("");setDni("");setEditando(null);setMensaje(editando?"Alumno actualizado.":"Alumno guardado e inscripto en la materia.");}catch(e){setError(e instanceof Error?e.message:"No se pudo guardar el alumno.");}finally{setGuardando(false);}}
  async function matricularLista(){const nombres=lista.split(/\r?\n/).map(n=>n.trim()).filter(Boolean);if(!materiaId||!nombres.length){setError("Seleccioná una materia y pegá un nombre por línea.");return;}setError("");setMensaje("");setGuardando(true);let hechos=0;try{for(const n of nombres){await crearAlumnoDB(n,"",materiaId);hechos++;}await cargarAlumnos(materiaId);setLista("");setMensaje("Se matricularon "+hechos+" alumnos.");}catch(e){setError((e instanceof Error?e.message:"Error en la carga.")+" Se procesaron "+hechos+" de "+nombres.length+" nombres.");}finally{setGuardando(false);}}
  const visibles=alumnos.filter(a=>a.nombre.toLocaleLowerCase("es").includes(filtro.toLocaleLowerCase("es"))||a.dni.includes(filtro));
  return <section className="seccion active">
    <div className="section__header"><h2 className="section__title">Materias y alumnos</h2><div className="section__line"/></div>
    {error&&<div className="card" role="alert" style={{borderTopColor:"var(--danger)"}}>{error}</div>}{mensaje&&<div className="card" role="status">{mensaje}</div>}
    <div className="card"><div className="card-title">Crear materia</div><div className="form-group"><label htmlFor="nm">Nombre</label><input id="nm" value={nombreMateria} onChange={e=>setNombreMateria(e.target.value)} placeholder="Ej.: Pedagogía General"/></div><div className="form-group"><label htmlFor="na">Año</label><select id="na" value={anio} onChange={e=>setAnio(Number(e.target.value))}>{[1,2,3,4].map(a=><option key={a} value={a}>{a}.º Año</option>)}</select></div><button className="btn btn-primary" disabled={guardando} onClick={crearMateria}>{guardando?"Guardando...":"Crear materia"}</button></div>
    <div className="card"><div className="card-title">Agregar alumno a una materia</div><div className="form-group"><label htmlFor="mat">Materia</label><select id="mat" value={materiaId} onChange={e=>{setMateriaId(e.target.value);setEditando(null);setNombre("");setDni("");}}><option value="">Seleccionar...</option>{materias.map(m=><option key={m.id} value={m.id}>{m.anio}.º — {m.nombre}</option>)}</select></div><div className="form-group"><label htmlFor="an">Apellido y nombre</label><input id="an" value={nombre} onChange={e=>setNombre(e.target.value)} placeholder="Pérez, María"/></div><div className="form-group"><label htmlFor="dni">DNI (opcional)</label><input id="dni" value={dni} onChange={e=>setDni(e.target.value)} placeholder="Sin puntos"/></div><button className="btn btn-primary" disabled={guardando||!materiaId} onClick={guardarAlumno}>{guardando?"Guardando...":editando?"Guardar cambios":"Agregar e inscribir"}</button>{editando&&<button className="btn btn-outline" onClick={()=>{setEditando(null);setNombre("");setDni("");}}>Cancelar edición</button>}</div>
    <div className="card"><div className="card-title">Carga masiva</div><p style={{fontSize:".85rem",marginBottom:8}}>Un nombre completo por línea. Para reutilizar una ficha existente, cargá al alumno individualmente con su DNI.</p><div className="form-group"><textarea rows={5} value={lista} onChange={e=>setLista(e.target.value)} placeholder={"Pérez, María\nGómez, Juan"}/></div><button className="btn btn-outline" disabled={guardando||!materiaId} onClick={matricularLista}>{guardando?"Procesando...":"Matricular lista"}</button></div>
    <div className="card"><div className="form-group"><label htmlFor="buscar">Buscar por nombre o DNI</label><input id="buscar" value={filtro} onChange={e=>setFiltro(e.target.value)}/></div><p style={{fontSize:".85rem",color:"var(--text-muted)"}}>{cargando?"Cargando...":visibles.length+" alumno(s) inscriptos"}</p>{visibles.map(a=><div className="alumno-card" key={a.id}><div className="alumno-info"><div><span className="alumno-nombre">{a.nombre}</span><div className="alumno-sub">DNI: {a.dni||"Sin datos"}</div></div></div><div style={{display:"flex",gap:8,marginTop:8}}><button className="btn btn-outline btn-sm" onClick={()=>{setEditando(a.id);setNombre(a.nombre);setDni(a.dni);}}>Editar</button></div></div>)}</div>
  </section>;
}