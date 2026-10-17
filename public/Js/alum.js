// ============================================================
// ARCHIVO: home_Alum.js
// PÁGINA:  home_Alum.html — ISFD Mercedes 2026
// FUNCIÓN: Gestión de la matriz exam_nota y los 3 procesos
//          del Primer Parcial de Laboratorio de Programación I
//
// Estructura de la matriz exam_nota:
//   exam_nota[i][0] = Apellido y nombre   (string)
//   exam_nota[i][1] = Primer parcial      (number)
//   exam_nota[i][2] = Segundo parcial     (number)
//   exam_nota[i][3] = Materia             (string)
// ============================================================


// ── MATRIZ PRINCIPAL ───────────────────────────────────────
// Array vacío que va a contener todos los alumnos cargados
// Cada posición es un sub-array con los 4 datos del alumno

const exam_nota = [];


// ── CONSTANTES ─────────────────────────────────────────────
// Se definen una sola vez acá arriba para facilitar cambios futuros
// Si la nota de aprobación cambia, solo se modifica este valor

const NOTA_APROBACION = 6;                           // Nota mínima para aprobar
const MATERIA_LAB     = "Laboratorio de Programación I";  // Materia del proceso 2


// ============================================================
// HELPERS DE INTERFAZ DE USUARIO
// Funciones auxiliares para mostrar mensajes al usuario
// ============================================================

// Muestra un mensaje de error (fondo rojo) durante 3.5 segundos
function mostrarError(msg) {
    let elError = document.getElementById("msg-error");
    let elOk    = document.getElementById("msg-ok");

    // Ocultar el mensaje de éxito si estaba visible
    elOk.style.display    = "none";

    // Mostrar el mensaje de error con ícono
    elError.textContent   = "✕  " + msg;
    elError.style.display = "block";

    // Ocultarlo automáticamente después de 3.5 segundos
    setTimeout(function() {
        elError.style.display = "none";
    }, 3500);
}

// Muestra un mensaje de éxito (fondo verde) durante 2.5 segundos
function mostrarOk(msg) {
    let elOk    = document.getElementById("msg-ok");
    let elError = document.getElementById("msg-error");

    // Ocultar el mensaje de error si estaba visible
    elError.style.display = "none";

    // Mostrar el mensaje de éxito con ícono
    elOk.textContent   = "✓  " + msg;
    elOk.style.display = "block";

    // Ocultarlo automáticamente después de 2.5 segundos
    setTimeout(function() {
        elOk.style.display = "none";
    }, 2500);
}

// Limpia todos los campos del formulario y mueve el foco al primer campo
function limpiarCampos() {
    document.getElementById("nombre").value  = "";
    document.getElementById("p1").value      = "";
    document.getElementById("p2").value      = "";
    document.getElementById("materia").value = "";

    // Poner el cursor en el campo nombre para agilizar la carga siguiente
    document.getElementById("nombre").focus();
}


// ============================================================
// VALIDACIONES DEL FORMULARIO
// Verifica que los datos sean correctos antes de cargarlos
// ============================================================

// Recibe los 4 valores del formulario y devuelve true si son válidos
// Si alguno no pasa, muestra el error correspondiente y devuelve false

function validar(nombre, p1Raw, p2Raw, materia) {

    // Validar que el nombre no esté vacío
    if (nombre === "") {
        mostrarError("Ingresá el apellido y nombre del alumno.");
        return false;
    }

    // Validar que se haya seleccionado una materia
    if (materia === "") {
        mostrarError("Seleccioná una materia.");
        return false;
    }

    // Validar el primer parcial:
    //   - p1Raw === "" → campo vacío
    //   - isNaN(p1Raw) → no es un número
    //   - Number(p1Raw) < 0 o > 10 → fuera de rango
    if (p1Raw === "" || isNaN(p1Raw) || Number(p1Raw) < 0 || Number(p1Raw) > 10) {
        mostrarError("El primer parcial debe ser un número entre 0 y 10.");
        return false;
    }

    // Validar el segundo parcial (mismos criterios)
    if (p2Raw === "" || isNaN(p2Raw) || Number(p2Raw) < 0 || Number(p2Raw) > 10) {
        mostrarError("El segundo parcial debe ser un número entre 0 y 10.");
        return false;
    }

    // Si llegó hasta acá, todos los campos son válidos
    return true;
}


// ============================================================
// PROCESO 1 — CARGA DE DATOS EN LA MATRIZ
// Lee los valores del formulario, los valida y los agrega
// a la matriz exam_nota como un nuevo sub-array
// ============================================================

function cargarAlumno() {

    // PASO 1: Obtener los valores del formulario
    // .trim() elimina espacios en blanco al inicio y al final
    let nombre  = document.getElementById("nombre").value.trim();
    let p1Raw   = document.getElementById("p1").value;       // String por ahora
    let p2Raw   = document.getElementById("p2").value;       // String por ahora
    let materia = document.getElementById("materia").value;

    // PASO 2: Validar los datos antes de guardarlos
    // Si validar() devuelve false, la función termina acá (return sin valor)
    if (!validar(nombre, p1Raw, p2Raw, materia)) {
        return;
    }

    // PASO 3: Convertir las notas a número
    // parseFloat convierte el string "7.5" al número 7.5
    let p1 = parseFloat(p1Raw);
    let p2 = parseFloat(p2Raw);

    // PASO 4: Cargar el alumno en la matriz
    // push() agrega un nuevo elemento al final del array
    // El elemento es un sub-array: [nombre, primerParcial, segundoParcial, materia]
    exam_nota.push([nombre, p1, p2, materia]);

    // PASO 5: Dar feedback al usuario
    // exam_nota.length - 1 es el índice del alumno recién cargado
    mostrarOk('Alumno "' + nombre + '" cargado en exam_nota[' + (exam_nota.length - 1) + '].');

    // PASO 6: Limpiar el formulario para el próximo ingreso
    limpiarCampos();

    // PASO 7: Actualizar la tabla y los resultados en pantalla
    renderTabla();
    calcularResultados();
}


// ============================================================
// PROCESO 2 — APROBADOS EN LABORATORIO DE PROGRAMACIÓN I
// Recorre toda la matriz y cuenta los alumnos que:
//   1. Pertenecen a la materia MATERIA_LAB
//   2. Tienen AMBAS notas >= NOTA_APROBACION
// ============================================================

function aprobadosLaboratorio() {
    let contador = 0;   // Empieza en 0, va sumando de a 1

    // Recorrer la matriz fila por fila
    for (let i = 0; i < exam_nota.length; i++) {

        // Extraer los datos de la fila i
        let p1      = exam_nota[i][1];   // Primer parcial
        let p2      = exam_nota[i][2];   // Segundo parcial
        let materia = exam_nota[i][3];   // Materia

        // Condición: tiene que ser la materia correcta Y aprobar los dos parciales
        if (materia === MATERIA_LAB && p1 >= NOTA_APROBACION && p2 >= NOTA_APROBACION) {
            contador++;   // Suma 1 al contador
        }
    }

    return contador;   // Devuelve el total encontrado
}


// ============================================================
// PROCESO 3 — DESAPROBADOS EN CUALQUIER MATERIA
// Recorre toda la matriz y cuenta los alumnos que tienen
// al menos UNA nota menor a NOTA_APROBACION
// (sin importar qué materia sea)
// ============================================================

function desaprobadosTotales() {
    let contador = 0;

    for (let i = 0; i < exam_nota.length; i++) {

        let p1 = exam_nota[i][1];   // Primer parcial
        let p2 = exam_nota[i][2];   // Segundo parcial

        // || (OR) → si ALGUNO de los dos está por debajo del mínimo, es desaprobado
        if (p1 < NOTA_APROBACION || p2 < NOTA_APROBACION) {
            contador++;
        }
    }

    return contador;
}


// ============================================================
// RENDER DE LA TABLA
// Actualiza visualmente la tabla HTML con los datos actuales
// de la matriz exam_nota
// ============================================================

function renderTabla() {
    let tbody     = document.getElementById("tbody");
    let tablaWrap = document.getElementById("tabla-wrap");
    let vaciaMsg  = document.getElementById("tabla-vacia");
    let contador  = document.getElementById("contador");

    // Actualizar el contador de alumnos en el encabezado de la tabla
    // Singular/plural: "1 alumno" vs "3 alumnos"
    contador.textContent = exam_nota.length + " alumno" + (exam_nota.length !== 1 ? "s" : "");

    // Si no hay alumnos, mostrar el mensaje vacío y ocultar la tabla
    if (exam_nota.length === 0) {
        tablaWrap.style.display = "none";
        vaciaMsg.style.display  = "block";
        return;   // Terminar la función acá
    }

    // Si hay alumnos, ocultar el mensaje vacío y mostrar la tabla
    vaciaMsg.style.display  = "none";
    tablaWrap.style.display = "block";

    // Limpiar las filas anteriores antes de redibujar
    tbody.innerHTML = "";

    // Recorrer la matriz y crear una fila <tr> por cada alumno
    for (let i = 0; i < exam_nota.length; i++) {
        let nombre   = exam_nota[i][0];
        let p1       = exam_nota[i][1];
        let p2       = exam_nota[i][2];
        let materia  = exam_nota[i][3];

        // Un alumno está aprobado si AMBAS notas son >= NOTA_APROBACION
        let aprobado = p1 >= NOTA_APROBACION && p2 >= NOTA_APROBACION;

        // Crear la fila del DOM
        let tr = document.createElement("tr");

        // innerHTML rellena la fila con las celdas correspondientes
        // Las clases nota-ok/nota-fail y badge-ok/badge-fail cambian el color según la nota
        tr.innerHTML =
            '<td class="idx-cell">[' + i + ']</td>' +
            '<td><strong>' + nombre + '</strong></td>' +
            '<td><span class="nota-pill ' + (p1 >= NOTA_APROBACION ? 'nota-ok' : 'nota-fail') + '">' + p1 + '</span></td>' +
            '<td><span class="nota-pill ' + (p2 >= NOTA_APROBACION ? 'nota-ok' : 'nota-fail') + '">' + p2 + '</span></td>' +
            '<td>' + materia + '</td>' +
            '<td><span class="badge-estado ' + (aprobado ? 'badge-ok' : 'badge-fail') + '">' + (aprobado ? 'Aprobado' : 'Desaprobado') + '</span></td>';

        // Agregar la fila al <tbody>
        tbody.appendChild(tr);
    }
}


// ============================================================
// RENDER DE RESULTADOS (PROCESOS 2 Y 3)
// Llama a las dos funciones de cálculo y actualiza los
// valores en pantalla
// ============================================================

function calcularResultados() {
    let panel = document.getElementById("resultados");

    // Si no hay alumnos, ocultar el panel de resultados
    if (exam_nota.length === 0) {
        panel.style.display = "none";
        return;
    }

    // Obtener los valores calculados
    let total        = exam_nota.length;
    let aprobados    = aprobadosLaboratorio();   // Proceso 2
    let desaprobados = desaprobadosTotales();    // Proceso 3

    // Actualizar los números grandes del panel
    document.getElementById("r-total").textContent        = total;
    document.getElementById("r-aprobados").textContent    = aprobados;
    document.getElementById("r-desaprobados").textContent = desaprobados;

    // Actualizar el texto explicativo del Proceso 2
    if (aprobados === 0) {
        document.getElementById("detalle-p2").textContent =
            'No hay alumnos aprobados en "' + MATERIA_LAB + '".';
    } else {
        document.getElementById("detalle-p2").textContent =
            aprobados + ' alumno' + (aprobados > 1 ? 's' : '') +
            ' aprobado' + (aprobados > 1 ? 's' : '') +
            ' en "' + MATERIA_LAB + '" (ambos parciales ≥ ' + NOTA_APROBACION + ').';
    }

    // Actualizar el texto explicativo del Proceso 3
    if (desaprobados === 0) {
        document.getElementById("detalle-p3").textContent =
            "No hay alumnos desaprobados en ninguna materia.";
    } else {
        document.getElementById("detalle-p3").textContent =
            desaprobados + ' alumno' + (desaprobados > 1 ? 's' : '') +
            ' desaprobado' + (desaprobados > 1 ? 's' : '') +
            ' en alguna de las materias ingresadas.';
    }

    // Mostrar el panel de resultados
    panel.style.display = "block";
}


// ============================================================
// LIMPIAR TODA LA MATRIZ
// Borra todos los alumnos cargados, previa confirmación
// ============================================================

function limpiarMatriz() {
    // Si no hay datos, no hacer nada
    if (exam_nota.length === 0) return;

    // Pedir confirmación al usuario antes de borrar todo
    let confirmar = confirm("¿Seguro que querés borrar todos los alumnos cargados?");

    if (!confirmar) return;   // El usuario canceló → salir sin borrar

    // Vaciar el array sin crear uno nuevo (mantiene la referencia)
    exam_nota.length = 0;

    // Actualizar la tabla y ocultar resultados
    renderTabla();
    calcularResultados();
}


// ============================================================
// EVENTO: TECLA ENTER PARA AGREGAR
// Permite presionar Enter desde cualquier campo del formulario
// para agregar el alumno sin necesidad de hacer clic
// ============================================================

document.addEventListener("keydown", function(e) {
    // Solo activar si la tecla es Enter y el foco NO está en un botón
    // (evita que Enter sobre "Limpiar todo" llame a cargarAlumno)
    if (e.key === "Enter" && document.activeElement.tagName !== "BUTTON") {
        cargarAlumno();
    }
});