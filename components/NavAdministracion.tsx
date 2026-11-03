import Link from "next/link";

type Pantalla = "profesores" | "carreras";

const ACCESOS: { id: Pantalla; texto: string; ruta: string }[] = [
  { id: "profesores", texto: "Profesores", ruta: "/administracion" },
  { id: "carreras", texto: "Carreras", ruta: "/administracion/carreras" },
];

// Fila de accesos arriba de cada pantalla de administración.
// Cuando se sumen Ciclos u otras pantallas, se agregan acá.
export default function NavAdministracion({ actual }: { actual: Pantalla }) {
  return (
    <nav
      aria-label="Secciones de administración"
      style={{ display: "flex", gap: "8px", marginBottom: "12px" }}
    >
      {ACCESOS.map((a) =>
        a.id === actual ? (
          <span
            key={a.id}
            aria-current="page"
            className="btn btn-primary btn-sm"
            style={{ display: "inline-block" }}
          >
            {a.texto}
          </span>
        ) : (
          <Link
            key={a.id}
            href={a.ruta}
            className="btn btn-outline btn-sm"
            style={{ display: "inline-block", textDecoration: "none" }}
          >
            {a.texto}
          </Link>
        )
      )}
    </nav>
  );
}
