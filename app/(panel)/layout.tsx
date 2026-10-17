"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { restaurarUsuario } from "@/lib/sesion";

const items = [
  { ruta: "/dashboard", id: "dashboard", icono: " ", texto: "Inicio" },
  { ruta: "/asistencias", id: "asistencia", icono: " ", texto: "Asistencia" },
  { ruta: "/alumnos", id: "alumnos", icono: " ", texto: "Alumnos" },
  { ruta: "/usuario", id: "usuario", icono: " ", texto: "Perfil" },
];

export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [nombre, setNombre] = useState<string | null>(null);

  useEffect(() => {
    // Verifica con Supabase que la sesión siga vigente
    restaurarUsuario()
      .then((usuario) => {
        if (!usuario) {
          router.replace("/");
        } else {
          setNombre(usuario.nombre);
        }
      })
      .catch(() => router.replace("/"));
  }, [router]);

  // Mientras se verifica la sesión no se muestra nada
  if (!nombre) return null;

  return (
    <div id="app-view" className="view active">
      <div className="app-bar">
        <h2>Profesorado Inicial</h2>
        <span className="user-badge">{nombre}</span>
      </div>

      <main>{children}</main>

      <nav className="bottom-nav">
        {items.map((item) => (
          <button
            key={item.id}
            id={`nav-${item.id}`}
            onClick={() => router.push(item.ruta)}
            className={`nav-item${pathname === item.ruta ? " active" : ""}`}
          >
            <span className="icon">{item.icono}</span>
            <span>{item.texto}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}