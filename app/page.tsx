"use client";

export default function LoginPage() {
  return (
    <div id="login-view" className="view active">
      <div className="wrapper">
        <div className="content">
          <div className="imagen">
            <img src="/imagen/40aniversarioblanco.png" alt="logo" />
            <label htmlFor="ISFD">ISFD Mercedes</label>
          </div>

          <div className="Formulario">
            <form onSubmit={(e) => e.preventDefault()}>
              <label htmlFor="username">Usuario</label>
              <input
                type="text"
                id="username"
                placeholder="Ingrese su usuario"
                autoComplete="username"
                required
              />

              <label htmlFor="password">Contraseña</label>
              <input
                type="password"
                id="password"
                placeholder="Ingrese su contraseña"
                autoComplete="current-password"
                required
              />

              <input type="submit" className="btn" value="Enviar" />
              <div className="separador">
                <span></span>
                <p>o</p>
                <span></span>
              </div>
              <p id="login-error" className="error-msg"></p>
            </form>
          </div>
        </div>

        <div className="content2">
          <div className="lado-imagen">
            <img
              src="/imagen/Nuestroinstituto.png"
              alt="logoderecha"
              className="imgderecha"
            />
          </div>
        </div>
      </div>
    </div>
  );
}