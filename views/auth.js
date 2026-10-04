const { pageTemplate } = require("./shared");

function renderProfessorLogin(errorMessage = "") {
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
          ${errorMessage ? `<p class="error-banner">${errorMessage}</p>` : ""}
          <form method="post" action="/login" class="stack-form">
            <label>Usuário<input name="username" autocomplete="username" required /></label>
            <label>Senha<input name="password" type="password" autocomplete="current-password" required /></label>
            <button type="submit">Acessar dashboard</button>
          </form>
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
          <h1>${student.name}</h1>
          <p class="lead">${student.class_label}</p>
          <p class="lead">Acesse sua pontuação individual usando seu usuário e senha.</p>
        </section>
        <section class="card form-card">
          <h2>Entrar</h2>
          ${errorMessage ? `<p class="error-banner">${errorMessage}</p>` : ""}
          <form method="post" action="/student/${student.token}/login" class="stack-form">
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
  renderStudentLogin,
};