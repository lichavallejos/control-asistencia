export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer__grid">
        <div className="footer__col">
          <div className="footer__brand-logo-area">
            <img
              src="/imagen/isfdblancoy40ani.png"
              alt="Logo ISFD"
              className="footer__brand-img"
            />
            <div>
              <p className="footer__brand-name">Instituto Superior de Formación Docente</p>
              <p className="footer__brand-sub">Mercedes · Corrientes</p>
            </div>
          </div>
          <p className="footer__descr">1986-2026</p>
          <div className="footer__socials">
            <a href="https://instagram.com/isfd_mercedes" target="_blank">Instagram: @isfd_mercedes</a>
            <a href="https://facebook.com/ISFDMercedesCorrientes" target="_blank">Facebook: ISFDMercedesCorrientes</a>
            <a href="mailto:ifdmercedes@hotmail.com">Correo: ifdmercedes@hotmail.com</a>
          </div>
        </div>

        <div className="footer__col">
          <h4>Institución</h4>
          <ul>
            <li><a href="#">Nuestra historia</a></li>
            <li><a href="#">Autoridades</a></li>
            <li><a href="#">Misión y visión</a></li>
            <li><a href="#">Cuerpo docente</a></li>
            <li><a href="#">Infraestructura</a></li>
          </ul>
        </div>

        <div className="footer__col">
          <h4>Servicios</h4>
          <ul>
            <li><a href="#">Carreras y planes de estudio</a></li>
            <li><a href="#">Inscripciones</a></li>
            <li><a href="#">Biblioteca</a></li>
            <li><a href="#">Aula virtual</a></li>
            <li><a href="#">Soporte técnico</a></li>
          </ul>
        </div>

        <div className="footer__col">
          <h4>Contacto</h4>
          <div className="footer__contact-item">
            <span className="footer__contact-label">Dirección</span>
            <span className="footer__contact-value">José María Gómez y Yatay, Mercedes, Corrientes</span>
          </div>
          <div className="footer__contact-item">
            <span className="footer__contact-label">Horario de atención</span>
            <span className="footer__contact-value">Lun a Vie: 7:30 a 23:00 hs.</span>
          </div>
          <div className="footer__contact-item">
            <span className="footer__contact-label">Correo institucional</span>
            <span className="footer__contact-value">
              <a href="mailto:ifdmercedes@hotmail.com">ifdmercedes@hotmail.com</a>
            </span>
          </div>
          <div className="footer__contact-item">
            <span className="footer__contact-label">Soporte</span>
            <span className="footer__contact-value">
              <a href="mailto:soporte@isfdmercedes.edu.ar">soporte@isfdmercedes.edu.ar</a>
            </span>
          </div>
        </div>
      </div>

      <div className="footer_bottom">
        <span>© 2026 ISFD Mercedes · Todos los derechos reservados</span>
        <nav>
          <a href="#">Términos de uso</a>
          <a href="#">Política de privacidad</a>
          <a href="#">Accesibilidad</a>
          <a href="#">Mapa del sitio</a>
        </nav>
      </div>
    </footer>
  );
}