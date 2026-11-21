const { escapeHtml, pageTemplate } = require("./shared");

function renderProfessorLogin(errorMessage = "", message = "") {
  return pageTemplate({
    title: "Login do Professor",
    pageClass: "auth-page",
    body: `
      <main class="shell auth-shell">
        <section class="card hero-card">
          <p class="eyebrow">English Class Points</p>
          <h1>Painel do professor</h1>
          <p class="lead">Controle rápido de pontos durante a aula, com ranking e histórico.</p>
          <p class="lead">Use seu login de professor para acessar apenas suas turmas e os pontos dos seus alunos.</p>
        </section>
        <section class="card form-card">
          <h2>Entrar</h2>
          ${message ? `<p class="success-banner">${escapeHtml(message)}</p>` : ""}
          ${errorMessage ? `<p class="error-banner">${escapeHtml(errorMessage)}</p>` : ""}
          <form method="post" action="/login" class="stack-form">
            <label>Usuário<input name="username" autocomplete="username" required /></label>
            <label>Senha<input name="password" type="password" autocomplete="current-password" required /></label>
            <button type="submit">Acessar dashboard</button>
          </form>
          <p><a href="/forgot-password">Esqueci minha senha</a></p>
        </section>
        <section class="card visitor-card">
          <h2>Conhecendo o projeto?</h2>
          <p>Explore o sistema com dados fictícios, sem precisar de conta. Nenhuma alteração é salva.</p>
          <form method="post" action="/visitor" class="stack-form">
            <button type="submit" class="ghost-link">Entrar como visitante</button>
          </form>
        </section>
      </main>`,
  });
}

function renderProfessorPasswordReset({ enabled, errorMessage = "", minLength }) {
  const form = enabled
    ? `
          <form method="post" action="/forgot-password" class="stack-form">
            <label>Usuário<input name="username" autocomplete="username" required /></label>
            <label>Código de recuperação<input name="code" type="password" autocomplete="off" required /></label>
            <label>Nova senha<input name="password" type="password" autocomplete="new-password" minlength="${minLength}" required /></label>
            <label>Repita a nova senha<input name="confirmPassword" type="password" autocomplete="new-password" minlength="${minLength}" required /></label>
            <button type="submit">Trocar senha</button>
          </form>`
    : `<p>A recuperação de senha não está configurada neste servidor. Defina <code>PASSWORD_RESET_CODE</code> no ambiente.</p>`;

  return pageTemplate({
    title: "Recuperar senha",
    pageClass: "auth-page",
    body: `
      <main class="shell auth-shell">
        <section class="card hero-card">
          <p class="eyebrow">English Class Points</p>
          <h1>Esqueci minha senha</h1>
          <p class="lead">Use o código de recuperação guardado na configuração do servidor (Vercel) para definir uma nova senha.</p>
        </section>
        <section class="card form-card">
          <h2>Nova senha</h2>
          ${errorMessage ? `<p class="error-banner">${escapeHtml(errorMessage)}</p>` : ""}
          ${form}
          <p><a href="/">Voltar ao login</a></p>
        </section>
      </main>`,
  });
}

function renderStudentLogin(student, errorMessage = "") {
  if (!student) {
    return pageTemplate({
      title: "Aluno não encontrado",
      body: `<main class="shell"><section class="card"><h1>Aluno não encontrado</h1><p>Este link não é válido.</p></section></main>`,
    });
  }

  return pageTemplate({
    title: `Área do aluno - ${student.name}`,
    pageClass: "auth-page",
    body: `
      <main class="shell auth-shell">
        <section class="card hero-card">
          <p class="eyebrow">Área do aluno</p>
          <h1>${escapeHtml(student.name)}</h1>
          <p class="lead">${escapeHtml(student.class_label)}</p>
          <p class="lead">Acesse sua pontuação individual usando seu usuário e senha.</p>
        </section>
        <section class="card form-card">
          <h2>Entrar</h2>
          ${errorMessage ? `<p class="error-banner">${escapeHtml(errorMessage)}</p>` : ""}
          <form method="post" action="/student/${escapeHtml(student.token)}/login" class="stack-form">
            <label>Usuário<input name="username" autocomplete="username" required /></label>
            <label>Senha<input name="password" type="password" autocomplete="current-password" required /></label>
            <button type="submit">Ver meus pontos</button>
          </form>
        </section>
      </main>`,
  });
}

module.exports = {
  renderProfessorLogin,
  renderProfessorPasswordReset,
  renderStudentLogin,
};