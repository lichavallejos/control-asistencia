const USER_DB = {
    email: "correo@electronico.com",
    pass: "1234"
};

document.addEventListener('DOMContentLoaded', () => {
    const btnSend = document.querySelector('.btn');

    if( btnSend ) {
        btnSend.addEventListener('click', (e) => {
            const email = document.getElementById('email').value;
            const pass = document.getElementById('pass').value;
            
            validarAcceso( email, pass );
        });
    }

    const btnCloseAlert = document.querySelector('#close-alert');
    btnCloseAlert?.addEventListener('click', () => {
        document.querySelector('#modal-overlay').classList.add('hidden');
    });
});

function validarAcceso( email, pass ) {
    if( USER_DB.email === email && USER_DB.pass === pass ) {
        showCustomAlert("Información!!!", "Bienvenido al sistema");
        window.location.href="/view/home.html";
    } else {
        showCustomAlert("Error!!!", "Usuario o contraseña incorrectos. Intente de nuevo");
    }
}

function showCustomAlert(title, message) {
    const alertBox = document.querySelector('#modal-overlay');
    const titleMessage = document.querySelector('#title-message');
    const alertMessage = document.querySelector('#alert-message');

    titleMessage.textContent = title;
    alertMessage.textContent = message; 

    // Mostramos el Overlay que contiene la alerta
    alertBox.classList.remove('hidden');

    // Opcional: quitamos el foco del boton enviar para evitar de enter accidentalmente
    document.querySelector('.sub').blur();
}