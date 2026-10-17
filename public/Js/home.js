// ============================================================
// ARCHIVO: home.js
// PÁGINA:  home.html — ISFD Mercedes 2026
// FUNCIÓN: Controla el slider hero y aplica estilos dinámicos
//          para el botón "Cargar Notas" del nav y la card destacada
// ============================================================


// ── ESTILOS DINÁMICOS PARA "CARGAR NOTAS" ──────────────────
// Se inyectan por JS para no modificar los archivos CSS compartidos
// del proyecto (style(2).css y home.css)

const styleExtra = document.createElement('style');

styleExtra.textContent = `
    .nav__link--notas {
        background: var(--color-accent, #0ab8a1) !important;
        color: #fff !important;
        padding: 7px 18px !important;
        border-radius: 6px !important;
        font-weight: 700 !important;
        letter-spacing: 0.04em;
        transition: background 0.2s, transform 0.2s !important;
    }
    .nav__link--notas:hover {
        background: #089e8b !important;
        transform: translateY(-1px);
    }
    .card--notas {
        border: 2px solid var(--color-accent, #0ab8a1) !important;
    }
    .card--notas .card__link {
        color: var(--color-accent, #0ab8a1) !important;
        font-weight: 700;
    }
`;

// Agrega los estilos al <head> del documento
document.head.appendChild(styleExtra);


// ── HERO SLIDER ────────────────────────────────────────────
//
// Cómo funciona:
//   - Hay 4 slides en el HTML con clase .hero__slide
//   - Solo el slide activo tiene clase .hero__slide--active (opacity: 1)
//   - Los demás tienen opacity: 0 (ocultos con transición CSS)
//   - Los dots (puntitos) se crean dinámicamente acá abajo
//   - El slider avanza automáticamente cada 5 segundos
//
// Variables principales:
//   slides   → lista de todos los elementos .hero__slide
//   current  → índice del slide que se está mostrando ahora
//   timer    → referencia al setInterval para poder cancelarlo

const slides        = document.querySelectorAll('.hero__slide');
const dotsContainer = document.getElementById('heroDots');
let current = 0;
let timer;


// ── Crear los dots dinámicamente ──
// Por cada slide se crea un <button> con clase hero__dot
// El primero también recibe hero__dot--active (ya que arranca en index 0)

slides.forEach(function(slide, i) {
    // Crear el botón del dot
    let dot = document.createElement('button');

    // Si es el primero, también le ponemos la clase "active"
    dot.className = 'hero__dot' + (i === 0 ? ' hero__dot--active' : '');

    // Atributo de accesibilidad para lectores de pantalla
    dot.setAttribute('aria-label', 'Slide ' + (i + 1));

    // Al hacer clic en el dot, ir a ese slide específico
    dot.addEventListener('click', function() {
        goTo(i);
    });

    // Agregarlo al contenedor de dots en el HTML
    dotsContainer.appendChild(dot);
});


// ── Función principal: ir a un slide específico ──
// Recibe n: el índice al que queremos ir
// El % (módulo) hace que sea circular: si n > último, vuelve al 0
//                                       si n < 0, va al último

function goTo(n) {
    // Quitar clase activa del slide y dot actuales
    slides[current].classList.remove('hero__slide--active');
    dotsContainer.children[current].classList.remove('hero__dot--active');

    // Calcular el nuevo índice (circular)
    // Ej: si current=3 y slides.length=4, goTo(4) → (4+4)%4 = 0 (vuelve al inicio)
    current = (n + slides.length) % slides.length;

    // Activar el nuevo slide y su dot correspondiente
    slides[current].classList.add('hero__slide--active');
    dotsContainer.children[current].classList.add('hero__dot--active');

    // Reiniciar el temporizador automático
    // clearInterval cancela el timer anterior para evitar que se acumulen
    clearInterval(timer);
    timer = setInterval(function() {
        goTo(current + 1);
    }, 5000);
}


// ── Activar el primer slide al cargar la página ──
slides[0].classList.add('hero__slide--active');


// ── Botones anterior y siguiente ──
document.getElementById('heroPrev').addEventListener('click', function() {
    goTo(current - 1);   // Resta 1 → el módulo en goTo() se encarga de circular
});

document.getElementById('heroNext').addEventListener('click', function() {
    goTo(current + 1);   // Suma 1 → si llega al final, vuelve al 0
});


// ── Arrancar el avance automático cada 5 segundos ──
timer = setInterval(function() {
    goTo(current + 1);
}, 5000);