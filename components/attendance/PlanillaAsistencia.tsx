"use client";

import { Fragment, useState } from "react";
import type {
  AlumnoDeMateria,
  EstadoAsistencia,
  RegistroAsistencia,
} from "@/lib/datos";
import "./planilla-asistencia.css";

// Máximo de caracteres del comentario de cada alumno
const LIMITE_COMENTARIO = 200;

type Registros = Record<string, RegistroAsistencia>;

type Props = {
  alumnos: AlumnoDeMateria[]; // todos los alumnos de la materia (para el N°)
  visibles: AlumnoDeMateria[]; // los que pasan el filtro de búsqueda
  registros: Registros; // asistencia de la fecha, por inscripción
  fecha: string; // aaaa-mm-dd
  filtro: string;
  ocupado: boolean;
  faltantes: string[]; // inscripciones con comentario obligatorio sin completar
  onFecha: (fecha: string) => void;
  onFiltro: (texto: string) => void;
  onEstado: (ids: string[], estado: EstadoAsistencia) => void;
  onMotivo: (id: string, motivo: string) => void;
  onObservacion: (id: string, texto: string) => void;
  onGuardar: () => void;
};

/* ---------- Íconos ---------- */

function IconoCalendario({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 7.5a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3V10H3z" fill="currentColor" />
      <rect x="3" y="4.5" width="18" height="16.5" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M8 2.5v4M16 2.5v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconoBuscar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M16.5 16.5 21 21" />
    </svg>
  );
}

function IconoOk() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="currentColor" />
      <path d="M7 12.5l3.2 3.2L17 8.8" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconoX() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="currentColor" />
      <path d="M8.2 8.2l7.6 7.6M15.8 8.2l-7.6 7.6" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function IconoFlecha() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function IconoGuardar() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M5 3h11.2a2 2 0 0 1 1.4.6l2.8 2.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2 1.5V9h8V4.5H7zM12 12.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z"
      />
    </svg>
  );
}

/* ---------- Componente ---------- */

export default function PlanillaAsistencia({
  alumnos,
  visibles,
  registros,
  fecha,
  filtro,
  ocupado,
  faltantes,
  onFecha,
  onFiltro,
  onEstado,
  onMotivo,
  onObservacion,
  onGuardar,
}: Props) {
  // Paneles de ausencia abiertos (por inscripción). Si no hay dato, se decide solo.
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});

  const lista = Object.values(registros);
  const presentes = lista.filter((r) => r.estado === "presente").length;
  const ausentes = lista.length - presentes;

  const numeros = new Map(alumnos.map((a, i) => [a.inscripcionId, i + 1]));

  const idsVisibles = visibles
    .map((a) => a.inscripcionId)
    .filter((id) => registros[id]);
  const presentesVisibles = idsVisibles.filter(
    (id) => registros[id].estado === "presente"
  ).length;
  const todosPresentes =
    idsVisibles.length > 0 && presentesVisibles === idsVisibles.length;
  const algunoPresente = presentesVisibles > 0;

  function alternar(id: string, esPresente: boolean) {
    if (esPresente) {
      onEstado([id], "ausente");
      setAbiertos((prev) => ({ ...prev, [id]: true }));
    } else {
      onEstado([id], "presente");
      setAbiertos((prev) => ({ ...prev, [id]: false }));
    }
  }

  return (
    <div className="asis">
      {/* Fecha + contadores */}
      <div className="asis-card asis-barra">
        <IconoCalendario className="asis-barra-icono" />

        <div className="asis-fecha">
          <label htmlFor="asis-fecha-clase">Fecha de clase</label>
          <input
            type="date"
            id="asis-fecha-clase"
            value={fecha}
            onChange={(e) => onFecha(e.target.value)}
          />
        </div>

        <div className="asis-tile asis-tile-p">
          <IconoOk />
          <span>Presentes</span>
          <span className="asis-cant">{presentes}</span>
        </div>
        <div className="asis-tile asis-tile-a">
          <IconoX />
          <span>Ausentes</span>
          <span className="asis-cant">{ausentes}</span>
        </div>
      </div>

      {/* Buscador */}
      <div className="asis-card asis-buscar">
        <IconoBuscar />
        <input
          type="text"
          placeholder="Buscar alumno..."
          aria-label="Buscar alumno"
          value={filtro}
          onChange={(e) => onFiltro(e.target.value)}
        />
      </div>

      {/* Tabla */}
      <div className="asis-card asis-tabla">
        <div className="asis-fila asis-cab">
          <div className="asis-c-chk">
            <input
              type="checkbox"
              className="asis-check"
              aria-label="Marcar o desmarcar todos los alumnos visibles"
              checked={todosPresentes}
              disabled={idsVisibles.length === 0}
              ref={(el) => {
                if (el) el.indeterminate = !todosPresentes && algunoPresente;
              }}
              onChange={() =>
                onEstado(idsVisibles, todosPresentes ? "ausente" : "presente")
              }
            />
          </div>
          <div className="asis-c-num">N°</div>
          <div className="asis-c-nom">Alumno</div>
          <div className="asis-c-dni">DNI</div>
          <div className="asis-c-est">Estado</div>
          <div className="asis-c-com">Comentario</div>
        </div>

        {visibles.length === 0 && (
          <p className="asis-vacio">No hay alumnos para mostrar.</p>
        )}

        {visibles.map((a) => {
          const id = a.inscripcionId;
          const r = registros[id];
          if (!r) return null;

          const presente = r.estado === "presente";
          const obligatorio = r.motivo === "justificada";
          const falta =
            faltantes.includes(id) && obligatorio && !r.observacion.trim();
          const abierto = !presente && (abiertos[id] ?? falta);
          const dni = a.dni || "S/D";

          return (
            <Fragment key={id}>
              <div className={`asis-fila${abierto ? " asis-fila--abierta" : ""}`}>
                <div className="asis-c-chk">
                  <input
                    type="checkbox"
                    className="asis-check"
                    checked={presente}
                    onChange={() => alternar(id, presente)}
                    aria-label={`${a.nombre}: ${presente ? "presente" : "ausente"}`}
                  />
                </div>
                <div className="asis-c-num">{numeros.get(id)}</div>
                <div className="asis-c-nom">
                  <span className="asis-nombre">{a.nombre}</span>
                  <span className="asis-dni-m">DNI {dni}</span>
                </div>
                <div className="asis-c-dni asis-dni">{dni}</div>
                <div className="asis-c-est">
                  <span className={`asis-pill ${presente ? "asis-pill-p" : "asis-pill-a"}`}>
                    {presente ? <IconoOk /> : <IconoX />}
                    {presente ? "Presente" : "Ausente"}
                  </span>
                </div>
                <div className="asis-c-com">
                  <span className="asis-comentario">
                    {r.observacion.trim() || "-"}
                  </span>
                  {!presente && (
                    <button
                      type="button"
                      className={`asis-chevron${abierto ? " asis-chevron--abierto" : ""}`}
                      aria-expanded={abierto}
                      aria-label={`${abierto ? "Ocultar" : "Mostrar"} detalle de la ausencia de ${a.nombre}`}
                      onClick={() =>
                        setAbiertos((prev) => ({ ...prev, [id]: !abierto }))
                      }
                    >
                      <IconoFlecha />
                    </button>
                  )}
                </div>
              </div>

              {abierto && (
                <div className="asis-detalle-wrap">
                  <div className="asis-detalle">
                    <div>
                      <label htmlFor={`asis-motivo-${id}`}>Tipo de ausencia</label>
                      <select
                        id={`asis-motivo-${id}`}
                        className="asis-select"
                        value={r.motivo}
                        onChange={(e) => onMotivo(id, e.target.value)}
                      >
                        <option value="justificada">Justificada</option>
                        <option value="injustificada">Injustificada</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`asis-obs-${id}`}>
                        Comentario
                        <small>
                          {obligatorio ? "(obligatorio si es ausencia)" : "(opcional)"}
                        </small>
                      </label>
                      <textarea
                        id={`asis-obs-${id}`}
                        className={`asis-textarea${falta ? " asis-textarea--falta" : ""}`}
                        maxLength={LIMITE_COMENTARIO}
                        value={r.observacion}
                        onChange={(e) => onObservacion(id, e.target.value)}
                      />
                      <div className="asis-contador">
                        {r.observacion.length}/{LIMITE_COMENTARIO}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </Fragment>
          );
        })}

        <div className="asis-pie">
          <button
            type="button"
            className="asis-guardar"
            onClick={onGuardar}
            disabled={ocupado}
          >
            <IconoGuardar />
            {ocupado ? "Guardando..." : "Guardar Asistencia"}
          </button>
        </div>
      </div>
    </div>
  );
}
