import Link from "next/link";

export default function Header() {
  return (
    <header className="header">
      <div className="logo">
        <img
          src="/imagen/Logo-ISFD-Banderin-tricolor-01-500x500.png"
          alt="Logo ISFD Mercedes"
          className="logoisfdm-img"
        />
        <h1 className="title">
          Instituto Superior de Formación Docente Mercedes
        </h1>
      </div>
      <nav className="nav">
        <ul className="Menu">
          <li><a href="https://ifdmercedes-crr.infd.edu.ar/sitio/">WEB</a></li>
          <li><a href="https://www.argentina.gob.ar/">Argentina</a></li>
          <li><a href="https://mapa.infd.edu.ar/">MAPA</a></li>
          <li><a href="https://red.infd.edu.ar/biblioteca-nuestra-escuela/">BIBLIOTECA</a></li>
          <li><Link href="/usuario">Mi Perfil</Link></li>
        </ul>
      </nav>
    </header>
  );
}